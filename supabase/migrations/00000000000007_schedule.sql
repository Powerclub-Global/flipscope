-- FlipScope migration 007 — Calendar & Schedule
-- Trade-level tasks with start/duration/progress. Task status rolls up to
-- the linked scope line so Scope & Estimate reflects field progress.

create type task_status as enum ('planned', 'scheduled', 'in_progress', 'blocked', 'done');

create table schedule_tasks (
  id             uuid primary key default uuid_generate_v4(),
  org_id         uuid not null references organizations(id) on delete cascade,
  project_id     uuid not null references projects(id) on delete cascade,
  scope_item_id  uuid references scope_items(id) on delete set null,
  vendor_id      uuid references vendors(id) on delete set null,
  name           text not null,
  trade          text,
  start_date     date not null,
  duration_days  integer not null default 1 check (duration_days >= 1),
  progress_pct   integer not null default 0 check (progress_pct between 0 and 100),
  status         task_status not null default 'planned',
  notes          text,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index schedule_tasks_project_idx on schedule_tasks (project_id, start_date);
create index schedule_tasks_org_idx on schedule_tasks (org_id);

create trigger schedule_tasks_set_updated_at before update on schedule_tasks
  for each row execute function scope_items_touch_updated_at();

-- Keep progress and status consistent: done ⇒ 100%, 100% ⇒ done,
-- any progress on a planned/scheduled task ⇒ in_progress.
create or replace function schedule_tasks_normalize()
returns trigger language plpgsql as $$
begin
  if new.status = 'done' then
    new.progress_pct := 100;
  elsif new.progress_pct = 100 then
    new.status := 'done';
  elsif new.progress_pct > 0 and new.status in ('planned', 'scheduled') then
    new.status := 'in_progress';
  end if;
  return new;
end;
$$;

create trigger schedule_tasks_normalize before insert or update on schedule_tasks
  for each row execute function schedule_tasks_normalize();

-- Roll task status up to the linked scope line. security definer so crew
-- progress updates (crew cannot write scope_items directly) still land.
create or replace function schedule_tasks_sync_scope()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.scope_item_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.status = old.status then return new; end if;

  update scope_items
  set status = case new.status
    when 'done'        then 'done'::scope_item_status
    when 'in_progress' then 'in_progress'::scope_item_status
    when 'blocked'     then 'in_progress'::scope_item_status
    when 'scheduled'   then 'scheduled'::scope_item_status
    else 'ready'::scope_item_status
  end
  where id = new.scope_item_id and org_id = new.org_id;
  return new;
end;
$$;

create trigger schedule_tasks_sync_scope after insert or update on schedule_tasks
  for each row execute function schedule_tasks_sync_scope();

-- Project-level rollup for the sidebar and Command Center.
create or replace function project_schedule(p_project_id uuid)
returns table (
  starts_on      date,
  ends_on        date,
  task_count     integer,
  done_count     integer,
  progress_pct   integer      -- duration-weighted
)
language sql
stable
security invoker
as $$
  select
    min(start_date),
    max(start_date + duration_days - 1),
    count(*)::int,
    count(*) filter (where status = 'done')::int,
    coalesce(round(sum(progress_pct * duration_days)::numeric / nullif(sum(duration_days), 0))::int, 0)
  from schedule_tasks
  where project_id = p_project_id;
$$;

alter table schedule_tasks enable row level security;

create policy schedule_select on schedule_tasks for select
  using (is_org_member(org_id));
create policy schedule_insert on schedule_tasks for insert
  with check (org_role_of(org_id) in ('owner', 'pm'));
-- Crew and subs update progress on their tasks; owner/pm edit everything.
create policy schedule_update on schedule_tasks for update
  using (org_role_of(org_id) in ('owner', 'pm', 'field_crew', 'subcontractor'));
create policy schedule_delete on schedule_tasks for delete
  using (org_role_of(org_id) in ('owner', 'pm'));

create trigger audit_schedule_tasks after insert or update or delete on schedule_tasks
  for each row execute function record_audit();

grant select, insert, update, delete on schedule_tasks to authenticated;
grant execute on function project_schedule(uuid) to authenticated;

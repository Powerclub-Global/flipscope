-- FlipScope migration 009 — Closeout & Warranty
-- Punch list, closeout checklist and warranty register. Closing a project
-- is gated: every punch item resolved and every required checklist item
-- done, so "sold" can't be clicked over unfinished work.

create type punch_status as enum ('open', 'in_progress', 'resolved', 'verified');
create type closeout_status as enum ('open', 'done', 'na');

create table punch_items (
  id             uuid primary key default uuid_generate_v4(),
  org_id         uuid not null references organizations(id) on delete cascade,
  project_id     uuid not null references projects(id) on delete cascade,
  scope_item_id  uuid references scope_items(id) on delete set null,
  room           text,
  title          text not null,
  detail         text,
  status         punch_status not null default 'open',
  proof_required boolean not null default true,
  raised_by      uuid references auth.users(id),
  resolved_at    timestamptz,
  verified_by    uuid references auth.users(id),
  verified_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index punch_items_project_idx on punch_items (project_id, status);
create index punch_items_org_idx on punch_items (org_id);

create trigger punch_items_set_updated_at before update on punch_items
  for each row execute function scope_items_touch_updated_at();

create or replace function punch_items_stamp()
returns trigger language plpgsql as $$
begin
  if new.raised_by is null then new.raised_by := auth.uid(); end if;
  if new.status in ('resolved', 'verified') and new.resolved_at is null then
    new.resolved_at := now();
  end if;
  if new.status = 'verified' and new.verified_at is null then
    new.verified_by := auth.uid();
    new.verified_at := now();
  end if;
  return new;
end;
$$;

create trigger punch_items_stamp before insert or update on punch_items
  for each row execute function punch_items_stamp();

create table closeout_items (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references organizations(id) on delete cascade,
  project_id  uuid not null references projects(id) on delete cascade,
  title       text not null,
  detail      text,
  required    boolean not null default true,
  status      closeout_status not null default 'open',
  completed_by uuid references auth.users(id),
  completed_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index closeout_items_project_idx on closeout_items (project_id, status);

create trigger closeout_items_set_updated_at before update on closeout_items
  for each row execute function scope_items_touch_updated_at();

create or replace function closeout_items_stamp()
returns trigger language plpgsql as $$
begin
  if new.status = 'done' and new.completed_at is null then
    new.completed_by := auth.uid();
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_by := null;
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger closeout_items_stamp before insert or update on closeout_items
  for each row execute function closeout_items_stamp();

-- The standard closeout checklist, seeded per project on demand.
create or replace function seed_closeout_checklist(p_project_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  v_org_id uuid;
begin
  select org_id into v_org_id from projects where id = p_project_id;
  if v_org_id is null then
    raise exception 'project not found or not visible';
  end if;
  if exists (select 1 from closeout_items where project_id = p_project_id) then
    return;
  end if;

  insert into closeout_items (org_id, project_id, title, required) values
    (v_org_id, p_project_id, 'Final punch list complete', true),
    (v_org_id, p_project_id, 'Lien waivers collected', true),
    (v_org_id, p_project_id, 'Final permit inspections passed', true),
    (v_org_id, p_project_id, 'Before / after gallery complete', false),
    (v_org_id, p_project_id, 'Warranty packet delivered', true),
    (v_org_id, p_project_id, 'Utilities transferred', false),
    (v_org_id, p_project_id, 'Keys and access handed over', true);
end;
$$;

create table warranties (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references organizations(id) on delete cascade,
  project_id  uuid not null references projects(id) on delete cascade,
  vendor_id   uuid references vendors(id) on delete set null,
  item        text not null,
  provider    text,
  starts_on   date not null default current_date,
  expires_on  date,
  document_url text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index warranties_project_idx on warranties (project_id, expires_on);

create trigger warranties_set_updated_at before update on warranties
  for each row execute function scope_items_touch_updated_at();

-- Readiness: what still blocks closing this project.
create or replace function closeout_readiness(p_project_id uuid)
returns table (
  punch_open        integer,
  punch_total       integer,
  checklist_open    integer,   -- required items not done
  checklist_total   integer,
  ready             boolean
)
language sql
stable
security invoker
as $$
  with p as (
    select count(*) filter (where status not in ('resolved', 'verified'))::int as open_ct,
           count(*)::int as total_ct
    from punch_items where project_id = p_project_id
  ),
  c as (
    select count(*) filter (where required and status = 'open')::int as open_ct,
           count(*)::int as total_ct
    from closeout_items where project_id = p_project_id
  )
  select p.open_ct, p.total_ct, c.open_ct, c.total_ct,
         (p.open_ct = 0 and c.open_ct = 0 and c.total_ct > 0)
  from p, c;
$$;

-- Closing the project is gated on that readiness.
create or replace function close_project(p_project_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  r record;
begin
  select * into r from closeout_readiness(p_project_id);
  if r.checklist_total = 0 then
    raise exception 'closeout checklist has not been started';
  end if;
  if r.punch_open > 0 then
    raise exception 'cannot close: % punch item(s) still open', r.punch_open;
  end if;
  if r.checklist_open > 0 then
    raise exception 'cannot close: % required checklist item(s) still open', r.checklist_open;
  end if;

  update projects set status = 'sold' where id = p_project_id;
  if not found then
    raise exception 'project not found or not writable';
  end if;
end;
$$;

alter table punch_items    enable row level security;
alter table closeout_items enable row level security;
alter table warranties     enable row level security;

-- Punch list is the crew's working document: everyone reads, crew and subs
-- raise and resolve, owner/pm verify (the stamp trigger records who).
create policy punch_select on punch_items for select
  using (is_org_member(org_id));
create policy punch_insert on punch_items for insert
  with check (org_role_of(org_id) in ('owner', 'pm', 'field_crew', 'subcontractor'));
create policy punch_update on punch_items for update
  using (org_role_of(org_id) in ('owner', 'pm', 'field_crew', 'subcontractor'));
create policy punch_delete on punch_items for delete
  using (org_role_of(org_id) in ('owner', 'pm'));

create policy closeout_select on closeout_items for select
  using (is_org_member(org_id));
create policy closeout_insert on closeout_items for insert
  with check (org_role_of(org_id) in ('owner', 'pm'));
create policy closeout_update on closeout_items for update
  using (org_role_of(org_id) in ('owner', 'pm'));
create policy closeout_delete on closeout_items for delete
  using (org_role_of(org_id) in ('owner', 'pm'));

create policy warranties_select on warranties for select
  using (is_org_member(org_id));
create policy warranties_insert on warranties for insert
  with check (org_role_of(org_id) in ('owner', 'pm'));
create policy warranties_update on warranties for update
  using (org_role_of(org_id) in ('owner', 'pm'));
create policy warranties_delete on warranties for delete
  using (org_role_of(org_id) in ('owner', 'pm'));

create trigger audit_punch_items after insert or update or delete on punch_items
  for each row execute function record_audit();
create trigger audit_closeout_items after insert or update or delete on closeout_items
  for each row execute function record_audit();
create trigger audit_warranties after insert or update or delete on warranties
  for each row execute function record_audit();

grant select, insert, update, delete on punch_items to authenticated;
grant select, insert, update, delete on closeout_items to authenticated;
grant select, insert, update, delete on warranties to authenticated;
grant execute on function seed_closeout_checklist(uuid) to authenticated;
grant execute on function closeout_readiness(uuid) to authenticated;
grant execute on function close_project(uuid) to authenticated;

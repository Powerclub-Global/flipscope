-- FlipScope migration 008 — Change Orders & RFIs
-- Change orders are raised and decided by owner/pm; approval adjusts the
-- budget in the ledger. RFIs are field questions with
-- a tracked answer. E-signature (Phase 4) layers on top of the decision
-- record here; nothing about the data model needs to change for it.

create type change_order_status as enum ('pending', 'approved', 'rejected', 'void');
create type rfi_status as enum ('open', 'answered', 'closed');

create table change_orders (
  id                    uuid primary key default uuid_generate_v4(),
  org_id                uuid not null references organizations(id) on delete cascade,
  project_id            uuid not null references projects(id) on delete cascade,
  scope_item_id         uuid references scope_items(id) on delete set null,
  number                integer not null,
  title                 text not null,
  description           text,
  amount_cents          bigint not null default 0,          -- negative = credit
  schedule_impact_days  integer not null default 0,
  status                change_order_status not null default 'pending',
  requested_by          uuid references auth.users(id),
  decided_by            uuid references auth.users(id),
  decided_at            timestamptz,
  decision_note         text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (project_id, number)
);

create index change_orders_project_idx on change_orders (project_id, status);
create index change_orders_org_idx on change_orders (org_id);

create trigger change_orders_set_updated_at before update on change_orders
  for each row execute function scope_items_touch_updated_at();

-- Sequential CO numbers per project, stamped at insert.
create or replace function change_orders_number()
returns trigger language plpgsql as $$
begin
  if new.number is null then
    select coalesce(max(number), 0) + 1 into new.number
    from change_orders where project_id = new.project_id;
  end if;
  if new.requested_by is null then
    new.requested_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger change_orders_number before insert on change_orders
  for each row execute function change_orders_number();

-- Decision workflow. security invoker: the update on change_orders and the
-- ledger insert both require owner/pm under RLS.
create or replace function decide_change_order(p_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security invoker
as $$
declare
  co change_orders%rowtype;
begin
  select * into co from change_orders where id = p_id;
  if not found then
    raise exception 'change order not found or not visible';
  end if;
  if co.status <> 'pending' then
    raise exception 'change order is already %', co.status;
  end if;

  update change_orders
  set status = case when p_approve then 'approved'::change_order_status else 'rejected'::change_order_status end,
      decided_by = auth.uid(), decided_at = now(), decision_note = p_note
  where id = co.id;

  if p_approve and co.amount_cents <> 0 then
    insert into ledger_entries (org_id, project_id, entry_type, category, description, amount_cents, created_by)
    values (co.org_id, co.project_id, 'budget', 'change_order',
            'CO #' || co.number || ' ' || co.title, co.amount_cents, auth.uid());
  end if;
end;
$$;

create table rfis (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references organizations(id) on delete cascade,
  project_id    uuid not null references projects(id) on delete cascade,
  scope_item_id uuid references scope_items(id) on delete set null,
  number        integer not null,
  question      text not null,
  asked_by      uuid references auth.users(id),
  answer        text,
  answered_by   uuid references auth.users(id),
  answered_at   timestamptz,
  status        rfi_status not null default 'open',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (project_id, number)
);

create index rfis_project_idx on rfis (project_id, status);
create index rfis_org_idx on rfis (org_id);

create trigger rfis_set_updated_at before update on rfis
  for each row execute function scope_items_touch_updated_at();

create or replace function rfis_number()
returns trigger language plpgsql as $$
begin
  if new.number is null then
    select coalesce(max(number), 0) + 1 into new.number
    from rfis where project_id = new.project_id;
  end if;
  if new.asked_by is null then
    new.asked_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger rfis_number before insert on rfis
  for each row execute function rfis_number();

create or replace function answer_rfi(p_id uuid, p_answer text)
returns void
language sql
security invoker
as $$
  update rfis
  set answer = p_answer, answered_by = auth.uid(), answered_at = now(), status = 'answered'
  where id = p_id and status = 'open';
$$;

alter table change_orders enable row level security;
alter table rfis          enable row level security;

-- Change orders carry money: ledger-level visibility, owner/pm write.
-- Crew raise an RFI; the PM turns it into a CO when it has a price.
create policy co_select on change_orders for select
  using (org_role_of(org_id) in ('owner', 'pm', 'investor'));
create policy co_insert on change_orders for insert
  with check (org_role_of(org_id) in ('owner', 'pm'));
create policy co_update on change_orders for update
  using (org_role_of(org_id) in ('owner', 'pm'));
create policy co_delete on change_orders for delete
  using (org_role_of(org_id) in ('owner', 'pm') and status = 'pending');

-- RFIs: the whole crew can read and ask; owner/pm answer and close.
create policy rfi_select on rfis for select
  using (is_org_member(org_id));
create policy rfi_insert on rfis for insert
  with check (org_role_of(org_id) in ('owner', 'pm', 'field_crew', 'subcontractor'));
create policy rfi_update on rfis for update
  using (org_role_of(org_id) in ('owner', 'pm'));
create policy rfi_delete on rfis for delete
  using (org_role_of(org_id) in ('owner', 'pm'));

create trigger audit_change_orders after insert or update or delete on change_orders
  for each row execute function record_audit();
create trigger audit_rfis after insert or update or delete on rfis
  for each row execute function record_audit();

grant select, insert, update, delete on change_orders to authenticated;
grant select, insert, update, delete on rfis to authenticated;
grant execute on function decide_change_order(uuid, boolean, text) to authenticated;
grant execute on function answer_rfi(uuid, text) to authenticated;

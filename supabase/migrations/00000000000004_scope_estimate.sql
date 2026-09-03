-- FlipScope migration 004 — Scope & Estimate
-- Real, editable scope line items per project (room/trade/task/qty/cost).
-- This replaces the concept-preview Scope & Estimate page's hardcoded
-- seed data; the AI walkthrough → scope extraction (Phase 3) will insert
-- into this same table, it's just manual entry until that lands.

create type scope_item_status as enum ('planned', 'ready', 'scheduled', 'in_progress', 'done');

create table scope_items (
  id               uuid primary key default uuid_generate_v4(),
  org_id           uuid not null references organizations(id) on delete cascade,
  project_id       uuid not null references projects(id) on delete cascade,
  room             text not null,
  trade            text not null,
  task             text not null,
  qty              numeric not null default 1 check (qty >= 0),
  unit             text not null default 'LS',
  labor_cents      bigint not null default 0 check (labor_cents >= 0),    -- per unit
  material_cents   bigint not null default 0 check (material_cents >= 0), -- per unit
  status           scope_item_status not null default 'planned',
  proof_required   boolean not null default false,
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index scope_items_project_idx on scope_items (project_id, created_at);
create index scope_items_org_idx on scope_items (org_id);

create or replace function scope_items_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger scope_items_set_updated_at before update on scope_items
  for each row execute function scope_items_touch_updated_at();

-- Per-project scope estimate total — same "one server-computed engine"
-- discipline as the financial engine, so every screen agrees on the number.
create or replace function scope_estimate_total(p_project_id uuid)
returns bigint
language sql
stable
security invoker
as $$
  select coalesce(sum(round(qty * (labor_cents + material_cents))), 0)::bigint
  from scope_items
  where project_id = p_project_id;
$$;

alter table scope_items enable row level security;

-- Visible to all org members (crew needs the task list even if they can't
-- see dollar figures elsewhere — cost columns are hidden client-side for
-- roles that can't see financials, same pattern as the rest of the app).
create policy scope_items_select on scope_items for select
  using (is_org_member(org_id));
create policy scope_items_insert on scope_items for insert
  with check (org_role_of(org_id) in ('owner', 'pm'));
create policy scope_items_update on scope_items for update
  using (org_role_of(org_id) in ('owner', 'pm'));
create policy scope_items_delete on scope_items for delete
  using (org_role_of(org_id) in ('owner', 'pm'));

create trigger audit_scope_items after insert or update or delete on scope_items
  for each row execute function record_audit();

grant select, insert, update, delete on scope_items to authenticated;
grant execute on function scope_estimate_total(uuid) to authenticated;

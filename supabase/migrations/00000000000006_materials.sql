-- FlipScope migration 006 — Materials & POs
-- Material selections tied to scope lines and vendors. Retailer columns
-- (retailer/sku/product_url/image_url) are in place now so the Home Depot /
-- Lowe's lookup integration and the Design Studio can populate rows later
-- without a schema change. Ordering commits the cost in the ledger.

create type material_status as enum ('selected', 'ordered', 'delivered', 'installed', 'returned');
create type retailer as enum ('home_depot', 'lowes', 'amazon', 'local', 'other');

create table materials (
  id               uuid primary key default uuid_generate_v4(),
  org_id           uuid not null references organizations(id) on delete cascade,
  project_id       uuid not null references projects(id) on delete cascade,
  scope_item_id    uuid references scope_items(id) on delete set null,
  vendor_id        uuid references vendors(id) on delete set null,
  name             text not null,
  retailer         retailer,
  sku              text,
  product_url      text,
  image_url        text,
  qty              numeric not null default 1 check (qty >= 0),
  unit             text not null default 'EA',
  unit_price_cents bigint not null default 0 check (unit_price_cents >= 0),
  status           material_status not null default 'selected',
  ordered_at       date,
  delivered_at     date,
  notes            text,
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index materials_project_idx on materials (project_id, status);
create index materials_org_idx on materials (org_id);

create trigger materials_set_updated_at before update on materials
  for each row execute function scope_items_touch_updated_at();

create or replace function materials_total(p_project_id uuid)
returns bigint
language sql
stable
security invoker
as $$
  select coalesce(sum(round(qty * unit_price_cents)), 0)::bigint
  from materials
  where project_id = p_project_id and status <> 'returned';
$$;

-- Placing the order commits the cost. security invoker: RLS on materials
-- and ledger_entries decides who may do this (owner/pm).
create or replace function order_material(p_material_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  m materials%rowtype;
begin
  select * into m from materials where id = p_material_id;
  if not found then
    raise exception 'material not found or not visible';
  end if;
  if m.status <> 'selected' then
    raise exception 'material is already %', m.status;
  end if;

  update materials set status = 'ordered', ordered_at = current_date where id = m.id;

  insert into ledger_entries (org_id, project_id, entry_type, category, description, amount_cents, created_by)
  values (m.org_id, m.project_id, 'committed', 'materials',
          'Ordered ' || m.name, round(m.qty * m.unit_price_cents)::bigint, auth.uid());
end;
$$;

alter table materials enable row level security;

-- Everyone in the org sees the material list (crew tracks deliveries);
-- prices are hidden client-side for roles without financial access.
create policy materials_select on materials for select
  using (is_org_member(org_id));
create policy materials_insert on materials for insert
  with check (org_role_of(org_id) in ('owner', 'pm'));
create policy materials_update on materials for update
  using (org_role_of(org_id) in ('owner', 'pm', 'field_crew'));
create policy materials_delete on materials for delete
  using (org_role_of(org_id) in ('owner', 'pm'));

create trigger audit_materials after insert or update or delete on materials
  for each row execute function record_audit();

grant select, insert, update, delete on materials to authenticated;
grant execute on function materials_total(uuid) to authenticated;
grant execute on function order_material(uuid) to authenticated;

-- FlipScope migration 005 — Bid Room
-- Vendors (reused by Materials & POs) and per-trade bids. Awarding a bid is
-- a real workflow: competing bids for the same trade are declined and the
-- amount is committed in the ledger, so Financials reflects it immediately.

create type bid_status as enum ('quoted', 'preferred', 'awarded', 'declined');

create table vendors (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text not null,
  trade       text,
  phone       text,
  email       text,
  rating      numeric(2,1) check (rating is null or (rating >= 0 and rating <= 5)),
  notes       text,
  created_at  timestamptz not null default now()
);

create index vendors_org_idx on vendors (org_id, name);

create table bids (
  id             uuid primary key default uuid_generate_v4(),
  org_id         uuid not null references organizations(id) on delete cascade,
  project_id     uuid not null references projects(id) on delete cascade,
  vendor_id      uuid not null references vendors(id) on delete restrict,
  scope_item_id  uuid references scope_items(id) on delete set null,
  trade          text not null,
  amount_cents   bigint not null check (amount_cents >= 0),
  duration_days  integer check (duration_days is null or duration_days >= 0),
  status         bid_status not null default 'quoted',
  notes          text,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index bids_project_idx on bids (project_id, trade);
create index bids_org_idx on bids (org_id);

create trigger bids_set_updated_at before update on bids
  for each row execute function scope_items_touch_updated_at();

-- Award workflow. security invoker so RLS decides who may do this: the
-- update on bids and the insert into ledger_entries both require owner/pm.
create or replace function award_bid(p_bid_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  b bids%rowtype;
begin
  select * into b from bids where id = p_bid_id;
  if not found then
    raise exception 'bid not found or not visible';
  end if;
  if b.status = 'awarded' then
    return;
  end if;

  update bids set status = 'declined'
  where project_id = b.project_id and trade = b.trade and id <> b.id and status <> 'declined';

  update bids set status = 'awarded' where id = b.id;

  insert into ledger_entries (org_id, project_id, entry_type, category, description, amount_cents, created_by)
  values (b.org_id, b.project_id, 'committed', lower(b.trade),
          'Awarded bid ' || b.id::text, b.amount_cents, auth.uid());
end;
$$;

alter table vendors enable row level security;
alter table bids    enable row level security;

create policy vendors_select on vendors for select
  using (is_org_member(org_id));
create policy vendors_insert on vendors for insert
  with check (org_role_of(org_id) in ('owner', 'pm'));
create policy vendors_update on vendors for update
  using (org_role_of(org_id) in ('owner', 'pm'));
create policy vendors_delete on vendors for delete
  using (org_role_of(org_id) = 'owner');

-- Bids carry money: same visibility as the ledger.
create policy bids_select on bids for select
  using (org_role_of(org_id) in ('owner', 'pm', 'investor'));
create policy bids_insert on bids for insert
  with check (org_role_of(org_id) in ('owner', 'pm'));
create policy bids_update on bids for update
  using (org_role_of(org_id) in ('owner', 'pm'));
create policy bids_delete on bids for delete
  using (org_role_of(org_id) in ('owner', 'pm'));

create trigger audit_vendors after insert or update or delete on vendors
  for each row execute function record_audit();
create trigger audit_bids after insert or update or delete on bids
  for each row execute function record_audit();

grant select, insert, update, delete on vendors to authenticated;
grant select, insert, update, delete on bids to authenticated;
grant execute on function award_bid(uuid) to authenticated;

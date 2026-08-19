-- FlipScope migration 001 — Foundation
-- Multi-tenant schema: Organization → Portfolio → Property → Project
-- Money model: integer cents only, single ledger, single rollup engine.
-- Security model: RLS deny-by-default, org membership first, then role.

create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────────
-- Roles
-- ─────────────────────────────────────────────
create type org_role as enum ('owner', 'pm', 'field_crew', 'investor', 'subcontractor');

create type project_status as enum ('lead', 'analysis', 'under_contract', 'rehab', 'listed', 'sold', 'archived');

create type ledger_entry_type as enum ('budget', 'committed', 'actual', 'revenue');

-- ─────────────────────────────────────────────
-- Tenancy
-- ─────────────────────────────────────────────
create table organizations (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table org_members (
  org_id      uuid not null references organizations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        org_role not null,
  created_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table portfolios (
  id          uuid primary key default uuid_generate_v4(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);

create table properties (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references organizations(id) on delete cascade,
  portfolio_id  uuid not null references portfolios(id) on delete cascade,
  address       text not null,
  city          text,
  state         text,
  zip           text,
  created_at    timestamptz not null default now()
);

create table projects (
  id           uuid primary key default uuid_generate_v4(),
  org_id       uuid not null references organizations(id) on delete cascade,
  property_id  uuid not null references properties(id) on delete cascade,
  name         text not null,
  status       project_status not null default 'lead',
  arv_cents    bigint,                    -- after-repair value; manual until Phase 4 comps feed
  purchase_price_cents bigint,
  started_at   date,
  target_finish date,
  created_at   timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- Financial engine: one ledger, nothing else stores money
-- ─────────────────────────────────────────────
create table ledger_entries (
  id           uuid primary key default uuid_generate_v4(),
  org_id       uuid not null references organizations(id) on delete cascade,
  project_id   uuid not null references projects(id) on delete cascade,
  entry_type   ledger_entry_type not null,
  category     text not null,             -- e.g. 'demo', 'roof', 'kitchen', 'holding', 'sale'
  description  text,
  amount_cents bigint not null,           -- integer cents, never floats
  entry_date   date not null default current_date,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now()
);

create index ledger_entries_project_idx on ledger_entries (project_id, entry_type);
create index ledger_entries_org_idx on ledger_entries (org_id);

-- The single financial engine. Every screen reads these figures from here;
-- no client-side or duplicate computation anywhere.
create or replace function project_financials(p_project_id uuid)
returns table (
  project_id       uuid,
  budget_cents     bigint,
  committed_cents  bigint,
  actual_cents     bigint,
  revenue_cents    bigint,
  profit_cents     bigint,
  roi_bps          bigint     -- return on cost, basis points (10000 = 100%)
)
language sql
stable
security invoker            -- RLS applies: callers only see projects they can read
as $$
  with sums as (
    select
      coalesce(sum(amount_cents) filter (where entry_type = 'budget'), 0)    as budget_cents,
      coalesce(sum(amount_cents) filter (where entry_type = 'committed'), 0) as committed_cents,
      coalesce(sum(amount_cents) filter (where entry_type = 'actual'), 0)    as actual_cents,
      coalesce(sum(amount_cents) filter (where entry_type = 'revenue'), 0)   as revenue_cents
    from ledger_entries
    where ledger_entries.project_id = p_project_id
  ),
  base as (
    select coalesce(p.purchase_price_cents, 0) as purchase_cents
    from projects p where p.id = p_project_id
  )
  select
    p_project_id,
    s.budget_cents,
    s.committed_cents,
    s.actual_cents,
    s.revenue_cents,
    s.revenue_cents - (s.actual_cents + b.purchase_cents)                    as profit_cents,
    case when (s.actual_cents + b.purchase_cents) = 0 then 0
         else round(((s.revenue_cents - (s.actual_cents + b.purchase_cents))::numeric * 10000)
              / (s.actual_cents + b.purchase_cents))::bigint
    end                                                                      as roi_bps
  from sums s, base b;
$$;

-- Portfolio rollup: re-aggregates the same ledger the project screen reads.
create or replace function portfolio_financials(p_portfolio_id uuid)
returns table (
  portfolio_id     uuid,
  budget_cents     bigint,
  committed_cents  bigint,
  actual_cents     bigint,
  revenue_cents    bigint,
  profit_cents     bigint,
  roi_bps          bigint
)
language sql
stable
security invoker
as $$
  with proj as (
    select pr.id, coalesce(pr.purchase_price_cents, 0) as purchase_cents
    from projects pr
    join properties p on p.id = pr.property_id
    where p.portfolio_id = p_portfolio_id
  ),
  sums as (
    select
      coalesce(sum(le.amount_cents) filter (where le.entry_type = 'budget'), 0)    as budget_cents,
      coalesce(sum(le.amount_cents) filter (where le.entry_type = 'committed'), 0) as committed_cents,
      coalesce(sum(le.amount_cents) filter (where le.entry_type = 'actual'), 0)    as actual_cents,
      coalesce(sum(le.amount_cents) filter (where le.entry_type = 'revenue'), 0)   as revenue_cents,
      coalesce((select sum(purchase_cents) from proj), 0)                          as purchase_cents
    from ledger_entries le
    where le.project_id in (select id from proj)
  )
  select
    p_portfolio_id,
    s.budget_cents,
    s.committed_cents,
    s.actual_cents,
    s.revenue_cents,
    s.revenue_cents - (s.actual_cents + s.purchase_cents),
    case when (s.actual_cents + s.purchase_cents) = 0 then 0
         else round(((s.revenue_cents - (s.actual_cents + s.purchase_cents))::numeric * 10000)
              / (s.actual_cents + s.purchase_cents))::bigint
    end
  from sums s;
$$;

-- ─────────────────────────────────────────────
-- Row-level security: deny by default, org membership first, then role
-- ─────────────────────────────────────────────
alter table organizations  enable row level security;
alter table org_members    enable row level security;
alter table portfolios     enable row level security;
alter table properties     enable row level security;
alter table projects       enable row level security;
alter table ledger_entries enable row level security;

-- Membership check helpers. security definer so they can read org_members
-- without recursive RLS; search_path pinned.
create or replace function is_org_member(p_org_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from org_members
    where org_id = p_org_id and user_id = auth.uid()
  );
$$;

create or replace function org_role_of(p_org_id uuid)
returns org_role language sql stable security definer set search_path = public as $$
  select role from org_members
  where org_id = p_org_id and user_id = auth.uid();
$$;

-- organizations: members can see their own org; only service role creates orgs (Phase 0)
create policy org_select on organizations for select
  using (is_org_member(id));

-- org_members: members can see the member list of their own orgs;
-- only owners manage membership
create policy members_select on org_members for select
  using (is_org_member(org_id));
create policy members_insert on org_members for insert
  with check (org_role_of(org_id) = 'owner');
create policy members_update on org_members for update
  using (org_role_of(org_id) = 'owner');
create policy members_delete on org_members for delete
  using (org_role_of(org_id) = 'owner');

-- portfolios / properties / projects: visible to all org members;
-- writable by owner and pm
create policy portfolios_select on portfolios for select
  using (is_org_member(org_id));
create policy portfolios_write on portfolios for insert
  with check (org_role_of(org_id) in ('owner', 'pm'));
create policy portfolios_update on portfolios for update
  using (org_role_of(org_id) in ('owner', 'pm'));
create policy portfolios_delete on portfolios for delete
  using (org_role_of(org_id) = 'owner');

create policy properties_select on properties for select
  using (is_org_member(org_id));
create policy properties_write on properties for insert
  with check (org_role_of(org_id) in ('owner', 'pm'));
create policy properties_update on properties for update
  using (org_role_of(org_id) in ('owner', 'pm'));
create policy properties_delete on properties for delete
  using (org_role_of(org_id) = 'owner');

create policy projects_select on projects for select
  using (is_org_member(org_id));
create policy projects_write on projects for insert
  with check (org_role_of(org_id) in ('owner', 'pm'));
create policy projects_update on projects for update
  using (org_role_of(org_id) in ('owner', 'pm'));
create policy projects_delete on projects for delete
  using (org_role_of(org_id) = 'owner');

-- ledger_entries: financials hidden from field_crew and subcontractor
-- (per the Phase 1 permission matrix; enforced from day one)
create policy ledger_select on ledger_entries for select
  using (org_role_of(org_id) in ('owner', 'pm', 'investor'));
create policy ledger_insert on ledger_entries for insert
  with check (org_role_of(org_id) in ('owner', 'pm'));
-- No update/delete policies on purpose: ledger corrections are new
-- offsetting entries, keeping the money trail append-only.

-- ─────────────────────────────────────────────
-- Grants: table-level access for authenticated users; RLS gates the rows.
-- anon gets nothing — every request must carry a real session.
-- ─────────────────────────────────────────────
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

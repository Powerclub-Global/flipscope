-- Tenant-isolation test suite (pgTAP).
-- Two orgs, one user in each: no query may cross the org boundary,
-- and role restrictions on financials must hold.
begin;
select plan(12);

-- Seed: two users, two orgs, membership
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@hanger.test'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@other.test'),
  ('00000000-0000-0000-0000-00000000000c', 'crew@hanger.test');

insert into organizations (id, name) values
  ('00000000-0000-0000-0000-0000000000a0', 'Hanger Investments'),
  ('00000000-0000-0000-0000-0000000000b0', 'Other LLC');

insert into org_members (org_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-00000000000a', 'owner'),
  ('00000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-00000000000b', 'owner'),
  ('00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-00000000000c', 'field_crew');

insert into portfolios (id, org_id, name) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a0', 'Hanger P1'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b0', 'Other P1');

insert into properties (id, org_id, portfolio_id, address) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-0000000000a1', '1 Hanger St'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-0000000000b1', '2 Other Ave');

insert into projects (id, org_id, property_id, name, purchase_price_cents) values
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-0000000000a2', 'Hanger Flip', 10000000),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-0000000000b2', 'Other Flip', 20000000);

insert into ledger_entries (org_id, project_id, entry_type, category, amount_cents) values
  ('00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-0000000000a3', 'budget', 'kitchen', 2500000),
  ('00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-0000000000a3', 'actual', 'kitchen', 2600000),
  ('00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-0000000000a3', 'revenue', 'sale', 15000000),
  ('00000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-0000000000b3', 'budget', 'roof', 1000000);

-- ── As Alice (owner of Hanger) ──
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';

select is(
  (select count(*)::int from organizations), 1,
  'Alice sees exactly her own org');

select is(
  (select count(*)::int from projects), 1,
  'Alice sees only Hanger projects');

select is(
  (select count(*)::int from ledger_entries), 3,
  'Alice sees only Hanger ledger entries');

select is(
  (select count(*)::int from project_financials('00000000-0000-0000-0000-0000000000b3') f where f.budget_cents > 0), 0,
  'Financial engine returns no data for a cross-org project');

-- Financial engine correctness, to the cent
select is(
  (select budget_cents from project_financials('00000000-0000-0000-0000-0000000000a3')), 2500000::bigint,
  'Budget aggregates to the cent');
select is(
  (select profit_cents from project_financials('00000000-0000-0000-0000-0000000000a3')), (15000000 - (2600000 + 10000000))::bigint,
  'Profit = revenue - (actual + purchase)');
select is(
  (select roi_bps from project_financials('00000000-0000-0000-0000-0000000000a3')), round((15000000 - 12600000)::numeric * 10000 / 12600000)::bigint,
  'ROI rounds to the nearest basis point');

-- Cross-org write must fail
select throws_ok(
  $$ insert into projects (org_id, property_id, name)
     values ('00000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-0000000000b2', 'Intrusion') $$,
  '42501', null,
  'Alice cannot insert a project into another org');

-- Ledger is append-only even for owners: with no update policy, RLS
-- filters every row out of the update — the amounts must be untouched.
update ledger_entries set amount_cents = 1 where category = 'kitchen';
select is(
  (select count(*)::int from ledger_entries where amount_cents = 1), 0,
  'Ledger entries cannot be updated, even by the org owner');

-- ── As Crew (field_crew in Hanger) ──
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}';

select is(
  (select count(*)::int from projects), 1,
  'Crew sees Hanger projects');
select is(
  (select count(*)::int from ledger_entries), 0,
  'Crew cannot read financials');

-- ── As Bob (owner of Other LLC) ──
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}';
select is(
  (select count(*)::int from ledger_entries), 1,
  'Bob sees only his own ledger');

select * from finish();
rollback;

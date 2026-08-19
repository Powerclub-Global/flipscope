-- Phase 2 tests: cash-flow calendar and risk signals aggregate correctly,
-- portfolio totals equal the sum of project totals to the cent, and the
-- portfolio layer respects tenancy and role gates.
begin;
select plan(10);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@hanger.test'),
  ('00000000-0000-0000-0000-00000000000c', 'crew@hanger.test'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@other.test');

insert into organizations (id, name) values
  ('00000000-0000-0000-0000-0000000000a0', 'Hanger Investments'),
  ('00000000-0000-0000-0000-0000000000b0', 'Other LLC');

insert into org_members (org_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-00000000000a', 'owner'),
  ('00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-00000000000c', 'field_crew'),
  ('00000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-00000000000b', 'owner');

insert into portfolios (id, org_id, name) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a0', 'Hanger P1');

insert into properties (id, org_id, portfolio_id, address) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-0000000000a1', '1 Hanger St'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-0000000000a1', '2 Hanger Ave');

-- Project 1: on budget, future target. Project 2: over budget, past target.
insert into projects (id, org_id, property_id, name, purchase_price_cents, started_at, target_finish) values
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-0000000000a2', 'Flip One', 10000000, '2026-06-15', current_date + 60),
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-0000000000e2', 'Flip Two', 5000000,  '2026-07-01', current_date - 5);

insert into ledger_entries (org_id, project_id, entry_type, category, amount_cents, entry_date) values
  -- Flip One: budget 30k, spent 15k (50%), sold for 2k in a later month
  ('00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-0000000000a3', 'budget',  'rehab', 3000000, '2026-06-15'),
  ('00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-0000000000a3', 'actual',  'rehab', 1500000, '2026-06-20'),
  ('00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-0000000000a3', 'revenue', 'sale',   200000, '2026-07-10'),
  -- Flip Two: budget 10k, spent 12k (120% — over budget)
  ('00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-0000000000e3', 'budget',  'rehab', 1000000, '2026-07-01'),
  ('00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-0000000000e3', 'actual',  'rehab', 1200000, '2026-07-05');

set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';

-- Portfolio totals = sum of project totals, to the cent
select is(
  (select budget_cents from portfolio_financials('00000000-0000-0000-0000-0000000000a1')),
  (select (select budget_cents from project_financials('00000000-0000-0000-0000-0000000000a3'))
        + (select budget_cents from project_financials('00000000-0000-0000-0000-0000000000e3'))),
  'Portfolio budget equals the sum of project budgets');

select is(
  (select profit_cents from portfolio_financials('00000000-0000-0000-0000-0000000000a1')),
  (select (select profit_cents from project_financials('00000000-0000-0000-0000-0000000000a3'))
        + (select profit_cents from project_financials('00000000-0000-0000-0000-0000000000e3'))),
  'Portfolio profit equals the sum of project profits');

-- Cash-flow calendar
select is(
  (select count(*)::int from portfolio_cashflow('00000000-0000-0000-0000-0000000000a1')), 2,
  'Cash flow groups into the months that have activity');

select is(
  (select outflow_cents from portfolio_cashflow('00000000-0000-0000-0000-0000000000a1') where month = '2026-06-01'),
  (10000000 + 1500000)::bigint,
  'June outflow = Flip One purchase + June spend');

select is(
  (select inflow_cents from portfolio_cashflow('00000000-0000-0000-0000-0000000000a1') where month = '2026-07-01'),
  200000::bigint,
  'July inflow = sale revenue');

select is(
  (select net_cents from portfolio_cashflow('00000000-0000-0000-0000-0000000000a1') where month = '2026-07-01'),
  (200000 - (5000000 + 1200000))::bigint,
  'July net = revenue - (Flip Two purchase + spend)');

-- Risk signals
select is(
  (select risk_level from portfolio_risk('00000000-0000-0000-0000-0000000000a1')
   where project_name = 'Flip Two'), 'red',
  'Over budget + past target = red');

select is(
  (select budget_used_bps from portfolio_risk('00000000-0000-0000-0000-0000000000a1')
   where project_name = 'Flip Two'), 12000::bigint,
  'Budget usage reported in basis points');

select is(
  (select risk_level from portfolio_risk('00000000-0000-0000-0000-0000000000a1')
   where project_name = 'Flip One'), 'green',
  'On budget + comfortable runway = green');

-- Tenancy: Bob sees an empty portfolio layer
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}';
select is(
  (select count(*)::int from portfolio_cashflow('00000000-0000-0000-0000-0000000000a1'))
  + (select count(*)::int from portfolio_risk('00000000-0000-0000-0000-0000000000a1')), 0,
  'Cash flow and risk never cross the org boundary');

select * from finish();
rollback;

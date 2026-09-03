-- Deal underwriting test suite (pgTAP).
begin;
select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000001001', 'owner10@hanger.test'),
  ('00000000-0000-0000-0000-000000001003', 'crew10@hanger.test');

insert into organizations (id, name) values
  ('00000000-0000-0000-0000-000000001010', 'Hanger Investments 10');

insert into org_members (org_id, user_id, role) values
  ('00000000-0000-0000-0000-000000001010', '00000000-0000-0000-0000-000000001001', 'owner'),
  ('00000000-0000-0000-0000-000000001010', '00000000-0000-0000-0000-000000001003', 'field_crew');

insert into portfolios (id, org_id, name) values
  ('00000000-0000-0000-0000-000000001011', '00000000-0000-0000-0000-000000001010', 'Hanger P10');
insert into properties (id, org_id, portfolio_id, address) values
  ('00000000-0000-0000-0000-000000001012', '00000000-0000-0000-0000-000000001010', '00000000-0000-0000-0000-000000001011', '10 Hanger St');

-- 212 E Maple-style deal: 119,500 purchase / 205,000 ARV
insert into projects (id, org_id, property_id, name, purchase_price_cents, arv_cents,
                      financing_cents, holding_cents, contingency_cents, selling_pct_bps, target_margin_bps)
values ('00000000-0000-0000-0000-000000001013', '00000000-0000-0000-0000-000000001010', '00000000-0000-0000-0000-000000001012',
        'Hanger Flip 10', 11950000, 20500000, 420000, 620000, 650000, 700, 1800);

set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-000000001001", "role": "authenticated"}';

insert into ledger_entries (org_id, project_id, entry_type, category, amount_cents) values
  ('00000000-0000-0000-0000-000000001010', '00000000-0000-0000-0000-000000001013', 'budget', 'kitchen', 2450000),
  ('00000000-0000-0000-0000-000000001010', '00000000-0000-0000-0000-000000001013', 'budget', 'flooring', 840000),
  ('00000000-0000-0000-0000-000000001010', '00000000-0000-0000-0000-000000001013', 'actual', 'kitchen', 1120000);

select is((select rehab_cents from project_underwriting('00000000-0000-0000-0000-000000001013')), 3290000::bigint,
  'Rehab is the approved budget, not actual spend');

select is((select selling_cents from project_underwriting('00000000-0000-0000-0000-000000001013')), 1435000::bigint,
  'Selling cost is ARV * selling_pct_bps');

select is((select all_in_cents from project_underwriting('00000000-0000-0000-0000-000000001013')),
  (11950000 + 3290000 + 420000 + 620000 + 650000 + 1435000)::bigint,
  'All-in sums purchase, rehab, financing, holding, contingency and selling');

select is((select profit_cents from project_underwriting('00000000-0000-0000-0000-000000001013')),
  (20500000 - (11950000 + 3290000 + 420000 + 620000 + 650000 + 1435000))::bigint,
  'Profit is ARV minus all-in');

select is((select margin_bps from project_underwriting('00000000-0000-0000-0000-000000001013')),
  round((20500000 - 18365000)::numeric * 10000 / 20500000)::bigint,
  'Margin is profit over ARV in basis points');

select is((select meets_target from project_underwriting('00000000-0000-0000-0000-000000001013')), false,
  'A 10.4% margin does not meet the 18% target');

update projects set target_margin_bps = 1000 where id = '00000000-0000-0000-0000-000000001013';
select is((select meets_target from project_underwriting('00000000-0000-0000-0000-000000001013')), true,
  'Lowering the target to 10% makes the deal pass');

-- Crew cannot read the ledger, so underwriting returns no rehab for them.
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-000000001003", "role": "authenticated"}';
select is((select rehab_cents from project_underwriting('00000000-0000-0000-0000-000000001013')), 0::bigint,
  'Underwriting respects ledger RLS for roles without financial access');

select * from finish();
rollback;

-- Change Orders & RFIs test suite (pgTAP).
begin;
select plan(12);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000801', 'owner8@hanger.test'),
  ('00000000-0000-0000-0000-000000000802', 'other8@other.test'),
  ('00000000-0000-0000-0000-000000000803', 'crew8@hanger.test');

insert into organizations (id, name) values
  ('00000000-0000-0000-0000-000000000810', 'Hanger Investments 8'),
  ('00000000-0000-0000-0000-000000000820', 'Other LLC 8');

insert into org_members (org_id, user_id, role) values
  ('00000000-0000-0000-0000-000000000810', '00000000-0000-0000-0000-000000000801', 'owner'),
  ('00000000-0000-0000-0000-000000000820', '00000000-0000-0000-0000-000000000802', 'owner'),
  ('00000000-0000-0000-0000-000000000810', '00000000-0000-0000-0000-000000000803', 'field_crew');

insert into portfolios (id, org_id, name) values
  ('00000000-0000-0000-0000-000000000811', '00000000-0000-0000-0000-000000000810', 'Hanger P8');
insert into properties (id, org_id, portfolio_id, address) values
  ('00000000-0000-0000-0000-000000000812', '00000000-0000-0000-0000-000000000810', '00000000-0000-0000-0000-000000000811', '8 Hanger St');
insert into projects (id, org_id, property_id, name) values
  ('00000000-0000-0000-0000-000000000813', '00000000-0000-0000-0000-000000000810', '00000000-0000-0000-0000-000000000812', 'Hanger Flip 8');
insert into ledger_entries (org_id, project_id, entry_type, category, amount_cents) values
  ('00000000-0000-0000-0000-000000000810', '00000000-0000-0000-0000-000000000813', 'budget', 'kitchen', 2000000);

-- ── As owner ──
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-000000000801", "role": "authenticated"}';

insert into change_orders (id, org_id, project_id, title, amount_cents, schedule_impact_days) values
  ('00000000-0000-0000-0000-000000000814', '00000000-0000-0000-0000-000000000810', '00000000-0000-0000-0000-000000000813', 'Replace damaged subfloor', 185000, 2),
  ('00000000-0000-0000-0000-000000000815', '00000000-0000-0000-0000-000000000810', '00000000-0000-0000-0000-000000000813', 'Upgrade kitchen lighting', 97500, 0);

select is((select number from change_orders where id = '00000000-0000-0000-0000-000000000814'), 1, 'First CO is numbered 1');
select is((select number from change_orders where id = '00000000-0000-0000-0000-000000000815'), 2, 'Second CO is numbered 2');
select is((select requested_by from change_orders where id = '00000000-0000-0000-0000-000000000814'), '00000000-0000-0000-0000-000000000801'::uuid, 'requested_by is stamped from auth.uid()');

select lives_ok(
  $$ select decide_change_order('00000000-0000-0000-0000-000000000814', true, 'Approved on site') $$,
  'Owner can approve a change order');
select is((select status::text from change_orders where id = '00000000-0000-0000-0000-000000000814'), 'approved', 'CO is approved');
select is(
  (select budget_cents from project_financials('00000000-0000-0000-0000-000000000813')), (2000000 + 185000)::bigint,
  'Approving a CO raises the project budget by its amount');

select lives_ok(
  $$ select decide_change_order('00000000-0000-0000-0000-000000000815', false, 'Not now') $$,
  'Owner can reject a change order');
select is(
  (select budget_cents from project_financials('00000000-0000-0000-0000-000000000813')), (2000000 + 185000)::bigint,
  'Rejecting a CO does not touch the budget');

select throws_ok(
  $$ select decide_change_order('00000000-0000-0000-0000-000000000814', true) $$,
  'P0001', 'change order is already approved',
  'A decided CO cannot be decided again');

-- ── As crew ──
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-000000000803", "role": "authenticated"}';

insert into rfis (id, org_id, project_id, question) values
  ('00000000-0000-0000-0000-000000000816', '00000000-0000-0000-0000-000000000810', '00000000-0000-0000-0000-000000000813', 'Which side does the dishwasher go on?');
select is((select status::text from rfis where id = '00000000-0000-0000-0000-000000000816'), 'open', 'Crew can raise an RFI');
select is((select count(*)::int from change_orders), 0, 'Crew cannot see change order amounts');

-- ── As owner: answer the RFI ──
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-000000000801", "role": "authenticated"}';
select answer_rfi('00000000-0000-0000-0000-000000000816', 'Left of the sink, per the plan.');
select is((select status::text from rfis where id = '00000000-0000-0000-0000-000000000816'), 'answered', 'Owner can answer an RFI');

select * from finish();
rollback;

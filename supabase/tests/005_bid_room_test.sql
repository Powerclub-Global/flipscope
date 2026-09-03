-- Bid Room test suite (pgTAP).
begin;
select plan(10);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000501', 'owner5@hanger.test'),
  ('00000000-0000-0000-0000-000000000502', 'other5@other.test'),
  ('00000000-0000-0000-0000-000000000503', 'crew5@hanger.test');

insert into organizations (id, name) values
  ('00000000-0000-0000-0000-000000000510', 'Hanger Investments 5'),
  ('00000000-0000-0000-0000-000000000520', 'Other LLC 5');

insert into org_members (org_id, user_id, role) values
  ('00000000-0000-0000-0000-000000000510', '00000000-0000-0000-0000-000000000501', 'owner'),
  ('00000000-0000-0000-0000-000000000520', '00000000-0000-0000-0000-000000000502', 'owner'),
  ('00000000-0000-0000-0000-000000000510', '00000000-0000-0000-0000-000000000503', 'field_crew');

insert into portfolios (id, org_id, name) values
  ('00000000-0000-0000-0000-000000000511', '00000000-0000-0000-0000-000000000510', 'Hanger P5');
insert into properties (id, org_id, portfolio_id, address) values
  ('00000000-0000-0000-0000-000000000512', '00000000-0000-0000-0000-000000000510', '00000000-0000-0000-0000-000000000511', '5 Hanger St');
insert into projects (id, org_id, property_id, name) values
  ('00000000-0000-0000-0000-000000000513', '00000000-0000-0000-0000-000000000510', '00000000-0000-0000-0000-000000000512', 'Hanger Flip 5');

-- ── As owner of Hanger ──
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-000000000501", "role": "authenticated"}';

insert into vendors (id, org_id, name, trade) values
  ('00000000-0000-0000-0000-000000000514', '00000000-0000-0000-0000-000000000510', 'Red River Millwork', 'Cabinets'),
  ('00000000-0000-0000-0000-000000000515', '00000000-0000-0000-0000-000000000510', 'Sooner Cabinets', 'Cabinets');

insert into bids (id, org_id, project_id, vendor_id, trade, amount_cents, duration_days) values
  ('00000000-0000-0000-0000-000000000516', '00000000-0000-0000-0000-000000000510', '00000000-0000-0000-0000-000000000513', '00000000-0000-0000-0000-000000000514', 'Cabinets', 720000, 5),
  ('00000000-0000-0000-0000-000000000517', '00000000-0000-0000-0000-000000000510', '00000000-0000-0000-0000-000000000513', '00000000-0000-0000-0000-000000000515', 'Cabinets', 665000, 8);

select is((select count(*)::int from bids), 2, 'Owner sees both bids');
select is((select status::text from bids where id = '00000000-0000-0000-0000-000000000516'), 'quoted', 'New bids default to quoted');

select lives_ok(
  $$ select award_bid('00000000-0000-0000-0000-000000000516') $$,
  'Owner can award a bid');

select is((select status::text from bids where id = '00000000-0000-0000-0000-000000000516'), 'awarded', 'Awarded bid is marked awarded');
select is((select status::text from bids where id = '00000000-0000-0000-0000-000000000517'), 'declined', 'Competing bid for the same trade is declined');

select is(
  (select committed_cents from project_financials('00000000-0000-0000-0000-000000000513')), 720000::bigint,
  'Awarding a bid commits its amount in the ledger');

select lives_ok(
  $$ select award_bid('00000000-0000-0000-0000-000000000516') $$,
  'Re-awarding is a no-op');
select is(
  (select committed_cents from project_financials('00000000-0000-0000-0000-000000000513')), 720000::bigint,
  'Re-awarding does not double-commit');

-- ── As Crew ──
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-000000000503", "role": "authenticated"}';
select is((select count(*)::int from bids), 0, 'Crew cannot see bid amounts');

-- ── As other org ──
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-000000000502", "role": "authenticated"}';
select throws_ok(
  $$ select award_bid('00000000-0000-0000-0000-000000000516') $$,
  'P0001', 'bid not found or not visible',
  'Another org cannot award a Hanger bid');

select * from finish();
rollback;

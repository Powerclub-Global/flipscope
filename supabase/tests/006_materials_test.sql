-- Materials & POs test suite (pgTAP).
begin;
select plan(10);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000601', 'owner6@hanger.test'),
  ('00000000-0000-0000-0000-000000000602', 'other6@other.test'),
  ('00000000-0000-0000-0000-000000000603', 'crew6@hanger.test');

insert into organizations (id, name) values
  ('00000000-0000-0000-0000-000000000610', 'Hanger Investments 6'),
  ('00000000-0000-0000-0000-000000000620', 'Other LLC 6');

insert into org_members (org_id, user_id, role) values
  ('00000000-0000-0000-0000-000000000610', '00000000-0000-0000-0000-000000000601', 'owner'),
  ('00000000-0000-0000-0000-000000000620', '00000000-0000-0000-0000-000000000602', 'owner'),
  ('00000000-0000-0000-0000-000000000610', '00000000-0000-0000-0000-000000000603', 'field_crew');

insert into portfolios (id, org_id, name) values
  ('00000000-0000-0000-0000-000000000611', '00000000-0000-0000-0000-000000000610', 'Hanger P6');
insert into properties (id, org_id, portfolio_id, address) values
  ('00000000-0000-0000-0000-000000000612', '00000000-0000-0000-0000-000000000610', '00000000-0000-0000-0000-000000000611', '6 Hanger St');
insert into projects (id, org_id, property_id, name) values
  ('00000000-0000-0000-0000-000000000613', '00000000-0000-0000-0000-000000000610', '00000000-0000-0000-0000-000000000612', 'Hanger Flip 6');

-- ── As owner ──
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-000000000601", "role": "authenticated"}';

insert into materials (id, org_id, project_id, name, retailer, sku, qty, unit, unit_price_cents) values
  ('00000000-0000-0000-0000-000000000614', '00000000-0000-0000-0000-000000000610', '00000000-0000-0000-0000-000000000613', 'Driftwood Oak LVP', 'lowes', 'LVP-1234', 1320, 'SF', 280),
  ('00000000-0000-0000-0000-000000000615', '00000000-0000-0000-0000-000000000610', '00000000-0000-0000-0000-000000000613', 'Matte Black Faucet', 'amazon', null, 1, 'EA', 18900);

select is((select count(*)::int from materials), 2, 'Owner sees both materials');
select is(
  (select materials_total('00000000-0000-0000-0000-000000000613')), (1320 * 280 + 18900)::bigint,
  'Materials total = sum(qty * unit price)');

select lives_ok(
  $$ select order_material('00000000-0000-0000-0000-000000000614') $$,
  'Owner can place an order');
select is((select status::text from materials where id = '00000000-0000-0000-0000-000000000614'), 'ordered', 'Ordered material is marked ordered');
select is((select ordered_at from materials where id = '00000000-0000-0000-0000-000000000614'), current_date, 'ordered_at is stamped');
select is(
  (select committed_cents from project_financials('00000000-0000-0000-0000-000000000613')), (1320 * 280)::bigint,
  'Ordering commits qty * unit price in the ledger');

select throws_ok(
  $$ select order_material('00000000-0000-0000-0000-000000000614') $$,
  'P0001', 'material is already ordered',
  'Cannot order the same material twice');

-- ── As crew ──
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-000000000603", "role": "authenticated"}';
select is((select count(*)::int from materials), 2, 'Crew sees the material list');

update materials set status = 'delivered', delivered_at = current_date where id = '00000000-0000-0000-0000-000000000614';
select is((select status::text from materials where id = '00000000-0000-0000-0000-000000000614'), 'delivered', 'Crew can mark a delivery received');

-- ── As other org ──
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-000000000602", "role": "authenticated"}';
select is((select count(*)::int from materials), 0, 'Other org sees no Hanger materials');

select * from finish();
rollback;

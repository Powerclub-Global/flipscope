-- Scope & Estimate test suite (pgTAP).
begin;
select plan(9);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000401', 'owner4@hanger.test'),
  ('00000000-0000-0000-0000-000000000402', 'other4@other.test'),
  ('00000000-0000-0000-0000-000000000403', 'crew4@hanger.test');

insert into organizations (id, name) values
  ('00000000-0000-0000-0000-000000000410', 'Hanger Investments 4'),
  ('00000000-0000-0000-0000-000000000420', 'Other LLC 4');

insert into org_members (org_id, user_id, role) values
  ('00000000-0000-0000-0000-000000000410', '00000000-0000-0000-0000-000000000401', 'owner'),
  ('00000000-0000-0000-0000-000000000420', '00000000-0000-0000-0000-000000000402', 'owner'),
  ('00000000-0000-0000-0000-000000000410', '00000000-0000-0000-0000-000000000403', 'field_crew');

insert into portfolios (id, org_id, name) values
  ('00000000-0000-0000-0000-000000000411', '00000000-0000-0000-0000-000000000410', 'Hanger P4'),
  ('00000000-0000-0000-0000-000000000421', '00000000-0000-0000-0000-000000000420', 'Other P4');

insert into properties (id, org_id, portfolio_id, address) values
  ('00000000-0000-0000-0000-000000000412', '00000000-0000-0000-0000-000000000410', '00000000-0000-0000-0000-000000000411', '4 Hanger St'),
  ('00000000-0000-0000-0000-000000000422', '00000000-0000-0000-0000-000000000420', '00000000-0000-0000-0000-000000000421', '4 Other Ave');

insert into projects (id, org_id, property_id, name) values
  ('00000000-0000-0000-0000-000000000413', '00000000-0000-0000-0000-000000000410', '00000000-0000-0000-0000-000000000412', 'Hanger Flip 4'),
  ('00000000-0000-0000-0000-000000000423', '00000000-0000-0000-0000-000000000420', '00000000-0000-0000-0000-000000000422', 'Other Flip 4');

-- ── As owner of Hanger ──
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-000000000401", "role": "authenticated"}';

insert into scope_items (org_id, project_id, room, trade, task, qty, unit, labor_cents, material_cents)
values ('00000000-0000-0000-0000-000000000410', '00000000-0000-0000-0000-000000000413', 'Kitchen', 'Cabinets', 'Install shaker cabinets', 18, 'LF', 11000, 16500);

select is(
  (select count(*)::int from scope_items), 1,
  'Owner sees exactly the scope item they inserted');

select is(
  (select scope_estimate_total('00000000-0000-0000-0000-000000000413')), (18 * (11000 + 16500))::bigint,
  'Scope estimate total = sum(qty * (labor + material))');

select is(
  (select status::text from scope_items limit 1), 'planned',
  'New scope items default to planned status');

update scope_items set status = 'done' where task = 'Install shaker cabinets';
select is(
  (select status::text from scope_items limit 1), 'done',
  'Owner can update scope item status');

select throws_ok(
  $$ insert into scope_items (org_id, project_id, room, trade, task)
     values ('00000000-0000-0000-0000-000000000420', '00000000-0000-0000-0000-000000000423', 'Kitchen', 'Demo', 'Intrusion') $$,
  '42501', null,
  'Owner cannot insert a scope item into another org''s project');

-- ── As Crew (field_crew in Hanger) ──
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-000000000403", "role": "authenticated"}';

select is(
  (select count(*)::int from scope_items), 1,
  'Crew can read the scope list');

select throws_ok(
  $$ insert into scope_items (org_id, project_id, room, trade, task)
     values ('00000000-0000-0000-0000-000000000410', '00000000-0000-0000-0000-000000000413', 'Bath', 'Tile', 'Crew cannot add scope') $$,
  '42501', null,
  'Crew cannot insert scope items');

update scope_items set status = 'ready';
select is(
  (select count(*)::int from scope_items where status = 'ready'), 0,
  'Crew cannot update scope items (RLS filters the update to zero rows)');

-- ── As owner of Other LLC ──
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-000000000402", "role": "authenticated"}';

select is(
  (select count(*)::int from scope_items), 0,
  'Other org owner sees no Hanger scope items');

select * from finish();
rollback;

-- Closeout & Warranty test suite (pgTAP).
begin;
select plan(12);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000901', 'owner9@hanger.test'),
  ('00000000-0000-0000-0000-000000000902', 'other9@other.test'),
  ('00000000-0000-0000-0000-000000000903', 'crew9@hanger.test');

insert into organizations (id, name) values
  ('00000000-0000-0000-0000-000000000910', 'Hanger Investments 9'),
  ('00000000-0000-0000-0000-000000000920', 'Other LLC 9');

insert into org_members (org_id, user_id, role) values
  ('00000000-0000-0000-0000-000000000910', '00000000-0000-0000-0000-000000000901', 'owner'),
  ('00000000-0000-0000-0000-000000000920', '00000000-0000-0000-0000-000000000902', 'owner'),
  ('00000000-0000-0000-0000-000000000910', '00000000-0000-0000-0000-000000000903', 'field_crew');

insert into portfolios (id, org_id, name) values
  ('00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000910', 'Hanger P9');
insert into properties (id, org_id, portfolio_id, address) values
  ('00000000-0000-0000-0000-000000000912', '00000000-0000-0000-0000-000000000910', '00000000-0000-0000-0000-000000000911', '9 Hanger St');
insert into projects (id, org_id, property_id, name, status) values
  ('00000000-0000-0000-0000-000000000913', '00000000-0000-0000-0000-000000000910', '00000000-0000-0000-0000-000000000912', 'Hanger Flip 9', 'rehab');

-- ── As owner ──
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-000000000901", "role": "authenticated"}';

select throws_ok(
  $$ select close_project('00000000-0000-0000-0000-000000000913') $$,
  'P0001', 'closeout checklist has not been started',
  'Cannot close before the checklist exists');

select seed_closeout_checklist('00000000-0000-0000-0000-000000000913');
select is((select count(*)::int from closeout_items), 7, 'Seeding creates the standard 7-item checklist');

select seed_closeout_checklist('00000000-0000-0000-0000-000000000913');
select is((select count(*)::int from closeout_items), 7, 'Seeding twice does not duplicate the checklist');

select is((select checklist_open from closeout_readiness('00000000-0000-0000-0000-000000000913')), 5, 'Five required items start open');

-- ── As crew: raise a punch item ──
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-000000000903", "role": "authenticated"}';
insert into punch_items (id, org_id, project_id, room, title) values
  ('00000000-0000-0000-0000-000000000914', '00000000-0000-0000-0000-000000000910', '00000000-0000-0000-0000-000000000913', 'Kitchen', 'Adjust cabinet door');
select is((select raised_by from punch_items where id = '00000000-0000-0000-0000-000000000914'), '00000000-0000-0000-0000-000000000903'::uuid, 'raised_by is stamped from auth.uid()');

-- ── As owner: try to close with punch open ──
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-000000000901", "role": "authenticated"}';
update closeout_items set status = 'done' where required;
select is((select checklist_open from closeout_readiness('00000000-0000-0000-0000-000000000913')), 0, 'Required checklist items can all be completed');
select is((select completed_at is not null from closeout_items where status = 'done' limit 1), true, 'Completing a checklist item stamps completed_at');

select throws_ok(
  $$ select close_project('00000000-0000-0000-0000-000000000913') $$,
  'P0001', 'cannot close: 1 punch item(s) still open',
  'Cannot close with an open punch item');

update punch_items set status = 'verified' where id = '00000000-0000-0000-0000-000000000914';
select is((select verified_by from punch_items where id = '00000000-0000-0000-0000-000000000914'), '00000000-0000-0000-0000-000000000901'::uuid, 'Verifying stamps verified_by');
select is((select ready from closeout_readiness('00000000-0000-0000-0000-000000000913')), true, 'Project reads as ready once punch and checklist are clear');

select lives_ok(
  $$ select close_project('00000000-0000-0000-0000-000000000913') $$,
  'Owner can close a ready project');
select is((select status::text from projects where id = '00000000-0000-0000-0000-000000000913'), 'sold', 'Closing marks the project sold');

select * from finish();
rollback;

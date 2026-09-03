-- Calendar & Schedule test suite (pgTAP).
begin;
select plan(11);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000701', 'owner7@hanger.test'),
  ('00000000-0000-0000-0000-000000000702', 'other7@other.test'),
  ('00000000-0000-0000-0000-000000000703', 'crew7@hanger.test');

insert into organizations (id, name) values
  ('00000000-0000-0000-0000-000000000710', 'Hanger Investments 7'),
  ('00000000-0000-0000-0000-000000000720', 'Other LLC 7');

insert into org_members (org_id, user_id, role) values
  ('00000000-0000-0000-0000-000000000710', '00000000-0000-0000-0000-000000000701', 'owner'),
  ('00000000-0000-0000-0000-000000000720', '00000000-0000-0000-0000-000000000702', 'owner'),
  ('00000000-0000-0000-0000-000000000710', '00000000-0000-0000-0000-000000000703', 'field_crew');

insert into portfolios (id, org_id, name) values
  ('00000000-0000-0000-0000-000000000711', '00000000-0000-0000-0000-000000000710', 'Hanger P7');
insert into properties (id, org_id, portfolio_id, address) values
  ('00000000-0000-0000-0000-000000000712', '00000000-0000-0000-0000-000000000710', '00000000-0000-0000-0000-000000000711', '7 Hanger St');
insert into projects (id, org_id, property_id, name) values
  ('00000000-0000-0000-0000-000000000713', '00000000-0000-0000-0000-000000000710', '00000000-0000-0000-0000-000000000712', 'Hanger Flip 7');
insert into scope_items (id, org_id, project_id, room, trade, task) values
  ('00000000-0000-0000-0000-000000000714', '00000000-0000-0000-0000-000000000710', '00000000-0000-0000-0000-000000000713', 'Kitchen', 'Cabinets', 'Install shaker cabinets');

-- ── As owner ──
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-000000000701", "role": "authenticated"}';

insert into schedule_tasks (id, org_id, project_id, scope_item_id, name, trade, start_date, duration_days) values
  ('00000000-0000-0000-0000-000000000715', '00000000-0000-0000-0000-000000000710', '00000000-0000-0000-0000-000000000713', '00000000-0000-0000-0000-000000000714', 'Install shaker cabinets', 'Cabinets', '2026-09-10', 5),
  ('00000000-0000-0000-0000-000000000716', '00000000-0000-0000-0000-000000000710', '00000000-0000-0000-0000-000000000713', null, 'Demo kitchen', 'Demo', '2026-09-07', 3);

select is((select count(*)::int from schedule_tasks), 2, 'Owner sees both tasks');
select is((select starts_on from project_schedule('00000000-0000-0000-0000-000000000713')), '2026-09-07'::date, 'Schedule starts on the earliest task');
select is((select ends_on from project_schedule('00000000-0000-0000-0000-000000000713')), '2026-09-14'::date, 'Schedule ends on start + duration - 1 of the last task');
select is((select progress_pct from project_schedule('00000000-0000-0000-0000-000000000713')), 0, 'Progress starts at 0');

update schedule_tasks set status = 'done' where id = '00000000-0000-0000-0000-000000000716';
select is((select progress_pct from schedule_tasks where id = '00000000-0000-0000-0000-000000000716'), 100, 'Marking done sets progress to 100');
select is((select progress_pct from project_schedule('00000000-0000-0000-0000-000000000713')), round(300::numeric / 8)::int, 'Project progress is duration-weighted');

-- ── As crew ──
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-000000000703", "role": "authenticated"}';

update schedule_tasks set progress_pct = 40 where id = '00000000-0000-0000-0000-000000000715';
select is((select status::text from schedule_tasks where id = '00000000-0000-0000-0000-000000000715'), 'in_progress', 'Crew progress flips the task to in_progress');
select is((select status::text from scope_items where id = '00000000-0000-0000-0000-000000000714'), 'in_progress', 'Task progress rolls up to the linked scope line');

update schedule_tasks set progress_pct = 100 where id = '00000000-0000-0000-0000-000000000715';
select is((select status::text from scope_items where id = '00000000-0000-0000-0000-000000000714'), 'done', 'Task completion marks the scope line done');

select throws_ok(
  $$ insert into schedule_tasks (org_id, project_id, name, start_date)
     values ('00000000-0000-0000-0000-000000000710', '00000000-0000-0000-0000-000000000713', 'Crew task', '2026-09-20') $$,
  '42501', null,
  'Crew cannot create tasks');

-- ── As other org ──
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-000000000702", "role": "authenticated"}';
select is((select count(*)::int from schedule_tasks), 0, 'Other org sees no Hanger tasks');

select * from finish();
rollback;

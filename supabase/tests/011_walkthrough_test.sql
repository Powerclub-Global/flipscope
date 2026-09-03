-- Property walkthrough capture test suite (pgTAP).
begin;
select plan(13);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000001101', 'owner11@hanger.test'),
  ('00000000-0000-0000-0000-000000001102', 'other11@other.test'),
  ('00000000-0000-0000-0000-000000001103', 'crew11@hanger.test'),
  ('00000000-0000-0000-0000-000000001104', 'investor11@hanger.test');

insert into organizations (id, name) values
  ('00000000-0000-0000-0000-000000001110', 'Hanger Investments 11'),
  ('00000000-0000-0000-0000-000000001120', 'Other LLC 11');

insert into org_members (org_id, user_id, role) values
  ('00000000-0000-0000-0000-000000001110', '00000000-0000-0000-0000-000000001101', 'owner'),
  ('00000000-0000-0000-0000-000000001120', '00000000-0000-0000-0000-000000001102', 'owner'),
  ('00000000-0000-0000-0000-000000001110', '00000000-0000-0000-0000-000000001103', 'field_crew'),
  ('00000000-0000-0000-0000-000000001110', '00000000-0000-0000-0000-000000001104', 'investor');

insert into portfolios (id, org_id, name) values
  ('00000000-0000-0000-0000-000000001111', '00000000-0000-0000-0000-000000001110', 'Hanger P11');
insert into properties (id, org_id, portfolio_id, address) values
  ('00000000-0000-0000-0000-000000001112', '00000000-0000-0000-0000-000000001110', '00000000-0000-0000-0000-000000001111', '11 Hanger St');
insert into projects (id, org_id, property_id, name) values
  ('00000000-0000-0000-0000-000000001113', '00000000-0000-0000-0000-000000001110', '00000000-0000-0000-0000-000000001112', 'Hanger Flip 11');

-- ── As crew: the field user records the walk ──
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-000000001103", "role": "authenticated"}';

insert into walkthroughs (id, org_id, project_id, title) values
  ('00000000-0000-0000-0000-000000001114', '00000000-0000-0000-0000-000000001110', '00000000-0000-0000-0000-000000001113', 'First walk');

select is((select recorded_by from walkthroughs where id = '00000000-0000-0000-0000-000000001114'),
  '00000000-0000-0000-0000-000000001103'::uuid, 'recorded_by is stamped from auth.uid()');
select is((select status::text from walkthroughs where id = '00000000-0000-0000-0000-000000001114'),
  'in_progress', 'A new walkthrough starts in progress');

insert into walkthrough_clips (org_id, walkthrough_id, project_id, kind, room, storage_path, content_type, duration_seconds, size_bytes, uploader_id) values
  ('00000000-0000-0000-0000-000000001110', '00000000-0000-0000-0000-000000001114', '00000000-0000-0000-0000-000000001113',
   'video', 'Kitchen', '00000000-0000-0000-0000-000000001110/00000000-0000-0000-0000-000000001113/00000000-0000-0000-0000-000000001114/a.mp4',
   'video/mp4', 42.5, 18000000, '00000000-0000-0000-0000-000000001103'),
  ('00000000-0000-0000-0000-000000001110', '00000000-0000-0000-0000-000000001114', '00000000-0000-0000-0000-000000001113',
   'photo', 'Kitchen', '00000000-0000-0000-0000-000000001110/00000000-0000-0000-0000-000000001113/00000000-0000-0000-0000-000000001114/b.jpg',
   'image/jpeg', null, 2400000, '00000000-0000-0000-0000-000000001103');

insert into walkthrough_clips (org_id, walkthrough_id, project_id, kind, room, note, uploader_id) values
  ('00000000-0000-0000-0000-000000001110', '00000000-0000-0000-0000-000000001114', '00000000-0000-0000-0000-000000001113',
   'note', 'Primary Bath', 'Subfloor feels soft near the tub.', '00000000-0000-0000-0000-000000001103');

select is((select clip_count from walkthrough_summary('00000000-0000-0000-0000-000000001114')), 3, 'Summary counts every clip');
select is((select room_count from walkthrough_summary('00000000-0000-0000-0000-000000001114')), 2, 'Summary counts distinct rooms');
select is((select total_seconds from walkthrough_summary('00000000-0000-0000-0000-000000001114')), 42.5, 'Summary sums recorded duration');
select is((select total_bytes from walkthrough_summary('00000000-0000-0000-0000-000000001114')), 20400000::bigint, 'Summary sums stored bytes');

-- A note needs text and no file; a video needs a file.
select throws_ok(
  $$ insert into walkthrough_clips (org_id, walkthrough_id, project_id, kind, room, uploader_id)
     values ('00000000-0000-0000-0000-000000001110', '00000000-0000-0000-0000-000000001114', '00000000-0000-0000-0000-000000001113',
             'video', 'Garage', '00000000-0000-0000-0000-000000001103') $$,
  '23514', null,
  'A video clip without a stored file is rejected');

-- Clips cannot be rewritten after the fact. UPDATE is never granted on this
-- table, so the attempt is refused outright rather than quietly matching no
-- rows — a stronger guarantee than an RLS-only block.
select throws_ok(
  $$ update walkthrough_clips set room = 'Tampered' where room = 'Kitchen' $$,
  '42501', null,
  'Clips cannot be edited, even by the crew member who recorded them');

-- Uploader cannot be forged.
select throws_ok(
  $$ insert into walkthrough_clips (org_id, walkthrough_id, project_id, kind, room, note, uploader_id)
     values ('00000000-0000-0000-0000-000000001110', '00000000-0000-0000-0000-000000001114', '00000000-0000-0000-0000-000000001113',
             'note', 'Garage', 'not mine', '00000000-0000-0000-0000-000000001101') $$,
  '42501', null,
  'A clip cannot be attributed to another user');

update walkthroughs set status = 'complete' where id = '00000000-0000-0000-0000-000000001114';
select is((select completed_at is not null from walkthroughs where id = '00000000-0000-0000-0000-000000001114'), true,
  'Completing a walkthrough stamps completed_at');

-- ── As investor: read-only ──
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-000000001104", "role": "authenticated"}';
select is((select count(*)::int from walkthrough_clips), 3, 'Investors can review the walkthrough');
select throws_ok(
  $$ insert into walkthroughs (org_id, project_id) values
     ('00000000-0000-0000-0000-000000001110', '00000000-0000-0000-0000-000000001113') $$,
  '42501', null,
  'Investors cannot record a walkthrough');

-- ── As another org ──
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-000000001102", "role": "authenticated"}';
select is((select count(*)::int from walkthrough_clips), 0, 'Another org sees no Hanger walkthrough media');

select * from finish();
rollback;

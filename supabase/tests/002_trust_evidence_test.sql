-- Phase 1 tests: audit log records and is immutable; proof media is
-- append-only and org-scoped; investor is read-only but sees financials.
begin;
select plan(14);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@hanger.test'),   -- owner
  ('00000000-0000-0000-0000-00000000000c', 'crew@hanger.test'),    -- field_crew
  ('00000000-0000-0000-0000-00000000000d', 'inv@hanger.test'),     -- investor
  ('00000000-0000-0000-0000-00000000000b', 'bob@other.test');      -- other org owner

insert into organizations (id, name) values
  ('00000000-0000-0000-0000-0000000000a0', 'Hanger Investments'),
  ('00000000-0000-0000-0000-0000000000b0', 'Other LLC');

insert into org_members (org_id, user_id, role) values
  ('00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-00000000000a', 'owner'),
  ('00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-00000000000c', 'field_crew'),
  ('00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-00000000000d', 'investor'),
  ('00000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-00000000000b', 'owner');

insert into portfolios (id, org_id, name) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a0', 'Hanger P1');
insert into properties (id, org_id, portfolio_id, address) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-0000000000a1', '1 Hanger St');
insert into projects (id, org_id, property_id, name) values
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-0000000000a2', 'Hanger Flip');

-- ── As Alice (owner): actions are audited ──
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';

insert into ledger_entries (org_id, project_id, entry_type, category, amount_cents)
values ('00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-0000000000a3', 'budget', 'kitchen', 500000);

select is(
  (select count(*)::int from audit_log where table_name = 'ledger_entries' and action = 'insert'), 1,
  'Ledger insert lands in the audit log');

select is(
  (select actor_id from audit_log where table_name = 'ledger_entries' limit 1),
  '00000000-0000-0000-0000-00000000000a'::uuid,
  'Audit row records who acted');

update projects set name = 'Hanger Flip Renamed'
where id = '00000000-0000-0000-0000-0000000000a3';

select is(
  (select count(*)::int from audit_log where table_name = 'projects' and action = 'update'), 1,
  'Project update lands in the audit log');

select is(
  (select new_row->>'name' from audit_log where table_name = 'projects' and action = 'update'),
  'Hanger Flip Renamed',
  'Audit row captures old and new values');

-- Audit log is immutable, even for the org owner
select throws_ok(
  $$ update audit_log set action = 'insert' where table_name = 'projects' $$,
  '42501', null,
  'Audit rows cannot be updated');
select throws_ok(
  $$ delete from audit_log where table_name = 'projects' $$,
  '42501', null,
  'Audit rows cannot be deleted');

-- ── Proof media ──
-- Crew can add proof to their org's project
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}';

insert into proof_media (org_id, project_id, storage_path, content_type, uploader_id, lat, lng)
values ('00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-0000000000a3',
        '00000000-0000-0000-0000-0000000000a0/00000000-0000-0000-0000-0000000000a3/photo1.jpg',
        'image/jpeg', '00000000-0000-0000-0000-00000000000c', 30.39, -86.49);

select is(
  (select count(*)::int from proof_media), 1,
  'Field crew can add proof media');

-- Crew cannot forge the uploader
select throws_ok(
  $$ insert into proof_media (org_id, project_id, storage_path, content_type, uploader_id)
     values ('00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-0000000000a3',
             '00000000-0000-0000-0000-0000000000a0/x/forged.jpg', 'image/jpeg',
             '00000000-0000-0000-0000-00000000000a') $$,
  '42501', null,
  'Uploader identity cannot be forged');

-- Proof is append-only
select throws_ok(
  $$ update proof_media set caption = 'doctored' $$,
  '42501', null,
  'Proof media cannot be edited');
select throws_ok(
  $$ delete from proof_media $$,
  '42501', null,
  'Proof media cannot be deleted');

-- ── As the investor: sees everything, changes nothing ──
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}';

select is(
  (select count(*)::int from ledger_entries), 1,
  'Investor can read financials');
select is(
  (select count(*)::int from audit_log where table_name = 'ledger_entries'), 1,
  'Investor can read the audit trail');
select throws_ok(
  $$ insert into ledger_entries (org_id, project_id, entry_type, category, amount_cents)
     values ('00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-0000000000a3', 'budget', 'x', 1) $$,
  '42501', null,
  'Investor cannot write to the ledger');

-- ── Cross-org: Bob sees none of it ──
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}';
select is(
  (select count(*)::int from audit_log) + (select count(*)::int from proof_media), 0,
  'Audit log and proof media never cross the org boundary');

select * from finish();
rollback;

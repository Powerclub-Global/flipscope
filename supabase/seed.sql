-- Local development seed only (runs on `supabase db reset`).
-- Real Hanger Investments members/properties are provisioned in staging/prod
-- through Supabase Auth — never via this file.

-- Dev owner login: dev@flipscope.local / password set via Auth admin locally.
-- GoTrue can't scan NULL token columns, so they must be '' not NULL.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
values (
  '11111111-1111-1111-1111-111111111111',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'dev@flipscope.local',
  crypt('flipscope-dev', gen_salt('bf')),
  now(), now(), now(),
  '', '', '', ''
);

-- Same password for every seeded dev login.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('11111111-1111-1111-1111-111111111112', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'investor@flipscope.local', crypt('flipscope-dev', gen_salt('bf')), now(), now(), now(), '', '', '', ''),
  ('11111111-1111-1111-1111-111111111113', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'crew@flipscope.local', crypt('flipscope-dev', gen_salt('bf')), now(), now(), now(), '', '', '', '');

insert into organizations (id, name)
values ('22222222-2222-2222-2222-222222222222', 'Hanger Investments');

insert into org_members (org_id, user_id, role) values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111112', 'investor'),
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111113', 'field_crew');

insert into portfolios (id, org_id, name)
values ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'Hanger Portfolio 1');

insert into properties (id, org_id, portfolio_id, address, city, state)
values ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333', '123 Placeholder Dr', 'Destin', 'FL');

insert into projects (id, org_id, property_id, name, status, purchase_price_cents)
values ('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222',
        '44444444-4444-4444-4444-444444444444', 'First Flip', 'rehab', 18500000);

insert into properties (id, org_id, portfolio_id, address, city, state)
values ('44444444-4444-4444-4444-444444444445', '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333', '456 Gulfview Ct', 'Destin', 'FL');

insert into projects (id, org_id, property_id, name, status, purchase_price_cents, started_at, target_finish)
values ('55555555-5555-5555-5555-555555555556', '22222222-2222-2222-2222-222222222222',
        '44444444-4444-4444-4444-444444444445', 'Gulfview Flip', 'rehab', 24000000, '2026-07-01', '2026-08-10');

update projects set started_at = '2026-06-01', target_finish = '2026-11-15'
where id = '55555555-5555-5555-5555-555555555555';

insert into ledger_entries (org_id, project_id, entry_type, category, amount_cents, entry_date) values
  ('22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555', 'budget', 'kitchen',  2200000, '2026-06-01'),
  ('22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555', 'budget', 'roof',     1400000, '2026-06-01'),
  ('22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555', 'actual', 'kitchen',  1150000, '2026-07-14'),
  -- Gulfview: over budget and past its target date → red on the heatmap
  ('22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555556', 'budget', 'rehab',    3000000, '2026-07-01'),
  ('22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555556', 'actual', 'rehab',    3450000, '2026-08-05');

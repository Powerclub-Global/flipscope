-- Local development seed only (runs on `supabase db reset`).
-- Real Hanger Investments members/properties are provisioned in staging/prod
-- through Supabase Auth — never via this file.

-- Dev owner login: dev@flipscope.local / password set via Auth admin locally.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values (
  '11111111-1111-1111-1111-111111111111',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'dev@flipscope.local',
  crypt('flipscope-dev', gen_salt('bf')),
  now(), now(), now()
);

insert into organizations (id, name)
values ('22222222-2222-2222-2222-222222222222', 'Hanger Investments');

insert into org_members (org_id, user_id, role)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'owner');

insert into portfolios (id, org_id, name)
values ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'Hanger Portfolio 1');

insert into properties (id, org_id, portfolio_id, address, city, state)
values ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333', '123 Placeholder Dr', 'Destin', 'FL');

insert into projects (id, org_id, property_id, name, status, purchase_price_cents)
values ('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222',
        '44444444-4444-4444-4444-444444444444', 'First Flip', 'rehab', 18500000);

insert into ledger_entries (org_id, project_id, entry_type, category, amount_cents) values
  ('22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555', 'budget', 'kitchen',  2200000),
  ('22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555', 'budget', 'roof',     1400000),
  ('22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555', 'actual', 'kitchen',  1150000);

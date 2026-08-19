-- FlipScope migration 002 — Trust, roles & evidence (Phase 1)
-- Append-only audit log, proof-chain media, storage policies.

-- ─────────────────────────────────────────────
-- Audit log: append-only record of every change to core tables.
-- ─────────────────────────────────────────────
create table audit_log (
  id          bigint generated always as identity primary key,
  org_id      uuid not null,
  actor_id    uuid,                        -- auth.uid() of who did it; null = system
  table_name  text not null,
  row_id      uuid,
  action      text not null check (action in ('insert', 'update', 'delete')),
  old_row     jsonb,
  new_row     jsonb,
  created_at  timestamptz not null default now()
);

create index audit_log_org_idx on audit_log (org_id, created_at desc);

alter table audit_log enable row level security;

-- Owners, PMs and investors can read their org's audit trail.
create policy audit_select on audit_log for select
  using (org_role_of(org_id) in ('owner', 'pm', 'investor'));
-- No insert/update/delete policies: rows arrive only via the trigger below
-- (security definer), and nothing can modify them afterward.

-- Belt and braces: reject UPDATE/DELETE at the database level for every role,
-- including table owners running outside RLS.
create or replace function audit_log_block_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_log is append-only';
end;
$$;

create trigger audit_log_no_update before update on audit_log
  for each row execute function audit_log_block_mutation();
create trigger audit_log_no_delete before delete on audit_log
  for each row execute function audit_log_block_mutation();

-- The recording trigger. security definer so it can insert regardless of the
-- acting user's own policies; search_path pinned.
create or replace function record_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_org_id uuid;
  v_row_id uuid;
begin
  if tg_op = 'DELETE' then
    v_org_id := old.org_id;
    v_row_id := old.id;
  else
    v_org_id := new.org_id;
    v_row_id := new.id;
  end if;

  insert into audit_log (org_id, actor_id, table_name, row_id, action, old_row, new_row)
  values (
    v_org_id,
    auth.uid(),
    tg_table_name,
    v_row_id,
    lower(tg_op),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger audit_portfolios after insert or update or delete on portfolios
  for each row execute function record_audit();
create trigger audit_properties after insert or update or delete on properties
  for each row execute function record_audit();
create trigger audit_projects after insert or update or delete on projects
  for each row execute function record_audit();
create trigger audit_ledger after insert or update or delete on ledger_entries
  for each row execute function record_audit();

-- ─────────────────────────────────────────────
-- Proof-chain media: files live in Storage, provenance lives here.
-- ─────────────────────────────────────────────
create table proof_media (
  id           uuid primary key default uuid_generate_v4(),
  org_id       uuid not null references organizations(id) on delete cascade,
  project_id   uuid not null references projects(id) on delete cascade,
  storage_path text not null unique,       -- object key in the proof-media bucket
  content_type text not null,
  caption      text,
  uploader_id  uuid not null references auth.users(id),
  captured_at  timestamptz not null default now(),
  lat          double precision,           -- geolocation when the device provides it
  lng          double precision,
  created_at   timestamptz not null default now()
);

create index proof_media_project_idx on proof_media (project_id, captured_at desc);

alter table proof_media enable row level security;

-- Everyone in the org can see the proof trail (it's the point of it);
-- owner/pm/field_crew/subcontractor can add to it. Nobody can edit or
-- delete: no update/delete policies, so the chain is append-only.
create policy proof_select on proof_media for select
  using (is_org_member(org_id));
create policy proof_insert on proof_media for insert
  with check (
    org_role_of(org_id) in ('owner', 'pm', 'field_crew', 'subcontractor')
    and uploader_id = auth.uid()
  );

create trigger proof_media_no_update before update on proof_media
  for each row execute function audit_log_block_mutation();
create trigger proof_media_no_delete before delete on proof_media
  for each row execute function audit_log_block_mutation();

-- Storage bucket for the files themselves.
insert into storage.buckets (id, name, public)
values ('proof-media', 'proof-media', false)
on conflict (id) do nothing;

-- Objects are keyed as <org_id>/<project_id>/<uuid>.<ext>; policies gate on
-- the org prefix so files follow the same tenancy rules as rows.
create policy proof_objects_read on storage.objects for select
  using (
    bucket_id = 'proof-media'
    and is_org_member((split_part(name, '/', 1))::uuid)
  );
create policy proof_objects_insert on storage.objects for insert
  with check (
    bucket_id = 'proof-media'
    and org_role_of((split_part(name, '/', 1))::uuid) in ('owner', 'pm', 'field_crew', 'subcontractor')
  );
-- No update/delete policies on proof objects: uploads are permanent.

-- Grants for the new table (RLS still gates rows).
grant select on audit_log to authenticated;  -- inserts happen only inside the definer trigger
grant select, insert on proof_media to authenticated;

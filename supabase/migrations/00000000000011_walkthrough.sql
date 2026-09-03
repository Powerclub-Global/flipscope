-- FlipScope migration 011 — Property walkthrough capture
-- A walkthrough is one visit to a property; clips are the per-room videos,
-- photos, audio notes and typed notes recorded during it. This is capture
-- and storage only: transcription and LLM scope extraction (Phase 3) will
-- read these rows later and fill transcript/processed_at without any schema
-- change, so recording real walkthroughs now is not wasted work.

create type walkthrough_status as enum ('in_progress', 'complete', 'abandoned');
create type clip_kind as enum ('video', 'photo', 'audio', 'note');

create table walkthroughs (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid not null references organizations(id) on delete cascade,
  project_id    uuid not null references projects(id) on delete cascade,
  title         text not null default 'Walkthrough',
  status        walkthrough_status not null default 'in_progress',
  notes         text,
  recorded_by   uuid references auth.users(id),
  started_at    timestamptz not null default now(),
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index walkthroughs_project_idx on walkthroughs (project_id, started_at desc);
create index walkthroughs_org_idx on walkthroughs (org_id);

create trigger walkthroughs_set_updated_at before update on walkthroughs
  for each row execute function scope_items_touch_updated_at();

create or replace function walkthroughs_stamp()
returns trigger language plpgsql as $$
begin
  if new.recorded_by is null then new.recorded_by := auth.uid(); end if;
  if new.status = 'complete' and new.completed_at is null then
    new.completed_at := now();
  end if;
  return new;
end;
$$;

create trigger walkthroughs_stamp before insert or update on walkthroughs
  for each row execute function walkthroughs_stamp();

create table walkthrough_clips (
  id               uuid primary key default uuid_generate_v4(),
  org_id           uuid not null references organizations(id) on delete cascade,
  walkthrough_id   uuid not null references walkthroughs(id) on delete cascade,
  project_id       uuid not null references projects(id) on delete cascade,
  kind             clip_kind not null default 'video',
  room             text not null,
  storage_path     text unique,             -- null for a typed note
  content_type     text,
  duration_seconds numeric,
  size_bytes       bigint,
  note             text,
  transcript       text,                    -- filled by the Phase 3 pipeline
  processed_at     timestamptz,             -- when transcription last ran
  lat              double precision,
  lng              double precision,
  uploader_id      uuid not null references auth.users(id),
  captured_at      timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  -- A note carries text; every other kind carries a file.
  constraint clip_has_content check (
    (kind = 'note' and note is not null and storage_path is null)
    or (kind <> 'note' and storage_path is not null)
  )
);

create index walkthrough_clips_walkthrough_idx on walkthrough_clips (walkthrough_id, captured_at);
create index walkthrough_clips_project_idx on walkthrough_clips (project_id, room);
create index walkthrough_clips_untranscribed_idx on walkthrough_clips (processed_at)
  where kind in ('video', 'audio') and processed_at is null;

-- What was captured, per walkthrough — drives the review screen.
create or replace function walkthrough_summary(p_walkthrough_id uuid)
returns table (
  clip_count      integer,
  room_count      integer,
  video_count     integer,
  photo_count     integer,
  note_count      integer,
  total_bytes     bigint,
  total_seconds   numeric
)
language sql
stable
security invoker
as $$
  select
    count(*)::int,
    count(distinct room)::int,
    count(*) filter (where kind = 'video')::int,
    count(*) filter (where kind = 'photo')::int,
    count(*) filter (where kind = 'note')::int,
    coalesce(sum(size_bytes), 0)::bigint,
    coalesce(sum(duration_seconds), 0)
  from walkthrough_clips
  where walkthrough_id = p_walkthrough_id;
$$;

alter table walkthroughs       enable row level security;
alter table walkthrough_clips  enable row level security;

-- Everyone in the org can review a walkthrough; anyone who works on site
-- can record one. Investors are read-only, as everywhere else.
create policy walkthrough_select on walkthroughs for select
  using (is_org_member(org_id));
create policy walkthrough_insert on walkthroughs for insert
  with check (org_role_of(org_id) in ('owner', 'pm', 'field_crew', 'subcontractor'));
create policy walkthrough_update on walkthroughs for update
  using (org_role_of(org_id) in ('owner', 'pm', 'field_crew', 'subcontractor'));
create policy walkthrough_delete on walkthroughs for delete
  using (org_role_of(org_id) in ('owner', 'pm'));

create policy clip_select on walkthrough_clips for select
  using (is_org_member(org_id));
create policy clip_insert on walkthrough_clips for insert
  with check (
    org_role_of(org_id) in ('owner', 'pm', 'field_crew', 'subcontractor')
    and uploader_id = auth.uid()
  );
-- Clips are evidence of what the property looked like: no update policy, so
-- a recording can never be edited after the fact. Owner/pm can delete a
-- mis-recorded clip; nobody else can remove one.
create policy clip_delete on walkthrough_clips for delete
  using (org_role_of(org_id) in ('owner', 'pm'));

create trigger audit_walkthroughs after insert or update or delete on walkthroughs
  for each row execute function record_audit();
create trigger audit_walkthrough_clips after insert or update or delete on walkthrough_clips
  for each row execute function record_audit();

-- Media bucket. Keys are <org_id>/<project_id>/<walkthrough_id>/<uuid>.<ext>
-- so the org prefix gates access exactly like proof-media.
insert into storage.buckets (id, name, public, file_size_limit)
values ('walkthrough-media', 'walkthrough-media', false, 524288000)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

create policy walkthrough_objects_read on storage.objects for select
  using (
    bucket_id = 'walkthrough-media'
    and is_org_member((split_part(name, '/', 1))::uuid)
  );
create policy walkthrough_objects_insert on storage.objects for insert
  with check (
    bucket_id = 'walkthrough-media'
    and org_role_of((split_part(name, '/', 1))::uuid) in ('owner', 'pm', 'field_crew', 'subcontractor')
  );
create policy walkthrough_objects_delete on storage.objects for delete
  using (
    bucket_id = 'walkthrough-media'
    and org_role_of((split_part(name, '/', 1))::uuid) in ('owner', 'pm')
  );

grant select, insert, update, delete on walkthroughs to authenticated;
grant select, insert, delete on walkthrough_clips to authenticated;
grant execute on function walkthrough_summary(uuid) to authenticated;

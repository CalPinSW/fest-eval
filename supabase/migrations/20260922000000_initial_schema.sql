-- Festival planner: initial schema.
--
-- Access control lives in row-level security. The app talks to Postgres as the
-- signed-in user wherever possible, so these policies are the real guard; the
-- service role is used only for background sync and streaming-token storage.

create extension if not exists citext with schema extensions;

-- ---------------------------------------------------------------------------
-- Profiles and roles
-- ---------------------------------------------------------------------------

create type public.app_role as enum ('user', 'moderator', 'admin');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username extensions.citext not null unique
    check (username ~ '^[A-Za-z0-9_]{3,24}$'),
  display_name text check (char_length(display_name) <= 60),
  role public.app_role not null default 'user',
  created_at timestamptz not null default now()
);

-- New auth users get a profile. The username comes from sign-up metadata when
-- provided and valid, otherwise a unique placeholder the user can change.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested text := new.raw_user_meta_data ->> 'username';
  fallback text := 'user_' || substr(replace(new.id::text, '-', ''), 1, 10);
begin
  if requested is null
     or requested !~ '^[A-Za-z0-9_]{3,24}$'
     or exists (select 1 from public.profiles where username = requested::extensions.citext) then
    requested := fallback;
  end if;

  insert into public.profiles (id, username, display_name)
  values (new.id, requested, coalesce(new.raw_user_meta_data ->> 'display_name', requested));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Festivals, stages, artists, performances
-- ---------------------------------------------------------------------------

create table public.festivals (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  name text not null check (char_length(name) between 2 and 120),
  location text check (char_length(location) <= 120),
  timezone text not null default 'Europe/London',
  starts_on date,
  ends_on date,
  -- Hour (local time) at which one festival "day" rolls into the next, so a
  -- 01:00 set still belongs to the previous evening's timetable.
  day_boundary_hour smallint not null default 6 check (day_boundary_hour between 0 and 12),
  clashfinder_id text unique check (clashfinder_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  last_synced_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create table public.stages (
  id uuid primary key default gen_random_uuid(),
  festival_id uuid not null references public.festivals (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  sort_order integer not null default 0,
  unique (festival_id, name)
);

create table public.artists (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  -- Output of normalizeArtistName() in src/lib/domain/artist-name.ts; the key
  -- used to de-duplicate artists and match them to streaming services.
  normalized_name text not null unique check (char_length(normalized_name) >= 1),
  spotify_id text,
  apple_music_id text,
  created_at timestamptz not null default now()
);

create type public.performance_source as enum ('clashfinder', 'manual');

create table public.performances (
  id uuid primary key default gen_random_uuid(),
  festival_id uuid not null references public.festivals (id) on delete cascade,
  artist_id uuid not null references public.artists (id) on delete restrict,
  stage_id uuid references public.stages (id) on delete set null,
  starts_at timestamptz,
  ends_at timestamptz,
  source public.performance_source not null default 'manual',
  -- Stable id from the upstream source (Clashfinder "short" code).
  external_key text,
  -- Set when a person edits an imported row, so the next sync leaves it alone.
  locally_modified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (festival_id, external_key),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check (ends_at is null or starts_at is not null)
);

create index performances_festival_idx on public.performances (festival_id, starts_at);
create index performances_artist_idx on public.performances (artist_id);

-- ---------------------------------------------------------------------------
-- Social: attendance, picks, friendships
-- ---------------------------------------------------------------------------

create table public.festival_attendees (
  user_id uuid not null references public.profiles (id) on delete cascade,
  festival_id uuid not null references public.festivals (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, festival_id)
);

create index festival_attendees_festival_idx on public.festival_attendees (festival_id);

create table public.artist_picks (
  user_id uuid not null references public.profiles (id) on delete cascade,
  festival_id uuid not null references public.festivals (id) on delete cascade,
  artist_id uuid not null references public.artists (id) on delete cascade,
  priority smallint not null check (priority between 1 and 5),
  updated_at timestamptz not null default now(),
  primary key (user_id, festival_id, artist_id),
  -- Picks disappear when the user stops attending.
  foreign key (user_id, festival_id)
    references public.festival_attendees (user_id, festival_id) on delete cascade
);

create index artist_picks_festival_idx on public.artist_picks (festival_id, artist_id);

create type public.friendship_status as enum ('pending', 'accepted');

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status public.friendship_status not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);

-- One relationship per pair, whichever direction it was requested in.
create unique index friendships_pair_idx on public.friendships (
  least(requester_id, addressee_id), greatest(requester_id, addressee_id)
);
create index friendships_addressee_idx on public.friendships (addressee_id);

-- ---------------------------------------------------------------------------
-- Community lineup edits
-- ---------------------------------------------------------------------------

create type public.proposal_status as enum ('pending', 'approved', 'rejected');
create type public.proposal_kind as enum ('add_performance', 'update_performance', 'remove_performance');

create table public.edit_proposals (
  id uuid primary key default gen_random_uuid(),
  festival_id uuid not null references public.festivals (id) on delete cascade,
  proposer_id uuid not null references public.profiles (id) on delete cascade,
  kind public.proposal_kind not null,
  -- Shape validated by lineupChangeSchema in src/lib/validation.ts.
  payload jsonb not null,
  note text check (char_length(note) <= 500),
  status public.proposal_status not null default 'pending',
  reviewer_id uuid references public.profiles (id) on delete set null,
  review_note text check (char_length(review_note) <= 500),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index edit_proposals_festival_idx on public.edit_proposals (festival_id, status);

-- ---------------------------------------------------------------------------
-- Streaming services (service-role only for secrets)
-- ---------------------------------------------------------------------------

create type public.music_provider as enum ('spotify', 'apple_music');

create table public.music_connections (
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider public.music_provider not null,
  provider_user_id text,
  -- AES-256-GCM ciphertext; see src/lib/music/token-crypto.ts.
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  storefront text,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  primary key (user_id, provider)
);

create table public.liked_artists (
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider public.music_provider not null,
  provider_artist_id text not null,
  name text not null,
  normalized_name text not null,
  synced_at timestamptz not null default now(),
  primary key (user_id, provider, provider_artist_id)
);

create index liked_artists_user_name_idx on public.liked_artists (user_id, normalized_name);

create table public.playlist_exports (
  user_id uuid not null references public.profiles (id) on delete cascade,
  festival_id uuid not null references public.festivals (id) on delete cascade,
  provider public.music_provider not null,
  playlist_id text not null,
  playlist_url text,
  track_count integer not null default 0,
  exported_at timestamptz not null default now(),
  primary key (user_id, festival_id, provider)
);

-- ---------------------------------------------------------------------------
-- Helper functions (security definer so policies can call them without
-- recursing through RLS on the tables they inspect)
-- ---------------------------------------------------------------------------

create function public.is_moderator(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = uid and role in ('moderator', 'admin')
  );
$$;

create function public.can_edit_festival(uid uuid, fid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select uid is not null and (
    public.is_moderator(uid)
    or exists (select 1 from public.festivals where id = fid and created_by = uid)
  );
$$;

create function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester_id = a and addressee_id = b) or (requester_id = b and addressee_id = a))
  );
$$;

create function public.attends(uid uuid, fid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.festival_attendees where user_id = uid and festival_id = fid
  );
$$;

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger performances_touch before update on public.performances
  for each row execute function public.touch_updated_at();
create trigger artist_picks_touch before update on public.artist_picks
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

-- Table privileges are granted explicitly (newer Supabase projects no longer
-- grant them by default); RLS policies below then decide which rows.
-- Column-level revokes further down narrow what may be updated.
grant select on public.profiles, public.festivals, public.stages, public.artists, public.performances to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

alter table public.profiles enable row level security;
alter table public.festivals enable row level security;
alter table public.stages enable row level security;
alter table public.artists enable row level security;
alter table public.performances enable row level security;
alter table public.festival_attendees enable row level security;
alter table public.artist_picks enable row level security;
alter table public.friendships enable row level security;
alter table public.edit_proposals enable row level security;
alter table public.music_connections enable row level security;
alter table public.liked_artists enable row level security;
alter table public.playlist_exports enable row level security;

-- Profiles: public directory of usernames; users edit their own name fields
-- only. Role changes go through set_user_role().
create policy "profiles are readable" on public.profiles
  for select using (true);
create policy "users update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke update on public.profiles from anon, authenticated;
grant update (username, display_name) on public.profiles to authenticated;
revoke insert, delete on public.profiles from anon, authenticated;

-- Festival data is public to read.
create policy "festivals are readable" on public.festivals for select using (true);
create policy "stages are readable" on public.stages for select using (true);
create policy "artists are readable" on public.artists for select using (true);
create policy "performances are readable" on public.performances for select using (true);

-- Anyone signed in can create their own festival; creators and moderators edit.
create policy "users create festivals" on public.festivals
  for insert to authenticated
  with check (created_by = (select auth.uid()) and clashfinder_id is null);
create policy "editors update festivals" on public.festivals
  for update to authenticated
  using (public.can_edit_festival((select auth.uid()), id))
  with check (public.can_edit_festival((select auth.uid()), id));
create policy "editors delete festivals" on public.festivals
  for delete to authenticated
  using (public.can_edit_festival((select auth.uid()), id));
-- Sync bookkeeping and ownership are not user-editable.
revoke update on public.festivals from anon, authenticated;
grant update (name, location, timezone, starts_on, ends_on, day_boundary_hour, slug)
  on public.festivals to authenticated;

create policy "editors manage stages" on public.stages
  for all to authenticated
  using (public.can_edit_festival((select auth.uid()), festival_id))
  with check (public.can_edit_festival((select auth.uid()), festival_id));

create policy "editors manage performances" on public.performances
  for all to authenticated
  using (public.can_edit_festival((select auth.uid()), festival_id))
  with check (public.can_edit_festival((select auth.uid()), festival_id));

-- Artists are a shared catalogue: any signed-in user may add one (needed when
-- building a lineup), only moderators may rename or delete.
create policy "users add artists" on public.artists
  for insert to authenticated with check (true);
create policy "moderators update artists" on public.artists
  for update to authenticated
  using (public.is_moderator((select auth.uid())))
  with check (public.is_moderator((select auth.uid())));
create policy "moderators delete artists" on public.artists
  for delete to authenticated
  using (public.is_moderator((select auth.uid())));

-- Attendance: visible to yourself and your friends.
create policy "see own and friends attendance" on public.festival_attendees
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.are_friends((select auth.uid()), user_id)
  );
create policy "users mark own attendance" on public.festival_attendees
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "users remove own attendance" on public.festival_attendees
  for delete to authenticated using (user_id = (select auth.uid()));

-- Picks: yours, plus friends' picks for festivals you are both attending.
create policy "see own and friends picks" on public.artist_picks
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      public.are_friends((select auth.uid()), user_id)
      and public.attends((select auth.uid()), festival_id)
    )
  );
create policy "users pick artists in the lineup" on public.artist_picks
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.performances p
      where p.festival_id = artist_picks.festival_id and p.artist_id = artist_picks.artist_id
    )
  );
create policy "users update own picks" on public.artist_picks
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "users delete own picks" on public.artist_picks
  for delete to authenticated using (user_id = (select auth.uid()));
revoke update on public.artist_picks from anon, authenticated;
grant update (priority) on public.artist_picks to authenticated;

-- Friendships: both parties can see and remove; only the addressee accepts.
create policy "parties see friendship" on public.friendships
  for select to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));
create policy "users send requests" on public.friendships
  for insert to authenticated
  with check (requester_id = (select auth.uid()) and status = 'pending' and responded_at is null);
create policy "addressee responds" on public.friendships
  for update to authenticated
  using (addressee_id = (select auth.uid()))
  with check (addressee_id = (select auth.uid()));
create policy "parties remove friendship" on public.friendships
  for delete to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));
revoke update on public.friendships from anon, authenticated;
grant update (status, responded_at) on public.friendships to authenticated;

-- Proposals: anyone signed in proposes; proposer and festival editors see
-- them; only editors review.
create policy "users propose edits" on public.edit_proposals
  for insert to authenticated
  with check (
    proposer_id = (select auth.uid())
    and status = 'pending'
    and reviewer_id is null
    and reviewed_at is null
  );
create policy "proposer and editors see proposals" on public.edit_proposals
  for select to authenticated
  using (
    proposer_id = (select auth.uid())
    or public.can_edit_festival((select auth.uid()), festival_id)
  );
create policy "editors review proposals" on public.edit_proposals
  for update to authenticated
  using (public.can_edit_festival((select auth.uid()), festival_id))
  with check (public.can_edit_festival((select auth.uid()), festival_id));
revoke update on public.edit_proposals from anon, authenticated;
grant update (status, reviewer_id, review_note, reviewed_at) on public.edit_proposals to authenticated;

-- Streaming: tokens are never exposed to clients. Liked artists and export
-- records are readable by their owner; writes happen server-side.
revoke all on public.music_connections from anon, authenticated;
create policy "owners read liked artists" on public.liked_artists
  for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.liked_artists from anon, authenticated;
create policy "owners read playlist exports" on public.playlist_exports
  for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.playlist_exports from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin RPC
-- ---------------------------------------------------------------------------

create function public.set_user_role(target_username text, new_role public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'only admins can change roles' using errcode = '42501';
  end if;

  update public.profiles
  set role = new_role
  where username = target_username::extensions.citext;

  if not found then
    raise exception 'no user named %', target_username using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.set_user_role(text, public.app_role) from public, anon;
grant execute on function public.set_user_role(text, public.app_role) to authenticated;

-- Queries that let pages fetch just what they show. Large festivals
-- (Glastonbury: ~4,000 sets, ~2,500 artists, 100+ stages) were loading the
-- whole lineup on every page view.
--
-- All functions are SECURITY INVOKER: they run with the caller's privileges,
-- so the existing RLS policies still apply.

-- One page of a festival's artists, each with its performances. Filter by a
-- name search and/or a list of artist ids (used for "my picks" / "friends'
-- picks"). `total_count` is the number of matching artists across all pages.
create function public.festival_lineup_page(
  fid uuid,
  search text default null,
  only_artist_ids uuid[] default null,
  page_offset integer default 0,
  page_limit integer default 100
)
returns table (
  artist_id uuid,
  artist_name text,
  normalized_name text,
  performances jsonb,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with matching as (
    select
      a.id,
      a.name,
      a.normalized_name,
      jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'stageId', p.stage_id,
          'stageName', s.name,
          'startsAt', p.starts_at,
          'endsAt', p.ends_at,
          'source', p.source,
          'externalKey', p.external_key,
          'locallyModified', p.locally_modified
        )
        order by p.starts_at nulls last, p.id
      ) as performances
    from public.performances p
    join public.artists a on a.id = p.artist_id
    left join public.stages s on s.id = p.stage_id
    where p.festival_id = fid
      and (search is null or search = '' or a.name ilike '%' || search || '%')
      and (only_artist_ids is null or a.id = any (only_artist_ids))
    group by a.id
  )
  select id, name, normalized_name, performances, count(*) over ()
  from matching
  order by lower(name), id
  offset greatest(page_offset, 0)
  limit least(greatest(page_limit, 1), 500);
$$;

-- Festival days that have scheduled sets, as local dates. A day runs from
-- `boundary_hour` to `boundary_hour`, matching festivalDayOf() in
-- src/lib/domain/time.ts.
create function public.festival_days(fid uuid)
returns table (day date)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct
    ((p.starts_at - make_interval(hours => f.day_boundary_hour)) at time zone f.timezone)::date as day
  from public.performances p
  join public.festivals f on f.id = p.festival_id
  where p.festival_id = fid and p.starts_at is not null
  order by day;
$$;

-- Lineup artists the signed-in user follows on a connected streaming service.
create function public.festival_liked_artists(fid uuid)
returns table (
  artist_id uuid,
  artist_name text,
  normalized_name text,
  providers public.music_provider[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.id, a.name, a.normalized_name, array_agg(distinct l.provider order by l.provider)
  from public.liked_artists l
  join public.artists a on a.normalized_name = l.normalized_name
  where l.user_id = (select auth.uid())
    and exists (
      select 1 from public.performances p where p.festival_id = fid and p.artist_id = a.id
    )
  group by a.id;
$$;

revoke execute on function public.festival_lineup_page(uuid, text, uuid[], integer, integer) from public;
revoke execute on function public.festival_days(uuid) from public;
revoke execute on function public.festival_liked_artists(uuid) from public;
grant execute on function public.festival_lineup_page(uuid, text, uuid[], integer, integer) to anon, authenticated, service_role;
grant execute on function public.festival_days(uuid) to anon, authenticated, service_role;
grant execute on function public.festival_liked_artists(uuid) to authenticated, service_role;

-- Day-window queries on the timetable filter by festival and start time.
-- (performances_festival_idx already covers (festival_id, starts_at).)

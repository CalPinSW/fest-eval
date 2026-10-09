-- Keep RLS helper functions out of the public API.
--
-- The helpers are SECURITY DEFINER so policies can use them without recursing
-- through RLS, but in the public schema PostgREST also exposed them as RPCs:
-- anyone could call are_friends(a, b) and learn who is friends with whom.
-- Moving them to an unexposed schema keeps the policies working (policies
-- reference functions by OID) while removing the RPC endpoints.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

alter function public.is_moderator(uuid) set schema private;
alter function public.are_friends(uuid, uuid) set schema private;
alter function public.attends(uuid, uuid) set schema private;
alter function public.can_edit_festival(uuid, uuid) set schema private;

-- Its body named public.is_moderator, which no longer exists.
create or replace function private.can_edit_festival(uid uuid, fid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select uid is not null and (
    private.is_moderator(uid)
    or exists (select 1 from public.festivals where id = fid and created_by = uid)
  );
$$;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;

-- The app asks "can I edit this festival?". The public wrapper keeps the old
-- signature but only answers for the caller, so it reveals nothing about
-- other users' roles.
create function public.can_edit_festival(uid uuid, fid uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select uid = (select auth.uid()) and private.can_edit_festival(uid, fid);
$$;

revoke execute on function public.can_edit_festival(uuid, uuid) from public, anon;
grant execute on function public.can_edit_festival(uuid, uuid) to authenticated;

-- Trigger function: runs from the auth.users trigger, never as an RPC.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

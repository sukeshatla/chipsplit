-- Friend-only expenses. An expense added with friends from the Dashboard (or a friend's page)
-- lives in a small "direct" group, so splits, payments, and history work exactly like any other
-- expense -- but direct groups are left out of every Groups list and shown under Friends instead.
--
-- Run once in the Supabase SQL editor after 0001-0016, BEFORE deploying the matching app build.

alter table public.groups add column if not exists is_direct boolean not null default false;

-- Same as 0007, plus p_direct.
drop function if exists public.create_group(text, text, text);
create or replace function public.create_group(p_name text, p_kind text, p_currency text, p_direct boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  gid uuid;
  pname text;
  pemail text;
begin
  if auth.uid() is null then raise exception 'You are signed out'; end if;
  select display_name, email into pname, pemail from public.profiles where id = auth.uid();
  insert into public.groups (name, kind, currency, created_by, is_direct)
    values (trim(p_name), coalesce(nullif(p_kind, ''), 'club'), coalesce(nullif(p_currency, ''), 'USD'), auth.uid(), coalesce(p_direct, false))
    returning id into gid;
  insert into public.group_members (group_id, user_id, name, email, role)
    values (gid, auth.uid(), coalesce(nullif(pname, ''), 'Me'), lower(pemail), 'owner');
  return gid;
end $$;
grant execute on function public.create_group(text, text, text, boolean) to authenticated;

-- Backfill: quick expenses made before this were plain "expenses" groups named after the one
-- friend in them. Mark those as direct: exactly two members, and named after the one who isn't
-- the creator.
update public.groups g set is_direct = true
where g.kind = 'expenses' and not g.is_direct
  and (select count(*) from public.group_members m where m.group_id = g.id) = 2
  and exists (
    select 1 from public.group_members m
    where m.group_id = g.id and m.user_id is distinct from g.created_by and m.name = g.name
  );

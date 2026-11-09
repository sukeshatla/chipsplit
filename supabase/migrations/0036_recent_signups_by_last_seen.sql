-- The Admin page's Recent signups lists the people who opened the app most recently (SPEC
-- ADMIN-3), not the newest accounts: someone who joined months ago but logged in today shows
-- at the top. Never-opened accounts go last, newest first. Same columns, same admin-only check.
--
-- Run once in the Supabase SQL editor after 0001-0035. The app also sorts what it gets, so it
-- works before this runs, just over the 20 newest accounts instead of everyone.

create or replace function public.admin_recent_signups(p_limit int default 20)
returns table (id uuid, display_name text, email text, created_at timestamptz, last_seen_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, p.email, p.created_at, p.last_seen_at
  from public.profiles p
  where public.is_app_admin()
  order by p.last_seen_at desc nulls last, p.created_at desc
  limit greatest(p_limit, 1);
$$;
grant execute on function public.admin_recent_signups(int) to authenticated;

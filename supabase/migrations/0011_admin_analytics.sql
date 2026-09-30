-- Admin-only usage analytics: signup counts and daily activity, visible to nobody but the
-- app's operator. Everything here is exposed exclusively through security-definer RPCs that
-- check is_app_admin() themselves -- never through a relaxed RLS policy on profiles, and
-- app_visits has no select policy at all, so even the row's own owner can't read it back.

create or replace function public.is_app_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and lower(email) = 'atlasukesh@gmail.com'
  );
$$;

alter table public.profiles add column last_seen_at timestamptz;

create table public.app_visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  visit_date date not null default current_date,
  created_at timestamptz not null default now(),
  unique (user_id, visit_date)
);
create index app_visits_date_idx on public.app_visits (visit_date);

alter table public.app_visits enable row level security;
create policy "record own visit" on public.app_visits for insert with check (user_id = auth.uid());

-- Called once per app load. Upserts today's visit and bumps last_seen_at; silently a no-op
-- when signed out so it's always safe to fire from the client.
create or replace function public.record_visit()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  update public.profiles set last_seen_at = now() where id = auth.uid();
  insert into public.app_visits (user_id, visit_date) values (auth.uid(), current_date)
    on conflict (user_id, visit_date) do nothing;
end $$;
grant execute on function public.record_visit() to authenticated;

create or replace function public.admin_overview()
returns table (
  total_users bigint,
  new_today bigint,
  new_this_week bigint,
  new_this_month bigint,
  active_today bigint,
  active_this_week bigint
) language sql stable security definer set search_path = public as $$
  select
    (select count(*) from public.profiles),
    (select count(*) from public.profiles where created_at::date = current_date),
    (select count(*) from public.profiles where created_at >= date_trunc('week', now())),
    (select count(*) from public.profiles where created_at >= date_trunc('month', now())),
    (select count(*) from public.app_visits where visit_date = current_date),
    (select count(distinct user_id) from public.app_visits where visit_date >= current_date - 6)
  where public.is_app_admin();
$$;
grant execute on function public.admin_overview() to authenticated;

create or replace function public.admin_daily_activity(p_days int default 30)
returns table (day date, new_users bigint, active_users bigint)
language sql stable security definer set search_path = public as $$
  select
    d::date as day,
    (select count(*) from public.profiles p where p.created_at::date = d::date) as new_users,
    (select count(distinct v.user_id) from public.app_visits v where v.visit_date = d::date) as active_users
  from generate_series(
    (current_date - (greatest(p_days, 1) - 1))::timestamp,
    current_date::timestamp,
    interval '1 day'
  ) as d
  where public.is_app_admin()
  order by day;
$$;
grant execute on function public.admin_daily_activity(int) to authenticated;

create or replace function public.admin_recent_signups(p_limit int default 20)
returns table (id uuid, display_name text, email text, created_at timestamptz, last_seen_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, p.email, p.created_at, p.last_seen_at
  from public.profiles p
  where public.is_app_admin()
  order by p.created_at desc
  limit greatest(p_limit, 1);
$$;
grant execute on function public.admin_recent_signups(int) to authenticated;

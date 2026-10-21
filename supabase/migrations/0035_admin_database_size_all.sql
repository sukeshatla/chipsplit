-- The Admin page's database size now matches Supabase's Usage page (SPEC ADMIN-1). Supabase
-- counts every database on the server, not just "postgres": the template0 and template1 copies
-- add about 15 MB that's always there. 0032 only counted "postgres", so the card read 13 MB
-- while Supabase said 28 MB. Everything else in admin_usage() is unchanged.
--
-- Run once in the Supabase SQL editor after 0001-0034. No app change depends on it.

create or replace function public.admin_usage()
returns table (database_bytes bigint, storage_bytes bigint, active_30d bigint, tables jsonb)
language sql stable security definer set search_path = public as $$
  select
    (select sum(pg_database_size(d.datname))::bigint from pg_database d),
    (select coalesce(sum((o.metadata->>'size')::bigint), 0) from storage.objects o),
    (select count(distinct v.user_id) from public.app_visits v where v.visit_date > current_date - 30),
    (select coalesce(jsonb_agg(t order by t.bytes desc), '[]'::jsonb) from (
      select c.relname as name, pg_total_relation_size(c.oid) as bytes, greatest(c.reltuples, 0)::bigint as rows
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by pg_total_relation_size(c.oid) desc
      limit 5
    ) t)
  where public.is_app_admin();
$$;
grant execute on function public.admin_usage() to authenticated;

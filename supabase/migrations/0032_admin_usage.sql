-- Supabase free-plan usage on the Admin page (SPEC ADMIN-1, ADMIN-2), so the app can stay on the
-- free plan knowingly: database size (limit 500 MB), file storage (1 GB), people active in the
-- last 30 days (stand-in for monthly active users, 50,000), and the biggest tables. Egress and log
-- ingestion aren't visible from Postgres; the page links to Supabase's Usage page for those.
-- Like 0011, it's a security-definer RPC that returns nothing unless the caller is the app admin.

create or replace function public.admin_usage()
returns table (database_bytes bigint, storage_bytes bigint, active_30d bigint, tables jsonb)
language sql stable security definer set search_path = public as $$
  select
    pg_database_size(current_database()),
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

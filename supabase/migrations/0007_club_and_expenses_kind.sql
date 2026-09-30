-- ChipSplit: rename the "poker" group kind to "club" (a club is a standing group of people
-- you play games with repeatedly -- it already supported unlimited games plus expenses; this
-- just makes the schema say what it means) and drop "mixed", which the UI stopped offering
-- as a creatable option a while back. A club already covers what "mixed" was for.
-- Run once in Supabase SQL editor after 0001-0006.

-- Widen the constraint first so the data migration below is allowed to write 'club',
-- then narrow it to the final allowed set once every row has been renamed.
alter table public.groups drop constraint if exists groups_kind_check;
alter table public.groups add constraint groups_kind_check check (kind in ('expenses', 'poker', 'mixed', 'club'));

update public.groups set kind = 'club' where kind in ('poker', 'mixed');

alter table public.groups drop constraint groups_kind_check;
alter table public.groups add constraint groups_kind_check check (kind in ('club', 'expenses'));
alter table public.groups alter column kind set default 'club';

create or replace function public.create_group(p_name text, p_kind text, p_currency text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  gid uuid;
  pname text;
  pemail text;
begin
  if auth.uid() is null then raise exception 'You are signed out'; end if;
  select display_name, email into pname, pemail from public.profiles where id = auth.uid();
  insert into public.groups (name, kind, currency, created_by)
    values (trim(p_name), coalesce(nullif(p_kind, ''), 'club'), coalesce(nullif(p_currency, ''), 'USD'), auth.uid())
    returning id into gid;
  insert into public.group_members (group_id, user_id, name, email, role)
    values (gid, auth.uid(), coalesce(nullif(pname, ''), 'Me'), lower(pemail), 'owner');
  return gid;
end $$;

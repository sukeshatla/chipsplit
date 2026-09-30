-- ChipSplit: group admins (a permission gate for deleting the group or an expense, and
-- for changing group settings) and a lightweight notifications feed built on change_log.
-- Run once in Supabase SQL editor after 0001, 0002, and 0003.

alter table public.group_members add column is_admin boolean not null default true;
alter table public.profiles add column notifications_seen_at timestamptz not null default now();

create or replace function public.is_group_admin(gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = auth.uid() and is_admin);
$$;

-- Only a current admin can promote or demote another member, and a group always keeps
-- at least one admin so it can never lock itself out of admin management.
create or replace function public.enforce_admin_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_admin is distinct from old.is_admin then
    if not exists (select 1 from public.group_members m where m.group_id = old.group_id and m.user_id = auth.uid() and m.is_admin) then
      raise exception 'Only a group admin can change admin status';
    end if;
    if old.is_admin and not new.is_admin
       and not exists (select 1 from public.group_members m where m.group_id = old.group_id and m.is_admin and m.id <> old.id) then
      raise exception 'A group needs at least one admin';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists group_members_admin_guard on public.group_members;
create trigger group_members_admin_guard before update on public.group_members
  for each row execute function public.enforce_admin_change();

-- Group settings and deleting the group are now admin-only.
drop policy if exists "members update groups" on public.groups;
create policy "admins update groups" on public.groups for update using (public.is_group_admin(id));
drop policy if exists "owners delete groups" on public.groups;
create policy "admins delete groups" on public.groups for delete using (public.is_group_admin(id));

-- Anyone in the group can still add or edit expenses; only admins can delete one.
drop policy if exists "members manage expenses" on public.expenses;
create policy "members read expenses" on public.expenses for select using (public.is_group_member(group_id));
create policy "members insert expenses" on public.expenses for insert with check (public.is_group_member(group_id));
create policy "members update expenses" on public.expenses for update using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));
create policy "admins delete expenses" on public.expenses for delete using (public.is_group_admin(group_id));

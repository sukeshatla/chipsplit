-- One name per person, everywhere. Once someone has an account, the name shown for them in every
-- group, every friends list, and every rummy game is their own profile name -- not whatever the
-- person who added them typed -- and it follows them if they rename themselves. People without
-- an account (guests, or invited but not signed up yet) keep the name they were added with.
--
-- Enforced here rather than in the app so it holds no matter how the row was written:
--   * a row gets its name from the profile whenever it becomes linked to an account
--     (added by email of an existing user, or linked at sign-up by email), and
--   * renaming your profile renames every linked row.
--
-- Run once in the Supabase SQL editor after 0001-0019.

create or replace function public.profile_name(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select nullif(trim(display_name), '') from public.profiles where id = p_user;
$$;

-- BEFORE insert / user_id change on any table that snapshots a person's name.
create or replace function public.take_linked_name()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null then
    new.name := coalesce(public.profile_name(new.user_id), new.name);
  end if;
  return new;
end $$;

drop trigger if exists group_members_linked_name on public.group_members;
create trigger group_members_linked_name before insert or update of user_id on public.group_members
  for each row execute function public.take_linked_name();
drop trigger if exists contacts_linked_name on public.contacts;
create trigger contacts_linked_name before insert or update of user_id on public.contacts
  for each row execute function public.take_linked_name();
drop trigger if exists rummy_players_linked_name on public.rummy_players;
create trigger rummy_players_linked_name before insert or update of user_id on public.rummy_players
  for each row execute function public.take_linked_name();

-- AFTER a profile rename: carry it to every linked row.
create or replace function public.spread_profile_name()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  n text := nullif(trim(new.display_name), '');
begin
  if n is null or n is not distinct from nullif(trim(old.display_name), '') then return new; end if;
  update public.group_members set name = n where user_id = new.id and name is distinct from n;
  update public.contacts set name = n where user_id = new.id and name is distinct from n;
  update public.rummy_players set name = n where user_id = new.id and name is distinct from n;
  return new;
end $$;
drop trigger if exists profiles_spread_name on public.profiles;
create trigger profiles_spread_name after update of display_name on public.profiles
  for each row execute function public.spread_profile_name();

-- Backfill everyone already linked.
update public.group_members gm set name = p.display_name
  from public.profiles p where gm.user_id = p.id and nullif(trim(p.display_name), '') is not null and gm.name is distinct from p.display_name;
update public.contacts c set name = p.display_name
  from public.profiles p where c.user_id = p.id and nullif(trim(p.display_name), '') is not null and c.name is distinct from p.display_name;
update public.rummy_players rp set name = p.display_name
  from public.profiles p where rp.user_id = p.id and nullif(trim(p.display_name), '') is not null and rp.name is distinct from p.display_name;

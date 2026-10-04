-- Who decides a person's name and email.
--
-- 1. Your own name is yours: new accounts confirm it once on first sign-in
--    (profiles.name_confirmed), and 0020 already carries it into every group, friends list, and
--    rummy game you're linked in.
-- 2. Nobody else's name or email can be changed except by the app admin (is_app_admin()):
--    a trigger on group_members and contacts rejects it, so it holds against direct API calls,
--    not just the UI. Automatic syncs still work -- linking an account by email (handle_new_user)
--    and a profile rename carried out by 0020 both set the name to the account's own name,
--    which the trigger allows. The SQL editor (no signed-in user) is also allowed.
-- 3. admin_update_person() is the one way to fix a guest's or invited person's name/email:
--    it updates that person in every group and friends list at once, and links them to an
--    account if the new email already has one.
-- 4. profiles.email always mirrors the sign-in account. Before this, "own profile update" let
--    anyone set their profile email to the admin's address and pass is_app_admin().
-- 5. Re-adding a friend by an email you already have no longer renames them.
--
-- Run once in the Supabase SQL editor after 0001-0022, BEFORE deploying the matching app build
-- (the app reads profiles.name_confirmed and calls admin_update_person).

-- 1. Confirm your name once. Everyone who already has an account counts as confirmed.
alter table public.profiles add column if not exists name_confirmed boolean not null default false;
update public.profiles set name_confirmed = true where not name_confirmed;

-- 4. Profile email = account email, always.
create or replace function public.profile_email_from_account()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.email := lower(coalesce((select email from auth.users where id = new.id), new.email, ''));
  return new;
end $$;
drop trigger if exists profiles_email_from_account on public.profiles;
create trigger profiles_email_from_account before insert or update of email on public.profiles
  for each row execute function public.profile_email_from_account();
-- Undo anything already changed by hand.
update public.profiles p set email = lower(u.email)
  from auth.users u where u.id = p.id and p.email is distinct from lower(u.email);

-- 2. Only the app admin changes other people's names and emails.
-- Named "zz_" so it runs after the 0020 "*_linked_name" triggers (BEFORE triggers run in name order).
create or replace function public.guard_person_identity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_app_admin() then return new; end if;
  if new.email is distinct from old.email then
    raise exception 'Only the app admin can change someone''s email';
  end if;
  if new.name is distinct from old.name
     and not (new.user_id is not null and new.name = public.profile_name(new.user_id)) then
    raise exception 'Only the app admin can change someone''s name';
  end if;
  return new;
end $$;
drop trigger if exists group_members_zz_identity_guard on public.group_members;
create trigger group_members_zz_identity_guard before update on public.group_members
  for each row execute function public.guard_person_identity();
drop trigger if exists contacts_zz_identity_guard on public.contacts;
create trigger contacts_zz_identity_guard before update on public.contacts
  for each row execute function public.guard_person_identity();

-- 3. Fix a person's name and email everywhere (app admin only, people without an account only).
create or replace function public.admin_update_person(p_member uuid, p_name text, p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare
  m public.group_members;
  nm text := trim(coalesce(p_name, ''));
  em text := nullif(lower(trim(coalesce(p_email, ''))), '');
  old_em text;
  uid uuid;
begin
  if not public.is_app_admin() then raise exception 'Only the app admin can change names and emails'; end if;
  if nm = '' then raise exception 'Enter a name'; end if;
  select * into m from public.group_members where id = p_member;
  if m.id is null then raise exception 'That person no longer exists'; end if;
  if m.user_id is not null then raise exception 'They have an account, so their name comes from their profile'; end if;
  old_em := nullif(lower(m.email), '');

  -- This member, plus every other unlinked row for the same person (same old email).
  update public.group_members set name = nm, email = em
    where id = m.id or (old_em is not null and user_id is null and lower(email) = old_em);
  update public.contacts set name = nm, email = em
    where (old_em is not null and user_id is null and lower(email) = old_em)
       or (m.contact_id is not null and id = m.contact_id);

  -- The new email already has an account: link them now instead of waiting for a sign-up.
  if em is not null then
    select id into uid from public.profiles where lower(email) = em;
    if uid is not null then
      update public.group_members gm set user_id = uid
        where gm.user_id is null and lower(gm.email) = em
          and not exists (select 1 from public.group_members x where x.group_id = gm.group_id and x.user_id = uid);
      update public.contacts set user_id = uid where user_id is null and lower(email) = em;
    end if;
  end if;

  insert into public.change_log (group_id, actor_id, entity_type, entity_id, summary)
    values (m.group_id, auth.uid(), 'member', m.id,
      case when nm is distinct from m.name then format('Renamed %s to %s', m.name, nm)
           else format('Changed %s''s email', nm) end);
end $$;
grant execute on function public.admin_update_person(uuid, text, text) to authenticated;

-- 5. upsert_contact (0002) renamed an existing contact when re-added by email; now it only links.
create or replace function public.upsert_contact(p_name text, p_email text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
  uid uuid;
  em text := nullif(lower(trim(coalesce(p_email, ''))), '');
  nm text := trim(coalesce(p_name, ''));
begin
  if auth.uid() is null then raise exception 'You are signed out'; end if;
  if nm = '' then raise exception 'Enter a name'; end if;
  if em is not null then
    select id into uid from public.profiles where lower(email) = em;
    select id into cid from public.contacts where owner_id = auth.uid() and lower(email) = em;
  end if;
  if cid is not null then
    update public.contacts set user_id = coalesce(user_id, uid) where id = cid;
    return cid;
  end if;
  insert into public.contacts (owner_id, user_id, name, email)
    values (auth.uid(), uid, nm, em) returning id into cid;
  return cid;
end $$;

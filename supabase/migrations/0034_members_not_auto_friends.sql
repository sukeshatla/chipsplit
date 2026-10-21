-- Adding someone to a group no longer adds them to your friends (SPEC FRIEND-11). Until now
-- add_member saved every new name or email to the adder's contacts, so everyone you ever put in a
-- group showed up on your Friends list. Now a friend is only someone you add on purpose: Add a
-- friend (by email) or Add as friend on their card, both through addContact / upsert_contact.
--
-- add_member keeps everything else: members only, picking a friend by contact id, linking an
-- email that already has an account, and refusing someone already in the group.
--
-- Run once in the Supabase SQL editor after 0001-0033, BEFORE deploying the matching app build.

create or replace function public.add_member(p_group uuid, p_name text default null, p_email text default null, p_contact_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
  mid uuid;
  cid uuid := p_contact_id;
  cname text;
  cemail text;
begin
  if not public.is_group_member(p_group) then raise exception 'You are not in this group'; end if;

  if cid is not null then
    select name, email, user_id into cname, cemail, uid from public.contacts where id = cid and owner_id = auth.uid();
    if cname is null then raise exception 'That friend is not in your list'; end if;
  else
    cname := trim(coalesce(p_name, ''));
    if cname = '' then raise exception 'Enter a name'; end if;
    cemail := nullif(lower(trim(coalesce(p_email, ''))), '');
    if cemail is not null then
      select id into uid from public.profiles where lower(email) = cemail;
    end if;
  end if;

  if uid is not null and exists (select 1 from public.group_members where group_id = p_group and user_id = uid) then
    raise exception 'That person is already in this group';
  end if;

  insert into public.group_members (group_id, user_id, contact_id, name, email, role)
    values (p_group, uid, cid, cname, cemail, 'member') returning id into mid;
  return mid;
end $$;
grant execute on function public.add_member(uuid, text, text, uuid) to authenticated;

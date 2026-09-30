-- ChipSplit: personal friends list (contacts), independent of any single group.
-- Run once in Supabase SQL editor after 0001_init.sql.

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  user_id uuid references auth.users on delete set null, -- set once their signed-up email matches
  name text not null check (length(trim(name)) > 0),
  email text,
  created_at timestamptz not null default now()
);
create index contacts_owner_idx on public.contacts (owner_id);
create index contacts_user_idx on public.contacts (user_id);
-- One contact per email per owner; guests with no email are never deduped.
create unique index contacts_owner_email_idx on public.contacts (owner_id, lower(email)) where email is not null;

alter table public.group_members add column contact_id uuid references public.contacts on delete set null;

alter table public.contacts enable row level security;
create policy "own contacts" on public.contacts for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Add or reuse (by email) a contact in the caller's own friends list.
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
    update public.contacts set name = nm, user_id = uid where id = cid;
    return cid;
  end if;
  insert into public.contacts (owner_id, user_id, name, email)
    values (auth.uid(), uid, nm, em) returning id into cid;
  return cid;
end $$;
grant execute on function public.upsert_contact(text, text) to authenticated;

-- Replaces 0001's add_member: add from an existing contact (p_contact_id), or from a
-- name/email, which is also saved to (or matched against) the caller's contacts.
drop function if exists public.add_member(uuid, text, text);
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
    cid := public.upsert_contact(p_name, p_email);
    select name, email, user_id into cname, cemail, uid from public.contacts where id = cid;
  end if;

  if uid is not null and exists (select 1 from public.group_members where group_id = p_group and user_id = uid) then
    raise exception 'That person is already in this group';
  end if;

  insert into public.group_members (group_id, user_id, contact_id, name, email, role)
    values (p_group, uid, cid, cname, cemail, 'member') returning id into mid;
  return mid;
end $$;
grant execute on function public.add_member(uuid, text, text, uuid) to authenticated;

-- Extend the new-user trigger to also link contacts by email, alongside group_members.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, email, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    lower(coalesce(new.email, '')),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  update public.group_members gm set user_id = new.id
  where gm.user_id is null and lower(gm.email) = lower(new.email)
    and not exists (select 1 from public.group_members x where x.group_id = gm.group_id and x.user_id = new.id);

  update public.contacts c set user_id = new.id
  where c.user_id is null and lower(c.email) = lower(new.email);

  return new;
end $$;

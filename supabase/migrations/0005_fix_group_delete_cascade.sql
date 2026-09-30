-- ChipSplit: fix "Delete group". expense_payers, expense_shares, session_results, and
-- settlements all reference group_members WITHOUT on delete cascade, so deleting a group
-- (which cascades into group_members) fails with a foreign key violation as soon as any
-- member has a finalized game, an expense, or a payment -- i.e. almost always in practice.
--
-- Fix: cascade those four FKs too. To keep "remove one member" safe (it must NOT silently
-- wipe that member's expense/game/payment history), a trigger blocks a *standalone* member
-- removal when they have activity -- it only lets the cascade through when the whole group
-- is already gone, which is exactly the case the app's UI currently guards client-side via
-- memberHasActivity().
--
-- Run once in Supabase SQL editor after 0001-0004.

alter table public.expense_payers drop constraint expense_payers_member_id_fkey,
  add constraint expense_payers_member_id_fkey foreign key (member_id) references public.group_members on delete cascade;
alter table public.expense_shares drop constraint expense_shares_member_id_fkey,
  add constraint expense_shares_member_id_fkey foreign key (member_id) references public.group_members on delete cascade;
alter table public.session_results drop constraint session_results_member_id_fkey,
  add constraint session_results_member_id_fkey foreign key (member_id) references public.group_members on delete cascade;
alter table public.settlements drop constraint settlements_from_member_fkey,
  add constraint settlements_from_member_fkey foreign key (from_member) references public.group_members on delete cascade;
alter table public.settlements drop constraint settlements_to_member_fkey,
  add constraint settlements_to_member_fkey foreign key (to_member) references public.group_members on delete cascade;

create or replace function public.enforce_member_removal()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- The group's own row is already gone by the time a whole-group delete cascades down to
  -- group_members, so this only fires for a standalone "remove this one member" delete.
  if exists (select 1 from public.groups where id = old.group_id) then
    if exists (select 1 from public.expense_payers where member_id = old.id)
       or exists (select 1 from public.expense_shares where member_id = old.id)
       or exists (select 1 from public.session_results where member_id = old.id)
       or exists (select 1 from public.settlements where from_member = old.id or to_member = old.id) then
      raise exception 'This member has games, expenses, or payments and can''t be removed';
    end if;
  end if;
  return old;
end $$;
drop trigger if exists group_members_removal_guard on public.group_members;
create trigger group_members_removal_guard before delete on public.group_members
  for each row execute function public.enforce_member_removal();

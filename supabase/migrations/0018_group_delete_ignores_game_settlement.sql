-- Deleting a group only needs the group's TOTAL balances settled (group_is_settled: expenses +
-- finalized games + every payment). Before this, the per-game rule from 0008 also fired for
-- each game as the group delete cascaded down, so a club settled up from its Balances tab
-- (payments not tied to any one game) still couldn't be deleted.
--
-- Deleting a single game still requires that game's own payments to be recorded.
-- Same pattern as enforce_member_removal (0005): when the group row is already gone, this
-- delete is part of a whole-group delete, which group_is_settled has already checked.
--
-- Run once in the Supabase SQL editor after 0001-0017.

create or replace function public.enforce_session_settled_before_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.groups where id = old.group_id)
     and old.status = 'final' and not public.session_is_settled(old.id) then
    raise exception 'Settle up everyone in this game before deleting it';
  end if;
  return old;
end $$;

-- Deleting a rummy game works like deleting a poker game (SPEC RUMMY-17).
--
-- A finished staked rummy game's payout lives in its Rummy group's balances as a finished game
-- (rummy_games.session_id). Before this, the scorer could delete the rummy game at any time, and
-- its payout and payments stayed in the balances with nothing to show for them.
--
-- 1. A rummy game whose payout isn't settled yet can't be deleted.
-- 2. Deleting a rummy game deletes its payout game too, and with it (0022) the payments marked for
--    it, so everyone's balance is exactly what it was before the game.
-- A game in progress or without a buy-in has no payout, so it can be deleted any time.
-- When a whole group is deleted (already checked as settled in total), these steps stand aside.
--
-- Run once in the Supabase SQL editor after 0001-0028, BEFORE deploying the matching app build.

create or replace function public.enforce_rummy_delete_settled()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.session_id is not null
     and exists (select 1 from public.groups where id = old.group_id)
     and exists (select 1 from public.game_sessions where id = old.session_id)
     and not public.session_is_settled(old.session_id) then
    raise exception 'Settle up everyone in this game before deleting it';
  end if;
  return old;
end $$;
drop trigger if exists rummy_delete_settled on public.rummy_games;
create trigger rummy_delete_settled before delete on public.rummy_games
  for each row execute function public.enforce_rummy_delete_settled();

create or replace function public.delete_rummy_payout()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.session_id is not null and exists (select 1 from public.groups where id = old.group_id) then
    delete from public.game_sessions where id = old.session_id;
  end if;
  return old;
end $$;
drop trigger if exists rummy_delete_payout on public.rummy_games;
create trigger rummy_delete_payout after delete on public.rummy_games
  for each row execute function public.delete_rummy_payout();

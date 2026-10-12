-- A rummy payout follows the game's result (SPEC RUMMY-18).
--
-- A finished staked rummy game's payout sits in its Rummy group's balances as a finished game
-- (rummy_games.session_id). Before this, if the scorer edited a round so the game was back in play
-- (or someone else won), that payout stayed in the balances, out of step with the game.
--
-- Now, when a rummy game's status or winner changes while it has a payout:
--   - if payments are already marked against the payout, the change is refused (undo them first);
--   - otherwise the payout comes out of the balances, and session_id is cleared. The scorer's
--     screen adds the new payout once the game finishes again (as for any finished game).
-- A round edit that keeps the same result leaves the payout alone.
--
-- Run once in the Supabase SQL editor after 0001-0029, BEFORE deploying the matching app build.

create or replace function public.rummy_result_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.session_id is not null
     and (new.status is distinct from old.status or new.winner_player_id is distinct from old.winner_player_id) then
    if exists (select 1 from public.settlements where session_id = old.session_id) then
      raise exception 'Undo the payments marked for this game first, then change the round';
    end if;
    new.session_id := null;  -- the payout itself is removed after the update (below)
  end if;
  return new;
end $$;
drop trigger if exists rummy_result_changed on public.rummy_games;
create trigger rummy_result_changed before update on public.rummy_games
  for each row execute function public.rummy_result_changed();

create or replace function public.remove_stale_rummy_payout()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.session_id is not null and new.session_id is null then
    -- Back to "in progress" first: a finished game that isn't settled can't be deleted (0018),
    -- and this payout has no payments, so nothing is lost.
    update public.game_sessions set status = 'open' where id = old.session_id;
    delete from public.game_sessions where id = old.session_id;
  end if;
  return new;
end $$;
drop trigger if exists rummy_remove_stale_payout on public.rummy_games;
create trigger rummy_remove_stale_payout after update on public.rummy_games
  for each row execute function public.remove_stale_rummy_payout();

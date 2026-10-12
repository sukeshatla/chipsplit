-- One game in progress per group (SPEC GAME-11, RUMMY-15).
--
-- 1. A Poker group can have at most one game in progress (status 'open', not deleted). Starting
--    a game, reopening a finished one, or restoring a deleted in-progress one is refused while
--    another is in progress, with a message naming it.
-- 2. A Rummy group can have at most one rummy game in progress (status 'active'). Starting one,
--    or a round edit that would put a finished game back in play, is refused while another is.
--
-- Groups that already have more than one in progress are left alone: the rule applies the next
-- time a game starts, reopens, or is restored.
--
-- Run once in the Supabase SQL editor after 0001-0026, BEFORE deploying the matching app build.

-- ---------- 1. poker ----------
create or replace function public.enforce_one_open_game()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  other text;
begin
  if new.status = 'open' and new.deleted_at is null
     and (tg_op = 'INSERT' or old.status is distinct from 'open' or old.deleted_at is not null) then
    select coalesce(nullif(s.location, ''), to_char(s.played_on, 'Mon DD')) into other
      from public.game_sessions s
      where s.group_id = new.group_id and s.id <> new.id and s.status = 'open' and s.deleted_at is null
      limit 1;
    if other is not null then
      raise exception 'A game is already in progress ("%"). Finish or delete it first.', other;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists sessions_one_open on public.game_sessions;
create trigger sessions_one_open before insert or update on public.game_sessions
  for each row execute function public.enforce_one_open_game();

-- ---------- 2. rummy ----------
create or replace function public.enforce_one_active_rummy()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  other text;
begin
  if new.status = 'active' and new.group_id is not null
     and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    select coalesce(nullif(g.name, ''), 'Rummy') into other
      from public.rummy_games g
      where g.group_id = new.group_id and g.id <> new.id and g.status = 'active'
      limit 1;
    if other is not null then
      raise exception '"%" is still in progress. Close or delete it before starting another rummy game.', other;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists rummy_one_active on public.rummy_games;
create trigger rummy_one_active before insert or update of status on public.rummy_games
  for each row execute function public.enforce_one_active_rummy();

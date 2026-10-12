-- Rummy: up to 7 players a game, and the scorer picks where a rejoining player restarts
-- (SPEC RUMMY-16, RUMMY-2).
--
-- 1. create_rummy_game refuses more than 7 players (same as 0026 otherwise).
-- 2. rejoin_rummy_player takes p_start: the score the player comes back at. The app suggests the
--    highest score still in + 1 and lets the scorer change it; anything from 0 up to one below
--    the point limit is accepted. Replaces 0016's one-argument version, which always used the
--    top score still in.
--
-- Run once in the Supabase SQL editor after 0001-0027, BEFORE deploying the matching app build.

-- ---------- 1. up to 7 players ----------
create or replace function public.create_rummy_game(p_group_id uuid, p_name text, p_point_limit int, p_players jsonb, p_buy_in_cents bigint default 0)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  gid uuid;
begin
  if auth.uid() is null then raise exception 'You are signed out'; end if;
  if p_point_limit not in (101, 151, 201) then raise exception 'Pick a valid point limit'; end if;
  if coalesce(p_buy_in_cents, 0) < 0 then raise exception 'The buy-in can''t be negative'; end if;
  if p_group_id is null or not exists (select 1 from public.groups where id = p_group_id and kind = 'rummy') then
    raise exception 'Rummy games are played in a Rummy group';
  end if;
  if not public.is_group_member(p_group_id) then raise exception 'You are not in this group'; end if;
  if jsonb_array_length(p_players) < 2 then raise exception 'Add at least two players'; end if;
  if jsonb_array_length(p_players) > 7 then raise exception 'A rummy table takes up to 7 players'; end if;
  insert into public.rummy_games (group_id, name, point_limit, scorer_id, buy_in_cents)
    values (p_group_id, nullif(trim(coalesce(p_name, '')), ''), p_point_limit, auth.uid(), coalesce(p_buy_in_cents, 0))
    returning id into gid;
  insert into public.rummy_players (rummy_game_id, user_id, name)
    select gid, nullif(x->>'user_id', '')::uuid, trim(x->>'name')
    from jsonb_array_elements(p_players) x;
  return gid;
end $$;
grant execute on function public.create_rummy_game(uuid, text, int, jsonb, bigint) to authenticated;

-- ---------- 2. rejoin at a chosen start ----------
drop function if exists public.rejoin_rummy_player(uuid);
create or replace function public.rejoin_rummy_player(p_player_id uuid, p_start int)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_game_id uuid;
  v_limit int;
  v_total int;
  v_active int;
begin
  select g.id, g.point_limit into v_game_id, v_limit
  from public.rummy_players p join public.rummy_games g on g.id = p.rummy_game_id
  where p.id = p_player_id and g.scorer_id = auth.uid() and g.status = 'active';
  if v_game_id is null then raise exception 'Only the scorer can bring a player back, while the game is active'; end if;

  select total into v_total from public.rummy_totals(v_game_id) where player_id = p_player_id;
  if v_total < v_limit then raise exception 'That player is still in'; end if;

  select count(*) into v_active from public.rummy_totals(v_game_id) where total < v_limit;
  if v_active < 2 then raise exception 'Rejoining needs at least two players still in'; end if;

  if p_start is null or p_start < 0 or p_start >= v_limit then
    raise exception 'Pick a starting score from 0 to below %', v_limit;
  end if;

  update public.rummy_players
    set rejoins = rejoins + 1, score_offset = score_offset + (p_start - v_total)
    where id = p_player_id;
end $$;
grant execute on function public.rejoin_rummy_player(uuid, int) to authenticated;

-- Rummy for money: an optional buy-in per player, rejoining after elimination, and posting the
-- result into a club's balances.
--
--  * rummy_games.buy_in_cents  -- each player's stake (0 = just keeping score). The pot is
--    buy_in x (players + rejoins); the winner takes it, or it's split evenly among everyone
--    still in if the game is closed early.
--  * rummy_players.rejoins / score_offset -- an eliminated player can buy back in while 2+ are
--    still playing; their total resets to the highest total among those still in (standard
--    pool-rummy re-entry). Totals are sum(round points) + score_offset.
--  * rummy_games.session_id -- set once the result has been posted to the club as a finalized
--    game, so it can't be posted twice.
--
-- Run once in the Supabase SQL editor after 0001-0015, BEFORE deploying the matching app build.

alter table public.rummy_games add column if not exists buy_in_cents bigint not null default 0 check (buy_in_cents >= 0);
alter table public.rummy_games add column if not exists session_id uuid references public.game_sessions on delete set null;
alter table public.rummy_players add column if not exists rejoins int not null default 0 check (rejoins >= 0);
alter table public.rummy_players add column if not exists score_offset int not null default 0;

-- Totals now include each player's rejoin offset; add/update/close all go through this.
create or replace function public.rummy_totals(p_game_id uuid)
returns table (player_id uuid, total int)
language sql stable security definer set search_path = public as $$
  select rp.id, (coalesce(sum(s.points), 0) + rp.score_offset)::int
  from public.rummy_players rp
  left join public.rummy_round_scores s on s.player_id = rp.id
  where rp.rummy_game_id = p_game_id
  group by rp.id, rp.score_offset;
$$;

drop function if exists public.create_rummy_game(uuid, text, int, jsonb);
create or replace function public.create_rummy_game(p_group_id uuid, p_name text, p_point_limit int, p_players jsonb, p_buy_in_cents bigint default 0)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  gid uuid;
begin
  if auth.uid() is null then raise exception 'You are signed out'; end if;
  if p_point_limit not in (101, 151, 201) then raise exception 'Pick a valid point limit'; end if;
  if coalesce(p_buy_in_cents, 0) < 0 then raise exception 'The buy-in can''t be negative'; end if;
  if p_group_id is not null and not public.is_group_member(p_group_id) then raise exception 'You are not in this group'; end if;
  if jsonb_array_length(p_players) < 2 then raise exception 'Add at least two players'; end if;

  insert into public.rummy_games (group_id, name, point_limit, scorer_id, buy_in_cents)
    values (p_group_id, nullif(trim(coalesce(p_name, '')), ''), p_point_limit, auth.uid(), coalesce(p_buy_in_cents, 0))
    returning id into gid;

  insert into public.rummy_players (rummy_game_id, user_id, name)
    select gid, nullif(x->>'user_id', '')::uuid, trim(x->>'name')
    from jsonb_array_elements(p_players) x;

  return gid;
end $$;
grant execute on function public.create_rummy_game(uuid, text, int, jsonb, bigint) to authenticated;

create or replace function public.rejoin_rummy_player(p_player_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_game_id uuid;
  v_limit int;
  v_total int;
  v_top int;
  v_active int;
begin
  select g.id, g.point_limit into v_game_id, v_limit
  from public.rummy_players p join public.rummy_games g on g.id = p.rummy_game_id
  where p.id = p_player_id and g.scorer_id = auth.uid() and g.status = 'active';
  if v_game_id is null then raise exception 'Only the scorer can bring a player back, while the game is active'; end if;

  select total into v_total from public.rummy_totals(v_game_id) where player_id = p_player_id;
  if v_total < v_limit then raise exception 'That player is still in'; end if;

  select count(*), max(total) into v_active, v_top from public.rummy_totals(v_game_id) where total < v_limit;
  if v_active < 2 then raise exception 'Rejoining needs at least two players still in'; end if;

  update public.rummy_players
    set rejoins = rejoins + 1, score_offset = score_offset + (v_top - v_total)
    where id = p_player_id;
end $$;
grant execute on function public.rejoin_rummy_player(uuid) to authenticated;

-- Records which club game a finished rummy game was posted as. The game itself is created with
-- the normal game_sessions/session_results writes (same rules as any club game).
create or replace function public.link_rummy_session(p_game_id uuid, p_session_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.rummy_games g set session_id = p_session_id
    where g.id = p_game_id and g.scorer_id = auth.uid() and g.status = 'finished' and g.session_id is null
      and exists (select 1 from public.game_sessions s where s.id = p_session_id and s.group_id = g.group_id);
  if not found then raise exception 'This game was already added to the club, or it isn''t yours to add'; end if;
end $$;
grant execute on function public.link_rummy_session(uuid, uuid) to authenticated;

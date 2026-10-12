-- Every new rummy game needs a buy-in above zero, like a poker game (SPEC RUMMY-19).
-- Games made before keep whatever buy-in they had (including none).
--
-- Same as 0028's create_rummy_game, with the buy-in check tightened from "not negative" to
-- "above zero".
--
-- Run once in the Supabase SQL editor after 0001-0030, BEFORE deploying the matching app build.

create or replace function public.create_rummy_game(p_group_id uuid, p_name text, p_point_limit int, p_players jsonb, p_buy_in_cents bigint default 0)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  gid uuid;
begin
  if auth.uid() is null then raise exception 'You are signed out'; end if;
  if p_point_limit not in (101, 151, 201) then raise exception 'Pick a valid point limit'; end if;
  if coalesce(p_buy_in_cents, 0) <= 0 then raise exception 'Enter the buy-in for each player'; end if;
  if p_group_id is null or not exists (select 1 from public.groups where id = p_group_id and kind = 'rummy') then
    raise exception 'Rummy games are played in a Rummy group';
  end if;
  if not public.is_group_member(p_group_id) then raise exception 'You are not in this group'; end if;
  if jsonb_array_length(p_players) < 2 then raise exception 'Add at least two players'; end if;
  if jsonb_array_length(p_players) > 7 then raise exception 'A rummy table takes up to 7 players'; end if;
  insert into public.rummy_games (group_id, name, point_limit, scorer_id, buy_in_cents)
    values (p_group_id, nullif(trim(coalesce(p_name, '')), ''), p_point_limit, auth.uid(), p_buy_in_cents)
    returning id into gid;
  insert into public.rummy_players (rummy_game_id, user_id, name)
    select gid, nullif(x->>'user_id', '')::uuid, trim(x->>'name')
    from jsonb_array_elements(p_players) x;
  return gid;
end $$;
grant execute on function public.create_rummy_game(uuid, text, int, jsonb, bigint) to authenticated;

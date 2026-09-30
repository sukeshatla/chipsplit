-- Standard pool rummy uses X01 point limits (101/151/201), not round numbers.
-- Constraint has to drop before the data migrates, not after -- the old constraint would
-- otherwise reject the very rows this migration is trying to write.
alter table public.rummy_games drop constraint rummy_games_point_limit_check;
update public.rummy_games set point_limit = point_limit + 1 where point_limit in (100, 150, 200);
alter table public.rummy_games add constraint rummy_games_point_limit_check check (point_limit in (101, 151, 201));

create or replace function public.create_rummy_game(p_group_id uuid, p_name text, p_point_limit int, p_players jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  gid uuid;
begin
  if auth.uid() is null then raise exception 'You are signed out'; end if;
  if p_point_limit not in (101, 151, 201) then raise exception 'Pick a valid point limit'; end if;
  if p_group_id is not null and not public.is_group_member(p_group_id) then raise exception 'You are not in this group'; end if;
  if jsonb_array_length(p_players) < 2 then raise exception 'Add at least two players'; end if;

  insert into public.rummy_games (group_id, name, point_limit, scorer_id)
    values (p_group_id, nullif(trim(coalesce(p_name, '')), ''), p_point_limit, auth.uid())
    returning id into gid;

  insert into public.rummy_players (rummy_game_id, user_id, name)
    select gid, nullif(x->>'user_id', '')::uuid, trim(x->>'name')
    from jsonb_array_elements(p_players) x;

  return gid;
end $$;
grant execute on function public.create_rummy_game(uuid, text, int, jsonb) to authenticated;

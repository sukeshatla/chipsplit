-- Lets the scorer correct a round after saving it, at any game status. Recomputes elimination
-- and the winner exactly like add_rummy_round -- if the edit changes who's still in, a finished
-- game can reopen (status back to active, winner cleared) or a still-active game can finish.

create or replace function public.update_rummy_round(p_round_id uuid, p_scores jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_game_id uuid;
  v_limit int;
  remaining uuid[];
begin
  select r.rummy_game_id, g.point_limit into v_game_id, v_limit
  from public.rummy_rounds r join public.rummy_games g on g.id = r.rummy_game_id
  where r.id = p_round_id and g.scorer_id = auth.uid();
  if v_game_id is null then raise exception 'Only the scorer can edit this round'; end if;

  update public.rummy_round_scores s
  set points = coalesce((x->>'points')::int, s.points)
  from jsonb_array_elements(p_scores) x
  where s.round_id = p_round_id and s.player_id = (x->>'player_id')::uuid;

  select array_agg(player_id) into remaining from public.rummy_totals(v_game_id) where total < v_limit;
  if coalesce(array_length(remaining, 1), 0) <= 1 then
    update public.rummy_games set status = 'finished', finished_at = coalesce(finished_at, now()), winner_player_id = remaining[1]
      where id = v_game_id;
  else
    update public.rummy_games set status = 'active', finished_at = null, winner_player_id = null
      where id = v_game_id;
  end if;
end $$;
grant execute on function public.update_rummy_round(uuid, jsonb) to authenticated;

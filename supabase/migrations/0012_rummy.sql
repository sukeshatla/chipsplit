-- Rummy score tracking: elimination-style scoring (accumulate points each hand, marked out at
-- a point limit, last one standing wins), independent of the expense/settle-up ledger entirely.
-- Can hang off a club group (group_id set, roster suggested from group_members) or stand alone
-- (group_id null, roster picked from friends or typed in) -- both are the same table, just
-- with or without a group attached.

create table public.rummy_games (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups on delete cascade,
  name text,
  point_limit int not null check (point_limit in (100, 150, 200)),
  status text not null default 'active' check (status in ('active', 'finished')),
  scorer_id uuid not null references auth.users on delete cascade,
  winner_player_id uuid, -- FK added below, once rummy_players exists
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index rummy_games_group_idx on public.rummy_games (group_id);
create index rummy_games_scorer_idx on public.rummy_games (scorer_id);

create table public.rummy_players (
  id uuid primary key default gen_random_uuid(),
  rummy_game_id uuid not null references public.rummy_games on delete cascade,
  user_id uuid references auth.users on delete set null, -- set when the player is a signed-up friend
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);
create index rummy_players_game_idx on public.rummy_players (rummy_game_id);

alter table public.rummy_games add constraint rummy_games_winner_fkey
  foreign key (winner_player_id) references public.rummy_players on delete set null;

create table public.rummy_rounds (
  id uuid primary key default gen_random_uuid(),
  rummy_game_id uuid not null references public.rummy_games on delete cascade,
  round_no int not null,
  created_at timestamptz not null default now(),
  unique (rummy_game_id, round_no)
);

create table public.rummy_round_scores (
  round_id uuid not null references public.rummy_rounds on delete cascade,
  player_id uuid not null references public.rummy_players on delete cascade,
  points int not null default 0 check (points >= 0),
  primary key (round_id, player_id)
);

-- ---------- Visibility ----------
-- A game is visible to: anyone in its group (if it has one), the scorer who started it, or any
-- participant with a linked account. Guests (no account) see scores only over the scorer's
-- shoulder -- same as how this app treats guests everywhere else.
create or replace function public.rummy_game_visible(gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.rummy_games g
    where g.id = gid
      and (
        (g.group_id is not null and public.is_group_member(g.group_id))
        or g.scorer_id = auth.uid()
        or exists (select 1 from public.rummy_players rp where rp.rummy_game_id = g.id and rp.user_id = auth.uid())
      )
  );
$$;

alter table public.rummy_games enable row level security;
alter table public.rummy_players enable row level security;
alter table public.rummy_rounds enable row level security;
alter table public.rummy_round_scores enable row level security;

create policy "visible rummy games" on public.rummy_games for select using (public.rummy_game_visible(id));
create policy "scorer deletes own rummy game" on public.rummy_games for delete using (scorer_id = auth.uid());

create policy "visible rummy players" on public.rummy_players for select
  using (public.rummy_game_visible(rummy_game_id));
create policy "visible rummy rounds" on public.rummy_rounds for select
  using (public.rummy_game_visible(rummy_game_id));
create policy "visible rummy round scores" on public.rummy_round_scores for select
  using (exists (select 1 from public.rummy_rounds r where r.id = round_id and public.rummy_game_visible(r.rummy_game_id)));

-- No insert/update policies anywhere: every write goes through the security-definer RPCs
-- below, which check scorer_id = auth.uid() themselves. Deleting a game cascades the rest.

-- ---------- RPCs ----------
create or replace function public.create_rummy_game(p_group_id uuid, p_name text, p_point_limit int, p_players jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  gid uuid;
begin
  if auth.uid() is null then raise exception 'You are signed out'; end if;
  if p_point_limit not in (100, 150, 200) then raise exception 'Pick a valid point limit'; end if;
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

-- Totals for a game as of right now, used by both add_rummy_round and close_rummy_game to
-- decide who's still in. Returns one row per player with their running total.
create or replace function public.rummy_totals(p_game_id uuid)
returns table (player_id uuid, total int)
language sql stable security definer set search_path = public as $$
  select rp.id, coalesce(sum(s.points), 0)::int
  from public.rummy_players rp
  left join public.rummy_round_scores s on s.player_id = rp.id
  where rp.rummy_game_id = p_game_id
  group by rp.id;
$$;

create or replace function public.add_rummy_round(p_game_id uuid, p_scores jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_limit int;
  v_next_round int;
  rid uuid;
  remaining uuid[];
begin
  select point_limit into v_limit from public.rummy_games where id = p_game_id and scorer_id = auth.uid() and status = 'active';
  if v_limit is null then raise exception 'You can only add rounds to a rummy game you started that is still active'; end if;

  select coalesce(max(round_no), 0) + 1 into v_next_round from public.rummy_rounds where rummy_game_id = p_game_id;
  insert into public.rummy_rounds (rummy_game_id, round_no) values (p_game_id, v_next_round) returning id into rid;

  insert into public.rummy_round_scores (round_id, player_id, points)
    select rid, (x->>'player_id')::uuid, coalesce((x->>'points')::int, 0)
    from jsonb_array_elements(p_scores) x;

  select array_agg(player_id) into remaining from public.rummy_totals(p_game_id) where total < v_limit;
  if coalesce(array_length(remaining, 1), 0) <= 1 then
    update public.rummy_games set status = 'finished', finished_at = now(), winner_player_id = remaining[1]
      where id = p_game_id;
  end if;

  return rid;
end $$;
grant execute on function public.add_rummy_round(uuid, jsonb) to authenticated;

create or replace function public.close_rummy_game(p_game_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  remaining uuid[];
begin
  if not exists (select 1 from public.rummy_games where id = p_game_id and scorer_id = auth.uid() and status = 'active') then
    raise exception 'Only the scorer can close an active game';
  end if;
  select array_agg(player_id) into remaining from public.rummy_totals(p_game_id) where total < (select point_limit from public.rummy_games where id = p_game_id);
  update public.rummy_games set status = 'finished', finished_at = now(),
    winner_player_id = case when coalesce(array_length(remaining, 1), 0) = 1 then remaining[1] else null end
    where id = p_game_id;
end $$;
grant execute on function public.close_rummy_game(uuid) to authenticated;

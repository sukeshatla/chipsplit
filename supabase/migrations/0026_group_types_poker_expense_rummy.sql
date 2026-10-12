-- Three group types: Poker, Expense, and Rummy (SPEC GROUP-1, RUMMY-7).
--
-- 1. groups.kind gains 'rummy'. 'club' stays the database name for a Poker group, so existing
--    groups don't change; the app just calls them Poker.
-- 2. A group's type is set when it's created and can't change afterwards (its games, rummy
--    games, or expenses depend on it).
-- 3. Rummy moves to its own group type: every rummy game belongs to a Rummy group, and there's no
--    stand-alone rummy. Existing rummy games (stand-alone or started from a poker club) are
--    deleted, as agreed. Rummy payouts already posted to a club's balances are ordinary finished
--    games there, so they stay and nobody's balance changes.
--
-- Run once in the Supabase SQL editor after 0001-0025, BEFORE deploying the matching app build.

-- ---------- 1. the 'rummy' type ----------
alter table public.groups drop constraint if exists groups_kind_check;
alter table public.groups add constraint groups_kind_check check (kind in ('club', 'expenses', 'rummy'));

-- ---------- 2. the type is fixed ----------
create or replace function public.enforce_group_kind_fixed()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.kind is distinct from old.kind then
    raise exception 'A group''s type can''t be changed';
  end if;
  return new;
end $$;
drop trigger if exists groups_kind_fixed on public.groups;
create trigger groups_kind_fixed before update of kind on public.groups
  for each row execute function public.enforce_group_kind_fixed();

-- ---------- 3. rummy lives in Rummy groups ----------
delete from public.rummy_games;  -- players, rounds, and scores go with them (on delete cascade)

-- Same as 0016, except the group is required and must be a Rummy group.
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
  insert into public.rummy_games (group_id, name, point_limit, scorer_id, buy_in_cents)
    values (p_group_id, nullif(trim(coalesce(p_name, '')), ''), p_point_limit, auth.uid(), coalesce(p_buy_in_cents, 0))
    returning id into gid;
  insert into public.rummy_players (rummy_game_id, user_id, name)
    select gid, nullif(x->>'user_id', '')::uuid, trim(x->>'name')
    from jsonb_array_elements(p_players) x;
  return gid;
end $$;
grant execute on function public.create_rummy_game(uuid, text, int, jsonb, bigint) to authenticated;

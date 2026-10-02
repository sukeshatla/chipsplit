-- A game belongs to whoever started it (game_sessions.created_by, the "host"). Only the host can
-- change it -- buy-ins, cash-outs, chips given back, players, finalize/reopen, payments marked
-- against it -- or delete it. Everyone else in the group can still see it all, live.
-- Older games with no recorded host fall back to the group's admins.
-- Rummy already works this way (scorer-only RPCs, 0012-0016).
--
-- Replaces 0008's "any member updates / admins delete" and 0009's "open game or admin" rules.
-- Payments recorded from the group's Balances tab (not tied to a game) are unchanged.
--
-- Run once in the Supabase SQL editor after 0001-0020.

create or replace function public.is_game_host(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.game_sessions s
    where s.id = sid
      and (s.created_by = auth.uid() or (s.created_by is null and public.is_group_admin(s.group_id)))
  );
$$;
grant execute on function public.is_game_host(uuid) to authenticated;

-- ---------- games ----------
drop policy if exists "members insert sessions" on public.game_sessions;
drop policy if exists "members update sessions" on public.game_sessions;
drop policy if exists "admins delete sessions" on public.game_sessions;
drop policy if exists "members start sessions" on public.game_sessions;
drop policy if exists "host updates session" on public.game_sessions;
drop policy if exists "host deletes session" on public.game_sessions;
create policy "members start sessions" on public.game_sessions for insert
  with check (public.is_group_member(group_id) and created_by = auth.uid());
create policy "host updates session" on public.game_sessions for update
  using (public.is_game_host(id)) with check (public.is_group_member(group_id));
create policy "host deletes session" on public.game_sessions for delete
  using (public.is_game_host(id));
-- "members read sessions" (select) is unchanged; deleting still also needs the game settled (0008/0018).

-- ---------- buy-ins / cash-outs ----------
drop policy if exists "members insert open results" on public.session_results;
drop policy if exists "members update open results" on public.session_results;
drop policy if exists "members delete open results" on public.session_results;
drop policy if exists "host writes results" on public.session_results;
create policy "host writes results" on public.session_results for all
  using (public.is_game_host(session_id)) with check (public.is_game_host(session_id));
-- "members read results" (select) is unchanged.

-- ---------- payments: game payments are the host's; group payments stay open ----------
drop policy if exists "members manage settlements" on public.settlements;
drop policy if exists "members read settlements" on public.settlements;
drop policy if exists "members write settlements" on public.settlements;
create policy "members read settlements" on public.settlements for select
  using (public.is_group_member(group_id));
create policy "members write settlements" on public.settlements for all
  using (public.is_group_member(group_id) and (session_id is null or public.is_game_host(session_id)))
  with check (public.is_group_member(group_id) and (session_id is null or public.is_game_host(session_id)));

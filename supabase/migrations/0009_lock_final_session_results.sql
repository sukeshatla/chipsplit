-- ChipSplit (security hardening): session_results (a game's buy-in/cash-out rows) could be
-- edited or deleted directly by any group member, even for a finalized game -- bypassing the
-- admin + settled protection 0008 put on deleting the game itself. The UI never exposes this
-- (results go read-only once final, until someone reopens the game), but nothing stopped a
-- direct API call from corrupting settled historical results.
--
-- Fix: session_results can only be written while its game is 'open', or by a group admin
-- (an admin can still reopen a game and edit it the normal way; this only blocks a
-- non-admin from touching a locked game's numbers directly).
-- Run once in Supabase SQL editor after 0001-0008.

drop policy if exists "members manage results" on public.session_results;

-- Anyone in the group can always see a game's results, finalized or not.
create policy "members read results" on public.session_results for select
  using (exists (select 1 from public.game_sessions s where s.id = session_id and public.is_group_member(s.group_id)));

-- Only while the game is still open, or if you're an admin, can those results be written.
create policy "members insert open results" on public.session_results for insert
  with check (exists (
    select 1 from public.game_sessions s where s.id = session_id
      and (s.status = 'open' or public.is_group_admin(s.group_id))
  ));
create policy "members update open results" on public.session_results for update
  using (exists (
    select 1 from public.game_sessions s where s.id = session_id
      and (s.status = 'open' or public.is_group_admin(s.group_id))
  ))
  with check (exists (
    select 1 from public.game_sessions s where s.id = session_id
      and (s.status = 'open' or public.is_group_admin(s.group_id))
  ));
create policy "members delete open results" on public.session_results for delete
  using (exists (
    select 1 from public.game_sessions s where s.id = session_id
      and (s.status = 'open' or public.is_group_admin(s.group_id))
  ));

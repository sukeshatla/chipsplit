-- ChipSplit: deleting a game is now admin-only, and blocked while a finalized game still has
-- money owed (mirrors 0006's group-level settle-before-delete). Anyone can still add, edit,
-- save results for, and finalize a game -- this only narrows who can delete one, and when.
-- Run once in Supabase SQL editor after 0001-0007.

create or replace function public.session_is_settled(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from (
      select member_id, sum(delta) as bal from (
        select sr.member_id, sr.cash_out_cents - sr.buy_in_cents as delta
          from public.session_results sr where sr.session_id = sid
        union all
        select s.from_member, s.amount_cents from public.settlements s where s.session_id = sid
        union all
        select s.to_member, -s.amount_cents from public.settlements s where s.session_id = sid
      ) deltas
      group by member_id
      having sum(delta) <> 0
    ) unsettled
  );
$$;
grant execute on function public.session_is_settled(uuid) to authenticated;

drop policy if exists "members manage sessions" on public.game_sessions;
create policy "members read sessions" on public.game_sessions for select using (public.is_group_member(group_id));
create policy "members insert sessions" on public.game_sessions for insert with check (public.is_group_member(group_id));
create policy "members update sessions" on public.game_sessions for update using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));
create policy "admins delete sessions" on public.game_sessions for delete using (public.is_group_admin(group_id));

-- A clear error (rather than a silent no-op) when an admin tries to delete a final,
-- unsettled game -- the "not an admin" case is left to the RLS policy above.
create or replace function public.enforce_session_settled_before_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'final' and not public.session_is_settled(old.id) then
    raise exception 'Settle up everyone in this game before deleting it';
  end if;
  return old;
end $$;
drop trigger if exists sessions_settled_guard on public.game_sessions;
create trigger sessions_settled_guard before delete on public.game_sessions
  for each row execute function public.enforce_session_settled_before_delete();

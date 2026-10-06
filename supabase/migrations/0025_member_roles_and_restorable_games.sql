-- Who can do what in a group, and deleted games can be restored.
--
-- 1. Admins: only the person who creates a group starts as its admin. Everyone added later is a
--    member; an admin can make others admin (0004's toggle). Existing groups are reset the same
--    way: their creator stays admin and everyone else becomes a member. A group whose creator
--    has left keeps the admins it has, so no group is left without one.
-- 2. Deleting a group (club or expenses) stays admin-only and settle-first (0004, 0006).
-- 3. Expenses: any member can add, edit, delete, and restore them (0015 made these admin-only).
-- 4. Games: any member can start one, and the host runs it (0021, unchanged). Deleting a game
--    now sets deleted_at instead of removing it -- the game, its results, and the payments
--    marked for it stay in the database but drop out of every balance -- and the host can restore
--    it from the group's History. A finished game still has to be settled before it's deleted.
--
-- Run once in the Supabase SQL editor after 0001-0024, BEFORE deploying the matching app build
-- (the app reads game_sessions.deleted_at).

-- ---------- 1. admins ----------
alter table public.group_members alter column is_admin set default false;

-- Same as 0017, with the creator marked admin explicitly now that the default is false.
create or replace function public.create_group(p_name text, p_kind text, p_currency text, p_direct boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  gid uuid;
  pname text;
  pemail text;
begin
  if auth.uid() is null then raise exception 'You are signed out'; end if;
  select display_name, email into pname, pemail from public.profiles where id = auth.uid();
  insert into public.groups (name, kind, currency, created_by, is_direct)
    values (trim(p_name), coalesce(nullif(p_kind, ''), 'club'), coalesce(nullif(p_currency, ''), 'USD'), auth.uid(), coalesce(p_direct, false))
    returning id into gid;
  insert into public.group_members (group_id, user_id, name, email, role, is_admin)
    values (gid, auth.uid(), coalesce(nullif(pname, ''), 'Me'), lower(pemail), 'owner', true);
  return gid;
end $$;
grant execute on function public.create_group(text, text, text, boolean) to authenticated;

-- One-time reset. The admin guard (0004) only lets a signed-in admin change admin status, and
-- the SQL editor isn't signed in as anyone, so it's paused for just this update.
alter table public.group_members disable trigger group_members_admin_guard;
update public.group_members m
  set is_admin = coalesce(m.user_id = g.created_by, false)
  from public.groups g
  where g.id = m.group_id
    and exists (select 1 from public.group_members c where c.group_id = g.id and c.user_id = g.created_by);
alter table public.group_members enable trigger group_members_admin_guard;

-- ---------- 3. expenses: any member ----------
drop policy if exists "admins insert expenses" on public.expenses;
drop policy if exists "admins update expenses" on public.expenses;
drop policy if exists "members insert expenses" on public.expenses;
drop policy if exists "members update expenses" on public.expenses;
create policy "members insert expenses" on public.expenses for insert
  with check (public.is_group_member(group_id));
-- Deleting and restoring are updates of deleted_at, so this covers them too.
create policy "members update expenses" on public.expenses for update
  using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));
-- "members read expenses" is unchanged; the app never hard-deletes ("admins delete expenses").

drop policy if exists "admins write payers" on public.expense_payers;
drop policy if exists "members write payers" on public.expense_payers;
create policy "members write payers" on public.expense_payers for all
  using (exists (select 1 from public.expenses e where e.id = expense_id and public.is_group_member(e.group_id)))
  with check (exists (select 1 from public.expenses e where e.id = expense_id and public.is_group_member(e.group_id)));

drop policy if exists "admins write shares" on public.expense_shares;
drop policy if exists "members write shares" on public.expense_shares;
create policy "members write shares" on public.expense_shares for all
  using (exists (select 1 from public.expenses e where e.id = expense_id and public.is_group_member(e.group_id)))
  with check (exists (select 1 from public.expenses e where e.id = expense_id and public.is_group_member(e.group_id)));

-- ---------- 4. restorable games ----------
alter table public.game_sessions add column if not exists deleted_at timestamptz;

-- Deleting (setting deleted_at) still needs a finished game settled, as 0008/0018 did for a real
-- delete. A deleted game can't be changed, only restored.
create or replace function public.enforce_session_soft_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.deleted_at is not null and new.deleted_at is not null then
    raise exception 'Restore this game before changing it';
  end if;
  if old.deleted_at is null and new.deleted_at is not null
     and old.status = 'final' and not public.session_is_settled(old.id) then
    raise exception 'Settle up everyone in this game before deleting it';
  end if;
  return new;
end $$;
drop trigger if exists sessions_soft_delete_guard on public.game_sessions;
create trigger sessions_soft_delete_guard before update on public.game_sessions
  for each row execute function public.enforce_session_soft_delete();

-- The host of a game that isn't deleted: results and game payments can't change while it's deleted.
create or replace function public.is_live_game_host(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_game_host(sid)
    and exists (select 1 from public.game_sessions s where s.id = sid and s.deleted_at is null);
$$;
grant execute on function public.is_live_game_host(uuid) to authenticated;

drop policy if exists "host writes results" on public.session_results;
create policy "host writes results" on public.session_results for all
  using (public.is_live_game_host(session_id)) with check (public.is_live_game_host(session_id));

drop policy if exists "members write settlements" on public.settlements;
create policy "members write settlements" on public.settlements for all
  using (public.is_group_member(group_id) and (session_id is null or public.is_live_game_host(session_id)))
  with check (public.is_group_member(group_id) and (session_id is null or public.is_live_game_host(session_id)));
-- "host updates session" (0021) is unchanged, so the host can still restore (clear deleted_at).

-- Same as 0019, leaving out deleted games and the payments marked for them.
create or replace function public.group_is_settled(gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from (
      select member_id, sum(delta) as bal from (
        select ep.member_id, ep.amount_cents as delta
          from public.expense_payers ep join public.expenses e on e.id = ep.expense_id
          where e.group_id = gid and e.deleted_at is null
        union all
        select es.member_id, -es.amount_cents
          from public.expense_shares es join public.expenses e on e.id = es.expense_id
          where e.group_id = gid and e.deleted_at is null
        union all
        select sr.member_id, sr.cash_out_cents + sr.returned_cents - sr.buy_in_cents
          from public.session_results sr join public.game_sessions gs on gs.id = sr.session_id
          where gs.group_id = gid and gs.status = 'final' and gs.deleted_at is null
        union all
        select s.from_member, s.amount_cents from public.settlements s where s.group_id = gid
          and not exists (select 1 from public.game_sessions gs where gs.id = s.session_id and gs.deleted_at is not null)
        union all
        select s.to_member, -s.amount_cents from public.settlements s where s.group_id = gid
          and not exists (select 1 from public.game_sessions gs where gs.id = s.session_id and gs.deleted_at is not null)
      ) deltas
      group by member_id
      having sum(delta) <> 0
    ) unsettled
  );
$$;

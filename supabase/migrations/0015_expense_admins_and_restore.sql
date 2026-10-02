-- Expenses become admin-only, and deleting one is reversible.
--
-- 1. Only a group admin can add, edit, delete, or restore an expense (previously any member
--    could add or edit; only deleting was admin-only). Everyone in the group can still see them.
-- 2. Deleting an expense now sets deleted_at instead of removing the row, so it can be restored
--    from the group's History. A deleted expense doesn't count toward anyone's balance.
--
-- Run once in the Supabase SQL editor after 0001-0014, BEFORE deploying the matching app build
-- (the app reads expenses.deleted_at).

alter table public.expenses add column if not exists deleted_at timestamptz;

-- ---------- expenses ----------
drop policy if exists "members insert expenses" on public.expenses;
drop policy if exists "members update expenses" on public.expenses;
drop policy if exists "admins insert expenses" on public.expenses;
drop policy if exists "admins update expenses" on public.expenses;
create policy "admins insert expenses" on public.expenses for insert
  with check (public.is_group_admin(group_id));
create policy "admins update expenses" on public.expenses for update
  using (public.is_group_admin(group_id)) with check (public.is_group_admin(group_id));
-- "members read expenses" (select) and "admins delete expenses" (hard delete) are unchanged.

-- ---------- payers / shares: readable by members, writable by admins ----------
drop policy if exists "members manage payers" on public.expense_payers;
drop policy if exists "members manage shares" on public.expense_shares;
drop policy if exists "members read payers" on public.expense_payers;
drop policy if exists "admins write payers" on public.expense_payers;
drop policy if exists "members read shares" on public.expense_shares;
drop policy if exists "admins write shares" on public.expense_shares;

create policy "members read payers" on public.expense_payers for select
  using (exists (select 1 from public.expenses e where e.id = expense_id and public.is_group_member(e.group_id)));
create policy "admins write payers" on public.expense_payers for all
  using (exists (select 1 from public.expenses e where e.id = expense_id and public.is_group_admin(e.group_id)))
  with check (exists (select 1 from public.expenses e where e.id = expense_id and public.is_group_admin(e.group_id)));

create policy "members read shares" on public.expense_shares for select
  using (exists (select 1 from public.expenses e where e.id = expense_id and public.is_group_member(e.group_id)));
create policy "admins write shares" on public.expense_shares for all
  using (exists (select 1 from public.expenses e where e.id = expense_id and public.is_group_admin(e.group_id)))
  with check (exists (select 1 from public.expenses e where e.id = expense_id and public.is_group_admin(e.group_id)));

-- ---------- balances ignore deleted expenses ----------
-- Same as 0006, plus "e.deleted_at is null" on both expense legs.
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
        select sr.member_id, sr.cash_out_cents - sr.buy_in_cents
          from public.session_results sr join public.game_sessions gs on gs.id = sr.session_id
          where gs.group_id = gid and gs.status = 'final'
        union all
        select s.from_member, s.amount_cents from public.settlements s where s.group_id = gid
        union all
        select s.to_member, -s.amount_cents from public.settlements s where s.group_id = gid
      ) deltas
      group by member_id
      having sum(delta) <> 0
    ) unsettled
  );
$$;
grant execute on function public.group_is_settled(uuid) to authenticated;

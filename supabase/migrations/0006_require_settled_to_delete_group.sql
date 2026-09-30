-- ChipSplit: a group can't be deleted while anyone in it still owes or is owed money.
-- Mirrors src/lib/ledger.ts groupBalances(): expense payers +, shares -, finalized game
-- cash-out - buy-in, and settlements move the balance from payer to receiver.
-- Run once in Supabase SQL editor after 0001-0005.

create or replace function public.group_is_settled(gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from (
      select member_id, sum(delta) as bal from (
        select ep.member_id, ep.amount_cents as delta
          from public.expense_payers ep join public.expenses e on e.id = ep.expense_id where e.group_id = gid
        union all
        select es.member_id, -es.amount_cents
          from public.expense_shares es join public.expenses e on e.id = es.expense_id where e.group_id = gid
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

create or replace function public.enforce_group_settled_before_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.group_is_settled(old.id) then
    raise exception 'Settle up everyone in this group before deleting it';
  end if;
  return old;
end $$;
drop trigger if exists groups_settled_guard on public.groups;
create trigger groups_settled_guard before delete on public.groups
  for each row execute function public.enforce_group_settled_before_delete();

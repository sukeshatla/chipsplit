-- Chips given back mid-game. A player can hand chips back to the bank (e.g. so someone else can
-- buy in when the bank is out), any number of times. That works like cash they've already taken
-- out, so a player's result is now:
--     net = cash_out + returned - buy_in
-- and the table balances when  sum(buy_in) = sum(cash_out) + sum(returned).
-- It's kept separate from cash_out so entering the final stack later never overwrites it.
--
-- Run once in the Supabase SQL editor after 0001-0018, BEFORE deploying the matching app build.

alter table public.session_results add column if not exists returned_cents bigint not null default 0 check (returned_cents >= 0);

-- Same as 0008, with returned chips counted.
create or replace function public.session_is_settled(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from (
      select member_id, sum(delta) as bal from (
        select sr.member_id, sr.cash_out_cents + sr.returned_cents - sr.buy_in_cents as delta
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

-- Same as 0015, with returned chips counted.
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

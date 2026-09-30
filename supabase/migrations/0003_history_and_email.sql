-- ChipSplit: lightweight per-group activity log, and a per-member opt-out for
-- the "email summary" mailto feature (built client-side, no email infra).
-- Run once in Supabase SQL editor after 0001_init.sql and 0002_friends.sql.

create table public.change_log (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups on delete cascade,
  actor_id uuid references auth.users on delete set null,
  entity_type text not null, -- 'member' | 'expense' | 'session' | 'settlement' | 'group'
  entity_id uuid,            -- the changed row's id; for a session-linked settlement, the session id
  summary text not null,
  created_at timestamptz not null default now()
);
create index change_log_group_idx on public.change_log (group_id, created_at desc);

alter table public.change_log enable row level security;
create policy "members read history" on public.change_log for select using (public.is_group_member(group_id));
create policy "members write history" on public.change_log for insert
  with check (public.is_group_member(group_id) and actor_id = auth.uid());

alter table public.group_members add column email_opt_out boolean not null default false;

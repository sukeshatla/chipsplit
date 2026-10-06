-- Remove anyone from your Friends list -- a signed-up friend, an invite, or a guest -- once
-- you're settled up with them. People also show up there just by sharing a group with you, so
-- removing one is remembered here by their friend key (src/lib/ledger.ts friendKey): "u:<user
-- id>", "e:<email>", or "m:<member id>" for a guest. They come back on their own if a balance
-- with them opens up again, or if you add them as a friend again.
--
-- Run once in the Supabase SQL editor after 0001-0023, BEFORE deploying the matching app build.

create table if not exists public.hidden_friends (
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  friend_key text not null check (length(friend_key) > 2),
  created_at timestamptz not null default now(),
  primary key (owner_id, friend_key)
);

alter table public.hidden_friends enable row level security;
drop policy if exists "own hidden friends" on public.hidden_friends;
create policy "own hidden friends" on public.hidden_friends for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

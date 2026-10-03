-- Deleting a game also deletes the payments recorded against it (settlements.session_id).
--
-- Before this, those payments were kept and only unlinked (on delete set null) while the game's
-- results were deleted (session_results cascade). A settled game's results and its payments
-- cancel out, so dropping only the results left the payments behind as plain group payments --
-- e.g. Kiran's $50 to Ravi for a game Ravi won turned into "Ravi owes Kiran $50" once the game
-- was deleted. Removing both keeps every balance exactly as it was before the game.
-- Payments recorded from the Balances tab (session_id null) are not affected.
--
-- Run once in the Supabase SQL editor after 0001-0021.

do $$
declare
  c text;
begin
  -- The FK's name isn't guaranteed, so find it by its column and target.
  for c in
    select con.conname from pg_constraint con
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any(con.conkey)
    where con.conrelid = 'public.settlements'::regclass and con.contype = 'f'
      and con.confrelid = 'public.game_sessions'::regclass and a.attname = 'session_id'
  loop
    execute format('alter table public.settlements drop constraint %I', c);
  end loop;
end $$;

alter table public.settlements add constraint settlements_session_id_fkey
  foreign key (session_id) references public.game_sessions on delete cascade;

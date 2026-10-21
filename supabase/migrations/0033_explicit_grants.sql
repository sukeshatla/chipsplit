-- Explicit Data API grants on every table (SPEC PLAT-7). From 2026-10-30 Supabase no longer
-- grants new tables in "public" to the API roles automatically, and that includes rebuilding the
-- schema from these migrations on a fresh project. Tables made before then (the live project's)
-- already have these grants, so this changes nothing there; on a fresh project, without it, every
-- request fails with "permission denied". The keep-alive workflow reads groups with the anon key.
--
-- Grants only open the table to the API; row-level security still decides which rows each person
-- sees and changes (anon matches no policy, so it reads nothing).
--
-- Any new table from here on gets the same three grants in the migration that creates it.
-- Safe to run more than once.

grant select on public.app_visits to anon;
grant select, insert, update, delete on public.app_visits to authenticated;
grant select, insert, update, delete on public.app_visits to service_role;

grant select on public.change_log to anon;
grant select, insert, update, delete on public.change_log to authenticated;
grant select, insert, update, delete on public.change_log to service_role;

grant select on public.contacts to anon;
grant select, insert, update, delete on public.contacts to authenticated;
grant select, insert, update, delete on public.contacts to service_role;

grant select on public.expense_payers to anon;
grant select, insert, update, delete on public.expense_payers to authenticated;
grant select, insert, update, delete on public.expense_payers to service_role;

grant select on public.expense_shares to anon;
grant select, insert, update, delete on public.expense_shares to authenticated;
grant select, insert, update, delete on public.expense_shares to service_role;

grant select on public.expenses to anon;
grant select, insert, update, delete on public.expenses to authenticated;
grant select, insert, update, delete on public.expenses to service_role;

grant select on public.game_sessions to anon;
grant select, insert, update, delete on public.game_sessions to authenticated;
grant select, insert, update, delete on public.game_sessions to service_role;

grant select on public.group_members to anon;
grant select, insert, update, delete on public.group_members to authenticated;
grant select, insert, update, delete on public.group_members to service_role;

grant select on public.groups to anon;
grant select, insert, update, delete on public.groups to authenticated;
grant select, insert, update, delete on public.groups to service_role;

grant select on public.hidden_friends to anon;
grant select, insert, update, delete on public.hidden_friends to authenticated;
grant select, insert, update, delete on public.hidden_friends to service_role;

grant select on public.profiles to anon;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;

grant select on public.rummy_games to anon;
grant select, insert, update, delete on public.rummy_games to authenticated;
grant select, insert, update, delete on public.rummy_games to service_role;

grant select on public.rummy_players to anon;
grant select, insert, update, delete on public.rummy_players to authenticated;
grant select, insert, update, delete on public.rummy_players to service_role;

grant select on public.rummy_round_scores to anon;
grant select, insert, update, delete on public.rummy_round_scores to authenticated;
grant select, insert, update, delete on public.rummy_round_scores to service_role;

grant select on public.rummy_rounds to anon;
grant select, insert, update, delete on public.rummy_rounds to authenticated;
grant select, insert, update, delete on public.rummy_rounds to service_role;

grant select on public.session_results to anon;
grant select, insert, update, delete on public.session_results to authenticated;
grant select, insert, update, delete on public.session_results to service_role;

grant select on public.settlements to anon;
grant select, insert, update, delete on public.settlements to authenticated;
grant select, insert, update, delete on public.settlements to service_role;

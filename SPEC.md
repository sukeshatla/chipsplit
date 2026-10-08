# Chip n Split — Specification

The contract for what the app does. [docs/DESIGN.md](docs/DESIGN.md) is the blueprint (the *why*);
this file is the *what*, written as numbered rules that are each checked by something.

**Read this before writing any feature.** Every change follows the loop in
[CLAUDE.md § Workflow](CLAUDE.md#workflow): design → rule here → failing test → code → migration → docs.

## How to read a rule

| Column | Meaning |
|---|---|
| **ID** | `AREA-n`. Stable forever: never renumber or reuse; retire a rule by marking it ~~struck through~~. |
| **Rule** | One behavior, stated so it can be checked. |
| **Verified by** | `test` — an automated test tagged `[ID]` checks it (CI fails without one). `db` — enforced by Postgres (RLS / trigger), named migration; demo mode mirrors it where noted. `manual` — a UI or device behavior with a written check. |
| **Where** | The code or migration that implements it. |

`src/spec.test.ts` enforces the link: every `test` rule must have at least one test whose name
contains `[ID]`, and every `[ID]` in a test must exist here.

## Glossary

| Term | Meaning |
|---|---|
| **Club** | A group for recurring card games (`kind = 'club'`). |
| **Expenses group** | A group for shared costs (`kind = 'expenses'`). |
| **One-on-one** | A hidden "direct" group (`is_direct`) for expenses with specific friends, shown under Friends. |
| **Member** | A row in a group's roster. **Guest** = name only; **Invited** = has an email, no account yet; **Friend** = linked account. |
| **Admin** | A member who can change settings, promote others, and delete the group. |
| **Host** | Whoever started a game (`game_sessions.created_by`); runs that game. |
| **Friend key** | One identity per person: `u:<user id>`, else `e:<email>`, else `m:<member or contact id>`. |
| **Settled** | Every balance in scope is exactly zero. |
| **Soft delete** | `deleted_at` is set: out of every balance, still stored, restorable. |

---

## MONEY — amounts and splits

| ID | Rule | Verified by | Where |
|---|---|---|---|
| MONEY-1 | Every amount is stored and computed as integer cents; no floating-point money. | test | `lib/money.ts` |
| MONEY-2 | An equal split hands leftover cents to the first people, so the parts always add up to the total exactly. | test | `splitEqual` |
| MONEY-3 | Shares and percentage splits use largest remainder: parts add up to the total exactly, and anyone with zero weight gets nothing. | test | `splitByWeights` |
| MONEY-4 | The percentage split starts as an even split that adds up to exactly 100.00. | test | `equalPercents` |
| MONEY-5 | Typed money like `$1,250.5` parses to cents; empty or invalid input is `null`, not 0. | test | `parseMoney` |
| MONEY-6 | Displayed money uses a true minus sign (−) for negatives and `+` only when a sign is asked for. | test | `formatMoney` |
| MONEY-7 | Different currencies are never converted or added together; each keeps its own balance. | test | `sumByCurrency`, `friendBalances`, `totals` |

## SETTLE — fewest payments

| ID | Rule | Verified by | Where |
|---|---|---|---|
| SETTLE-1 | Settle-up pays the largest debtor to the largest creditor until everyone is at zero: at most n − 1 payments, and every balance clears. | test | `lib/settle.ts` |
| SETTLE-2 | When everyone is already even there are no payments. | test | `settle` |

## BAL — balances

| ID | Rule | Verified by | Where |
|---|---|---|---|
| BAL-1 | A member's group balance = what they paid − their shares + their finished-game nets + payments they made − payments they received. | test | `groupBalances` |
| BAL-2 | A game still in progress doesn't count toward balances. | test | `groupBalances` |
| BAL-3 | A game net is cash-out + chips given back − buy-ins; a missing amount counts as zero. | test | `resultNet` |
| BAL-4 | Deleted expenses, deleted games, and the payments marked for deleted games count toward nothing. | test | `mapGroup`, `groupBalances`, 0025 `group_is_settled` |
| BAL-5 | Your balance with a friend is the sum, across every group and one-on-one you share, of the simplified payments between the two of you, per currency. | test | `friendBalances` |
| BAL-6 | "You get" / "You pay" are in your own currency; other currencies are listed separately, never converted. | test | `totals` |
| BAL-7 | The Friends list and the Dashboard list people and groups biggest amount first, owed or owing, with settled last and ties by name. | test | `friendsList`, `DashboardPage` |

## GAME — club games

| ID | Rule | Verified by | Where |
|---|---|---|---|
| GAME-1 | A game's host is whoever started it; an old game with no recorded host falls back to the group's admins. | test | `isGameHost`, 0021 |
| GAME-2 | Any member of a club can start a game. | test | demo `createSession`, 0021 policy |
| GAME-3 | Only the host can change a game's results, details, or status, or record and delete its payments. | test | demo `assertHost`, 0021 / 0025 `is_live_game_host` |
| GAME-4 | A finished game can't be deleted until its own payments settle it; a game in progress can be deleted any time. | test | `isSessionSettled`, demo `deleteSession`, 0008 / 0025 trigger |
| GAME-5 | Deleting a game hides it with its results and payments, so every balance is exactly what it was before the game; the host restores it exactly as it was. | test | demo `deleteSession` / `restoreSession`, 0025 |
| GAME-6 | A deleted game can't be changed until it's restored. | db | 0025 `sessions_soft_delete_guard`, `is_live_game_host` |
| GAME-7 | The table balances when total buy-ins = total cash-outs + chips given back; Finalize is offered only then, with 2+ players. | test | `sessionTotals`, `GameDayPage` |
| GAME-8 | A finished game counts as settled only by payments marked for that game. | test | `isSessionSettled` |
| GAME-9 | The leaderboard totals finished games only: net, games played, winning nights, best night; payments don't change it. | test | `pokerLeaderboard` |

## RUMMY

| ID | Rule | Verified by | Where |
|---|---|---|---|
| RUMMY-1 | A player's total is their round points plus any rejoin offset. | test | `rummyStandings` |
| RUMMY-2 | A knocked-out player can rejoin only while two or more are still in. | test | `rummyCanRejoin` |
| RUMMY-3 | With a buy-in, the winner takes the whole pot. | test | `rummyResult` |
| RUMMY-4 | Closed early, the pot is split between everyone still in. | test | `rummyResult` |
| RUMMY-5 | Without a buy-in, or before the end, there's no money side. | test | `rummyResult` |
| RUMMY-6 | Only the scorer adds or fixes rounds, rejoins, or closes the game. | db | 0012 – 0016 RPCs |

## EXP — expenses

| ID | Rule | Verified by | Where |
|---|---|---|---|
| EXP-1 | Any member of a group can add, edit, delete, and restore its expenses; admin isn't required. | test | demo `saveExpense` etc., 0025 policies |
| EXP-2 | Deleting an expense hides it (out of balances); restoring brings it back unchanged. | test | demo `deleteExpense` / `restoreExpense`, 0015 |
| EXP-3 | One-on-one expenses live in hidden direct groups that never appear in Groups lists. | test | `listedGroups`, 0017 |
| EXP-4 | One-on-one activity links to the friend's page, not a group page. | test | `directFriendKey`, `activity` |
| EXP-5 | Spreadsheet import shows a preview that flags bad rows before anything is saved. | manual | `ImportDialog` — import a sheet with a blank amount; the row is flagged and nothing saves |

## FRIEND — friends list

| ID | Rule | Verified by | Where |
|---|---|---|---|
| FRIEND-1 | The same person shows once: matched by account, then email (any case), else they're separate. | test | `friendKey`, `friendsList` |
| FRIEND-2 | A friend is **Friend** (account), **Invited** (email only), or **Guest** (name only). | test | `statusFromKey` |
| FRIEND-3 | Someone added as a friend shows even with nothing shared yet. | test | `friendsList` |
| FRIEND-4 | Each row says *N shared group(s)* (real groups only), else *one-on-one* if a one-on-one has anything in it, else *nothing shared yet*. | test | `sharedSummary` |
| FRIEND-5 | A one-on-one counts as shared only while it has a live expense, game, or payment; empty ones and deleted-only ones don't, and aren't shown. | test | `hasActivity` |
| FRIEND-6 | Remove friend is allowed only when you're settled with them in every currency. | test | `isSettledFriend`, `FriendDetailPage` |
| FRIEND-7 | A removed friend stays hidden until a balance with them opens again or you add them back as a friend. | test | `isRemovedFriend`, 0024 |
| FRIEND-8 | A friend's one-on-ones are shown as one Balance row per currency (summed); Settle goes to the one-on-one owing most that way; one-on-ones with a third person keep their own row. | test | `directBalanceRows` |
| FRIEND-9 | Add a friend is *With email* (valid email required) or *Guest, no email* (name only). | manual | `AddFriendDialog` — Guest hides the email field; With email rejects `ravi@` |

## ROLE — who can do what

| ID | Rule | Verified by | Where |
|---|---|---|---|
| ROLE-1 | Whoever creates a group is its admin; everyone added later joins as a member. | test | demo `createGroup` / `addMember`, 0025 |
| ROLE-2 | An admin can make others admin or remove admin; a group always keeps at least one admin. | test | demo `setGroupAdmin`, 0004 trigger |
| ROLE-3 | Only admins can change group settings or delete the group, for clubs and expense groups alike. | test | demo `updateGroup` / `deleteGroup`, 0004 |
| ROLE-4 | A group can't be deleted until everyone in it is settled up in total. | test | `isGroupSettled`, demo `deleteGroup`, 0006 / 0018 / 0025 |
| ROLE-5 | Someone with expenses, games, or payments in a group (deleted ones included) can't be removed from it. | test | `memberHasActivity`, demo `removeMember`, 0005 |
| ROLE-6 | Only the app admin can change another person's name or email; a signed-up person's name comes from their own profile. | db | 0020, 0023 |
| ROLE-7 | Admin checks only count members linked to your account. | test | `isGroupAdmin` |
| ROLE-8 | Only members can see a group and anything in it. | db | 0001 RLS `is_group_member` |

## SHARE — summaries, images, reminders

| ID | Rule | Verified by | Where |
|---|---|---|---|
| SHARE-1 | An email summary goes only to members with an email who haven't opted out of that group. | test | `summaryMailto` |
| SHARE-2 | A game's summary covers only its players (with date and place); a group's covers every member. Game payments already recorded show as paid. | test | `summaryData` |
| SHARE-3 | The game table lists winners first, then players still in, then even, then losers; a finished game drops sat-out rows and lists payments with paid marks. | test | `gameTableData` |
| SHARE-4 | A reminder is addressed to the one person who owes, naming who and how much; no email on file means no reminder. | test | `reminderMailto` |
| SHARE-5 | Share images render as a phone-shaped PNG; past 20 rows they split into two pictures. | manual | `summaryImage.ts` — share a 25-person group; two images |
| SHARE-6 | Names shorten to first name + last initial, unless two people would look the same. | test | `shortName` |

## HIST — history and notifications

| ID | Rule | Verified by | Where |
|---|---|---|---|
| HIST-1 | Each notification opens the right place: expenses and payments on their tab, games on the game page. | test | `notificationLink` |
| HIST-2 | Every change to a group is logged in plain English with who and when. | db | `change_log`, `log()` in both APIs |
| HIST-3 | A deleted expense or game offers **Restore** on its newest "Deleted" entry while it's still deleted: expenses for any member, games for their host. | manual | `HistoryList` — delete then restore an expense; the button disappears after |

## AUTH and PLATFORM

| ID | Rule | Verified by | Where |
|---|---|---|---|
| AUTH-1 | Sign-in is Google only (PKCE); the app never sees a password. | manual | `app/auth.tsx` — Continue with Google goes to accounts.google.com |
| AUTH-2 | Demo mode works with no keys and keeps data in this browser only. | manual | `demoApi.ts` — Try the demo, add an expense, reload; it's still there |
| AUTH-3 | Someone added by email links to every group with that email the first time they sign in. | db | `handle_new_user()` |
| PLAT-1 | The app installs as a PWA (Android: Install; iPhone: Add to Home Screen) and updates itself on the next load. | manual | `vite.config.ts` — see README *Install on Your Phone* |
| PLAT-2 | Pop-up forms stay above the phone keyboard with their buttons visible. | manual | `Modal` in `ui.tsx` — open Add a friend on a phone |
| PLAT-3 | Every push to `main` is tested and built before it deploys; pull requests run the same checks. | manual | `.github/workflows/ci.yml`, `deploy.yml` |
| PLAT-4 | Demo mode enforces the same permission rules as the database (the `db` rules above that name a demo function). | test | `api/demoApi.test.ts` |

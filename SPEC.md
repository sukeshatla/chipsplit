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
| **Poker group** | A group for recurring buy-in card games (`kind = 'club'` in the database; shown as *Poker*). |
| **Expense group** | A group for shared costs (`kind = 'expenses'`). |
| **Rummy group** | A group for rummy games scored hand by hand (`kind = 'rummy'`). |
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

## DASH — dashboard

| ID | Rule | Verified by | Where |
|---|---|---|---|
| DASH-1 | The dashboard shows every game in progress you're playing in, poker and rummy, each linking to the game; games you're not in aren't shown. | test | `myLiveGames`, `DashboardPage` |

## GROUP — group types and pages

| ID | Rule | Verified by | Where |
|---|---|---|---|
| GROUP-1 | A group is **Poker**, **Expense**, or **Rummy**, chosen when it's created; the type can't be changed afterwards. | test | demo `updateGroup`, 0026 trigger |
| GROUP-2 | New group is two steps: (1) type as three big buttons, name, and currency as toggle chips, then **Next**; (2) pick friends, then **Create group**. Each step fits above the phone keyboard. | manual | `CreateGroupDialog` — on a phone, both steps' buttons stay visible with the keyboard open |
| GROUP-3 | The top of every group page looks the same: the name, a quiet type badge with its icon (**Poker**, **Rummy**, **Expense**; never green, so only the main action stands out), your balance in bold, then on its own row the main action: **New game** (Poker), **New rummy game** (Rummy), or **Import** and **+ Add expense** as two separate buttons (Expense). Cards below don't repeat it; only an empty list offers a start button. No Email summary. | manual | `GroupPage` — open one group of each type; same layout, no second New button |
| GROUP-4 | On the Balances tab, **Settle up** and **Where everyone stands** collapse and expand; Settle up starts collapsed, Where everyone stands starts open. An **Expense** group splits them into two tabs, **Balances** (Where everyone stands) and **Settle up** (Settle up and Payments recorded), both open; settled-up people stay hidden until asked for. | manual | `GroupPage` `BalancesTab` — open Balances in a Poker group and tap each header; open an Expense group: two tabs, both cards open |
| GROUP-5 | Adding an expense is the same green **+ Add expense** button everywhere (home, friend page, Expense group). The home page's Groups card has its own **+ New group**. | manual | `AddExpenseButton` — check home, a friend, an Expense group |
| GROUP-6 | The Groups list shows each group's people, games or expenses count, and your balance; no unpaid counts. A finished game in a list reads **Unsettled** (red) until its payments are all marked paid, then **Settled**; never "5 unpaid". | manual | `GroupsPage`, `GroupPage` Games tab, `GamesPage` — a finished game with open payments says Unsettled |
| GROUP-7 | The Members tab's card is titled with how many people are in the group, **18 members** (**1 member**), before **Add**. | manual | `GroupPage` `MembersTab` — open Members; the count matches the list |

## GAME — poker games

| ID | Rule | Verified by | Where |
|---|---|---|---|
| GAME-1 | A game's host is whoever started it; an old game with no recorded host falls back to the group's admins. | test | `isGameHost`, 0021 |
| GAME-2 | Any member of a Poker group can start a game. | test | demo `createSession`, 0021 policy |
| GAME-3 | Only the host can change a game's results, details, or status, or record and delete its payments. | test | demo `assertHost`, 0021 / 0025 `is_live_game_host` |
| GAME-4 | A finished game can't be deleted until its own payments settle it; a game in progress can be deleted any time. | test | `isSessionSettled`, demo `deleteSession`, 0008 / 0025 trigger |
| GAME-5 | Deleting a game hides it with its results and payments, so every balance is exactly what it was before the game; the host restores it exactly as it was. | test | demo `deleteSession` / `restoreSession`, 0025 |
| GAME-6 | A deleted game can't be changed until it's restored. | db | 0025 `sessions_soft_delete_guard`, `is_live_game_host` |
| GAME-7 | The table balances when total buy-ins = total cash-outs + chips given back; Finalize is offered only then, with 2+ players. | test | `sessionTotals`, `GameDayPage` |
| GAME-8 | A finished game counts as settled only by payments marked for that game. | test | `isSessionSettled` |
| GAME-9 | The leaderboard totals finished games only: net, games played, winning nights, best night; payments don't change it. | test | `pokerLeaderboard` |
| GAME-10 | The **Poker** page lists only buy-in games you played in Poker groups, and its stats count only those; rummy payouts posted to a Rummy group's balances aren't poker games. | test | `myPokerGames`, `pokerStats` |
| GAME-11 | A Poker group has at most one game in progress: starting, reopening, or restoring a game while another is in progress is refused with a message naming it. | test | demo `createSession` / `updateSession` / `restoreSession`, 0027 trigger, `NewGameDialog` |

## RUMMY

| ID | Rule | Verified by | Where |
|---|---|---|---|
| RUMMY-1 | A player's total is their round points plus any rejoin offset. | test | `rummyStandings` |
| RUMMY-2 | A knocked-out player can rejoin only while two or more are still in; they restart at the highest score still in **+ 1** by default, which the scorer confirms or changes (0 up to one below the limit) before they're back. | test | `rummyCanRejoin` |
| RUMMY-3 | With a buy-in, the winner takes the whole pot. | test | `rummyResult` |
| RUMMY-4 | Closed early, the pot is split between everyone still in. | test | `rummyResult` |
| RUMMY-5 | Without a buy-in, or before the end, there's no money side. | test | `rummyResult` |
| RUMMY-6 | Only the scorer (whoever started the game) adds or fixes rounds, brings players back, closes, or deletes the game; everyone else in the group can only watch. | test | demo rummy writes, 0012 – 0016 RPCs and delete policy |
| RUMMY-7 | Every rummy game belongs to a Rummy group and its players are that group's members; Poker and Expense groups can't start one, and there's no stand-alone rummy. | test | demo `createRummyGame`, 0026 `create_rummy_game` |
| RUMMY-8 | A Rummy group has a leaderboard like Poker: finished games played, games won, and money won or lost (from payouts in its balances), best night. | test | `rummyLeaderboard` |
| RUMMY-9 | A rummy game reads like a poker game: its date (local day) on the game and as a date tile in the list, **In progress**, then **Unsettled** (red) until its payout is paid and **Settled**, and a **Share** picture of its standings. | test | `rummyTableData`, `imageBanner` |
| RUMMY-10 | When a staked game ends, the scorer's screen adds its payout to the group's balances by itself (no button), as a finished game the Poker page doesn't count. | test | `rummyBalanceRows`, `RummyGamePage` |
| RUMMY-11 | A finished staked rummy game shows the same **Settle up** card as a poker game: **Mark paid** per payment (scorer), Undo, reminders, Share. | manual | `RummyGamePage` — finish a staked game; mark a payment paid |
| RUMMY-12 | Scores are entered in a pop-up, never inline: **Add round N** at the top of the game opens **Round N** with a small score box per player still in, laid out two to a row so all of them (up to 7) fit on a phone screen above the keyboard without scrolling; each round's ✎ (in its column header) opens **Edit round N**, and saving an edit shows what changes and asks to confirm. The pop-up's buttons stay above the phone keyboard. | manual | `RummyGamePage` — on a phone, add a round and edit one; Save is visible with the keyboard open |
| RUMMY-13 | Starting a rummy game, each round added or changed, rejoins, closing, and deleting show in the Rummy group's History. | test | demo and Supabase rummy writes, `log()` |
| RUMMY-14 | **Round by round** reads players down the side and rounds across (R1, R2, … Total); the player column stays put while the rounds scroll sideways. | manual | `RummyGamePage` — play 10 rounds on a phone; names stay visible while scrolling |
| RUMMY-15 | A Rummy group has at most one rummy game in progress: starting another, or a round edit that would put a finished game back in play, is refused until the current one is closed or deleted. | test | demo `createRummyGame` / `updateRummyRound`, 0027 trigger, `NewRummyGameDialog` |
| RUMMY-16 | A rummy game has 2 to 7 players. | test | `NewRummyGameDialog`, demo `createRummyGame`, 0028 `create_rummy_game` |
| RUMMY-17 | Like a poker game: a finished staked rummy game can't be deleted until its own payments settle it, and deleting it takes its payout and payments out of the group's balances, so they're exactly as before the game (zero if it was the only one). A game in progress, or one without a buy-in, can be deleted any time. The Settle up card sits at the bottom of the game. | test | demo `deleteRummyGame`, 0029 triggers, `RummyGamePage` |
| RUMMY-18 | A rummy payout follows the result: if a round edit puts a finished game back in play or changes who won, its payout leaves the balances (refused while payments are marked against it: undo them first), and the new result goes in when the game finishes again. | test | demo `updateRummyRound`, 0030 triggers |
| RUMMY-19 | Every new rummy game needs a buy-in above zero, like a poker game (games made before keep what they had). | test | `NewRummyGameDialog`, demo `createRummyGame`, 0031 `create_rummy_game` |

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
| FRIEND-9 | Add a friend takes a name and a valid email; there's no guest option. | manual | `AddFriendDialog` — no Guest switch; `ravi@` is rejected |
| FRIEND-10 | The Friends list (and the Dashboard's Friends card and the friend pickers) shows signed-up people you added as friends, plus anyone (guest, invited, or signed up) money has moved between you and: a payment recorded between you two (either way), a one-on-one expense together, or a balance open between you right now. Playing the same game or being in the same group split doesn't count on its own. Deleted expenses and games don't count. Removed friends (while settled) don't show. | test | `friendsList`, `transactedWith` |
| FRIEND-11 | Adding someone to a group doesn't add them to your friends. Anyone signed up has **Add as friend** on their card (tap their picture: name and email), unless they're you or already a friend. | test | demo `addMember`, 0034 `add_member`, `MemberCardDialog` |
| FRIEND-12 | The Friends page hides friends you're settled up with (in every currency) behind **Show N settled up** / **Hide settled up** at the bottom of the list; searching shows every match, settled or not. | manual | `FriendsPage` — a settled friend is hidden until Show N settled up; searching their name finds them |

## ROLE — who can do what

| ID | Rule | Verified by | Where |
|---|---|---|---|
| ROLE-1 | Whoever creates a group is its admin; everyone added later joins as a member. | test | demo `createGroup` / `addMember`, 0025 |
| ROLE-2 | An admin can make others admin or remove admin; a group always keeps at least one admin. | test | demo `setGroupAdmin`, 0004 trigger |
| ROLE-3 | Only admins can change group settings or delete the group, for every group type. | test | demo `updateGroup` / `deleteGroup`, 0004 |
| ROLE-4 | A group can't be deleted until everyone in it is settled up in total. | test | `isGroupSettled`, demo `deleteGroup`, 0006 / 0018 / 0025 |
| ROLE-5 | Someone with expenses, games, or payments in a group (deleted ones included) can't be removed from it. | test | `memberHasActivity`, demo `removeMember`, 0005 |
| ROLE-6 | Only the app admin can change another person's name or email; a signed-up person's name comes from their own profile. | db | 0020, 0023 |
| ROLE-7 | Admin checks only count members linked to your account. | test | `isGroupAdmin` |
| ROLE-8 | Only members can see a group and anything in it. | db | 0001 RLS `is_group_member` |

## SHARE — summaries, images, reminders

| ID | Rule | Verified by | Where |
|---|---|---|---|
| ~~SHARE-1~~ | ~~An email summary goes only to members with an email who haven't opted out of that group. ~~ Retired: Email summary was removed (GROUP-3). | — | — |
| SHARE-2 | A game's picture covers only its players (with date and place); a group's covers every member. Game payments already recorded show as paid. | test | `summaryData` |
| SHARE-3 | The game table lists winners first, then players still in, then even, then losers; a finished game drops sat-out rows and lists payments with paid marks. | test | `gameTableData` |
| SHARE-4 | A reminder is addressed to the one person who owes, naming who and how much; no email on file means no reminder. | test | `reminderMailto` |
| SHARE-5 | Share images render as phone-shaped PNGs; longer lists get tighter rows instead of a second picture. | manual | `summaryImage.ts` — share a 25-person group's balances; one picture |
| SHARE-7 | Every picture opens with a banner: the Chip n Split logo and name, a label saying what it is (**Game · In progress**, **Game · Final results**, **Game · Settle up**, **Rummy · In progress**, **Rummy · Final**, **Group · Balances**, or **Group · Settle up**), the group name, and when: *As of* today for a group; the game's date and place for a game, plus the buy-in on its results. | test | `imageBanner` |
| SHARE-8 | Each card's Share sends one picture of just that card: a game's **Players** (results) or **Settle up**; a group's **Where everyone stands** or **Settle up**. | test | `imageParts` |
| SHARE-9 | Sharing sends only the picture(s): no title or "summary" text is added. | manual | `shareSummaryImage` — share to WhatsApp; only images arrive |
| SHARE-10 | The leaderboard has no Share button. | manual | `GroupPage` — open a club's Games tab; the Leaderboard card has no Share |
| SHARE-11 | There's no Email summary anywhere; every card's **Share** sends only its picture, with no dropdown. One-person reminders stay on settle-up rows. | manual | `GameDayPage`, `GroupPage` — no Email summary button or Share menu on any page |
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
| PLAT-3 | Every push to `main` is tested and built before it deploys; pull requests run the same checks. | manual | `.github/workflows/ci.yml`, `deploy.yml` — open a pull request; the CI check runs and must pass |
| PLAT-4 | Demo mode enforces the same permission rules as the database (the `db` rules above that name a demo function). | test | `api/demoApi.test.ts` |
| PLAT-5 | Someone watching a game in progress refreshes just that game every 15 seconds, not everything; everything reloads once, when the game finishes, reopens, or is deleted. The host's autosave updates the screen without a reload. | test | `withSession`, `needsFullReload`, `GameDayPage`, `loadSession` |
| PLAT-6 | Loaded data stays fresh for 5 minutes: switching back to the app or between pages inside that doesn't reload everything, while any change you make reloads at once. The notifications bell checks every 5 minutes. Avatars are cached for a year (each upload gets a new address). | manual | `main.tsx`, `NotificationsBell`, `uploadAvatar` — browser Network tab: switch tabs and back within 5 minutes; no new `groups` request |
| PLAT-7 | Every table the app uses has explicit Data API grants in a migration (Supabase stopped granting new `public` tables automatically on 2026-10-30), so running the migrations on a fresh project gives a working app. | test | 0033 `explicit_grants`, `src/migrations.test.ts` |

## ADMIN — app admin page

| ID | Rule | Verified by | Where |
|---|---|---|---|
| ADMIN-1 | The Admin page shows Supabase free-plan usage against its limits, with the percent used: database size (of 500 MB, every database on the server, as Supabase counts it), file storage (of 1 GB), and people active in the last 30 days (of 50,000), plus the biggest tables. A meter turns amber from 80% and red at 100%. Egress and logs can't be read from the database, so the card links to Supabase's Usage page for them. | test | `usageMeters`, `AdminPage` |
| ADMIN-2 | Usage figures come only from `admin_usage()`, which returns nothing unless the caller is the app admin. | db | 0032 / 0035 `admin_usage` |

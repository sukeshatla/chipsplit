# Chip n Split

Split shared expenses like Splitwise and settle card-game nights with friends, in one ledger.
Log each player's buy-in and cash-out, add the pizza, and Chip n Split works out the fewest payments that square everyone up.

**Live at [chipnsplit.org](https://chipnsplit.org).** A static web app on **GitHub Pages** (free) with **Supabase** (free tier) for the database and Google sign-in.
It installs on phones as an app (PWA), and has a **demo mode** that works with no setup at all.

---

## Documentation

| Document | Purpose |
|---|---|
| [docs/DESIGN.md](docs/DESIGN.md) | Product design, data model, architecture, and security model in depth. Read before changing how money or permissions work. |
| [docs/Chip-n-Split-Features.pdf](docs/Chip-n-Split-Features.pdf) | Feature overview with screenshots, who can do what, step-by-step phone install (Android and iPhone), and the Google sign-in security notes. Share this with new users. |
| `supabase/migrations/*.sql` | The whole database, one numbered file per change. Each file's header says what it does. |
| This file | Quick start, project layout, routes, data API, permissions, and the full feature list. |

## Project Structure

```
chipsplit/
├── index.html                ← App shell (viewport meta, PWA links)
├── vite.config.ts            ← Vite + PWA (service worker, manifest); VITE_BASE sets the URL base
├── .env.local                ← VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (not committed)
├── .github/workflows/
│   ├── deploy.yml            ← On every push to main: test, build, deploy to GitHub Pages
│   └── keep-alive.yml        ← Pings Supabase every 3 days so the free project never pauses
├── public/                   ← App icons
├── docs/                     ← DESIGN.md, feature overview PDF (features, roles, phone install, security)
├── supabase/migrations/      ← 0001 … 0025, run in order in the Supabase SQL editor
└── src/
    ├── main.tsx, App.tsx     ← Entry + HashRouter (routes below)
    ├── index.css             ← Tailwind + theme tokens (light / dark)
    ├── api/
    │   ├── types.ts          ← DataApi: every read and write the UI can do
    │   ├── supabaseApi.ts    ← Real backend (Supabase, guarded by RLS)
    │   ├── demoApi.ts        ← Demo mode: the same API on localStorage, same rules
    │   └── seed.ts           ← Demo sample data
    ├── app/                  ← auth.tsx (Google sign-in / demo), data.tsx (load + actions), toast.tsx
    ├── lib/
    │   ├── ledger.ts         ← Balances, friends, permissions, activity (pure functions)
    │   ├── settle.ts         ← Fewest-payments settle-up
    │   ├── money.ts          ← Integer-cent math, exact splits, formatting
    │   ├── rummy.ts          ← Rummy scoring and payouts
    │   ├── summaryImage.ts   ← Share images (game table, balances, leaderboard)
    │   ├── admin.ts          ← The one app-admin account
    │   ├── *.test.ts         ← Unit tests (Vitest)
    │   └── types.ts, image.ts, theme.ts, supabase.ts
    ├── components/
    │   ├── ui.tsx            ← Button, Input, Modal (keyboard-aware), Tabs, Card, Row, ...
    │   ├── Layout.tsx, ActionBar.tsx, HistoryList.tsx, SettleRow.tsx, NotificationsBell.tsx, ...
    │   └── dialogs/          ← AddFriend, AddMember, CreateGroup, Expense, ExpenseDetail, Import,
    │                           MemberCard, NewGame, NewRummyGame, QuickExpense, Settle
    └── pages/                ← Dashboard, Groups, Group, GameDay, Games, Rummy (list, group, game),
                                Friends, FriendDetail, Profile, Admin, Login, Welcome
```

## Install on Your Phone (PWA)

Chip n Split installs like an app (own icon, full screen, updates itself) straight from the browser, no app store. Always install from **chipnsplit.org**. Step-by-step pictures are on the *Install* pages of [the feature PDF](docs/Chip-n-Split-Features.pdf).

**Android (Chrome)**
1. Open **chipnsplit.org** in Chrome.
2. Tap the **⋮** menu (top right) → **Add to home screen** (some Chrome versions say **Install app**).
3. Choose **Install**, not *Create shortcut* (a shortcut just opens a Chrome tab), then tap **Install** again.
4. To remove: long-press the icon → **Uninstall**.

**iPhone (Chrome, iOS 16.4 or later)**
1. Open **chipnsplit.org** in Chrome.
2. Tap the **Share** icon (square with an arrow) at the right of the address bar → **Add to Home Screen**.
3. Keep the name and tap **Add**.
4. To remove: long-press the icon → **Remove App** → **Delete from Home Screen**.

In **Safari** on iPhone it's the same: **Share** (bottom bar) → **Add to Home Screen** → **Add**.

If an icon installed from the old `sukeshatla.github.io/chipsplit` address shows an old version, see **Deploying** below.

## Quick Start

```bash
npm install
npm run dev
```

Open the URL Vite prints (http://localhost:5173). With no Supabase keys it runs in **demo mode**: sample data, saved in your browser only.

## First-Time Setup (real accounts)

1. Create a free project at [supabase.com](https://supabase.com).
2. In its **SQL editor**, run every file in `supabase/migrations/` **in order** (0001 → 0025).
3. **Authentication → Providers**: turn on Google (client ID and secret from Google Cloud Console).
4. **Authentication → URL Configuration**: Site URL `https://chipnsplit.org`; Redirect URLs `https://chipnsplit.org` and `http://localhost:5173`.
5. Create `.env.local` from **Project settings → API**:
   ```
   VITE_SUPABASE_URL=https://<project>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon key>
   ```
6. `npm run dev` and sign in with Google.

## Deploying

Every push to `main` runs **deploy.yml**: `npm test`, `npm run build` (with `VITE_BASE=/` and the two Supabase values from repo **Secrets**), then publishes `dist/` to GitHub Pages. Check a run with `gh run list -L 1`.

- **Domain:** the site is served at **chipnsplit.org** (custom domain on GitHub Pages, GitHub-managed HTTPS).
- **Old URL:** `https://sukeshatla.github.io/chipsplit/` now **301-redirects** to chipnsplit.org. Leave the redirect in place: old links and bookmarks keep working, and it isn't a security risk (every rule is enforced by the database, not the page).
- **"The old URL still shows an old version":** a phone that opened the old URL *before* the move kept that copy (PWA service worker). Its update check gets redirected to another site, which browsers refuse, so it never updates. Fix on that device: uninstall the old home-screen app, then Chrome → Settings → Site settings → All sites → `sukeshatla.github.io` → **Delete data**, and open chipnsplit.org instead. Removing the old URL from Supabase's Redirect URLs sends any old-copy sign-in to chipnsplit.org.
- **New version not showing on chipnsplit.org:** the app updates itself on the next load; refresh once.

## Database Migrations

The app never changes the schema itself. **Run a new migration in the Supabase SQL editor before pushing the app build that needs it.**

| File | What it does |
|---|---|
| 0001_init | Groups, members, expenses, games, payments, row-level security |
| 0002_friends | Personal friends list (contacts) |
| 0003_history_and_email | Per-group History log; per-member email opt-out |
| 0004_admins_and_notifications | Group admins; notifications feed |
| 0005_fix_group_delete_cascade | Delete group removes everything in it |
| 0006_require_settled_to_delete_group | A group can't be deleted until everyone is settled |
| 0007_club_and_expenses_kind | Club vs Expenses groups |
| 0008_admin_settled_delete_session | A finished game must be settled before it's deleted |
| 0009_lock_final_session_results | Finished games' results are locked |
| 0010_avatars | Profile photos |
| 0011_admin_analytics | App-admin usage stats |
| 0012 – 0014, 0016 | Rummy: scoring, editing rounds, 101/151/201 limits, buy-ins and rejoins |
| 0015_expense_admins_and_restore | Deleted expenses can be restored |
| 0017_direct_groups | One-on-one (friend-only) expenses |
| 0018_group_delete_ignores_game_settlement | Deleting a club only needs its total balance settled |
| 0019_chips_given_back | Chips given back mid-game |
| 0020_names_follow_account | A signed-up person's own name shows everywhere |
| 0021_game_host_only | Only a game's host changes or deletes it |
| 0022_game_payments_go_with_game | A game's payments go with it when deleted |
| 0023_names_admin_only | Only the app admin edits other people's names and emails |
| 0024_remove_friends | Remove anyone from your Friends list once settled |
| 0025_member_roles_and_restorable_games | Creator-only admins; any member manages expenses; deleted games can be restored |

## Permissions

All enforced in Postgres (row-level security and triggers), so they hold even if someone bypasses the app.

| Action | Who |
|---|---|
| See a group and everything in it | Its members |
| Add, edit, delete, restore expenses | Any member |
| Start a game | Any member of the club |
| Change a game, mark its payments, delete or restore it | The game's host (whoever started it) |
| Record a payment from the Balances tab | Any member |
| Add people to a group | Any member |
| Change group settings, make someone admin | Group admins (the creator, plus anyone they promote) |
| Delete a group (club or expenses) | Group admins, and only once everyone is settled up |
| Remove someone from your Friends list | You, once you're settled up with them |
| Edit another person's name or email | The app admin only |

## Running Tests

```bash
npm test            # Vitest: 54 tests, about a second
npm run typecheck   # TypeScript
npm run build       # what the deploy runs
```

Tests cover the settlement math (fewest payments, exact-cent splits), balances across groups and currencies, the friends list (merging, hiding removed friends), permissions (admins, game hosts), share summaries, and rummy scoring. See `src/lib/ledger.test.ts` and `src/lib/rummy.test.ts`.

## Pages & Routes

Hash routes (`/#/...`), so GitHub Pages never needs server-side routing.

| Route | Page | Description |
|---|---|---|
| `/` | Dashboard | Your net, groups and friends (biggest amount first), games in progress, recent activity |
| `/login` | Login | Sign in with Google, or try the demo |
| `/groups` | Groups | Your clubs and expense groups |
| `/groups/:groupId` | Group | Tabs: Games or Expenses, Balances, Members, History |
| `/groups/:groupId/games/:gameId` | GameDay | Buy-ins, give-backs, cash-outs, finalize, settle up |
| `/groups/:groupId/rummy` | GroupRummy | A club's rummy games |
| `/games` | Games (Club Games) | Buy-in games you played, across all clubs |
| `/rummy`, `/rummy/:id` | RummyList, RummyGame | Stand-alone and club rummy |
| `/friends` | Friends | Everyone you split with, biggest amount first |
| `/friends/:key` | FriendDetail | One-on-one expenses, balance per group, settle, remove friend |
| `/profile` | Profile | Name, currency, theme, card-game stats |
| `/admin` | Admin | Usage stats (app admin only) |

## Data API

There's no server of our own: the browser calls Supabase directly. Every call the UI can make is one method on `DataApi` (`src/api/types.ts`), implemented twice: `supabaseApi.ts` (real) and `demoApi.ts` (localStorage, same rules).

| Area | Methods |
|---|---|
| Load | `loadAll` (profile, groups with everything in them, friends, removed friends) |
| Profile | `updateProfile`, `uploadAvatar`, `removeAvatar` |
| Groups | `createGroup`, `updateGroup`, `deleteGroup`, `addMember`, `addMemberFromContact`, `removeMember`, `setGroupAdmin`, `setEmailOptOut`, `updatePerson` |
| Friends | `addContact`, `deleteContact`, `removeFriend` |
| Expenses | `saveExpense`, `deleteExpense`, `restoreExpense` |
| Games | `createSession`, `updateSession`, `saveSessionResults`, `deleteSession`, `restoreSession` |
| Payments | `addSettlement`, `deleteSettlement` |
| History | `loadHistory`, `loadNotifications`, `markNotificationsSeen` |
| Rummy | `loadRummyGames`, `loadRummyGame`, `createRummyGame`, `addRummyRound`, `updateRummyRound`, `rejoinRummyPlayer`, `closeRummyGame`, `deleteRummyGame`, `linkRummySession` |
| App admin | `loadAdminOverview`, `loadAdminDailyActivity`, `loadAdminRecentSignups` |

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, TypeScript 5, Vite 5 |
| Styling | Tailwind CSS 3 |
| Data fetching | TanStack Query 5 |
| Routing | React Router 6 (HashRouter) |
| Backend | Supabase: Postgres with row-level security, Auth (Google), Storage (avatars) |
| Offline / install | vite-plugin-pwa (Workbox service worker) |
| Spreadsheet import | SheetJS (`xlsx`) |
| Icons | Lucide React |
| Tests | Vitest |
| Hosting | GitHub Pages + GitHub Actions, custom domain chipnsplit.org |

## Key Notes

- **Money is integer cents** everywhere; splits use largest-remainder so they always add up exactly. Currencies are never converted.
- **Migrations first, then push.** A build that reads a new column fails to load if its migration hasn't been run.
- **Soft deletes:** deleted expenses and games stay in the database (`deleted_at`) and drop out of every balance until restored from History.
- **One-on-ones are small hidden groups** (`groups.is_direct`), shown under Friends instead of Groups.
- **Friend keys:** a person is `u:<user id>` (has an account), `e:<email>` (invited), or `m:<member id>` (guest). Removed friends are stored by key in `hidden_friends`.
- **App admin** is one hard-coded account (`src/lib/admin.ts`), and the database checks it too.
- **Free-tier upkeep:** `keep-alive.yml` stops Supabase from pausing the project after a quiet week.
- **No email service:** summaries and reminders are `mailto:` links.
- Ideas for later are in [docs/DESIGN.md § Ideas for later](docs/DESIGN.md#8-ideas-for-later).

---

## Features

**Clubs and card games** (rummy, blackjack, poker — anything with buy-ins and cash-outs)
- A **Club** is a standing group for people you play with regularly — create it once, then start as many games in it as you want, whenever you want.
- Starting a new game suggests the club's members as the roster (last game's players if there was one); pick who's actually at the table tonight. The **buy-in per player is required** every time (last game's amount is one tap away), and every player starts with one buy-in.
- Log buy-ins as people sit down. The **+** button adds a rebuy in one tap; **−** records chips a player gives back to the bank mid-game (so someone else can buy in), any amount, any number of times. Given-back chips count like cash already taken out.
- Mistakes are one tap to fix: every rebuy and give-back shows an **Undo** (just the latest one). Tapping **−** opens the player's panel: their **Buy-ins** (e.g. 3 × $3 = $9) with **Remove 1**, what they **Gave back** with **Undo 1**, and the main **Give back** button, so nobody's numbers get padded with fake give-backs.
- Enter cash-outs when the table breaks. A live **table check** shows whether total cash-outs match total buy-ins.
- Everything on an open game **saves automatically**: taps (rebuy, give back, adding or removing a player) right away, typed amounts a moment after you stop typing.
- Built for entering a full table on a phone: one line per player, a **Buy-ins / Cash-outs** switch so only one box shows at a time, and the keyboard's **Next** key jumps straight to the next player.
- Finalize to lock the results and get the **settle-up list**: the fewest payments that clear the table.
- Tick off each payment as **Paid** (or undo it). The game shows "3 unpaid" until everyone's square.
- A game belongs to whoever **started** it: only they can change buy-ins and cash-outs, finalize or reopen it, mark its payments, or delete it. Everyone else in the club follows along live, read-only. (Rummy works the same way.)
- Reopen a game to fix a mistake. Date, location, and rebuy amount are set when the game starts.
- Deleting a game needs that game's own payments recorded, and takes them out along with it, so everyone's balance is exactly what it was before the game. The host can **restore** a deleted game, payments and all, from the club's History tab. Deleting the whole club only needs the club's **total** balance settled (games + any older expenses + every payment).
- A club has a **Games** tab (the games list, with the **Leaderboard** under it: total won or lost at the table across finished games, games played, winning nights, best night; payments don't change it) and a **Balances** tab (the fewest payments to settle, where everyone stands with settled-up people last, payments recorded).
- **Club Games** (main menu) lists only the buy-in games you played, across all your clubs, with your totals; games you sat out or weren't in are left out. Rummy stays on each club's Rummy page.
- A club can run more than one game on the same day — each is its own record, nothing is tied to a calendar day.
- A club tracks games only. Shared costs go in an Expenses group or one-on-one; expenses a club already had stay visible on its Expenses tab.

**Rummy**
- Score pool rummy hand by hand: players are out at **101, 151, or 201** points; last one standing wins. Start one from a club's **Rummy** button, or stand-alone from friends and typed-in names.
- Only the person who started the game enters or fixes rounds; everyone else in it can follow along. Rounds show as one table with running totals.
- Optional **buy-in**: the winner takes the pot. A knocked-out player can **rejoin** for another buy-in while two or more are still in, restarting at the highest score still in. Closing early splits the pot between everyone still in.
- When it ends, the **payout** lists the fewest payments, and a club game can be **added to the club's balances** in one tap so it settles with everything else.

**Splitwise-style expenses**
- Add expenses with one payer or **several payers**.
- Split **equally**, by **shares** (e.g. one person owes 2 shares, everyone else 1), by **exact amounts**, or by **percentages** (defaults to an even split of 100%, not zero) — always to the exact cent. Every mode uses the same tap-to-include/exclude picker.
- **One-on-one expenses**: from the Dashboard or a friend's page, add an expense with friends ("we ate out, one person paid") without making a group. These stay under **Friends**, never in your Groups list. Under **More options** pick **USD, INR, or GBP**; each currency keeps its own balance with that friend (never converted).
- Tap an expense for a summary: who paid, who's in, and each share, with **Edit** and **Delete** for anyone in the group. Expenses are grouped by month and show what you lent or borrowed.
- A deleted expense can be **restored** from the group's History tab.
- **Import from Excel or CSV** (`.xlsx`, `.xls`, `.csv`) with a preview that flags bad rows before anything is saved. A template is downloadable from the import dialog.

**Friends**
- A personal friends list, independent of any one group: add someone by name, or by email so they're linked the moment they sign in with a matching Google account.
- **Add a friend** is one short form: **With email** (name + Google email) or **Guest, no email** (just a name). Pop-up forms stay above the phone keyboard.
- Each friend row says what you share: **2 shared groups**, **one-on-one**, or **nothing shared yet** (deleted expenses and empty one-on-ones don't count).
- **Remove friend** works for anyone (friend, invited, or guest), but only once you're settled up in every currency. They come back on their own if a balance with them opens again, or if you add them back.
- Every friend is tagged **Friend** (linked account), **Invited** (email on file, hasn't signed up), or **Guest** (name only).
- **One name per person**: once someone has an account, their own account name is what everyone sees, in every group, friends list, and rummy game, and it follows them if they rename themselves. People without an account keep the name they were added with.
- **Only the app admin changes other people's names and emails** (enforced in the database): **Edit name & email** on a guest's or invited person's card fixes them in every group and friends list at once, and links them if that email already has an account. Everyone else can only change their own name, on Profile.
- Pick existing friends right when creating a group or a club, when adding them to an expense, or when adding a player to a game — no retyping. Adding someone new anywhere in the app also saves them to your friends list.
- Friend page: your overall balance with them, an **Add expense** button, your one-on-one expenses ("Just you two", one **Balance** row per currency even if you each started a one-on-one), and your balance in each group you share, each with a **Settle** button.

**Balances and settling up**
- Each group shows where everyone stands and a **simplified debts** list, one line per payment; tap one to record it or send a reminder.
- Group and finished-game pages have one action bar: **Share** first, then **New game** in a club, or **Import / Expense** in an Expenses group. A club's **Rummy** sits beside it as its own button, since rummy is a different kind of game.
- **Share image** for a game is a table of each player's **Buy-ins, Bought in, Gave back, Cash-out, and Net** (green up, red down, winners first) with a totals row. In progress, a player's net shows once they cash out and the bottom shows the pot on the table; once finished, it lists who pays whom (striped rows) with recorded payments marked **Paid ✓**. Big tables get tighter rows, and past 20 rows a finished game goes out as two pictures: the table, then settle up.
- **Share** (first button on a group or finished game): **Email summary** opens a pre-filled email (via `mailto:`, no email service required) with the date, place, everyone's balance and the settle-up list, game payments already made marked paid; **Share image** makes the same summary as a colored picture (share sheet on phones, download on desktop). A game's summary covers only its players; a group's covers every member. Anyone can be left off the email, per group, from their card on the Members tab.
- **Share** on a club's **Leaderboard** and on **Settle up** sends a picture: the all-time leaderboard (games, nights won, best night, total; marked as table results, not balances), or a compact "Group balances as of" today (who gets back or owes, settled-up names on one line, then who pays whom). Bigger groups get tighter rows, and past 20 rows it goes out as two pictures (1 of 2: where everyone stands, 2 of 2: settle up) so each stays phone-shaped.
- **Where everyone stands** hides people who are settled up, with **Show N settled up** to see them.
- **Remind**: a `mailto:` nudge addressed to just the one person who owes a specific payment, from that payment in the settle-up list.
- Payment history with method (Cash, Zelle, Venmo, UPI, PayPal) and notes.
- A group can't be deleted until everyone in it is settled up — enforced by the database, not just the UI.

**History and notifications**
- Every group has a **History** tab: a plain-English log of who added, edited, or deleted what, and when.
- A notifications bell in the header shows an unread count for activity across every group you're in — new expenses, deletions, payments, being added to a group. "Mark all as read" clears it.

**Group admins**
- Whoever creates a group is its admin; everyone added later is a member. An admin can make others admin from their card on the Members tab.
- Every member can add, edit, delete, and restore expenses, and start games (each game is run by whoever started it).
- Only admins can change group settings, make others admin, or delete the group (clubs and expense groups alike). Enforced server-side (Postgres RLS + triggers), so it holds even if someone bypasses the UI.

**Dashboard**
- A colored banner (green when you're up, red when you're down): your net with its sign in a big box, and **You get** / **You pay** beside it. Then your **Groups** and **Friends** (top 5 each, biggest amount first whether you're owed or you owe, **Show all** for the rest), then a short recent-activity feed.
- Two quick actions: **Add expense** (one-on-one, above) and **New group**. Starting a game is a club-level action, done from inside that club.
- Banner for any game currently in progress. The activity feed only shows what involves you: the latest 5, then **Show all**.

**Accounts and profile**
- **Sign in with Google** (no password to set, leak, or forget) via Supabase Auth; it auto-creates the account on first sign-in. Someone without Gmail can make a Google account with their existing email (Yahoo, Outlook, ...), and is linked to every group they were added to with that address.
- **First sign-in** asks you to confirm your name (prefilled from Google, with your email shown). That name is what everyone sees for you, everywhere.
- Profile: display name, currency for totals, light / dark / system theme, card-game stats. Your profile email always matches your Google account.
- Groups are either a **Club** (recurring games only) or an **Expenses** group (trips, rent — no games).

- Long lists everywhere start short with one **Show all** at the bottom (the only expand control in the app; no "See all" links), and the Dashboard and Friends list the biggest amounts first, owed or owing (settled up last).

**Built for low maintenance**
- No server to run: the browser talks to Supabase directly, and **row-level security** in Postgres makes sure people only ever see groups they belong to.
- Money is stored as integer cents everywhere, so there's no rounding drift.
- The whole database is a handful of SQL files in `supabase/migrations`, so you can rebuild it anytime.
- Unit tests cover the settlement math and permission logic. GitHub Actions tests, builds, and deploys on every push.

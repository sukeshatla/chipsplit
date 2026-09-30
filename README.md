# ChipSplit

Split shared expenses like Splitwise and settle card-game nights with friends, in one ledger.
Log each player's buy-in and cash-out, add the pizza, and ChipSplit works out the fewest payments that square everyone up.

Runs as a static web app on **GitHub Pages** (free) with **Supabase** (free tier) for the database and Google sign-in.
It installs on phones as an app (PWA), and has a **demo mode** that works with no setup at all.

---

## Features

**Clubs and card games** (rummy, blackjack, poker — anything with buy-ins and cash-outs)
- A **Club** is a standing group for people you play with regularly — create it once, then start as many games in it as you want, whenever you want.
- Starting a new game suggests the club's members as the roster (last game's players if there was one); pick who's actually at the table tonight.
- Log buy-ins as people sit down. The **+** button adds a rebuy in one tap.
- Enter cash-outs when the table breaks. A live **table check** shows whether total cash-outs match total buy-ins.
- Finalize to lock the results and get the **settle-up list**: the fewest payments that clear the table.
- Tick off each payment as **Paid** (or undo it). The game shows "3 unpaid" until everyone's square.
- Reopen a game to fix a mistake. Edit date, location, notes, and rebuy amount any time.
- **Leaderboard** per club: total won or lost, games played, winning nights, best night.
- A club can run more than one game on the same day — each is its own record, nothing is tied to a calendar day.
- A club holds expenses too (split the pizza, chip in for the venue) — it isn't games-only.

**Splitwise-style expenses**
- Add expenses with one payer or **several payers**.
- Split **equally**, by **shares** (e.g. one person owes 2 shares, everyone else 1), by **exact amounts**, or by **percentages** (defaults to an even split of 100%, not zero) — always to the exact cent. Every mode uses the same tap-to-include/exclude picker.
- **Quick add**: from the Dashboard, add a one-off expense with any friends ("we ate out, one person paid") without setting up a group first — ChipSplit finds or creates the right group behind the scenes.
- Edit or delete any expense. Expenses list is grouped by month and shows what you lent or borrowed.
- **Import from Excel or CSV** (`.xlsx`, `.xls`, `.csv`) with a preview that flags bad rows before anything is saved. A template is downloadable from the import dialog.

**Friends**
- A personal friends list, independent of any one group: add someone by name, or by email so they're linked the moment they sign in with a matching Google account.
- Every friend is tagged **Friend** (linked account), **Invited** (email on file, hasn't signed up), or **Guest** (name only).
- Pick existing friends right when creating a group or a club, when adding them to an expense, or when adding a player to a game — no retyping. Adding someone new anywhere in the app also saves them to your friends list.
- Friend detail page: your running balance with that person across every group you share, and a "Settle" button per group.

**Balances and settling up**
- Each group shows where everyone stands and a **simplified debts** list with one-tap "Record" payments.
- **Send summary**: opens a pre-filled email (via `mailto:`, no email service required) with the balance breakdown and settle-up list, for a group or a single finalized game. Anyone can opt out of being included, per group, from the Members tab.
- **Remind**: a one-tap `mailto:` nudge addressed to just the one person who owes a specific payment, next to it in the settle-up list.
- Payment history with method (Cash, Zelle, Venmo, UPI, PayPal) and notes.
- A group can't be deleted until everyone in it is settled up — enforced by the database, not just the UI.

**History and notifications**
- Every group has a **History** tab: a plain-English log of who added, edited, or deleted what, and when.
- A notifications bell in the header shows an unread count for activity across every group you're in — new expenses, deletions, payments, being added to a group. "Mark all as read" clears it.

**Group admins**
- Everyone in a group is an admin by default. Narrow it to one or two people from the Members tab if you want.
- Only admins can change group settings, delete the group, or delete an expense. Everyone can still add expenses. Enforced server-side (Postgres RLS + triggers), so it holds even if someone bypasses the UI.

**Dashboard**
- Two quick actions: **Add expense** (the quick-add flow above) and **New group**. Starting a game is a club-level action, done from inside that club.
- Your overall position: owed to you, you owe, and all-time card-game result.
- Banner for any game currently in progress.
- Recent activity (capped, with a link to the full **Activity** page) and your groups (capped, with a link to **Groups**).

**Accounts and profile**
- **Sign in with Google**, or **email magic link** (no password to set, leak, or forget) — both via Supabase Auth. Either one auto-creates the account on first sign-in.
- Profile: display name, currency for totals, light / dark / system theme, card-game stats.
- Groups are either a **Club** (recurring games, plus expenses) or an **Expenses** group (trips, rent — no games) — no separate "both" option, since a club already covers it.

**Built for low maintenance**
- No server to run: the browser talks to Supabase directly, and **row-level security** in Postgres makes sure people only ever see groups they belong to.
- Money is stored as integer cents everywhere, so there's no rounding drift.
- The whole database is a handful of SQL files in `supabase/migrations`, so you can rebuild it anytime.
- Unit tests cover the settlement math and permission logic. GitHub Actions tests, builds, and deploys on every push.

---

## Try it in 1 minute (demo mode, no accounts)

Needs Node.js 18 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:5173 and click **Try the demo**. It loads sample groups (a club with seven games, a trip, and a shared apartment) stored only in your browser. **Profile → Reset demo data** restores the samples.

---

## Set up for real use (about 20 minutes, one time)

### 1. Create the Supabase project

1. Sign up at https://supabase.com and create a new project (free plan). Pick a region near you.
2. Open **SQL Editor → New query**. Paste and run each file in `supabase/migrations/`, **in order** (`0001_init.sql` through the highest-numbered file) — each one is a one-time, one-paste-and-Run step.
3. Go to **Project Settings → API** (called **API Keys** in newer dashboards) and copy:
   - the **Project URL** (`https://xxxx.supabase.co`)
   - the **anon / publishable** key. This key is meant to be public; row-level security is what protects the data. Never use the `service_role` / secret key in this app.

### 2. Create Google sign-in credentials

1. Go to https://console.cloud.google.com, create a project (for example "ChipSplit").
2. **APIs & Services → OAuth consent screen**: choose **External**, fill in the app name and your email, save.
   While the app is in "Testing", only accounts you add under **Test users** can sign in. Add your friends there, or click **Publish app** so anyone with a Google account can sign in (basic profile and email scopes don't need Google's review).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application**.
   - **Authorized JavaScript origins**: `http://localhost:5173` and `https://<your-github-username>.github.io`
   - **Authorized redirect URIs**: `https://<your-project-ref>.supabase.co/auth/v1/callback`
     (Supabase shows this exact URL on its Google provider page.)
4. Copy the **Client ID** and **Client secret**.

### 3. Connect Google to Supabase

1. Supabase → **Authentication → Sign In / Providers → Google**: enable it and paste the Client ID and Client secret.
2. Supabase → **Authentication → URL Configuration**:
   - **Site URL**: `https://<your-github-username>.github.io/<repo-name>/`
   - **Redirect URLs**: add both
     `http://localhost:5173/**` and `https://<your-github-username>.github.io/<repo-name>/**`

### 4. Run locally against Supabase

```bash
cp .env.example .env.local
# edit .env.local and paste your Project URL and anon key
npm run dev
```

The **Continue with Google** button is now active.

---

## Deploy to GitHub Pages

1. Create a GitHub repo (for example `chipsplit`) and push this folder to the `main` branch.
2. In the repo: **Settings → Secrets and variables → Actions → New repository secret**, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Push to `main` (or run the workflow from the **Actions** tab). The site goes live at
   `https://<your-github-username>.github.io/<repo-name>/`.

The workflow runs the tests, builds with the right base path, and publishes. If your repo is named `<username>.github.io`, change `VITE_BASE` in `.github/workflows/deploy.yml` to `/`.

**Keep-alive:** Supabase pauses free projects after about a week without activity. `.github/workflows/keep-alive.yml` pings the database every three days using the same secrets, so a quiet month won't take the app offline. If it does pause, click **Restore** in the Supabase dashboard; no data is lost.

**Install on a phone:** open the site in Safari (iPhone) and use **Share → Add to Home Screen**, or in Chrome (Android) use **Install app**. It's a PWA with a service worker, so after an update you may need to fully close and reopen the installed app (or hard-refresh a browser tab) to see the new version.

---

## How the math works

Everything reduces to one number per person per group: their **net balance** in cents.

| Event | Effect |
|---|---|
| Expense | each payer **+** what they paid, each person in the split **−** their share |
| Finalized game | each player **+** (cash-out − buy-in) |
| Payment from A to B | A **+** amount, B **−** amount |

Positive means the group owes that person; negative means they owe. Every group always sums to zero, and a group can't be deleted until it does.

To settle, `src/lib/settle.ts` repeatedly matches the person who owes the most with the person who is owed the most, pays the smaller of the two amounts, and repeats. It never needs more than one fewer payment than the number of people involved. For the sample game (+120, −80, +60, −100, +40, −40) that's four payments:

```
Ajay → Suki   $100
Ravi → Suki    $20
Ravi → Kiran   $60
Teja → Vamsi   $40
```

Games are settled on their own (so you can clear each night at the table), while a group's **Balances** tab settles everything in the group at once. The Friends page adds up, across groups, the payments between you and each person.

Splits always add up exactly: an equal split of $10.00 three ways is $3.34 + $3.33 + $3.33; percentage and share-based splits both use the largest-remainder method.

---

## Project structure

```
src/
  lib/
    types.ts         data model
    money.ts          cents formatting, parsing, exact splits (equal / shares / percent)
    settle.ts        minimum-payments settlement algorithm
    ledger.ts        balances, friends, admin/settled checks, activity feed (pure functions)
    ledger.test.ts   unit tests (npm test)
    supabase.ts      Supabase client
    theme.ts         light / dark / system
  api/
    types.ts         DataApi interface: every read and write the UI uses
    supabaseApi.ts   real backend
    demoApi.ts       browser-only backend for demo mode (mirrors the same permission rules)
    seed.ts          demo sample data
  app/
    auth.tsx         Google sign-in, demo mode, sign-out
    data.tsx         data loading and the useAction() write helper
    toast.tsx        notifications (toasts, not the bell)
  components/
    ui.tsx                buttons, inputs, cards, modal, tabs, amounts
    Layout.tsx             sidebar (desktop) and bottom tabs (mobile)
    NotificationsBell.tsx  header bell + unread badge, over the per-group activity log
    HistoryList.tsx        a group's (or one game's) activity log
    dialogs/               new group, friends, expense, quick expense, import, game, payment
  pages/             Login, Dashboard, Activity, Groups, Group, GameDay, Games, Friends, FriendDetail, Profile
supabase/migrations/   tables, row-level security, functions, triggers -- run in order, see below
.github/workflows/     deploy and keep-alive
```

**Design of the data flow:** the app loads all of your groups (with members, expenses, games, and payments) in one query, and every screen derives what it needs with the pure functions in `ledger.ts`. For a friends-and-family app this is fast, easy to reason about, and means balance logic lives in exactly one tested place. Writes go through `useAction()`, which refreshes the data and shows a toast. The notifications bell and a group's History tab load separately (`loadNotifications()` / `loadHistory()`), since they don't need to block the main screen.

Because both backends implement the same `DataApi` interface, you can develop UI in demo mode and it behaves the same against Supabase — including the admin and settle-up-before-delete rules, which `demoApi.ts` enforces the same way the database does.

### Database

Run these in order, once each, in the Supabase SQL editor:

| File | Adds |
|---|---|
| `0001_init.sql` | `profiles`, `groups`, `group_members`, `expenses` (+ `expense_payers`/`expense_shares`), `game_sessions` (+ `session_results`), `settlements`; RLS; `create_group()`, `add_member()` |
| `0002_friends.sql` | `contacts` (your personal friends list), `group_members.contact_id`, `upsert_contact()`, and an `add_member()` that can add from an existing contact |
| `0003_history_and_email.sql` | `change_log` (the History tab / notifications feed), `group_members.email_opt_out` |
| `0004_admins_and_notifications.sql` | `group_members.is_admin`, `profiles.notifications_seen_at`; admin-only RLS on group settings/delete and expense delete |
| `0005_fix_group_delete_cascade.sql` | fixes `expense_payers`/`expense_shares`/`session_results`/`settlements` to cascade-delete with their group (they didn't originally), and adds a guard so removing a single active member is still blocked |
| `0006_require_settled_to_delete_group.sql` | blocks deleting a group until every member's balance is zero |
| `0007_club_and_expenses_kind.sql` | renames the `poker` group kind to `club` and drops the unused `mixed` kind (`groups.kind` is now `club` \| `expenses`) |
| `0008_admin_settled_delete_session.sql` | deleting a game is admin-only and blocked while a finalized game still has unpaid settle-up (mirrors 0006 at the game level) |

All tables have row-level security: you can read and write a group's data only if you're a member. Groups are created through `create_group()` (which also makes you an admin), and members are added through `add_member()`, which links an existing account by email or copies in an existing friend by `contact_id`.

---

## Common tasks

| Task | Where |
|---|---|
| Rename the app | `index.html` title, `vite.config.ts` manifest, `src/components/Logo.tsx` |
| Change colors | CSS variables at the top of `src/index.css` (light and dark) |
| Add a currency | `CURRENCIES` in `src/components/dialogs/CreateGroupDialog.tsx` |
| Add an expense category | `CATEGORIES` in `src/components/dialogs/ExpenseDialog.tsx` |
| Change a database table | add a new file `supabase/migrations/000N_*.sql` (next number up) and run it in the SQL editor |

Scripts: `npm run dev` (local server), `npm test` (unit tests), `npm run typecheck`, `npm run build`, `npm run preview` (serve the build).

---

## Costs and limits

- **GitHub Pages:** free for public repos.
- **Supabase free plan:** comfortably covers a group of friends (500 MB database, generous auth limits at the time of writing; check supabase.com/pricing for current numbers). Projects pause after about a week idle; the keep-alive workflow handles that.
- **Google sign-in:** free.
- **Email summaries:** free — they open a pre-filled `mailto:` link in your own mail client rather than sending through a service, so there's no email provider or API key involved.

---

## Troubleshooting

- **"Continue with Google" is greyed out:** the app can't see your Supabase keys. Locally, check `.env.local` and restart `npm run dev`. On GitHub Pages, check the two repository secrets and re-run the deploy workflow.
- **Google says `redirect_uri_mismatch`:** the redirect URI in Google Cloud must be exactly your Supabase callback URL (`https://<ref>.supabase.co/auth/v1/callback`).
- **After signing in you land on localhost or the wrong page:** add your site to Supabase **Authentication → URL Configuration → Redirect URLs**, including the `/**` suffix.
- **"Access blocked: app has not completed verification":** the Google consent screen is in Testing. Add the person as a test user or publish the app.
- **A friend signed in but doesn't see the group:** the email you added for them must match their Google email. You can remove the guest (if they have no history) and add them again with the right email, or edit `group_members.email` in the Supabase table editor.
- **Blank page on GitHub Pages:** make sure Pages source is set to GitHub Actions, and that `VITE_BASE` matches your repo name.
- **The app looks out of date after a deploy:** it's a PWA and caches aggressively. Hard-refresh, or in DevTools → Application, unregister the service worker and clear site data.
- **"Delete group" or "Delete game" is disabled/missing:** either the group/game isn't settled up yet (clear the remaining payments first) or you're not an admin of that group.
- **"Only a group admin can..." errors:** by default everyone in a group is an admin; someone narrowed it down from the Members tab. Ask a current admin to re-add you, or check the shield icon next to each member.
- **Magic-link email never arrives:** works out of the box (the Email provider is on by default, no Supabase config needed), but Supabase's shared/default mailer has a low rate limit (a few emails per hour) until you set up custom SMTP under **Authentication → Emails**. Fine for a friends-and-family group; if you're testing sign-up repeatedly, check spam or wait a few minutes between attempts.

**Note on spreadsheet import:** it uses the `xlsx` package (0.18.5 from npm), which is only loaded when you import a file and only reads files you choose yourself. If you prefer the latest SheetJS build, install it from `https://cdn.sheetjs.com` per their docs.

---

## Ideas for later

- Real push notifications (the in-app bell already tracks unread activity; this would need a service worker push subscription)
- Receipt photos on expenses (Supabase Storage)
- Recurring expenses (rent, subscriptions)
- Realtime updates while a game is being entered on several phones (Supabase Realtime)
- Native app store builds with Capacitor, reusing this codebase

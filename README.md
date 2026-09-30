# ChipSplit

Split shared expenses like Splitwise and settle poker nights with friends, in one ledger.
Log each player's buy-in and cash-out, add the pizza, and ChipSplit works out the fewest payments that square everyone up.

Runs as a static web app on **GitHub Pages** (free) with **Supabase** (free tier) for the database and Google sign-in.
It installs on phones as an app (PWA), and has a **demo mode** that works with no setup at all.

---

## Features

**Poker game days**
- Start a game day from any poker group: pick the players, set the buy-in, add a location.
- Log buy-ins as people sit down. The **+** button adds a rebuy in one tap.
- Enter cash-outs when the table breaks. A live **table check** shows whether total cash-outs match total buy-ins.
- Finalize to lock the results and get the **settle-up list**: the fewest payments that clear the table.
- Tick off each payment as **Paid** (or undo it). The game shows "3 unpaid" until everyone's square.
- Reopen a game to fix a mistake. Edit date, location, notes, and rebuy amount any time.
- **Leaderboard** per group: total won or lost, games played, winning nights, best night.

**Splitwise-style expenses**
- Add expenses with one payer or **several payers**.
- Split **equally** (pick who's in), by **exact amounts**, or by **percentages**, always to the exact cent.
- Edit or delete any expense. Expenses list is grouped by month and shows what you lent or borrowed.
- **Import from Excel or CSV** (`.xlsx`, `.xls`, `.csv`) with a preview that flags bad rows before anything is saved. A template is downloadable from the import dialog.

**Balances and settling up**
- Each group shows where everyone stands and a **simplified debts** list with one-tap "Record" payments.
- **Friends** page: your running balance with each person across every group you share, like Splitwise. A friend who's a guest in several groups is matched by email.
- Friend detail page with the per-group breakdown and a "Settle" button per group.
- Payment history with method (Cash, Zelle, Venmo, UPI, PayPal) and notes.

**Dashboard**
- Your overall position: owed to you, you owe, and all-time poker result.
- Banner for any game currently in progress.
- Six-month chart of poker results next to your share of expenses.
- Groups with your balance in each, and a recent activity feed.

**Accounts and profile**
- **Sign in with Google** (Supabase Auth).
- Add friends to a group by name, optionally with their Google email. When they sign in with that email, they're linked automatically and see the group.
- Profile: display name, how friends can pay you, currency for totals, light / dark / system theme, poker stats.
- Groups can be Poker, Expenses, or Both, each with its own currency.

**Built for low maintenance**
- No server to run: the browser talks to Supabase directly, and **row-level security** in Postgres makes sure people only ever see groups they belong to.
- Money is stored as integer cents everywhere, so there's no rounding drift.
- The whole database is one SQL file in `supabase/migrations`, so you can rebuild it anytime.
- Unit tests cover the settlement math. GitHub Actions tests, builds, and deploys on every push.

---

## Try it in 1 minute (demo mode, no accounts)

Needs Node.js 18 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:5173 and click **Try the demo**. It loads sample groups (a poker group with seven game days, a trip, and a shared apartment) stored only in your browser. **Profile → Reset demo data** restores the samples.

---

## Set up for real use (about 20 minutes, one time)

### 1. Create the Supabase project

1. Sign up at https://supabase.com and create a new project (free plan). Pick a region near you.
2. Open **SQL Editor → New query**, paste the whole of `supabase/migrations/0001_init.sql`, and click **Run**. This creates the tables, security policies, and helper functions.
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

**Install on a phone:** open the site in Safari (iPhone) and use **Share → Add to Home Screen**, or in Chrome (Android) use **Install app**.

---

## How the math works

Everything reduces to one number per person per group: their **net balance** in cents.

| Event | Effect |
|---|---|
| Expense | each payer **+** what they paid, each person in the split **−** their share |
| Finalized game day | each player **+** (cash-out − buy-in) |
| Payment from A to B | A **+** amount, B **−** amount |

Positive means the group owes that person; negative means they owe. Every group always sums to zero.

To settle, `src/lib/settle.ts` repeatedly matches the person who owes the most with the person who is owed the most, pays the smaller of the two amounts, and repeats. It never needs more than one fewer payment than the number of people involved. For the sample game (+120, −80, +60, −100, +40, −40) that's four payments:

```
Ajay → Suki   $100
Ravi → Suki    $20
Ravi → Kiran   $60
Teja → Vamsi   $40
```

Game days are settled on their own (so you can clear each night at the table), while a group's **Balances** tab settles everything in the group at once. The Friends page adds up, across groups, the payments between you and each person.

Splits always add up exactly: an equal split of $10.00 three ways is $3.34 + $3.33 + $3.33, and percentage splits use the largest-remainder method.

---

## Project structure

```
src/
  lib/
    types.ts         data model
    money.ts         cents formatting, parsing, exact splits
    settle.ts        minimum-payments settlement algorithm
    ledger.ts        balances, friends, stats, activity feed (pure functions)
    ledger.test.ts   unit tests (npm test)
    supabase.ts      Supabase client
    theme.ts         light / dark / system
  api/
    types.ts         DataApi interface: every read and write the UI uses
    supabaseApi.ts   real backend
    demoApi.ts       browser-only backend for demo mode
    seed.ts          demo sample data
  app/
    auth.tsx         Google sign-in, demo mode, sign-out
    data.tsx         data loading and the useAction() write helper
    toast.tsx        notifications
  components/
    ui.tsx           buttons, inputs, cards, modal, tabs, amounts
    Layout.tsx       sidebar (desktop) and bottom tabs (mobile)
    dialogs/         new group, add friend, expense, import, game day, payment
  pages/             Login, Dashboard, Groups, Group, GameDay, Games, Friends, FriendDetail, Profile
supabase/migrations/0001_init.sql   tables, row-level security, functions, triggers
.github/workflows/                  deploy and keep-alive
```

**Design of the data flow:** the app loads all of your groups (with members, expenses, games, and payments) in one query, and every screen derives what it needs with the pure functions in `ledger.ts`. For a friends-and-family app this is fast, easy to reason about, and means balance logic lives in exactly one tested place. Writes go through `useAction()`, which refreshes the data and shows a toast.

Because both backends implement the same `DataApi` interface, you can develop UI in demo mode and it behaves the same against Supabase.

### Database tables

`profiles`, `groups`, `group_members` (guests have no `user_id` until they sign in), `expenses` with `expense_payers` and `expense_shares`, `game_sessions` with `session_results`, and `settlements`. All tables have row-level security: you can read and write a group's data only if you're a member. Groups are created through the `create_group()` function (which also adds you as owner), and friends are added through `add_member()`, which links an existing account by email.

---

## Common tasks

| Task | Where |
|---|---|
| Rename the app | `index.html` title, `vite.config.ts` manifest, `src/components/Logo.tsx` |
| Change colors | CSS variables at the top of `src/index.css` (light and dark) |
| Add a currency | `CURRENCIES` in `src/components/dialogs/CreateGroupDialog.tsx` |
| Add an expense category | `CATEGORIES` in `src/components/dialogs/ExpenseDialog.tsx` |
| Change a database table | add a new file `supabase/migrations/0002_*.sql` and run it in the SQL editor |

Scripts: `npm run dev` (local server), `npm test` (unit tests), `npm run typecheck`, `npm run build`, `npm run preview` (serve the build).

---

## Costs and limits

- **GitHub Pages:** free for public repos.
- **Supabase free plan:** comfortably covers a group of friends (500 MB database, generous auth limits at the time of writing; check supabase.com/pricing for current numbers). Projects pause after about a week idle; the keep-alive workflow handles that.
- **Google sign-in:** free.

---

## Troubleshooting

- **"Continue with Google" is greyed out:** the app can't see your Supabase keys. Locally, check `.env.local` and restart `npm run dev`. On GitHub Pages, check the two repository secrets and re-run the deploy workflow.
- **Google says `redirect_uri_mismatch`:** the redirect URI in Google Cloud must be exactly your Supabase callback URL (`https://<ref>.supabase.co/auth/v1/callback`).
- **After signing in you land on localhost or the wrong page:** add your site to Supabase **Authentication → URL Configuration → Redirect URLs**, including the `/**` suffix.
- **"Access blocked: app has not completed verification":** the Google consent screen is in Testing. Add the person as a test user or publish the app.
- **A friend signed in but doesn't see the group:** the email you added for them must match their Google email. You can remove the guest (if they have no history) and add them again with the right email, or edit `group_members.email` in the Supabase table editor.
- **Blank page on GitHub Pages:** make sure Pages source is set to GitHub Actions, and that `VITE_BASE` matches your repo name.

**Note on spreadsheet import:** it uses the `xlsx` package (0.18.5 from npm), which is only loaded when you import a file and only reads files you choose yourself. If you prefer the latest SheetJS build, install it from `https://cdn.sheetjs.com` per their docs.

---

## Ideas for later

- Push or email reminders for unpaid game-day payments
- Receipt photos on expenses (Supabase Storage)
- Recurring expenses (rent, subscriptions)
- Realtime updates while a game is being entered on several phones (Supabase Realtime)
- Native app store builds with Capacitor, reusing this codebase

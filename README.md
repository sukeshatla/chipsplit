# Chip n Split

Split shared expenses like Splitwise and settle card-game nights with friends, in one ledger.
Log each player's buy-in and cash-out, add the pizza, and Chip n Split works out the fewest payments that square everyone up.

Runs as a static web app on **GitHub Pages** (free) with **Supabase** (free tier) for the database and Google sign-in.
It installs on phones as an app (PWA), and has a **demo mode** that works with no setup at all.

See **[docs/DESIGN.md](docs/DESIGN.md)** for the product design, data model, architecture, and security model in depth.

---

## Features

**Clubs and card games** (rummy, blackjack, poker — anything with buy-ins and cash-outs)
- A **Club** is a standing group for people you play with regularly — create it once, then start as many games in it as you want, whenever you want.
- Starting a new game suggests the club's members as the roster (last game's players if there was one); pick who's actually at the table tonight. The **buy-in per player is required** every time (last game's amount is one tap away), and every player starts with one buy-in.
- Log buy-ins as people sit down. The **+** button adds a rebuy in one tap; **−** records chips a player gives back to the bank mid-game (so someone else can buy in), any amount, any number of times. Given-back chips count like cash already taken out.
- Enter cash-outs when the table breaks. A live **table check** shows whether total cash-outs match total buy-ins.
- Everything on an open game **saves automatically**: taps (rebuy, give back, adding or removing a player) right away, typed amounts a moment after you stop typing.
- Built for entering a full table on a phone: one line per player, a **Buy-ins / Cash-outs** switch so only one box shows at a time, and the keyboard's **Next** key jumps straight to the next player.
- Finalize to lock the results and get the **settle-up list**: the fewest payments that clear the table.
- Tick off each payment as **Paid** (or undo it). The game shows "3 unpaid" until everyone's square.
- A game belongs to whoever **started** it: only they can change buy-ins and cash-outs, finalize or reopen it, mark its payments, or delete it. Everyone else in the club follows along live, read-only. (Rummy works the same way.)
- Reopen a game to fix a mistake. Date, location, and rebuy amount are set when the game starts.
- Deleting a game needs that game's own payments recorded, and removes them along with it, so everyone's balance is exactly what it was before the game. Deleting the whole club only needs the club's **total** balance settled (games + any older expenses + every payment).
- A club has tabs for **Games** (the list), **Leaderboard** (total won or lost, games played, winning nights, best night), and **Settle up** (who pays whom, where everyone stands, payments recorded).
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
- Tap an expense for a summary: who paid, who's in, and each share, with **Edit** and **Delete** for group admins. Expenses are grouped by month and show what you lent or borrowed.
- A deleted expense can be **restored** from the group's History tab.
- **Import from Excel or CSV** (`.xlsx`, `.xls`, `.csv`) with a preview that flags bad rows before anything is saved. A template is downloadable from the import dialog.

**Friends**
- A personal friends list, independent of any one group: add someone by name, or by email so they're linked the moment they sign in with a matching Google account.
- Every friend is tagged **Friend** (linked account), **Invited** (email on file, hasn't signed up), or **Guest** (name only).
- **One name per person**: once someone has an account, their own account name is what everyone sees, in every group, friends list, and rummy game, and it follows them if they rename themselves. People without an account keep the name they were added with.
- **Only the app admin changes other people's names and emails** (enforced in the database): **Edit name & email** on a guest's or invited person's card fixes them in every group and friends list at once, and links them if that email already has an account. Everyone else can only change their own name, on Profile.
- Pick existing friends right when creating a group or a club, when adding them to an expense, or when adding a player to a game — no retyping. Adding someone new anywhere in the app also saves them to your friends list.
- Friend page: your overall balance with them, an **Add expense** button, your one-on-one expenses ("Just you two"), and your balance in each group you share, each with a **Settle** button.

**Balances and settling up**
- Each group shows where everyone stands and a **simplified debts** list, one line per payment; tap one to record it or send a reminder.
- Group and finished-game pages have one action bar: **Share** first, then **New game** in a club, or **Import / Expense** in an Expenses group. A club's **Rummy** sits beside it as its own button, since rummy is a different kind of game.
- A game **in progress** has **Share** too (image only, since nobody owes anything yet): a table of each player's buy-ins, money in, chips given back, and cash-out, with their profit (green) or loss (red) once they've cashed out, a totals row, and the pot on the table right now.
- **Share** (first button on a group or finished game): **Email summary** opens a pre-filled email (via `mailto:`, no email service required) with the date, place, everyone's balance and the settle-up list, game payments already made marked paid; **Share image** makes the same summary as a colored picture (share sheet on phones, download on desktop). A game's summary covers only its players; a group's covers every member. Anyone can be left off the email, per group, from their card on the Members tab.
- **Remind**: a `mailto:` nudge addressed to just the one person who owes a specific payment, from that payment in the settle-up list.
- Payment history with method (Cash, Zelle, Venmo, UPI, PayPal) and notes.
- A group can't be deleted until everyone in it is settled up — enforced by the database, not just the UI.

**History and notifications**
- Every group has a **History** tab: a plain-English log of who added, edited, or deleted what, and when.
- A notifications bell in the header shows an unread count for activity across every group you're in — new expenses, deletions, payments, being added to a group. "Mark all as read" clears it.

**Group admins**
- Everyone in a group is an admin by default. Narrow it to one or two people from each person's card on the Members tab if you want.
- Only admins can add, edit, delete, or restore expenses, change group settings, or delete the group. Enforced server-side (Postgres RLS + triggers), so it holds even if someone bypasses the UI.

**Dashboard**
- A bold banner with your overall balance (green when you're owed, red when you owe), then your **Groups** and **Friends** (top 5 each, most owed to you first, **Show more** for the rest), then a short recent-activity feed.
- Two quick actions: **Add expense** (one-on-one, above) and **New group**. Starting a game is a club-level action, done from inside that club.
- Banner for any game currently in progress. The activity feed only shows what involves you, with a link to the full **Activity** page.

**Accounts and profile**
- **Sign in with Google** (no password to set, leak, or forget) via Supabase Auth; it auto-creates the account on first sign-in. Someone without Gmail can make a Google account with their existing email (Yahoo, Outlook, ...), and is linked to every group they were added to with that address.
- **First sign-in** asks you to confirm your name (prefilled from Google, with your email shown). That name is what everyone sees for you, everywhere.
- Profile: display name, currency for totals, light / dark / system theme, card-game stats. Your profile email always matches your Google account.
- Groups are either a **Club** (recurring games only) or an **Expenses** group (trips, rent — no games).

- Long lists everywhere start short with **Show more** at the bottom, and balances are listed from most up to most down.

**Built for low maintenance**
- No server to run: the browser talks to Supabase directly, and **row-level security** in Postgres makes sure people only ever see groups they belong to.
- Money is stored as integer cents everywhere, so there's no rounding drift.
- The whole database is a handful of SQL files in `supabase/migrations`, so you can rebuild it anytime.
- Unit tests cover the settlement math and permission logic. GitHub Actions tests, builds, and deploys on every push.

Ideas for what's next (push notifications, receipt photos, realtime game entry, ...) are in **[docs/DESIGN.md § Ideas for later](docs/DESIGN.md#8-ideas-for-later)**.

# Chip n Split — Design Document

This document covers the product design, data model, and architecture decisions behind Chip n
Split. The [README](../README.md) covers setup and day-to-day usage; this is the "why it's built
this way" companion for anyone extending the codebase.

---

## 1. Product overview

### Problem

Splitting money with the same group of people, repeatedly, over a long time, is two problems
that existing tools solve separately: Splitwise-style apps handle shared expenses well but have
no concept of a recurring game night with buy-ins and cash-outs; poker-tracking apps handle the
table but not the pizza everyone chipped in for afterward. Friend groups end up running both,
manually reconciling between them.

### Target users

A friend or family group — not a business, not a marketplace. Trust between members is assumed;
the design optimizes for low friction (no invites-and-approvals ceremony, no per-transaction
fees, no ads) over protecting strangers from each other.

### Core principles

- **One ledger, two activities.** A single "Club" holds both recurring card games and shared
  expenses, because in practice the two are the same social unit (the people you play with are
  often the people you split the pizza with).
- **Exact money, always.** Every amount is integer cents internally; splits use largest-remainder
  distribution so a three-way split of $10.00 is always $3.34 + $3.33 + $3.33 — never a penny
  lost to rounding, never a value that doesn't sum back to the original total.
- **No account required to participate.** Someone can be added to a group by name alone (a
  "Guest"), or by email (an "Invited" friend who auto-links the moment they sign in with a
  matching address) — full participation in the ledger doesn't require anyone to sign up first.
- **Free to run, indefinitely.** Static hosting, a free-tier database, and `mailto:` links
  instead of a transactional email service. The cost structure was a design constraint, not an
  afterthought — see [§6 Non-goals](#6-non-goals-and-deliberate-scope-boundaries).

---

## 2. Feature design

### Clubs and games

A **Club** is a standing group for people who play together repeatedly. Creating one is a
one-time action; starting a new game inside it is not — a club supports unlimited games over
its lifetime, each an independent record (a club can run more than one game in a single day,
since nothing is keyed to a calendar date). Starting a new game defaults the player roster to
the club's membership (or the previous game's roster, if there was one), so the common case —
"same crew as last time" — takes one tap.

A game moves through two states: **open** (buy-ins/cash-outs are still being entered, freely
editable by anyone in the club) and **final** (locked; the settle-up list is generated from the
results). Finalizing requires the table to balance — total cash-out must equal total buy-in —
which catches counting mistakes before they become a wrong debt. A finalized game can be
reopened for corrections, but its buy-in/cash-out rows become admin-protected once final (see
[§4 Security model](#4-security-model)), so casual mistakes are fixable without exposing
settled historical numbers to casual tampering.

### Expenses

Standard Splitwise-style shared expenses, with one deliberate extension: **shares-based
splitting**. Beyond equal, exact-amount, and percentage splits, an expense can be split by
weight ("Madhu owes 2 shares, everyone else owes 1") — useful for the common real case where
costs aren't actually equal per person. All four modes share one selection UI (tap a person in
or out) rather than four different interaction patterns, and percentage splits default to an
even distribution of 100% rather than starting at zero, since "everyone splits this evenly" is
the common case even within the percentage mode.

A **quick expense** from the dashboard handles the one-off case — "we ate out, one person
paid, that's the whole interaction" — without requiring a club or group to already exist. It
finds an existing group with exactly that set of people, or creates a minimal one, so a
recurring set of friends converges on one shared ledger over time instead of accumulating
duplicate one-off groups.

### Friends

A personal address book, independent of any one group — the same friend, once added, can be
reused across every club or expense group without retyping. Three states describe where a
friend is in their relationship with the app, and are surfaced directly wherever a friend is
listed:

- **Friend** — linked to a real, signed-in account.
- **Invited** — added with an email; will auto-link the moment they sign in with that address.
- **Guest** — name only, no email on file.

Matching a returning member to their existing history is done by email, case-insensitively, at
the moment they first sign in (see `handle_new_user()` in the schema) — so someone who was
added as a guest to three different groups over a year, then finally signs up, sees all three
retroactively connect to their account without anyone doing anything.

### Balances, settling up, and reminders

Balances reduce to one number per person per group (see [§3 Data model](#3-data-model)); a
minimum-cash-flow algorithm turns that into the fewest payments that clear everyone. Settling
up is deliberately low-ceremony — record a payment in one tap, with a method and note for your
own records, no approval step from the other side. Two complementary, zero-infrastructure
communication tools sit on top of this: a **summary** email (the full balance picture for a
group or one game) and a **reminder** email (addressed to just the one person who owes a
specific amount) — both built as `mailto:` links rather than sent by a service, trading
"automatic" for "no email provider, no API key, no cost."

### History and notifications

Every write to a group is logged in plain English (`change_log`) — who added, edited, or
deleted what, when. A notification bell surfaces this across every group a person belongs to,
with an unread count, so staying current doesn't require checking each group individually.

### Governance: group admins

By default, everyone in a group is equally trusted — anyone can add an expense, log a game, or
record a payment. A narrower set of actions (changing group settings, deleting the group,
deleting an expense) requires **admin** status, which every member holds by default and can be
narrowed to one or two people per group if a club or household wants a single owner. This
mirrors real social structure: most groups don't need a designated authority, but the option
exists without requiring it upfront.

---

## 3. Data model

### Entity overview

```mermaid
erDiagram
    PROFILES {
        uuid id PK "= auth.users.id"
        text display_name
        text default_currency
        timestamptz notifications_seen_at
    }
    GROUPS {
        uuid id PK
        text name
        text kind "club | expenses"
        text currency
        uuid created_by FK
    }
    GROUP_MEMBERS {
        uuid id PK
        uuid group_id FK
        uuid user_id FK "null = guest until they sign in"
        uuid contact_id FK "null = not from a friend"
        text name
        text email
        bool email_opt_out
        bool is_admin
    }
    CONTACTS {
        uuid id PK
        uuid owner_id FK "whose friends list"
        uuid user_id FK "null until they sign in"
        text name
        text email
    }
    EXPENSES {
        uuid id PK
        uuid group_id FK
        text description
        bigint amount_cents
        date spent_on
    }
    EXPENSE_PAYERS { uuid expense_id FK
        uuid member_id FK
        bigint amount_cents }
    EXPENSE_SHARES { uuid expense_id FK
        uuid member_id FK
        bigint amount_cents }
    GAME_SESSIONS {
        uuid id PK
        uuid group_id FK
        date played_on
        text status "open | final"
        bigint default_buy_in_cents
    }
    SESSION_RESULTS { uuid session_id FK
        uuid member_id FK
        bigint buy_in_cents
        bigint cash_out_cents }
    SETTLEMENTS {
        uuid id PK
        uuid group_id FK
        uuid from_member FK
        uuid to_member FK
        bigint amount_cents
        uuid session_id FK "null = not tied to a game"
    }
    CHANGE_LOG {
        uuid id PK
        uuid group_id FK
        uuid actor_id FK
        text summary
        timestamptz created_at
    }

    GROUPS ||--o{ GROUP_MEMBERS : has
    GROUPS ||--o{ EXPENSES : has
    GROUPS ||--o{ GAME_SESSIONS : has
    GROUPS ||--o{ SETTLEMENTS : has
    GROUPS ||--o{ CHANGE_LOG : has
    CONTACTS ||--o{ GROUP_MEMBERS : "linked as"
    EXPENSES ||--o{ EXPENSE_PAYERS : has
    EXPENSES ||--o{ EXPENSE_SHARES : has
    GROUP_MEMBERS ||--o{ EXPENSE_PAYERS : is
    GROUP_MEMBERS ||--o{ EXPENSE_SHARES : is
    GAME_SESSIONS ||--o{ SESSION_RESULTS : has
    GROUP_MEMBERS ||--o{ SESSION_RESULTS : is
    GROUP_MEMBERS ||--o{ SETTLEMENTS : "from / to"
    GAME_SESSIONS ||--o{ SETTLEMENTS : "settles up"
```

All tables reference Supabase's built-in `auth.users` for identity — there is no separate user
table to keep in sync. The full column-level schema lives in `supabase/migrations/`, applied as
a single ordered sequence; that directory is the source of truth, not this document.

### Key decisions

**Money as integer cents, everywhere.** No floating point anywhere near a dollar amount. Splits
are computed with largest-remainder distribution (`src/lib/money.ts`), so a total always equals
the exact sum of its parts.

**One net balance per person per group.** Every event — an expense, a finalized game, a
settlement — is just a signed adjustment to a running per-member total (`groupBalances()` in
`src/lib/ledger.ts`). This single representation is what lets expenses, games, and payments all
settle through the same minimum-cash-flow algorithm (`src/lib/settle.ts`) without needing
separate logic per event type.

**Friends are decoupled from group membership.** `contacts` is a private, per-account address
book; `group_members` is the per-group roster. A person can exist in one without the other (a
friend not yet in any shared group; a group co-member never personally added as a friend), and
`friendKey()` — matching by linked account, then email, then a per-row fallback — merges the
two views into one identity wherever they overlap, so the same person is never shown twice.

**Settlement is an invariant, not a convention.** A group's balances always sum to zero; the
database enforces (not just the UI) that a group or a finalized game cannot be deleted while
unsettled, and that a finalized game's results are locked from casual edits. See
[§4](#4-security-model).

---

## 4. Security model

No custom backend exists — the browser talks to Supabase directly with the public anon key.
Row-level security (RLS) in Postgres is therefore the entire application-layer security
boundary, not a secondary check behind a server. Every policy resolves through a small set of
`SECURITY DEFINER` helper functions so a policy can never be bypassed by manipulating RLS on the
table it depends on:

| Function | Answers |
|---|---|
| `is_group_member(gid)` | Can this user see this group's data at all? |
| `is_group_admin(gid)` | Can this user change settings or delete things in this group? |
| `group_is_settled(gid)` | Does every member's balance in this group net to zero? |
| `session_is_settled(sid)` | Does every player's balance in this game net to zero? |

**Admin-gated actions** (changing group settings, deleting a group, deleting an expense) check
`is_group_admin`. Adding an expense, a game, or a payment does not — participation stays open to
every member. A trigger additionally blocks demoting the last admin in a group, so a group can
never lock itself out of its own governance.

**Settlement invariants are enforced at the database, not the UI.** Deleting a group or a
finalized game is blocked by a trigger while `group_is_settled` / `session_is_settled` is false
— this holds even against a direct API call that bypasses the app's own UI entirely. A
finalized game's buy-in/cash-out rows are similarly locked from direct edits or deletes unless
the game is reopened first or the caller is an admin.

**Authentication** is Google OAuth via Supabase Auth using the PKCE
flow — this application's own code never sees, stores, or handles a password. No secrets are
shipped to the client beyond the anon key, which is meant to be public; the `service_role` key
is never used here.

**No raw HTML injection anywhere** — the UI has zero uses of `dangerouslySetInnerHTML` or
similar; React's default escaping protects every user-entered string (names, notes,
descriptions) without any additional sanitization layer needed.

---

## 5. System architecture

```mermaid
flowchart LR
    subgraph Client["Browser / installed PWA"]
        SPA["React 18 + TypeScript SPA
Vite build, Tailwind CSS"]
    end
    subgraph GH["GitHub"]
        Pages["GitHub Pages
static hosting"]
        Actions["GitHub Actions
test -> build -> deploy
+ keep-alive cron"]
    end
    subgraph SB["Supabase"]
        Auth["Auth
Google OAuth"]
        DB[("Postgres
RLS + SECURITY DEFINER RPCs")]
    end
    SPA -- static assets --> Pages
    Actions -- build & deploy --> Pages
    Actions -- keep-alive ping --> DB
    SPA -- sign in --> Auth
    Auth -- link by email on new user --> DB
    SPA -- reads & writes, RLS-scoped --> DB
```

**Static SPA, no custom backend.** The tradeoff is explicit: application logic that would
normally live in backend middleware instead lives in two places — pure TypeScript functions
(`src/lib/ledger.ts`) for anything read-only, and Postgres RLS/triggers for anything that must
be enforced even against a hostile client. This keeps hosting free and the deploy pipeline
trivial, at the cost of needing database-level discipline that a server layer would otherwise
provide by default.

**One query loads everything.** The app fetches all of a signed-in user's groups — with
members, expenses, games, and payments — in a single query on load, and every screen derives
what it needs from that in memory via pure functions. For the target scale (a friend group, not
thousands of users), this is simpler to reason about than incremental fetching, and means
balance logic exists in exactly one tested place rather than being recomputed per screen.

**Two interchangeable backends.** `DataApi` (`src/api/types.ts`) is the single interface the UI
writes against; `supabaseApi.ts` implements it against Postgres, `demoApi.ts` implements the
identical interface against `localStorage` — including the same permission rules (admin checks,
settle-before-delete) enforced independently on the client side, so demo mode is a faithful
preview of real behavior, not a simplified stand-in.

**Deployment**: GitHub Actions tests, builds, and publishes to GitHub Pages on every push; a
separate scheduled workflow pings Supabase periodically so the free-tier project doesn't pause
from inactivity. A custom domain, when used, is a DNS-level and Pages-config change only — no
code path is domain-aware beyond the build's base path.

---

## 6. Non-goals and deliberate scope boundaries

- **Not a general ledger or accounting tool.** No multi-currency conversion (a group has one
  currency), no receipts/tax handling, no recurring/scheduled transactions.
- **Not a payments product.** Chip n Split tracks who owes whom; it never moves money. Settling
  up happens outside the app (Venmo, cash, etc.) and is only *recorded* here.
- **Not multi-tenant SaaS.** There's no organization/billing layer, no per-seat pricing, no
  admin console across groups — a single Supabase project serves one friend-and-family
  population, by design, to keep the free tier sufficient indefinitely.
- **Email is intentionally manual.** Summaries and reminders are `mailto:` links, not
  automatically sent messages — see [§2](#balances-settling-up-and-reminders). Automatic,
  richly-formatted email is a real future option (§7) but requires standing up an email
  provider and a scheduled function, which is a deliberate line not crossed yet.
- **No real-time collaboration.** Two people editing the same game simultaneously don't see each
  other's changes live — acceptable for the target usage pattern (one person at a time entering
  results at a table), revisited if that stops being true.

---

## 7. Delivery phases

The feature set breaks into five coherent phases, each shippable and useful on its own:

1. **Core ledger** — clubs and games (buy-ins, cash-outs, finalize, leaderboard), Splitwise-style
   expenses (multi-payer, four split modes), and the minimum-cash-flow settle-up engine.
2. **Social layer** — a personal friends list decoupled from group membership, friend-picker
   reuse across every creation flow, and email-based auto-linking for guests who later sign up.
3. **Governance and safety** — per-group admin roles, settlement invariants enforced at the
   database layer (not just the UI), and rich in-app confirmation for destructive actions.
4. **Communication** — a per-group history log, cross-group notifications with an unread count,
   and `mailto:`-based summaries and targeted reminders.
5. **Production hardening** — a full RLS/security pass (closing gaps where a direct API call
   could bypass UI-level protections), and a custom domain with GitHub-managed HTTPS.

## 8. Ideas for later

- Real push notifications (the in-app bell already tracks unread state; this needs a service
  worker push subscription)
- Automatic, richly-formatted settle-up reminders via a scheduled function + email provider
  (the deliberate alternative to the current `mailto:` approach — see §6)
- Receipt photos on expenses (Supabase Storage)
- Recurring expenses (rent, subscriptions)
- Realtime updates while a game is being entered on several phones (Supabase Realtime)
- Native app store builds with Capacitor, reusing this codebase

# CLAUDE.md

Context for anyone (person or AI assistant) changing this repo. Read [SPEC.md](SPEC.md) first.

## Documents

| File | Role |
|---|---|
| [docs/DESIGN.md](docs/DESIGN.md) | Blueprint: product design, data model, security model, architecture. The *why*. |
| [SPEC.md](SPEC.md) | Contract: numbered rules (`AREA-n`), each verified by a test, the database, or a written manual check. The *what*. |
| [README.md](README.md) | Setup, deploying, project layout, routes, data API, features. |
| `supabase/migrations/` | The database, one numbered file per change. Source of truth for the schema. |

## Workflow

Spec-driven and test-first. For every feature or fix:

1. **Design.** If it changes how money, permissions, or data work, update `docs/DESIGN.md` first.
2. **Spec.** Add or change the rule in `SPEC.md`. New rule = next free number in its area; never
   renumber or reuse an ID. Pick how it's verified: `test`, `db`, or `manual`.
3. **Red.** Write the test, named with the rule ID — `it('[FRIEND-6] …')` — and watch it fail
   (`npm test`). Pure rules go next to the code in `src/lib/*.test.ts`; permission and lifecycle
   rules go in `src/api/demoApi.test.ts`, since demo mode mirrors the database.
4. **Green.** Write the smallest code that passes. Keep logic in pure functions in `src/lib/`;
   pages only call them.
5. **Database.** If the rule must hold against a hostile client, enforce it in a new migration
   (`supabase/migrations/00NN_<what>.sql`, header says what and why) and mirror it in
   `demoApi.ts`. The user runs migrations by hand in the Supabase SQL editor: **never push a build
   that needs a migration until they confirm it has run.**
6. **Docs.** README feature list, and the feature PDF if screens changed.
7. **Check.** `npm run check` (typecheck + tests + build). CI runs the same on every push and PR.
8. **Commit** one logical change per commit: what changed and why in plain words. Spec, test, and
   code for one rule can share a commit; unrelated changes can't.

`src/spec.test.ts` keeps the spec honest: CI fails if a `test` rule has no tagged test, or a test
names a rule that doesn't exist.

## Commands

```bash
npm install
npm run dev          # http://localhost:5173 (demo mode without .env.local)
npm test             # Vitest, once
npm run test:watch   # Vitest, watching
npm run typecheck    # tsc -b
npm run build        # typecheck + production build into dist/
npm run check        # typecheck + test + build: what CI runs
```

## Architecture in one breath

React 18 + TypeScript SPA (Vite, Tailwind, TanStack Query, HashRouter), no server of our own.
`loadAll()` fetches everything a user can see; every screen derives from it with pure functions in
`src/lib/ledger.ts`. All writes go through `DataApi` (`src/api/types.ts`), implemented by
`supabaseApi.ts` (Postgres, guarded by RLS and triggers) and `demoApi.ts` (localStorage, same
rules). Deployed to GitHub Pages at chipnsplit.org on every push to `main`.

## Conventions

- **Money is integer cents.** Use `splitEqual` / `splitByWeights` / `parseMoney` / `formatMoney`;
  never divide money with floats in a component. Never add two currencies together.
- **Soft delete** (`deleted_at`) for anything restorable; data lives in `deleted_expenses` /
  `deleted_sessions`, never in the live arrays.
- **Permissions are enforced twice:** the database (the real guarantee) and `demoApi.ts` (so demo
  behaves the same). The UI only hides what you can't do.
- **Friends are keys, not rows:** `friendKey()` merges contacts and group members into one person.
- **Copy:** plain, short, sentence case. Lists sort biggest amount first where they show money.
- **Comments** explain why, not what; match the density of the file you're in.
- **Commits** end with the co-author line the session asks for; push only when asked.

## Gotchas

- `HashRouter` (`/#/...`) because GitHub Pages has no server-side routing.
- The old `sukeshatla.github.io/chipsplit` URL 301-redirects to chipnsplit.org; installed copies
  from before the move can't update and must be cleared on the device (README → Deploying).
- RLS skips rows silently; API writes ask for the row back (`.select('id')`) to tell "not allowed"
  from success.
- Tests run in Node (`vitest.config.ts`); `demoApi.test.ts` stubs `localStorage`.

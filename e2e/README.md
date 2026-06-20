# E2E harness (Phase 2a foundation)

Cross-app Playwright harness running both apps (`pos-interface`, `workshop`)
against a **local** Supabase stack. Phase 2a ships one smoke login test per app:
the real PIN login UI → lands on the authenticated dashboard.

## What it talks to

- Local Supabase: API `http://127.0.0.1:54321`, DB `:54322` (started by the
  Supabase CLI). The anon key in `config.ts` is the standard CLI local-dev demo
  key — **not a secret**.
- Apps read `VITE_SUPABASE_*` from each app's `.env.local` (gitignored), which
  this harness writes to point at the local stack.

Nothing here ever touches prod. `packages/database/.env` holds the prod URL;
this harness avoids dotenv entirely — schema SQL is applied via `docker exec
psql`, and seeding uses the hardcoded local URL in `config.ts`.

## Run from a clean state

```bash
# 0. (once) install workspace deps + the chromium browser
pnpm install
pnpm --filter e2e exec playwright install chromium

# 1. (once per machine boot) start Supabase, build the schema, seed users.
#    Idempotent — safe to re-run. Starts the stack if it isn't already up.
pnpm e2e:setup           # == pnpm --filter e2e setup

# 2. run the smoke test (boots both dev servers via Playwright webServer)
pnpm e2e                 # == pnpm --filter e2e test
```

Tear the stack down with `pnpm supabase stop` when finished.

## Why the schema is built by hand (not `supabase db reset`)

The authoritative schema is the Drizzle schema + `triggers.sql`, **not**
`supabase/migrations` (the repo is built via `db:push` historically; the
migrations dir is incomplete and its first migration references tables it never
creates). `supabase start` applies those migrations on boot and fails with
`relation "garments" does not exist`. So `setup.sh`:

1. moves `supabase/migrations` aside, runs `supabase start`, restores it;
2. `drizzle-kit push:pg` → builds tables/enums into `:54322`;
3. creates the `accessory_category` placeholder type (the only Supabase-local
   gap `triggers.sql`'s cast-bootstrap block needs — the real `auth` schema,
   roles, pgcrypto and `supabase_realtime` publication already exist locally, so
   the full `scripts/lifecycle/shim.sql` is **not** applied: it would clobber the
   real `auth.uid()`/`auth.role()` that RLS depends on);
4. applies `triggers.sql` then the `login_with_pin` RPC (migration 0014);
5. seeds reference data + three loginnable users.

## Seeded loginnable users (PIN `123456`)

`login_with_pin` mints the GoTrue `auth.users` row lazily on first sign-in, so a
`public.users` row + bcrypt PIN is all that's needed (same as
`packages/database/scripts/test-login-e2e.ts`).

| username         | role    | dept     | job_functions | lands on             |
| ---------------- | ------- | -------- | ------------- | -------------------- |
| `e2e_ordertaker` | staff   | shop     | —             | `/erth` (dashboard)  |
| `e2e_cashier`    | cashier | shop     | —             | `/cashier`           |
| `e2e_cutter`     | staff   | workshop | `cutter`      | `/terminals/cutting` |

All ERTH brand (lowercase in `users.brands`).

The workshop user is a **terminal user** (staff + a job_function): the workshop
RBAC matrix denies plain `staff:workshop` the office pages (e.g. `/receiving`),
so a terminal user is the shape that lands cleanly on its own terminal page.
The smoke test drives `e2e_ordertaker` (shop) and `e2e_cutter` (workshop).

## Layout

```
config.ts            local URLs/keys + seeded user definitions (single source)
global-setup.ts      fast readiness gate (DB up, RPC + users present)
playwright.config.ts boots both dev servers, chromium project
fixtures/login.ts     per-role login helpers (drive the real PIN UI)
helpers/db.ts         postgres.js connection to :54322 for future DB assertions
scripts/setup.sh      one-shot clean-state setup (stack + schema + seed)
scripts/seed-users.ts reference data + loginnable users (local-only)
tests/smoke.spec.ts   one login smoke per app
```

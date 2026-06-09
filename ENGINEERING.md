# ENGINEERING.md

Project-specific **working rules**: the maintainable-code ruleset, build/dev commands, environment, and the per-app UI/code conventions. The **product spec** (what the system does, §1–§6) lives in `SPEC.md`; governance (spec-as-oracle, change protocol) in `CLAUDE.md` §0. On any spec-vs-code conflict the spec wins (`CLAUDE.md` §0.2).

---

## 7. Maintainable-code ruleset (both apps)

General conduct — think before coding, simplicity, surgical changes, goal-driven execution, tests-as-oracles (`CLAUDE.md` §0.2) — lives in the global CLAUDE.md. Below is project-specific.

1. **Descriptive errors.** No bare "Error"/"Failed"/"Something went wrong". Name the operation and surface the cause (e.g. `updateGarment: failed to update garment <id>: <db error>`).
2. **Reach for shared primitives / helpers first.** Duplicating a pattern 2+ times means extract a primitive.
3. **Idempotency is mandatory on retryable mutations.** Order confirm, payment, refund, sales-order create, register close — each takes an idempotency key; a lost-response replay produces exactly one effect. (Production runs on a tier with a real lost-response tail; not optional.)
4. **DB migration discipline.** Don't guess remote DB state — inspect it first. Write migrations idempotent (`IF NOT EXISTS`). The schema is built via `db:push`; apply new migrations directly — the `db:migrate` runner is not usable.
5. **Invariants never to break silently:**
   - `users.brands` is stored **lowercase**; the brand-access check lowercases only the probe, so an uppercase entry silently denies access.
   - Garment lifecycle transitions only through the §2.5 branches — no ad-hoc `piece_stage` writes.
   - All money flows through `payment_transactions` (the trigger owns `orders.paid`); never write `orders.paid` directly.
   - All stock changes go through the stamping RPCs so the ledger stays complete.
   - Workshop date logic uses local-tz helpers (§12).
6. **Step completion is earned, not inferred.** A wizard/stepper step is marked complete only by an explicit user act *on that step* — clicking its Continue, or a Save that performs the step's work. Never auto-complete a step merely because pre-existing data exists (e.g. the customer has historical measurements). Loading a customer or reloading a draft may pre-fill and warm caches, but the step stays incomplete until the user acts. Two carve-outs, both still "earned": (a) a fully finalized record (e.g. a `confirmed` order) marks all its steps complete — the finalization *is* the explicit act; (b) on reload, a completed *later* step in a sequential stepper implies its prerequisites were completed in a prior session (the later step is unreachable otherwise), so they may be marked complete too.

---

## 8. Build & dev commands

**pnpm (v9) + Turborepo** monorepo.

```bash
# Root (Turbo, all apps/packages)
pnpm dev | build | lint | check-types | format

# Shop
pnpm --filter pos-interface dev          # Vite dev (port 5173)
pnpm --filter pos-interface build        # tsc + vite build
pnpm --filter pos-interface lint | check-types | test

# Database
pnpm --filter @repo/database db:push        # push Drizzle schema
pnpm --filter @repo/database db:reset       # drop + recreate
pnpm --filter @repo/database db:triggers    # apply SQL triggers
pnpm --filter @repo/database db:seed        # seed test data
pnpm --filter @repo/database test           # fast unit suites
pnpm --filter @repo/database test:workflow  # Docker-backed spec-as-oracle lifecycle suite
```

**Tests:** unit suites under `@repo/database` + the Shop app; the spec-as-oracle suite (`test:workflow`) runs real RPCs/triggers against an ephemeral Postgres and encodes `SPEC.md` §2–§4. A RED lifecycle test is a caught spec violation (or an intended-RED gap documented as such in `SPEC.md` §2–§4) — never relax it to green.

---

## 9. Environment variables

- Frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (in `apps/pos-interface/.env`).
- Database: `DATABASE_URL`; optional `TRANSACTION_URL` (pooler, port 6543).

---

## 11. Shop app (`apps/pos-interface`) — UI & tech conventions

> Behavioral rules for this app are in `SPEC.md` §5.

**Tech conventions** (match; don't re-architect): TanStack Router (file-based, generated route tree), TanStack Query + Supabase SDK for server state (no direct DB access), Zustand for local state, React Hook Form + Zod for forms, Shadcn/Radix + Tailwind, `@/*` path alias.

**UI direction — shop-first professional** (boutique retired):

- **Type:** Marcellus serif kept for headings (brand voice). Body/UI is Inter (Arabic falls back to Cairo). Montserrat retained ONLY by the bespoke login/landing pages (inline typography — don't globally remove). The Hidayatullah Arabic font is for the brand wordmark only — never UI text.
- **Neutral base + brand-as-accent only:** a neutral cool-gray/white system. Brand classes recolor ONLY primary/ring/sidebar-active (ERTH = very dark green, SAKKBA = very dark navy). Never re-tint border/muted/input/secondary/accent/background per brand.
- **Shape:** `--radius: 0.5rem`. Cards border-led (`rounded-lg border`, no shadow). Avoid `rounded-xl/2xl` and decorative content shadows.
- **No "AI-default" gradients / garish accent fills** on form steps — neutral surfaces + semantic tokens; the single brand primary is the only saturated color in a region.

---

## 12. Workshop app (`apps/workshop`) — UI & code conventions

> Behavioral rules for this app are in `SPEC.md` §6.

An **operational tool**, not a marketing page — dense-data / control-panel (Linear/Datadog/Vercel-admin), not boutique.

**Typography (enforced):** Inter + JetBrains Mono only (no Marcellus/Montserrat/decorative). Root 17px / line-height 1.4 (don't override per page). One typographic role per element — match the role table; don't invent ad-hoc sizes (add a role if needed). Max weight 600 (page titles), 500 (section titles/table headers/emphasis), 400 (body/data). **Never `font-bold`/`font-black`** — fix weak values with color contrast or size, not weight. Sentence case; no uppercase+tracking-wider except true acronyms (QC, ID, INV-). Table headers medium + muted, not bold.

**Color (enforced):** semantic tokens only (`--status-ok/warn/bad/info` + `bg-muted`/`text-muted-foreground`). **Forbidden:** `bg-{color}-100 text-{color}-800` and raw `bg-red-50`/`text-emerald-700`-style classes on chips/badges/pills — replace with the token when you touch the file. Dark icon tints (700-shade) OK for must-stay-identifiable indicator icons (express, home delivery, soaking, returns) — never -500. Brand badges dark/saturated (ERTH emerald-900, SAKKBA blue-900, QASS zinc-800) — never light pills. **One signal wins color per region** — if a row has a colored stage badge, the location beside it is plain text.

**Shape & layout:** single radius `rounded-md` (cards/chips/badges/buttons/inputs); `rounded-full` only for 1–2px status dots. No card shadow (border only; shadows for popovers/dialogs). No decorative `border-l-2` unless it encodes real state (discarded = red left-border). Card chrome (tints/rings) only for exceptional states (`opacity-60` parked, red `border-l-2` discarded) — never to restate a badge.

**No emoji in UI.** Lucide icons or plain text. Satisfaction = stars/text, never face emoji.

**Hierarchy by reduction, not addition.** Make something prominent by reducing the noise around it, not bold/color.

**Compose from the shared primitives** (PageHeader, SectionCard, SectionLabel, StatusBanner, StatsCard, EmptyState, LoadingSkeleton, MetadataChip) instead of re-writing Tailwind. About to write `bg-card border border-border rounded-md`, `uppercase tracking-wider`, or `bg-red-50 text-red-800`? Use the primitive. A pattern repeated across 2+ pages becomes a new primitive.

**Date handling (correctness).** All date comparisons use the workshop's local-tz helpers (`getLocalDateStr` / `toLocalDateStr` / `getLocalMidnightUtc`). **Never** `new Date().toISOString().slice(0,10)` for comparisons — that's the UTC date, wrong in non-UTC timezones.

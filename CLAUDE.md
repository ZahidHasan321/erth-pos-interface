# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

This is a **pnpm (v9) + Turborepo** monorepo.

```bash
# Root-level (runs across all apps/packages via Turbo)
pnpm dev              # Start all apps in dev mode
pnpm build            # Build all apps
pnpm lint             # ESLint all apps
pnpm check-types      # TypeScript type check all apps
pnpm format           # Prettier format

# POS Interface (apps/pos-interface)
pnpm --filter pos-interface dev          # Vite dev server (port 5173)
pnpm --filter pos-interface build        # tsc + vite build
pnpm --filter pos-interface lint
pnpm --filter pos-interface check-types

# Database (packages/database)
pnpm --filter @repo/database db:push      # Push Drizzle schema to DB
pnpm --filter @repo/database db:reset     # Drop and recreate all tables
pnpm --filter @repo/database db:triggers  # Apply SQL triggers
pnpm --filter @repo/database db:seed      # Seed test data
```

There are no tests configured in this project.

## Architecture

**Domain:** Dishdasha (traditional garment) production & POS system for the Autolinium/ERTH brand. Handles custom tailoring work orders (measured, cut, sewn) and shelf-item sales orders.

### Monorepo Structure

- **`apps/pos-interface`** — React 19 + Vite SPA. Shop staff interface for order creation, garment tracking, customer management, and printing.
- **`apps/workshop`** — React 19 + Vite SPA. Workshop staff interface for production scheduling, terminals, dispatch, and resource management.
- **`packages/database`** — Drizzle ORM schema and scripts. Shared types used by both apps. PostgreSQL on Supabase.
- **`packages/ui`** — Minimal shared Shadcn component stubs (Button, Card, Code).
- **`packages/eslint-config`** / **`packages/typescript-config`** — Shared configs.

### POS Interface Key Tech

- **Routing:** TanStack Router (file-based, route tree auto-generated in `routeTree.gen.ts`)
- **Server state:** TanStack Query + Supabase JS SDK (REST, no direct DB access from frontend)
- **Local state:** Zustand
- **Forms:** React Hook Form + Zod 4 validation
- **UI:** Shadcn UI (Radix primitives) + Tailwind CSS 4
- **Path alias:** `@/*` → `./src/*`

### POS App Layout

- `src/api/` — Supabase query functions (customers, orders, garments, measurements, fabrics, styles, prices, shelf, campaigns)
- `src/hooks/` — TanStack Query hooks wrapping API calls (`useOrderMutations`, `useShowroomOrders`, `useOrderHistory`, `usePricing`, etc.)
- `src/routes/` — File-based TanStack Router pages. Main authenticated routes live under `$main/`
- `src/components/forms/` — Multi-step order creation forms (customer demographics, fabric selection, measurements, payment summary)
- `src/components/order-management/` — Order lifecycle operations (dispatch, link/unlink, feedback, receiving)
- `src/components/orders-at-showroom/` — Active order data tables and filters
- `src/context/auth.tsx` — Auth context (localStorage-based, brand determined by user)
- `src/lib/constants.ts` — Shared constants and enums
- `src/stores/` — Zustand stores

### Database Schema (packages/database/src/schema.ts)

The system thinks in **garments, not orders**. An order is a container; garment rows track individual pieces through production.

Key tables and relationships:
- **orders** → parent container with `order_type` (WORK/SALES), `checkout_status` (draft/confirmed/cancelled), `brand` (ERTH/SAKKBA/QASS), payment info
- **work_orders** → extends orders for tailoring: `order_phase` (new/in_progress/completed), delivery dates, campaign
- **garments** → individual pieces: `garment_type` (brova=trial/final), `piece_stage` (11-value enum tracking production — see Order Lifecycle below), `location` (shop/workshop/transit), `feedback_status`, `acceptance_status`, fabric/style specs
- **garment_feedback** → QC and customer trial records with satisfaction levels and measurement diffs (JSON)
- **measurements** → 30+ body dimension fields per customer
- **customers** → profiles with demographics, phone, addresses
- **fabrics/styles** → inventory and pricing catalogs
- **shelf / order_shelf_items** → pre-made items for sales orders
- **prices** → dynamic key-value pricing lookup

Key enums: `piece_stage` has 11 values (see Order Lifecycle below), `location` tracks physical whereabouts separately from production stage.

### Order Lifecycle

> **IMPORTANT:** If any flow changes, update this section. This is the source of truth for how garments move through the system.

#### Garment Tracking Fields

| Field | Purpose |
|-------|---------|
| `piece_stage` | Where in production/lifecycle (enum) |
| `feedback_status` | Trial/collection outcome: `accepted` / `needs_repair` / `needs_redo` / `null` |
| `acceptance_status` | `true` = design approved (finals can proceed). NOT the same as piece_stage |
| `location` | Physical location: `shop` / `workshop` / `transit_to_shop` / `transit_to_workshop` |
| `trip_number` | Increments each time garment is sent back to workshop (starts at 1) |
| `garment_type` | `brova` (trial garment) or `final` |

#### Piece Stage Enum (clean set, no deprecated values)

```
waiting_for_acceptance → waiting_cut → soaking → cutting → post_cutting →
sewing → finishing → ironing → quality_check → ready_for_dispatch →
awaiting_trial / ready_for_pickup → brova_trialed → completed
```

#### Alteration Thresholds (trip number)

- **Brova and Final (unified):** trip 1 = initial, trip 2+ = alteration (alt# = trip - 1). Finals have no trial step; brova trip 2+ returns are treated as alterations too.
- **QC-fail rework:** no trip increment — detected via `trip_history[current_trip].qc_attempts` containing a `result: "fail"` entry. Labeled `alt_p` in production terminals, distinct from trip-based `alt_N`.
- Helper functions `isAlteration()` and `getAlterationNumber()` in `packages/database/src/utils.ts`.

#### Step-by-Step Flow

**1. Order Created** (`new-work-order` page → `save_work_order_garments` RPC)
- Brovas: `piece_stage: waiting_cut`, `location: shop`, `trip_number: 1`
- Finals: auto-set to `piece_stage: waiting_for_acceptance` if any brova exists (parked until brova accepted)
- Order: `checkout_status: confirmed`, `order_phase: new`

**2. Dispatch to Workshop** (`dispatch-order` page → `dispatchOrder()`)
- All garments → `location: transit_to_workshop`
- Order → `order_phase: in_progress`
- Finals stay at `waiting_for_acceptance` (parked at workshop)

**3. Workshop Receives** (`workshop/receiving` page → `receiveGarments()`)
- Garments → `location: workshop`
- "Receive" = park (`in_production: false`), "Receive & Start" = schedule (`in_production: true`)
- Finals at `waiting_for_acceptance` never get `in_production: true`

**4. Workshop Production** (`workshop/scheduler` → `ProductionTerminal`)
- Scheduler assigns date + production plan → garment moves through terminals
- Stages: `waiting_cut → soaking → cutting → post_cutting → sewing → finishing → ironing → quality_check → ready_for_dispatch`

**5. Workshop Dispatches to Shop** (`workshop/dispatch` → `dispatchGarments()`)
- Sets `location: transit_to_shop`, `in_production: false`, `feedback_status: null` (cleared)

**6. Shop Receives** (`receiving-brova-final` page)
- Brovas → `piece_stage: awaiting_trial`, `location: shop`
- Finals → `piece_stage: ready_for_pickup`, `location: shop`

**7. Brova Trial** (`feedback/$orderId` page → `evaluateBrovaFeedback()`)
- All outcomes set `piece_stage: brova_trialed`. The difference is in `feedback_status` and `acceptance_status`:

| Action | feedback_status | acceptance_status | Goes back to workshop? |
|--------|----------------|-------------------|----------------------|
| Accept | `accepted` | `true` | No |
| Accept with Fix | `needs_repair` | `true` | Yes (later) |
| Reject - Repair | `needs_repair` | `false` | Yes |
| Reject - Redo | `needs_redo` | `false` | Yes |

**8. Finals Release** (manual "Start Production" button on feedback page)
- Enabled as soon as ANY brova has `acceptance_status: true` (no need to wait for all brovas)
- Moves finals from `waiting_for_acceptance` → `waiting_cut`

**9. Sending Garments Back** (`alterations` page or `dispatch > Return to Workshop` tab)
- Both paths set: `piece_stage: waiting_cut`, `location: transit_to_workshop`, `trip_number += 1`, `in_production: false`

**10. Workshop Re-receives** (workshop receiving page, Alterations section — all trip >= 2)
- Single "Alterations" section covers every returning garment (brova or final trip 2+), and any QC-fail rework regardless of trip
- All returning garments can be received or received & started immediately (no brova-approval gate at this point)
- Resets `piece_stage: waiting_cut` if still `brova_trialed` with feedback

**11. Final Collection** (feedback page, final tab)
- Accepted → `piece_stage: completed`, `fulfillment_type: collected/delivered`
- Rejected → `piece_stage: brova_trialed`, `feedback_status: needs_repair/needs_redo` → goes through alteration cycle

#### Showroom Status Labels (`getShowroomStatus()` in `packages/database/src/utils.ts`)

Determines what shows on the "Orders at Showroom" page. Garment-state-driven — looks at what garments are actually doing, derives a label from that.

**Shows orders with garments at shop, OR finals in transit (even if no shop items yet).**

| Label | Condition | Staff Action |
|-------|-----------|-------------|
| `alteration_in` | Alteration garment at shop needing trial/action (any trip 2+ with `awaiting_trial`, or `needs_repair`/`needs_redo` at alteration threshold) | Customer trial for returning alteration |
| `brova_trial` | Brova at shop with `piece_stage: awaiting_trial` | Customer needs to try brovas on |
| `needs_action` | Any garment at shop with `feedback_status: needs_repair/needs_redo` | Send rejected garment back to workshop |
| `partial_ready` | All shop items done, but other garments still out (at workshop/transit) | Inform customer, partial pickup possible |
| `ready_for_pickup` | All shop items done AND no garments outstanding anywhere | Customer can collect everything |

**Priority order:** alteration_in > brova_trial > needs_action > partial_ready > ready_for_pickup.

The priority is action-first: things needing customer/staff action rank higher than informational statuses. If one garment needs trial and another needs to be sent back, trial wins (customer-facing).

**Key scenarios:**
- B1 accepted, B2 rejected → **needs_action** (B2 has feedback_status)
- B1 accepted, finals not here yet → **partial_ready** (shop items done, finals out)
- Finals ready, one brova still being repaired → **partial_ready** (not everything at shop)
- 4 garments collected, 1 needs fix → **needs_action** (completed garments filtered out)
- Returning final (trip 2+) at ready_for_pickup with clean feedback → **ready_for_pickup** (optional recheck, not forced)
- Returning final rejected again → **alteration_in** (trip 2+ with needs_repair)
- No shop items but finals in transit → **partial_ready** (order stays visible)

#### Workshop Status Labels (`AssignedOrderCard` in `apps/workshop/src/routes/(main)/assigned/index.tsx`)

Order-level status on the Production Tracker. Brova returns and alterations are tracked as individual garments in their own tabs.

| Status | Condition |
|--------|-----------|
| At shop | All garments at shop |
| Ready for dispatch | All workshop garments at `ready_for_dispatch` |
| In transit to shop | Garments in transit, nothing active at workshop (or only parked finals) |
| Brovas in transit | Brovas in transit to shop, only parked finals remain |
| Awaiting finals release | Brovas at shop + at least one accepted, finals still parked (`waiting_for_acceptance`) |
| Awaiting brova trial | Brovas at shop + none accepted yet, finals parked |
| Finals in production | Finals actively being worked on at workshop (not `waiting_for_acceptance`) |
| Brovas in production | Brovas being worked on at workshop |

**Priority:** at shop > ready for dispatch > in transit > awaiting finals release/brova trial > finals in production > brovas in production > fallback "In production".

If brova is returning AND finals are in production → "Finals in production" wins (main order work). Brova returns appear in the receiving page Alterations section alongside other returning garments.

#### Order-Level Phase

- `order_phase: new` → not dispatched yet
- `order_phase: in_progress` → at least one garment beyond pre-dispatch
- `order_phase: completed` → all garments completed (partial pickup supported — individual garments marked completed via feedback)
- Order history page shows only `order_phase`. No garment-level detail needed there.

#### Date Handling

All date comparisons in the workshop app use local timezone helpers from `apps/workshop/src/lib/utils.ts`:
- `getLocalDateStr()` — today as YYYY-MM-DD in user's timezone
- `toLocalDateStr(value)` — convert any date to local YYYY-MM-DD
- `getLocalMidnightUtc()` — local midnight as UTC ISO string (for DB timestamp queries)

Never use `new Date().toISOString().slice(0, 10)` for date comparisons — it gives UTC date which can be wrong in non-UTC timezones.

### Environment Variables

- Frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (in `apps/pos-interface/.env`)
- Database: `DATABASE_URL` (postgres connection string), optional `TRANSACTION_URL` (pooler on port 6543)

### Inventory & Transfers (redesigned)

The store/inventory area was consolidated from ~15 stage-based pages to **3 per app**: Inventory, Transfers, Reports (POS keeps End-of-Day Report as a separate financial page).

#### Stock movements ledger

Every change to `fabrics`/`shelf`/`accessories.{shop,workshop}_stock` writes a row to `stock_movements`. Auto-logged via `AFTER UPDATE` triggers (`log_fabric_stock_change`, `log_shelf_stock_change`, `log_accessory_stock_change`). Callers stamp context via PostgreSQL session settings before the UPDATE so the trigger knows WHY:

```sql
PERFORM set_config('app.movement_type',     'restock',  true);
PERFORM set_config('app.movement_ref_type', 'restock',  true);
PERFORM set_config('app.movement_ref_id',   '42',       true);
PERFORM set_config('app.movement_user_id',  '<uuid>',   true);
PERFORM set_config('app.movement_supplier_id', '7',     true);
PERFORM set_config('app.movement_unit_cost',   '12.5',  true);
PERFORM set_config('app.movement_reason',  'supplier delivery', true);
PERFORM set_config('app.movement_notes',   '...',      true);
```

If session settings are missing, the trigger defaults to `movement_type='adjustment'`, `reason='unattributed'` so no change is silently lost.

**movement_type enum:** `restock` · `consumption` · `transfer_out` · `transfer_in` · `adjustment` · `waste` · `return`

**RPCs that stamp context:** `restock_item`, `adjust_stock`, `consume_for_order`, plus the existing `dispatch_transfer`, `receive_transfer`, `complete_work_order`, `complete_sales_order`, `create_complete_sales_order` (all extended to set vars before stock UPDATEs).

**Suppliers** are first-class (`suppliers` table, shared across all item types). Restock dialog has a supplier dropdown with inline "+ New" creation.

#### UI surfaces

- **Inventory** (`/store/inventory`) — list per item type. Click row → detail drawer with stock breakdown, movement history, and Restock / Adjust / Request-transfer buttons (RBAC-gated). The metadata edit dialog NO LONGER shows a stock field — all stock changes go through Restock or Adjust (both require a reason).
- **Transfers** (`/store/transfers`) — replaces 4 stage-pages per app (request-delivery, active-deliveries, receiving-deliveries, approve-requests). Tabs: `Needs my action` / `Active` / `All` / `History`. The action button on each row changes based on transfer status × user role × side (`primaryActionFor` in `lib/transfers.ts`).
- **Reports** (`/store/reports`) — KPI cards (restocked, consumed, net, lost), top items by movement type, recent adjustments feed. Driven by `get_movement_aggregates` and `get_top_items_by_movement` RPCs.

#### RBAC permissions added

```
inventory:restock   → owner-side manager + admin
inventory:adjust    → manager + admin (either side)
inventory:delete    → manager:shop + admin (hard-deletes if unused, archives if FK-referenced)
suppliers:manage    → manager + admin

transfers:request   → staff + manager (either side)
transfers:approve   → manager + admin (gated by side at render-time)
transfers:dispatch  → manager + admin (source side)
transfers:receive   → staff + manager (destination side)
transfers:cancel    → manager + admin
```

#### Backfill

`pnpm --filter @repo/database db:backfill-stock-movements` populates the ledger from existing `transfer_request_items` history (transfer_out / transfer_in / waste rows). Refuses to re-run if backfilled rows already exist. Direct dialog edits and order consumption have no historical record → not backfilled.

#### Deprecated (still present, drop later)

- `fabrics.real_stock`, `shelf.stock` — old single-stock columns. Still written by `complete_work_order` / `complete_sales_order` triggers to stay in sync. App reads have been migrated to `shop_stock`/`workshop_stock`. Two app-layer references remain in `apps/pos-interface/src/components/forms/shelf/shelf-columns.tsx` and `apps/pos-interface/src/hooks/useOrderMutations.ts` (unused mutations). Drop after migrating those.

### Key Documentation

- `MIGRATION_PLAN.md` — Detailed garment stage definitions, transition rules, and SQL migration specs
- `SHOP_FLOW_AND_ARCHITECTURE.md` — POS app workflows and architecture decisions

## Workshop UI Design Rules

The workshop app is an **operational tool**, not a marketing page. Visual language is dense-data / control-panel (think Linear, Datadog, Vercel admin) — not boutique. Follow these rules in every workshop file. The full ruleset with the typography role table lives at the top of `apps/workshop/src/index.css` — read that first.

### Typography (enforced)

- **Font stack:** Inter + JetBrains Mono (loaded in `apps/workshop/index.html`). Do not introduce Marcellus, Montserrat, or any decorative font.
- **Root size:** 17px, line-height 1.4. Set in `index.css` — do not override per-page.
- **One role per element.** Match every text element to a role in the table at the top of `index.css` (page title / section title / primary data / table header / pill / etc). If a case doesn't fit, add a row to the table first — never invent ad-hoc sizes.
- **Weights:** max 600 (semibold) on page titles, 500 (medium) on section titles + table headers + emphasis, 400 (regular) on body and all data. **Never use `font-bold` or `font-black`** in UI — they fake hierarchy. If a value reads weak, fix it with color contrast or size.
- **No uppercase + tracking-wider.** Sentence case only. The single exception is true acronyms (INV-, QC, ID).
- **Table headers are NOT bold.** `text-sm font-medium text-muted-foreground` — hierarchy comes from muted color against `text-base` foreground data, not from header weight.

### Color (enforced)

- **Use semantic tokens, never raw Tailwind palette.** Defined in `apps/workshop/src/index.css`:
  - `--status-ok` / `--status-ok-bg` — done / ready / approved
  - `--status-warn` / `--status-warn-bg` — needs decision / customer action / imminent
  - `--status-bad` / `--status-bad-bg` — overdue / failed / discarded / express
  - `--status-info` / `--status-info-bg` — in progress / in transit
  - Plus `bg-muted` / `text-muted-foreground` for neutral
- **Forbidden:** `bg-{color}-100 text-{color}-800` patterns and any direct `bg-red-50`, `text-emerald-700`, etc. on chips, badges, and status pills. If you find one in a file you're touching, replace it with the right token.
- **Dark icon tints are OK** for indicator icons that need to stay distinctly identifiable (express ⚡, home delivery, soaking, returns). Use 700-shade Tailwind (`text-red-700`, `text-indigo-700`, etc.) — never -500.
- **Brand colors are dark, saturated.** `BrandBadge` in `apps/workshop/src/components/shared/StageBadge.tsx`: ERTH = `emerald-900`, SAKKBA = `blue-900`, QASS = `zinc-800` (placeholder). Never re-introduce light brand pills.
- **One signal wins color per region.** If a row already has a colored stage badge, the location next to it is plain text — not another colored chip. The user must be able to tell what matters by what's colored, not parse 6 simultaneous colors.

### Shape & layout

- **Single radius: `rounded-md`** for cards, chips, badges, buttons, inputs. The only exception is `rounded-full` for status *dots* (1-2px circles). Never `rounded-xl` / `rounded-2xl` / `rounded-full` on chips.
- **No shadow on cards.** Border only (`border border-border`). Shadows are for popovers/dialogs.
- **No decorative `border-l-2` accent stripes** unless they encode real state (`isDiscarded` = red left-border).
- **Card chrome (background tints, rings) reserved for exceptional states only.** Never tint a card to signal "express" or "alteration" when a badge inside already says so. Acceptable: `opacity-60` for parked, red `border-l-2` for discarded.

### Emoji & decorative elements

- **No emoji in UI.** Replace with lucide icons or plain text. `Express` not `⚡ Express`. Satisfaction levels use stars or text labels, never face emoji.

### Hierarchy by reduction, not addition

When in doubt about how to make something prominent, *reduce* the noise around it instead of bolding/coloring it. A `text-base font-medium` value pops on a page where everything else is muted. The same value gets lost on a page where five other things compete in red+bold+uppercase.

### Shared primitives — reach for these first

Workshop pages should compose from `apps/workshop/src/components/shared/PageShell.tsx` instead of re-writing the same Tailwind strings. The primitives bake the rules in so you don't have to remember them.

| Primitive | Replaces | Use for |
|-----------|----------|---------|
| `PageHeader` | `<h1 className="text-2xl font-bold...">` | Page title + subtitle + action slot |
| `SectionCard` | `<div className="bg-card border border-border rounded-md...">` with header | Bordered content card with optional title bar |
| `SectionLabel` | `<span className="text-xs font-bold uppercase tracking-wider">` | Inline section heading inside lists/forms |
| `StatusBanner` | `<div className="bg-red-50 text-red-800 rounded-md p-3...">` | Inline alert with semantic tone (`ok`/`warn`/`bad`/`info`) |
| `StatsCard` | KPI tiles with semantic accent | Metric tiles on dashboards |
| `EmptyState` | Dashed-border empty placeholder | "No results" panels |
| `LoadingSkeleton` | `<Skeleton>` stacks | List/page loading state |
| `MetadataChip` | `<span>` pills with semantic tone | Small inline metadata pills |

If you're tempted to write `bg-card border border-border rounded-md`, `uppercase tracking-wider`, or `bg-red-50 text-red-800` — there's a primitive for that. If a new layout pattern repeats across 2+ pages, add a primitive instead of duplicating the classes.

### POS app is exempt

These rules apply to `apps/workshop` only. POS keeps Marcellus + Montserrat and its existing visual language — it's customer-facing and the boutique feel is intentional there.

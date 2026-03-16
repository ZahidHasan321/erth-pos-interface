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
- **`packages/database`** — Drizzle ORM schema and scripts. Shared types used by the POS app. PostgreSQL on Supabase.
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

- **Brova:** trip 1 = initial, trip 2-3 = brova returns, trip 4+ = alteration (alt# = trip - 3)
- **Final:** trip 1 = initial, trip 2+ = alteration (alt# = trip - 1). Finals have no trial step.
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

**10. Workshop Re-receives** (workshop receiving page, tabs by trip)
- Brova Returns tab: trip 2-3 brovas
- Alteration In tab: brova trip 4+, final trip 2+
- Resets `piece_stage: waiting_cut` if still `brova_trialed` with feedback

**11. Final Collection** (feedback page, final tab)
- Accepted → `piece_stage: completed`, `fulfillment_type: collected/delivered`
- Rejected → `piece_stage: brova_trialed`, `feedback_status: needs_repair/needs_redo` → goes through alteration cycle

#### Showroom Status Labels (`getShowroomStatus()` in `packages/database/src/utils.ts`)

Determines what shows on the "Orders at Showroom" page. Only orders with garments physically at `location: shop` appear.

| Label | Condition |
|-------|-----------|
| `alteration_in` | Shop item at alteration trip threshold, not accepted |
| `brova_trial` | Brova at shop, not accepted |
| `needs_action` | Garment at shop with `feedback_status: needs_repair/needs_redo` |
| `pickup_waiting_finals` | All shop items done, but finals still in production/transit |
| `ready_for_pickup` | All shop items done, no outstanding finals |

Priority order: alteration_in > brova_trial > needs_action > pickup_waiting_finals > ready_for_pickup.

#### Order-Level Status

- `order_phase: new` → not dispatched yet
- `order_phase: in_progress` → at least one garment beyond pre-dispatch
- `order_phase: completed` → all garments completed
- Order history page shows only `order_phase`. No garment-level detail needed there.

### Environment Variables

- Frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (in `apps/pos-interface/.env`)
- Database: `DATABASE_URL` (postgres connection string), optional `TRANSACTION_URL` (pooler on port 6543)

### Key Documentation

- `MIGRATION_PLAN.md` — Detailed garment stage definitions, transition rules, and SQL migration specs
- `SHOP_FLOW_AND_ARCHITECTURE.md` — POS app workflows and architecture decisions

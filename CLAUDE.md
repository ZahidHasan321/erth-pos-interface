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
- **garments** → individual pieces: `garment_type` (brova=trial/final), `piece_stage` (15-value enum tracking production), `location` (shop/workshop/transit), fabric/style specs
- **garment_feedback** → QC and customer trial records with satisfaction levels and measurement diffs (JSON)
- **measurements** → 30+ body dimension fields per customer
- **customers** → profiles with demographics, phone, addresses
- **fabrics/styles** → inventory and pricing catalogs
- **shelf / order_shelf_items** → pre-made items for sales orders
- **prices** → dynamic key-value pricing lookup

Key enums: `piece_stage` has 15 values (waiting_for_acceptance → completed), `location` tracks physical whereabouts separately from production stage.

### Order Lifecycle

1. **Work Order:** Customer measured → garments created as brova (trial) → dispatched to workshop → production stages → returned to shop → customer trial/feedback → finals produced → collection
2. **Sales Order:** Select shelf items → payment → collection/delivery
3. Order status is **derived from garment stages** — order_phase updates based on constituent garment progress
4. **Finals release rule:** All brovas must be trialed with ≥1 accepted before finals can progress

### Environment Variables

- Frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (in `apps/pos-interface/.env`)
- Database: `DATABASE_URL` (postgres connection string), optional `TRANSACTION_URL` (pooler on port 6543)

### Key Documentation

- `MIGRATION_PLAN.md` — Detailed garment stage definitions, transition rules, and SQL migration specs
- `SHOP_FLOW_AND_ARCHITECTURE.md` — POS app workflows and architecture decisions

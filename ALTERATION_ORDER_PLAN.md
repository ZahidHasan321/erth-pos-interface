# Alteration Order — Implementation Plan

New order type for altering existing garments. Customer-brought outside garments. Mirrors new-work-order at a high level but with sparse measurements/styles, manual total pricing, and a distinct "alteration (out)" workshop track.

## Status

- **Phase 1 — Schema & helpers:** ✅ done (2026-04-25)
- **Phase 2 — POS new-alteration-order page:** ✅ done (2026-04-25)
- **Phase 3 — POS lifecycle integration:** ✅ done (2026-04-25)
- **Phase 4 — Workshop:** ✅ done (2026-04-25)
- **Phase 5 — Cross-cutting UI badge:** ✅ done (2026-04-25)
- **Phase 6 — Verification:** pending (manual E2E)

## Decisions (locked — updated to match implementation)

| Topic | Decision |
|---|---|
| `order_type` enum | `'ALTERATION'` (uppercase, matches `WORK`/`SALES`) |
| `garment_type` enum | `'alteration'` (lowercase, matches `brova`/`final`) |
| Schema | Reuse `orders` + `alteration_orders` extension + `garments` tables |
| Prior-garment link | Optional. Picker on each garment seeds style overrides from prior garment |
| Measurements (changes_only) | Sparse jsonb on garment: `alteration_measurements: {field → number}` |
| Measurements (full set) | FK on garment: `full_measurement_set_id → measurements.id` |
| Per-garment mode toggle | Pill: `changes_only` vs `full_set`. Mixable within one order |
| Style changes | Sparse jsonb on garment: `alteration_styles: {field → value}` |
| Customer master measurements | Master record selector shown for reference. Master-record updates plumbed through API (`master_measurement_id` + `master_measurement_updates`) but UI-side dirty tracking deferred — cashier still uses standalone Measurements page to maintain master |
| `trip_number` | Starts at 0 (consistent with work orders); becomes 1 on first dispatch |
| Pricing | Manual total entry by cashier. No per-garment price |
| Home delivery | Single switch on order. Applies to all garments |
| Draft step | None. Single submit creates order |
| `order_phase` | Reuse `new` / `in_progress` / `completed` |
| Submit path | Inline TS sequence in `api/alteration-orders.ts` (no `save_alteration_order` RPC). Order, alteration_orders extension, and garments inserted in series; orphan-cleanup on failure |
| Workshop receiving | "Alterations" tab gets new subsection "Alteration Orders (Out)" alongside "Work Order Alterations" |
| Stage routing | Workshop manually moves to whichever `piece_stage` needed; no required-stages array |
| Shop receiving | Garment → `ready_for_pickup`, `location: shop` |
| Trial | Optional, like brova. Cashier triggers if needed |
| Reject path | Back to workshop, `trip_number += 1` |
| Showroom label | Reuse `ready_for_pickup` |
| Production tracker | Show alteration orders, badge `Alteration` |
| Campaign | Not supported |

### Notable deviations from initial plan

1. `order_type` kept uppercase (`ALTERATION`) — already in DB; would have churned to rename.
2. Existing `alteration_issues` jsonb (legacy SVG overlay UX) deprecated, not dropped — older rows preserved for back-compat.
3. No `save_alteration_order` RPC. Inline TS sequence is enough; saves complexity. Failure cleanup deletes the parent `orders` row, which cascades.
4. Customer master measurement edits on submit deferred. Cashier edits master via existing Measurements page.

## Phase 1 — Schema & helpers ✅

### `packages/database/src/schema.ts`
- Added `'alteration'` to `garment_type` enum.
- Added on `garments`:
  - `original_garment_id uuid REFERENCES garments(id) ON DELETE SET NULL` — optional link to prior garment.
  - `full_measurement_set_id uuid REFERENCES measurements(id)` — FK when full_set mode chosen.
  - `alteration_styles jsonb` — sparse style overrides for changes_only mode.
- Existing `alteration_measurements jsonb`, `alteration_issues jsonb`, `custom_price`, `bufi_ext` retained. `alteration_issues` deprecated.

### Migration
`supabase/migrations/20260425120000_alteration_orders_phase1.sql` — adds enum value + 3 columns, idempotent.

### `packages/database/src/utils.ts`
- Added `isAlterationOrder(orderType)` — returns true for `'ALTERATION'`.
- `isAlteration(tripNumber, garmentType)` and `getAlterationNumber(...)` left unchanged. Their semantics still apply to alteration orders (trip 2+ = labelled alteration). New "alt_out_N" labelling deferred to Phase 4 when production-tracker UI lands — most callers today only need the boolean.

## Phase 2 — POS: new-alteration-order page ✅

Single-file route at `apps/pos-interface/src/routes/$main/orders/new-alteration-order.tsx` (mirrors new-work-order's single-file pattern). Replaced the previous SVG-overlay + checkbox-matrix UX entirely.

### Sections (in-memory state, no draft, single submit)
1. Customer search (top, reuses `SearchCustomer`).
2. Customer demographics (reuses `CustomerDemographicsForm` — proceed button is purely visual; submit happens at the bottom).
3. Order details (received date, manual total, comments, home-delivery switch).
4. Master measurement record (informational picker — used to seed full-set option and show baseline values for changes-only fields).
5. Garments (tabbed list). Each garment editor has:
   - Mode pill: `changes_only` vs `full_set`.
   - `changes_only` → sparse measurement number-fields + sparse style fields. Master values shown as placeholder.
   - `full_set` → measurement-record dropdown (sets `full_measurement_set_id`).
   - Optional "Link prior garment" picker → loads style overrides from a prior garment's resolved style fields.
   - BU/F/External pill, requested delivery date, per-garment notes.
6. Sticky action bar with "Confirm Order".

### Submit
Inline sequence in `createAlterationOrder` (`apps/pos-interface/src/api/alteration-orders.ts`):
1. Allocate invoice via `next_alteration_invoice` RPC.
2. Insert `orders` (`order_type='ALTERATION'`, `checkout_status='confirmed'`).
3. Insert `alteration_orders` extension. Cleanup on failure.
4. Insert `garments` rows (`garment_type='alteration'`, `piece_stage='waiting_cut'`, `location='shop'`, `trip_number=0`).
5. Optionally update master `measurements` row (currently always null from UI — wired through API for future use).

### Files added/changed
- `apps/pos-interface/src/components/forms/alteration/alteration-form.schema.ts` (new)
- `apps/pos-interface/src/components/forms/alteration/alteration-fields.ts` (new)
- `apps/pos-interface/src/components/forms/alteration/alteration-garment-form.tsx` (new)
- `apps/pos-interface/src/api/alteration-orders.ts` (rewritten — sparse fields + master measurement update support)
- `apps/pos-interface/src/hooks/useAlterationOrderMutations.ts` (refactored payload, master-measurement cache invalidation)
- `apps/pos-interface/src/routes/$main/orders/new-alteration-order.tsx` (rewritten as multi-section page)
- `packages/database/src/schema.ts` (enum + 3 columns)
- `packages/database/src/utils.ts` (`isAlterationOrder`)
- `supabase/migrations/20260425120000_alteration_orders_phase1.sql` (new)

### Deprecated (kept for back-compat, not written by new flow)
- `apps/pos-interface/src/components/alteration/{svg-form-overlay,alteration-checkbox-matrix,…}` — used by legacy SVG-overlay UX, no longer referenced from the new route. Safe to delete in a future cleanup pass.
- `garments.alteration_issues` jsonb column.

## Phase 3 — POS: lifecycle integration ✅

### Order history (`order-history.tsx`)
- `TypeBadge` now renders `ALTER` (purple) for `ALTERATION` orders.
- `OrderCard` derives `isGarmentOrder = isWorkOrder || isAlterationOrder`. Delivery date, home-delivery badge, item count, financial breakdown and the side gradient bar all use the garment-order gate so alteration rows look like work rows. Discount badge stays work-only (alteration has no discount UX). Route maps to `/$main/orders/new-alteration-order`.

### Dispatch + Receiving APIs (`api/orders.ts`)
- `flattenOrder` now also folds `alterationOrder` joined-relation fields into the order row (so callers can read `invoice_number`, `order_phase`, etc., uniformly).
- `getOrdersForDispatch`, `getDispatchedOrders`, `getInTransitToWorkshopOrders` switched the `work_orders` inner-join to a left-join, added `alterationOrder:alteration_orders!order_id(*)`, and broadened the type filter to `in('order_type', ['WORK', 'ALTERATION'])`.

### Dispatch UI (`dispatch-order.tsx`)
- Added `alterationCount` and a purple "Alteration" / "A" badge alongside Brova/Final counts on desktop and mobile cards.
- Per-garment chip styling adds an `alteration → purple` branch wherever the brova/final ternary lived (header chip, expanded grid, dispatch history rows).
- Trip-based "Alt N" badge now also fires for alteration garments at trip ≥ 2 (`alt_N = trip - 1`, mirroring finals).

### Receiving UI (`receiving-brova-final.tsx`)
- Receive mutation already routed non-brova garments to `ready_for_pickup`, so alteration garments work without code change there.
- Added alteration count badge and purple chip styling to match dispatch.
- Order detail link routes alteration orders back to `new-alteration-order`.

### Feedback page (`feedback.$orderId.tsx`)
- Tab badge label now reads "Alteration" (in addition to "Alt N", "Brova", "Final").
- Header type chip shows a purple "Alteration" badge for alteration garments.
- Submit branch: alteration garments take the same path as finals **except** `needs_redo` skips the `discarded` branch — alteration redo goes to `brova_trialed` + `needs_redo`, then the existing send-back path bumps `trip_number`. We never discard customer-owned property.
- `accepted` branch reads `home_delivery` from the garment for alteration orders (work orders carry it on the order row).
- Balance toast on accept now also fires for alteration accepts.

### Showroom RPC (`get_showroom_orders_page`)
Migration: `supabase/migrations/20260425130000_alteration_orders_phase3_showroom.sql` (mirrored in `triggers.sql`).
- `INNER JOIN work_orders` → `LEFT JOIN`, plus `LEFT JOIN alteration_orders ao` and a lateral derived `alt_meta` that pulls `MIN(delivery_date)` and `bool_or(home_delivery)` from garments (alteration_orders has no order-level dates).
- `COALESCE(wo.invoice_number, ao.invoice_number)`, `COALESCE(wo.delivery_date, alt_meta.delivery_date)`, `COALESCE(wo.home_delivery, alt_meta.home_delivery)`, `COALESCE(wo.order_phase::text, ao.order_phase::text)`.
- Filter: `o.order_type::text IN ('WORK', 'ALTERATION')` and the order-phase filter coalesced across both extension tables.
- `is_alteration` predicate adds `(garment_type='alteration' AND trip>=2)`.
- `shop_item_done` predicate now treats `garment_type IN ('final', 'alteration') AND piece_stage='ready_for_pickup'` as "done".

### `getShowroomStatus` client helper (`utils.ts`)
- `allShopItemsDone` accepts alteration garments at `ready_for_pickup` (parity with finals and the RPC).

### Send-back / Alterations page (`alterations.tsx`)
- Query joins both `work_orders` and `alteration_orders` and falls back to `ao.invoice_number` so alteration-order garments show their invoice when they're returned with `needs_repair`/`needs_redo`.
- New "Alteration Out" badge for `garment_type='alteration'` rows.

### Notes
- Customer-detail route for alteration orders (`new-alteration-order` with `?orderId=…`) does not yet load existing data — order history rows still link there for navigation, but the page opens blank. Out of Phase 3 scope; track separately if needed.
- Sidebar entry already exists.

## Phase 4 — Workshop ✅

### Receiving (`apps/workshop/src/routes/(main)/receiving.tsx`)
- Pre-existing "Alterations" section renamed to "Work Order Alterations". Filter restricted to `garment_type !== 'alteration'` so trip 2+ brovas/finals still land here.
- New "Alteration Orders (Out)" section filters by `garment_type === 'alteration'` and shows an amber `Alteration Out` badge plus optional `Alt N` for trip 2+ rework. Receive / Receive & Start / Lost behave the same as the existing alterations section.
- Sections live alongside Express / Brova / Finals on the same scrollable page (the page is sectioned, not tabbed).

### Scheduler / production terminals
- Workshop manually moves the garment to whichever `piece_stage` it needs (e.g. straight to `sewing`). No scheduler-side gating added.
- `ProductionTerminal` now classifies alteration garments into the existing "alterations" section via `isAlterationRow` and renders the new label below.

### Production tracker (`assigned/index.tsx`)
- `get_assigned_orders_page` and `get_assigned_overview` RPCs both rewritten: `INNER JOIN work_orders` → `LEFT JOIN`, plus `LEFT JOIN alteration_orders`. `invoice_number`, `delivery_date`, `home_delivery`, and `order_phase` coalesced across both extension tables. Filter expanded to `o.order_type IN ('WORK','ALTERATION')`.
- `assigned_order_agg` view gains `has_alteration` / `alteration_count` / `any_home_delivery` (alteration orders carry `home_delivery` per-garment, uniformly).
- `assigned_order_status_label` signature gains `p_has_alteration`. New label `Alteration in production` covers the alteration-only fallback.
- `AssignedOrderRow` carries `order_type`, `has_alteration`, `alteration_count`. `AssignedOrderCard` shows an amber `Alteration` chip in `OrderIndicators`. `GarmentBreakdown` renders an `A` letter for `garment_type='alteration'` summaries.
- Migration: `supabase/migrations/20260425140000_alteration_orders_phase4_assigned.sql` (mirrored in `triggers.sql`).

### Alt label helper (`packages/database/src/utils.ts`)
- New `getGarmentAltLabel(garment)` returns:
  - `alt_p` on QC-fail this trip.
  - `alt_out_N` (trip ≥ 2) or `alt_out` (trip 1) for `garment_type='alteration'`.
  - `alt_N` (trip ≥ 2) or null for everything else.
- `ProductionTerminal` swapped its local `getAltLabel` for the new helper.

### Dispatch (workshop → shop)
Same flow. No changes.

## Phase 5 — Cross-cutting UI ✅

- New `packages/ui/src/order-type-badge.tsx` exports `OrderTypeBadge` — single style for `WORK` / `SALES` / `ALTERATION` (purple for alteration). `text-[10px]`, rounded, uppercase, `font-black`. Accepts `className` for layout tweaks (e.g. `ml-0.5`).
- POS order history (`order-history.tsx`): `TypeBadge` reduced to a one-line wrapper around `OrderTypeBadge`. Same visual output.
- Workshop production tracker (`assigned/index.tsx`): replaced the bespoke amber + Scissors chip in `OrderIndicators` with `<OrderTypeBadge type="ALTERATION" />`. Workshop and POS now share the purple alteration colour. Dropped the unused `Scissors` import.
- Dispatch / receiving "Alteration" garment-count chips left as-is — those are garment-type counts, not order-type, and the surrounding brova/final chips already share their styling.

## Phase 6 — Verification

End-to-end manual test:
1. Create alteration order with mix of `changes_only` + `full_set` garments.
2. Optional prior-garment link → confirm style overrides copy.
3. Dispatch → workshop receives in new subsection.
4. Workshop moves garment to e.g. `sewing` → `ironing` → `ready_for_dispatch`.
5. Dispatch back → shop receives → `ready_for_pickup`.
6. Trigger optional trial → reject → trip+1 cycle works.
7. Accept → `completed`.

Verify:
- `isAlterationOrder` is true for the order.
- Showroom + workshop tracker badges + labels.

## Open items (future)

1. Master measurement dirty-tracking on form submit. API already supports it; UI deferred.
2. PDF print for alteration order (old SVG-overlay PDF deprecated — needs replacement).
3. Production-terminal label `alt_out_N` for alteration orders (Phase 4).
4. Cleanup pass: delete deprecated `apps/pos-interface/src/components/alteration/` files and the `alteration_issues` jsonb column once no rows remain.
5. ~~Alteration-order detail view: `new-alteration-order.tsx` does not yet hydrate from `?orderId=…`.~~ ✅ done — page now hydrates from `?orderId=…` in read-only view mode (fieldset-disabled regions, hidden Confirm/Add/Remove buttons, Back-to-history button, invoice + phase header). Edits to existing alteration orders still go through dedicated paths (feedback, dispatch, receiving). API customer select expanded to `customer:customers(*)` for full demographics hydration.
6. Feedback page records alteration garment outcomes with `feedback_type='final_collection'`. Consider adding `'alteration_collection'` once analytics needs it.

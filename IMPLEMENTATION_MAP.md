# Implementation map (NON-AUTHORITATIVE — may drift)

> Extracted from `CLAUDE.md`. Navigation aid only — where code lives, not what it must do. If anything here disagrees with the `CLAUDE.md` spec (§1–§7), **the spec wins and this is stale.** Never cite this as the source of a test's expected value.

- **Schema & types:** `packages/database/src/schema.ts`, `.../utils.ts` (`isAlteration`, `getAlterationNumber`, `evaluateBrovaFeedback`, `getShowroomStatus`).
- **Lifecycle RPCs/triggers:** `packages/database/src/triggers.sql` — `save_work_order_garments`, `complete_work_order`, `record_payment_transaction`, `toggle_home_delivery`, `collect_garments`, `dispatch_order`, `receive_garments`, `dispatch_garments_to_shop`, `release_finals`, `create_replacement_garment`, `create_complete_sales_order`, `recompute_order_phase`, `open`/`close`/`reopen_register`, `can_access_brand`, the `stock_movements` triggers.
- **Spec-as-oracle suite:** `packages/database/src/__tests__/workflow*.test.ts` + driver/fixtures in `packages/database/scripts/lifecycle/`; config `vitest.workflow.config.ts`.
- **Shop:** `apps/pos-interface/src` — `api/`, `hooks/`, `routes/` (`$main/`, `cashier/`), `components/forms|order-management|orders-at-showroom|cashier`, `context/auth.tsx`, `lib/constants.ts` (`BRANDS_WITH_CASHIER`, `brandUsesCashier`), `index.css`.
- **Workshop:** `apps/workshop/src` — `routes/(main)/assigned` (order labels), `components/shared/PageShell.tsx` + `StageBadge.tsx`, `lib/production-logic.ts`, `lib/qc-spec.ts`, `lib/utils.ts` (date helpers), `index.css` (typography role table).

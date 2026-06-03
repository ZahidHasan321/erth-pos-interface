# CLAUDE.md

The **verbatim specification** of this product's features and workflows, plus the codebase working rules. Single source of truth: code implements it, it does not define it.

---

## 0. How to use this file (governance — read first)

1. **This file is the spec.** Every feature, branch, and edge case lives here in plain language. Behavior not described here isn't specified — surface the gap, don't infer it from code.
2. **Spec-as-oracle.** The lifecycle test suite encodes *this file*. Test vs. code disagree → the code is the bug. This file vs. code disagree → this file wins (fix the code; or if the rule itself is wrong, change this file deliberately first, then the code). A test's expected value comes from this file or a universal invariant (accounting identity, idempotency property) — never copied from an RPC/trigger body. A test derived from the implementation is green by construction and catches nothing.
3. **Change protocol.** A new edge case → add it here, then match code + tests. A workflow/feature change → edit this file first (the now-disagreeing tests reveal the blast radius), then the code. Change this file only deliberately; never bend it to match what the code happens to do.
4. **Code-decoupled.** §1–§6 describe *what* and *why* — no file paths or line numbers. Code locations live only in `IMPLEMENTATION_MAP.md` (§10), which is non-authoritative and may drift. If it disagrees with the spec, the spec wins.

---

## 1. Domain & architecture

**Domain:** Dishdasha (traditional garment) production & POS for the Autolinium/ERTH brand. Two order types: **WORK** (custom tailoring — measured, cut, sewn) and **SALES** (pre-made shelf items).

**Mental model: the system thinks in _garments, not orders_.** An order is a container; each garment row tracks one physical piece through production independently. Most lifecycle rules are per-garment; the order's state is derived from its garments.

**Core entities:**

- **order** — container. `order_type` WORK/SALES, `checkout_status` draft/confirmed/cancelled, `brand` (ERTH/SAKKBA/QASS), payment totals.
- **work_order** — WORK extension: `order_phase` new/in_progress/completed, delivery dates, campaign.
- **garment** — one physical piece (tracking fields §2.1).
- **garment_feedback** — QC + customer-trial records (satisfaction, measurement diffs).
- **measurements** — body dimensions per customer.
- **customer** — profile, phone, addresses.
- **fabrics / styles** — inventory + pricing catalogs.
- **shelf / order_shelf_items** — pre-made items for SALES orders.
- **prices** — dynamic key/value pricing lookup.
- **payment_transactions** — append-only money log; a trigger sums it into `orders.paid`.
- **register_sessions / register_close_events** — cashier register open/close + append-only close audit.
- **stock_movements** — append-only inventory ledger (§4).

**Two apps, one database:**

- **Shop** (`apps/pos-interface`) — order creation, garment tracking, customer mgmt, cashier, printing (§5).
- **Workshop** (`apps/workshop`) — production scheduling, terminals, dispatch, resources (§6).
- Frontend never touches the DB directly — all writes go through RPCs/triggers so lifecycle rules are enforced server-side.

---

## 2. The garment lifecycle (the heart of the system)

### 2.1 Garment tracking fields

| Field | Meaning |
|-------|---------|
| `piece_stage` | Where the piece is in production/lifecycle (enum, §2.2) |
| `feedback_status` | Trial/collection outcome: `accepted` / `needs_repair` / `needs_redo` / `null` |
| `acceptance_status` | `true` = design approved (parked finals may proceed). Distinct from `piece_stage` |
| `location` | Physical place: `shop` / `workshop` / `transit_to_shop` / `transit_to_workshop` |
| `trip_number` | `0` on a fresh garment (pre-dispatch). +1 each time the garment is sent back to the workshop. Dispatch from shop only picks `trip_number = 0`; alteration thresholds treat a missing value as `1` |
| `garment_type` | `brova` (trial garment), `final`, or `alteration` (customer-brought; `order_type: ALTERATION`; never auto-discarded) |
| `trip_history` | Per-trip record incl. `qc_attempts` (QC pass/fail breadcrumb) |

### 2.2 Piece-stage set

```
waiting_for_acceptance → waiting_cut → soaking → cutting → post_cutting →
sewing → finishing → ironing → quality_check → ready_for_dispatch →
awaiting_trial / ready_for_pickup → brova_trialed → completed
```

- **Terminal:** `completed` and `discarded`.
- `discarded` is a dead end (Reject-Redo, or final Needs-Redo on a non-alteration garment); a brand-new replacement row is created instead (§2.5).
- `soaking` is a **parallel track**, not a chain step.
- `post_cutting` exists in the set but is **currently disabled** in the production chain.

### 2.3 Alteration thresholds (trip number)

- **Brova & final, unified:** trip 1 = initial; trip 2+ = alteration (alteration # = trip − 1). Finals have no trial step; a brova returning at trip 2+ is also treated as an alteration.
- **QC-fail rework:** **no trip increment** — detected via a `result: "fail"` entry in the current trip's `qc_attempts`. Labeled `alt_p`, which **wins over** the trip-based `alt_N` label.
- **No maximum** trip / alteration / QC-attempt count — unbounded by design.

### 2.4 Step-by-step flow

**1. Order created** (Shop, order-taker). Three phases:
- **A — Create:** customer selected → `checkout_status: draft`, `order_phase: new`.
- **B — Save garments:** created `piece_stage: waiting_cut`, `location: shop`, `trip_number: 0`, `garment_type: brova|final`. **Brova-parking rule:** if the order has ANY brova, ALL finals flip `waiting_cut → waiting_for_acceptance` (parked until a brova is accepted).
- **C — Confirm:** `checkout_status: confirmed`, invoice # generated, shelf/fabric stock decremented. `order_phase` stays `new`. Idempotent on its key (a lost-response retry must not double-decrement stock or double-issue an invoice).

**2. Cashier payment** — see §3.

**3. Dispatch to workshop** — all fresh garments (`trip_number = 0`) → `location: transit_to_workshop`, `trip_number → 1`; order → `order_phase: in_progress`. Parked finals are dispatched alongside brovas but stay parked.

**4. Workshop receives** — garments → `location: workshop`. "Receive" parks (`in_production: false`); "Receive & Start" schedules (`in_production: true`). Parked finals (`waiting_for_acceptance`) and accepted brovas **never** get `in_production: true`.

**5. Workshop production** — scheduler assigns date + plan; garment advances `waiting_cut → cutting → sewing → finishing → ironing → quality_check → ready_for_dispatch`. `soaking` parallel; `post_cutting` disabled.

**6. Workshop dispatches to shop** — `location: transit_to_shop`, `in_production: false`, `feedback_status: null` (cleared).

- **Accept-with-Fix stranded-finals confirmation (workshop dispatch only; UI-only).** An Accept-with-Fix brova must travel back *with* its order's finals. When a dispatch batch includes an Accept-with-Fix brova (a `brova` back at the workshop, `ready_for_dispatch`, `acceptance_status: true` — the durable marker; plain-Accept never returns and Reject-Repair has `acceptance_status: false`, so neither triggers this) **and** the same order has ≥1 **final** still in production at the workshop not in this batch (`location: workshop`/`transit_to_workshop`, `piece_stage NOT IN (ready_for_dispatch, completed, discarded)`), show a blocking confirm: the finals aren't ready — send the brova without them? Confirm dispatches as selected; cancel aborts. No lifecycle/RPC state changes. Outside this exact pairing there is no dispatch confirmation.

**7. Shop receives** — brovas → `piece_stage: awaiting_trial`; finals → `piece_stage: ready_for_pickup`; both `location: shop`.

**8. Brova trial → finals release → collection** — all outcomes in §2.5.

### 2.5 Branch tree — every outcome

**Brova trial:**

| Action | piece_stage | feedback_status | acceptance_status | Finals | Back to workshop? |
|--------|-------------|-----------------|-------------------|--------|-------------------|
| Accept | `brova_trialed` | `accepted` | `true` | released | No |
| Accept with Fix | `brova_trialed` | `needs_repair` | `true` | released | Yes (trip+1, later) |
| Reject – Repair | `brova_trialed` | `needs_repair` | `false` | stay parked | Yes (trip+1) |
| Reject – Redo | **`discarded`** (terminal) | `needs_redo` | `false` | stay parked | No — replacement row |

- **Finals-release gate:** ANY one brova with `acceptance_status: true` releases ALL parked finals. Mixed outcomes (B1 accept, B2 reject) → finals still released; B2 reworked in parallel.
- **Reject-Redo:** original `discarded` permanently. The workshop creates an FK-linked replacement row inheriting specs, starting fresh at `trip 1 / waiting_cut` (workshop-initiated today; showroom-initiation is a deferred change). Replacements can themselves be redone → unbounded chain (accepted).
  - **Replacement fabric is auto-consumed from stock** (no longer manual) — a fresh cut of the spec's `fabric_length` is decremented at redo-creation, same side/guard as order confirmation.
  - **The discarded original's already-cut fabric is recorded as material waste**, classified by `root_cause` (§2.9), at the redo-creation step. It does **not** return to stock — it's a net-zero waste annotation on the ledger (§4), surfaced in the waste report.
  - **`root_cause` is captured at the workshop redo-creation step** (required picker) on the discarded original — the single attribution point for both the scrap and Q14 performance.
  - **Customer-brought fabric (`fabric_source: OUT`)** is never consumed or wasted from our stock; the replacement is flagged "customer must provide fabric" and **parked pending the customer**.
  - **Replacement material unavailable** (owning side's stock < required length) → the replacement is **parked pending a manager decision** (reorder / substitute / consult / refund), not hard-failed; the waste annotation is still recorded (the scrap is a fact at discard).

**Finals release** (manual "Start Production"): parked finals `waiting_for_acceptance → waiting_cut`, then normal production. **Stuck state (accepted):** if ALL brovas were rejected (none ever accepted) and a brova still exists to act on, finals park indefinitely — manual intervention only, no timeout. (Contrast the §2.6 orphaned-finals edge: the only brova is gone, so finals must release.)

**Final collection:**

| Outcome | piece_stage | fulfillment_type | Next |
|---------|-------------|------------------|------|
| Accept – collected | `completed` | `collected` | Terminal |
| Accept – delivered (home delivery) | `completed` | `delivered` | Terminal |
| Needs Repair | `brova_trialed` | — | Alteration cycle (trip+1) |
| Needs Redo (non-alteration) | `discarded` | — | Replacement row — same fabric-auto-consume / material-waste / `root_cause`-capture / OUT-parking / material-unavailable rules as Reject-Redo above |
| Needs Redo (alteration-type order) | NOT discarded | `needs_redo` | Same row loops back (customer property never discarded) |

**Sending garments back** (Shop "Return to Workshop"): `piece_stage: waiting_cut`, `location: transit_to_workshop`, `trip_number += 1`, `in_production: false`, production fields cleared. No max trip.

**Workshop re-receives** (Alterations section, trip ≥ 2): one section covers every returning garment (brova/final trip 2+) and QC-fail rework regardless of trip. No brova-approval gate. Resets `piece_stage: waiting_cut` if still `brova_trialed` with feedback.

**QC fail:** **no trip increment.** Garment bounced to the earliest failed rework stage; a breadcrumb routes it back to QC; the attempt is logged in the trip's `qc_attempts`. Labeled `alt_p`. No max-attempt cap.

**Feedback updates the target spec, not just the verdict.** A feedback submission (brova trial or final collection) carries optional measurement deltas (each reason-tagged) and style/option changes, applied to the garment's spec at submit time — so every downstream path inherits them: the row that loops back on repair, the cloned Reject-Redo replacement, and parked finals on release.

- **Measurement reason gates propagation.** `customer_request` writes a new measurement row and repoints `measurement_id`; `workshop_error` / `shop_error` are audit-only (the spec was right, the executor erred — target unchanged). These map to the §2.9 taxonomy: `customer_request`≡`customer_change`, `shop_error`≡`showroom_error`, `workshop_error`≡`production_error`.
- **Brova feedback fans out to siblings.** Style/measurement changes from a brova's feedback also apply to every sibling garment sharing that brova's `style_id` / `measurement_id` (unless scoped to "this garment only") — this lets parked finals inherit the brova's trial adjustments on release.

### 2.6 Cancellation / refund

Per-component (fabric/stitching/style/express/soaking) or shelf-qty refund, taken by the cashier. Records a `refund` payment_transaction (reason required); `orders.paid` drops via the summing trigger. Order stays `confirmed`. Affected garments get `refunded_*` flags. A **full garment refund → `piece_stage: discarded`**, offering optional fabric-restock (return uncut fabric to shop stock, default off). A **full-order cancel** sets `checkout_status: cancelled` — garments NOT auto-discarded (in-progress workshop work may continue/orphan — accepted).

**Edge rules:**

- **Capped amount.** A refund may not drive `orders.paid` below 0; without selected items it's capped at the overpayment; with items, at the selected items' total + overpayment.
- **Post-hand-over exception.** A full refund of an already-`completed` (handed-over) garment refunds money + sets `refunded_*` flags but the garment **stays `completed`** (you can't un-deliver it), and **fabric-restock does not apply** even if requested. Discard applies only when `piece_stage NOT IN (discarded, completed)`.
- **Refund-discard side-effects.** Also sets `in_production: false`, clears `start_time`, `feedback_status`, `acceptance_status`. `location` is left as-is — a garment refund-discarded while `transit_*` keeps its transit location and is silently dropped at the receiving step (documented, not auto-fixed).
- **Per-garment isolation.** A refund on one garment never mutates a sibling's stage or `refunded_*` flags.
- **Idempotent** on the idempotency key.
- **Orphaned-finals rule.** Refund-discarding the **last remaining brova** releases its parked finals (`waiting_for_acceptance → waiting_cut`). Distinct from the "all brovas rejected → park indefinitely" case: there a brova still exists to act on; here the only brova is gone, so the finals have no release path. Refund/discard never auto-creates a replacement — that's the workshop's manual Reject-Redo only.

### 2.7 Order-level phase

- `new` → not dispatched yet.
- `in_progress` → at least one garment past pre-dispatch.
- `completed` → ALL garments terminal (`piece_stage ∈ {completed, discarded}`). `discarded` does NOT block completion (9 completed + 1 discarded ⇒ order completed). Partial pickup supported (individual garments completed via feedback).
- A cancelled order whose workshop garments keep progressing is the accepted orphan case (§2.6).
- The order-history view shows only `order_phase` — no garment detail.

### 2.8 Status-label derivations

**Showroom labels** (Shop "Orders at Showroom"). Garment-state-driven. Shows orders with garments at shop, OR finals in transit (even with no shop items yet).

| Label | Condition | Staff action |
|-------|-----------|--------------|
| `alteration_in` | Alteration garment at shop needing trial/action (trip 2+ `awaiting_trial`, or `needs_repair`/`needs_redo` at alteration threshold) | Trial returning alteration |
| `alteration_out` | Alteration-type order (`order_type: ALTERATION`) — single label | Handle customer-brought alteration |
| `brova_trial` | Brova at shop, `piece_stage: awaiting_trial` | Customer tries brovas |
| `needs_action` | Any garment at shop with `feedback_status: needs_repair/needs_redo` | Send rejected garment back |
| `ready_for_pickup` | Everything else visible (incl. partial: some at shop, others out) | Customer collects ready items |

**Priority:** `alteration_in` > `brova_trial` > `needs_action` > `ready_for_pickup` (action-first). `partial_ready`/`awaiting_finals` were collapsed into `ready_for_pickup` (the list shows an x/y received count).

Worked scenarios: B1 accepted + B2 rejected → `needs_action`. B1 accepted, finals not here → `ready_for_pickup`. Finals ready, one brova still repairing → `ready_for_pickup`. 4 collected, 1 needs fix → `needs_action`. Returning final (trip 2+) clean → `ready_for_pickup`. Returning final rejected again → `alteration_in`. No shop items but finals in transit → `ready_for_pickup`.

**Workshop labels** (order-level, Production Tracker). Brova returns/alterations also tracked as individual garments in their own tabs.

| Status | Condition |
|--------|-----------|
| At shop | All garments at shop |
| Ready for dispatch | All workshop garments at `ready_for_dispatch` |
| In transit to shop | Garments in transit, nothing active at workshop (or only parked finals) |
| Brovas in transit | Brovas in transit to shop, only parked finals remain |
| Awaiting finals release | Brovas at shop + ≥1 accepted, finals still parked |
| Awaiting brova trial | Brovas at shop + none accepted yet, finals parked |
| Finals waiting on replacement brova | Finals parked at `waiting_for_acceptance` while a `discarded` brova's replacement brova is still in flight (`replaced_by_garment_id` set, replacement `piece_stage NOT IN (completed, discarded)`). **Flag-only** — finals correctly stay parked; the replacement brova will release them on acceptance. Distinct from the §2.6 last-brova-refund-discarded **auto-release** (there the only brova is gone, so finals must release; here a replacement brova exists, so they stay parked). |
| Finals in production | Finals actively worked (not `waiting_for_acceptance`) |
| Brovas in production | Brovas being worked |

**Priority:** at shop > ready for dispatch > in transit > awaiting finals release/brova trial > finals waiting on replacement brova > finals in production > brovas in production > fallback "In production". If a brova is returning AND finals are in production → "Finals in production" wins (main order work).

### 2.9 Root-cause taxonomy (shared attribution vocabulary)

A single canonical **"who is responsible / why did this happen"** vocabulary, shared by everything that attributes a quality event: redo + scrap recording (§2.5), redo material waste (§4), the repeated-returns investigation workflow (§6), performance attribution (§6). No feature redefines the set.

The enum (`root_cause`); each value carries a **responsible party** that is a deterministic *derivation* of the value, not a separately stored field (this is what performance impact keys off):

| `root_cause` | Responsible party | When it applies |
|--------------|-------------------|-----------------|
| `production_error` | production team | cutting / sewing / finishing / ironing / execution-measurement error |
| `qc_escape` | QC | a technical defect QC passed that should have failed |
| `showroom_error` | showroom | wrong measurement taken, wrong option entered, bad briefing |
| `customer_change` | customer | change of mind / expectation mismatch (no internal fault) |
| `material_defect` | supplier | supplier / material quality |
| `other` | — (unattributed) | anything else; free-text note required |

**Three distinct axes, never collapsed:**

- **Measurement-reason gates (§2.5)** = the measurement-scoped view of this taxonomy: `customer_request`≡`customer_change`, `shop_error`≡`showroom_error`, `workshop_error`≡`production_error`. Keep the shop-**recorded** (`showroom_error`) vs workshop-**executed** (`production_error`) split — don't collapse measurement into one bucket.
- **Waste physical-reason categories (§4 `WASTE_REASONS`: `supplier_defect` / `staff_mistake` / `customer_damage` / `lost` / `mis_cut` / `other`)** are a separate axis — "what physically happened to the stock," not "who is responsible." A redo's wasted fabric can carry **both** a `WASTE_REASONS` reason and a `root_cause`. Damage/Waste keeps `WASTE_REASONS`; this taxonomy does not replace it.

**Persistence.** The DB enum `root_cause` is the single source of truth (mirrored in `schema.ts`); the value→responsible-party mapping lives in exactly one SQL helper (`root_cause_responsible_party`). The frontend label set (`ROOT_CAUSES`) imports these six values — no group invents its own.

---

## 3. Cashier, payments & EOD

- **Cashier split.** A separate role-locked shell (single brand; tabs Cashier / Order History / End-of-Day). Order-taker confirms with `paid: 0` → order enters the cashier queue (`confirmed` AND `paid: 0`). Payment is recorded as a `payment_transaction` (NOT via the confirm RPC); a trigger sums transactions → `orders.paid`. Partial/installment supported. Idempotent on its key.
- **Pickup is ungated on payment** (intentional). The cashier may hand over/deliver with a balance outstanding — staff judgment, not gated on feedback completion or finals-ready state.
- **EOD / register close.** Reconciles cash basis (collected/refunded/net) vs accrual (orders booked) + cash-movement log + per-cashier, then freezes the day.
  - **Who:** the **cashier opens AND closes** their own session (close needs only an active user). **Reopening a frozen/closed day is manager-only** — the sole manager gate in EOD. (EOD close must not wait on a manager; altering a frozen day must.)
  - **Reconciliation:** `expected_cash = opening_float + cash_payments − cash_refunds + cash_in − cash_out`; `variance = counted_cash − expected_cash` (negative = shortage). This is the universal cash-drawer identity (drawer = float + received − paid out) — that identity, not any SQL, is the oracle.
  - **Per-session attribution:** a cash payment/refund recorded while a session is open is stamped to it and counts toward THAT session's reconciliation on close.
  - **Idempotent close:** a replayed close (same key) returns the original summary and writes NO additional audit event.
  - **Append-only history:** every close writes a `register_close_events` row (never overwritten); the session row keeps only the latest close. Reopen + re-close ⇒ one additional event.
  - **Frozen day rejects money:** with no open session for the brand, payment recording is rejected.
- **Brand gate.** Which brands use the cashier flow is a single source of truth (a brand set + a case-normalizing helper; currently ERTH only). It drives inline-payment-vs-cashier-queue routing, the `/cashier` route guard, and sidebar visibility. Enabling a brand = a one-line set addition; brands not in the set take payment inline at order-taking.

---

## 4. Inventory & transfers

The store/inventory area is **4 surfaces per app**: Inventory, Transfers, Stocktake, Reports (Shop also keeps End-of-Day as a separate financial page).

**Two stocks, each side blind to the other.** Every fabric/shelf/accessory carries a **shop stock** and a **workshop stock**, counted independently and never summed. **Each app shows only its own side's count** — everywhere (lists, item detail pages, transfer screens). Stock crosses sides only via a recorded transfer.

**Ownership — who creates what.**
- The **shop** buys and creates **fabrics** and **shelf items**. Fabric also carries a **season** (`summer`/`winter`, optional) shown on the item, so staff can eyeball a season's stock and bulk-send it.
- The **workshop** owns only **accessories** (devices, equipment, sewing supplies — its operating stock).
- A side may **restock/adjust** stock it physically holds, but only the **owning** side creates the catalogue entry (workshop has no "Add fabric/shelf"; shop has no "Add accessory").

**Customer-brought fabric.** A garment may use the customer's own cloth (`fabric_source: OUT`), recorded descriptively (colour/source/length) with no catalogue link. Never part of either stock, never decremented. (Redo/refund handling in §2.5/§2.6.)

**Stock-movements ledger.** Every stock change writes an append-only `stock_movements` row, auto-logged by AFTER-UPDATE triggers. Callers stamp context (why/who/ref/supplier/cost/reason) before the UPDATE. Missing context → the trigger defaults to `movement_type='adjustment'`, `reason='unattributed'` — **no change is ever silently unlogged.**

- **movement_type:** `restock` · `consumption` · `transfer_out` · `transfer_in` · `adjustment` · `waste` · `return`.
- Stock-mutating RPCs (restock, adjust, consume-for-order, transfer dispatch/receive, order completion) all stamp context before their UPDATEs.
- **Order confirmation rejects on insufficient stock.** A confirm/checkout that decrements stock (work-order completion, sales-order completion/create) locks each item row and rejects with a descriptive error when the relevant side's on-hand < required qty — never drives stock negative. Customer-brought fabric (`fabric_source: OUT`) is excluded from the decrement and guard.
- **Suppliers** are first-class, shared across item types; the restock dialog can create one inline.
- **No silent stock edits:** the metadata edit dialog has no stock field — all stock changes go through Restock, Adjust, Damage/Waste, or a validated Stocktake, each requiring a reason.
- **Adjust vs. Damage/Waste are distinct.** Adjust = count corrections (recount up/down, found, returned-from/to, expired); it does NOT offer damaged/lost — those belong to Damage/Waste (cost impact + categorized fault reasons).

**Low-stock alerts.** Every item carries a **minimum (reorder threshold)** — a per-item value a **manager** sets (informed by lead time, consumption rate, cost, criticality); absent an override, a per-type default (fabric 5 / shelf 3 / accessory 10). Evaluated against **each side's own count independently** (shop vs `shop_stock`, workshop vs `workshop_stock`). Two surfaces:

- **Always-visible "Need to Restock" list** atop each app's Inventory — the itemized set below threshold (`0 < own-side stock < threshold`), not just a count.
- **Active notification** on the **falling edge only** — a change from ≥ threshold to < threshold fires one `low_stock` notification to that side's department; staying-low does not re-fire. Out-of-stock (0) counts as below-threshold.

**Stocktake (mandatory monthly, soft-enforced).** A controlled recount run **per side** (each counts only its own holdings). Cadence: ≥ once per calendar month per side. Workflow: open → list the side's full item set → enter the **physical count** per item → system computes **variance** (counted − system) → a **variance reason is mandatory** on any non-zero line → a **manager validates** to commit (each non-zero variance applied as an `adjustment` stamped `reason='stocktake'` + the line reason; the session freezes and the cadence clock resets) → the session is retained for reporting. Staff enter counts; only a **manager** validates.

- **Overdue escalation (soft block — nag, not freeze).** Tier 1 (overdue): warning banner. Tier 2: a manager may dismiss and continue. Tier 3 (> 3 days overdue): a persistent blocking-style banner + an entry modal — but **nothing is functionally locked**; any user may dismiss and proceed.

**Damage / Waste** (distinct from Adjust). Records stock physically lost/unusable against the side's own count as a `waste` movement:

- **Categorized reason** (required): `supplier_defect` / `staff_mistake` / `customer_damage` / `lost` / `mis_cut` / `other` (+ free-text note; required for `other`).
- **Quantity damaged** (the amount removed, not a new total), **optional photo**, per-unit **cost** (prefilled from last restock cost or price, editable). Cost impact = qty × unit cost recorded on the ledger row.
- **Manager-approval gate by cost.** Below a configured cost threshold, any waste-permitted user records it directly (stock drops immediately). At/above, **only a manager/admin** may — the RPC rejects an over-threshold waste from a non-manager (`needs manager approval`). No pending state; the gate is authorization, not a workflow.

**Redo material waste** (resolves §2.9's forward-reference). When a redo discards a garment (§2.5), its already-cut fabric is scrap — but that length already left stock as a `-L consumption` at order confirmation, so a second decrement would double-count and break conservation. Instead the scrap is recorded as a **net-zero `waste` annotation**: a `stock_movements` row with `qty_delta = 0` carrying the wasted length in `annotated_qty` (a column alongside `qty_delta`), the per-unit `unit_cost`, and a `root_cause` (the new `stock_movements.root_cause` column, §2.9 taxonomy) captured at the workshop redo step. The replacement's fresh cut is a **real `-L consumption`**; net ledger change is `-2L` (one wasted cut + one good replacement physically gone) → conservation holds exactly.

- **Company vs. customer fabric.** Company fabric (catalogue-linked) → the replacement auto-consumes a fresh `-L` and the scrap is annotated as above. Customer-brought fabric (`fabric_source: OUT`) → **neither** consumed nor wasted from our stock (never part of either count); the replacement is flagged customer-must-provide and parked (§2.5). `root_cause` is orthogonal — we may still be at fault for ruining customer cloth, so the redo step captures it regardless of fabric source.
- **Waste report surfaces it.** Aggregates count waste via `SUM(ABS(qty_delta) + COALESCE(annotated_qty, 0))` so annotations (real qty `0`, length in `annotated_qty`) and real wastes (length in `qty_delta`, `annotated_qty` null) sum without double-counting. A **waste-by-`root_cause`** aggregate (qty + cost, `cost = Σ qty × unit_cost`) joins the existing by-reason-category breakdown.

**Transfers — request → send → receive (no approval gate).**
- **Request:** either side requests items + quantities from the other, **without seeing the source side's stock** (invisibility holds).
- **Send:** the owning side fulfils directly — **no approve step**. Sends the **full**, a **partial**, or **none**. Sent stock leaves the source count and travels **in transit**.
- **Receive:** the destination confirms arrival; stock lands in its count. A partially-sent transfer stays open for the remainder.
- **Direct / bulk send:** a side may **push** stock with no request (e.g. season-change whole-summer-fabric send). Bulk send is atomic — all decrements + in-transit rows commit or roll back together.
- UI tabs: `Needs my action` / `Active` / `All` / `History`. Per-row action = transfer status (`requested` → send · `dispatched`/`partially_received` → receive) × role × side. No `approved` state, no approve/reject.

**Reports** = KPI cards (restocked/consumed/net/lost) + top items by movement type + recent adjustments, from aggregate RPCs. Plus a **waste breakdown** (by reason category, with cost impact) on a ~2-week cadence and the stocktake-history view.

**RBAC:**

```
inventory:create   → owning side only (shop: fabrics + shelf · workshop: accessories) + admin
inventory:restock  → owner-side manager + admin
inventory:adjust   → manager + admin (the side holding the stock)
inventory:waste    → staff + manager + admin (the side holding the stock); over the cost threshold ⇒ manager + admin only (enforced server-side)
inventory:stocktake → staff + manager enter counts; manager + admin validate (the side holding the stock)
inventory:delete   → manager:shop + admin (hard-delete if unused, archive if FK-referenced)
suppliers:manage   → manager + admin
transfers:request  → staff + manager (either side)
transfers:dispatch → manager + admin (source side) — the "send"; acts directly on a requested transfer, no separate approve
transfers:receive  → staff + manager (destination side)
transfers:cancel   → manager + admin
```

**Backfill:** a one-shot script seeds the ledger from existing transfer history (transfer_out/in/waste); refuses to re-run if backfilled rows exist. Direct edits and order consumption have no history → not backfilled.

**Deprecated (drop later):** the old single-stock columns (`stock`/`real_stock`) are kept current by inline writes inside the consumption/refund RPCs (same UPDATE as the split column; no sync trigger). App reads use the split shop/workshop stock. A couple of unused app references remain — drop after migrating them.

---

## 5. Shop app (`apps/pos-interface`) rules

**Role shells.** Order-taker shell (order creation, garment tracking, customer mgmt) and a separate role-locked Cashier shell (§3). Brand is determined by the authenticated user.

**Tech conventions** (match; don't re-architect): TanStack Router (file-based, generated route tree), TanStack Query + Supabase SDK for server state (no direct DB access), Zustand for local state, React Hook Form + Zod for forms, Shadcn/Radix + Tailwind, `@/*` path alias.

**UI direction — shop-first professional** (boutique retired):

- **Type:** Marcellus serif kept for headings (brand voice). Body/UI is Inter (Arabic falls back to Cairo). Montserrat retained ONLY by the bespoke login/landing pages (inline typography — don't globally remove). The Hidayatullah Arabic font is for the brand wordmark only — never UI text.
- **Neutral base + brand-as-accent only:** a neutral cool-gray/white system. Brand classes recolor ONLY primary/ring/sidebar-active (ERTH = very dark green, SAKKBA = very dark navy). Never re-tint border/muted/input/secondary/accent/background per brand.
- **Shape:** `--radius: 0.5rem`. Cards border-led (`rounded-lg border`, no shadow). Avoid `rounded-xl/2xl` and decorative content shadows.
- **No "AI-default" gradients / garish accent fills** on form steps — neutral surfaces + semantic tokens; the single brand primary is the only saturated color in a region.

---

## 6. Workshop app (`apps/workshop`) rules

An **operational tool**, not a marketing page — dense-data / control-panel (Linear/Datadog/Vercel-admin), not boutique.

**Typography (enforced):** Inter + JetBrains Mono only (no Marcellus/Montserrat/decorative). Root 17px / line-height 1.4 (don't override per page). One typographic role per element — match the role table; don't invent ad-hoc sizes (add a role if needed). Max weight 600 (page titles), 500 (section titles/table headers/emphasis), 400 (body/data). **Never `font-bold`/`font-black`** — fix weak values with color contrast or size, not weight. Sentence case; no uppercase+tracking-wider except true acronyms (QC, ID, INV-). Table headers medium + muted, not bold.

**Color (enforced):** semantic tokens only (`--status-ok/warn/bad/info` + `bg-muted`/`text-muted-foreground`). **Forbidden:** `bg-{color}-100 text-{color}-800` and raw `bg-red-50`/`text-emerald-700`-style classes on chips/badges/pills — replace with the token when you touch the file. Dark icon tints (700-shade) OK for must-stay-identifiable indicator icons (express, home delivery, soaking, returns) — never -500. Brand badges dark/saturated (ERTH emerald-900, SAKKBA blue-900, QASS zinc-800) — never light pills. **One signal wins color per region** — if a row has a colored stage badge, the location beside it is plain text.

**Shape & layout:** single radius `rounded-md` (cards/chips/badges/buttons/inputs); `rounded-full` only for 1–2px status dots. No card shadow (border only; shadows for popovers/dialogs). No decorative `border-l-2` unless it encodes real state (discarded = red left-border). Card chrome (tints/rings) only for exceptional states (`opacity-60` parked, red `border-l-2` discarded) — never to restate a badge.

**No emoji in UI.** Lucide icons or plain text. Satisfaction = stars/text, never face emoji.

**Hierarchy by reduction, not addition.** Make something prominent by reducing the noise around it, not bold/color.

**Compose from the shared primitives** (PageHeader, SectionCard, SectionLabel, StatusBanner, StatsCard, EmptyState, LoadingSkeleton, MetadataChip) instead of re-writing Tailwind. About to write `bg-card border border-border rounded-md`, `uppercase tracking-wider`, or `bg-red-50 text-red-800`? Use the primitive. A pattern repeated across 2+ pages becomes a new primitive.

**Date handling (correctness).** All date comparisons use the workshop's local-tz helpers (`getLocalDateStr` / `toLocalDateStr` / `getLocalMidnightUtc`). **Never** `new Date().toISOString().slice(0,10)` for comparisons — that's the UTC date, wrong in non-UTC timezones.

**Worker team (unit) assignment — explicit, never silently defaulted.** A worker (a `resources` row) belongs to a **unit** (team) within its production stage. In create/edit, the manager **explicitly picks the team** for **every station the worker runs** — cutting, sewing, finishing, ironing, quality-check — via a visible, required picker (with inline "create team" when a station's first/second team is needed). Never silently default to the first/lowest-id unit (that silently re-pins e.g. a second-cutting-table worker back to "Team A" on every routine edit). On edit, each picker is pre-filled from the worker's *actual* current unit (not recomputed), so saving an unrelated field never moves their team. **Soaking is excluded** (all-hands, negligible labor; not on the Performance page) and keeps auto-assignment; `post_cutting` is disabled.

**Redo priority queue — full manager control.** Each redo replacement (§2.5) carries a manager-set `redo_priority`: `immediate` (jump the queue) / `next_slot` (default — folds into the normal flow) / `parked` (blocked, not schedulable). A parked redo also carries a `redo_parked_reason`: `waiting_material` (replacement fabric short) / `customer_decision` (customer-brought `fabric_source: OUT` — must provide fabric) / `approval` / `clarification`. The **redo-creation step captures `root_cause` (§2.9) + `redo_priority`** in one dialog. The scheduler surfaces these as sortable sections — a pinned high-priority `immediate` queue, `next_slot` redos in the normal flow, and a "parked redos" section showing each `redo_parked_reason` for manager attention. A **resume-parked** action un-parks a redo once the blocking issue clears: it re-runs the fabric consume (the deferred `-L consumption`) and makes the replacement schedulable; the scrap waste annotation (already written at creation) is **not** re-recorded.

---

## 7. Maintainable-code ruleset (both apps)

General conduct — think before coding, simplicity, surgical changes, goal-driven execution, tests-as-oracles (§0.2) — lives in the global CLAUDE.md. Below is project-specific.

1. **Descriptive errors.** No bare "Error"/"Failed"/"Something went wrong". Name the operation and surface the cause (e.g. `updateGarment: failed to update garment <id>: <db error>`).
2. **Reach for shared primitives / helpers first.** Duplicating a pattern 2+ times means extract a primitive.
3. **Idempotency is mandatory on retryable mutations.** Order confirm, payment, refund, sales-order create, register close — each takes an idempotency key; a lost-response replay produces exactly one effect. (Production runs on a tier with a real lost-response tail; not optional.)
4. **DB migration discipline.** Don't guess remote DB state — inspect it first. Write migrations idempotent (`IF NOT EXISTS`). The schema is built via `db:push`; apply new migrations directly — the `db:migrate` runner is not usable.
5. **Invariants never to break silently:**
   - `users.brands` is stored **lowercase**; the brand-access check lowercases only the probe, so an uppercase entry silently denies access.
   - Garment lifecycle transitions only through the §2.5 branches — no ad-hoc `piece_stage` writes.
   - All money flows through `payment_transactions` (the trigger owns `orders.paid`); never write `orders.paid` directly.
   - All stock changes go through the stamping RPCs so the ledger stays complete.
   - Workshop date logic uses local-tz helpers (§6).
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

**Tests:** unit suites under `@repo/database` + the Shop app; the spec-as-oracle suite (`test:workflow`) runs real RPCs/triggers against an ephemeral Postgres and encodes §2–§4. A RED lifecycle test is a caught spec violation (or an intended-RED gap documented as such in §2–§4) — never relax it to green.

---

## 9. Environment variables

- Frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (in `apps/pos-interface/.env`).
- Database: `DATABASE_URL`; optional `TRANSACTION_URL` (pooler, port 6543).

---

## 10. Companion docs (read on demand — kept out of the always-loaded spec)

- **`IMPLEMENTATION_MAP.md`** — where code lives (schema, lifecycle RPCs/triggers, the spec-as-oracle suite, app directories). Non-authoritative nav aid; on any conflict the spec wins.
- **`DEPLOYMENT_HARDENING.md`** — deploy-time host/proxy hardening checklist (not coding guidance; re-apply if the deployment moves).

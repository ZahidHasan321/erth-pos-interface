# CLAUDE.md

The **verbatim specification** of this product's features and workflows, plus the working rules for the codebase. This file is the single source of truth. Code implements it; it does not define it.

---

## 0. How to use this file (governance — read first)

1. **This file is the spec.** Every feature, scenario, branch, and edge case lives here in plain language. If behavior isn't described here, it isn't specified — surface that gap, don't infer it from code.
2. **Spec-as-oracle.** The lifecycle test suite encodes *this file*, never the code. When a test and the code disagree, the test is right and **the code is the bug**. When this file and the code disagree, **this file wins** — fix the code (or, if the rule itself is wrong, change this file deliberately first, then the code).
3. **Change protocol.**
   - A new edge case is discovered in any scenario → **add it to the relevant section here**, then make code + tests match.
   - A workflow or feature change is requested → **edit this file first**, then change code to match. Editing this file is how the blast radius becomes visible (the tests that now disagree show exactly what the change touches).
   - This file is changed **only deliberately**. Never bend it to match what the code happens to do.
4. **Code-decoupled.** The spec body (§1–§6) describes *what* and *why* — never file paths or line numbers. Concrete code locations live only in **Appendix A (Implementation Map)**, which is explicitly non-authoritative and allowed to drift. If the appendix disagrees with the spec, the spec wins and the appendix is stale.
5. **Tests are oracles, not mirrors.** A test's expected value must come from this file or a universal invariant (accounting identity, idempotency property) — never copied from the RPC/trigger body. A test derived from the implementation is green by construction and catches nothing.

---

## 1. Domain & architecture

**Domain:** Dishdasha (traditional garment) production & POS for the Autolinium/ERTH brand. Two kinds of order: **WORK** (custom tailoring — measured, cut, sewn) and **SALES** (pre-made shelf items).

**Mental model: the system thinks in _garments, not orders_.** An order is a container; each garment row tracks one physical piece through production independently. Most lifecycle rules are per-garment; the order's state is derived from its garments.

**Core entities (domain level):**

- **order** — container. `order_type` WORK/SALES, `checkout_status` draft/confirmed/cancelled, `brand` (ERTH/SAKKBA/QASS), payment totals.
- **work_order** — WORK extension: `order_phase` new/in_progress/completed, delivery dates, campaign.
- **garment** — one physical piece. Tracking fields in §2.1.
- **garment_feedback** — QC and customer-trial records (satisfaction, measurement diffs).
- **measurements** — body dimensions per customer.
- **customer** — profile, phone, addresses.
- **fabrics / styles** — inventory + pricing catalogs.
- **shelf / order_shelf_items** — pre-made items for SALES orders.
- **prices** — dynamic key/value pricing lookup.
- **payment_transactions** — append-only money log; a trigger sums it into `orders.paid`.
- **register_sessions / register_close_events** — cashier register open/close + append-only close audit.
- **stock_movements** — append-only inventory ledger (§4).

**Two apps, one database:**

- **Shop** (`apps/pos-interface`) — shop staff: order creation, garment tracking, customer management, cashier, printing. Rules in §5.
- **Workshop** (`apps/workshop`) — workshop staff: production scheduling, terminals, dispatch, resources. Rules in §6.
- Frontend never touches the DB directly — all writes go through RPCs/triggers so the lifecycle rules are enforced server-side.

---

## 2. The garment lifecycle (shared spec — the heart of the system)

> This is the authoritative description of how garments move. Any flow change updates this section first.

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
- `discarded` is a dead end (Reject-Redo, or final Needs-Redo on a non-alteration garment). A brand-new replacement garment row is created instead (§2.5).
- `soaking` is a **parallel track**, not a chain step.
- `post_cutting` exists in the set but is **currently disabled** in the production chain.

### 2.3 Alteration thresholds (trip number)

- **Brova & final, unified:** trip 1 = initial; trip 2+ = alteration (alteration # = trip − 1). Finals have no trial step; a brova returning at trip 2+ is also treated as an alteration.
- **QC-fail rework:** **no trip increment** — detected via a `result: "fail"` entry in the current trip's `qc_attempts`. Labeled `alt_p` in production terminals, and `alt_p` **wins over** the trip-based `alt_N` label.
- **No maximum** trip / alteration / QC-attempt count — unbounded by design.

### 2.4 Step-by-step flow

**1. Order created** (Shop, order-taker). Three phases:
- **A — Create:** after customer selected → `checkout_status: draft`, `order_phase: new`.
- **B — Save garments:** garments created `piece_stage: waiting_cut`, `location: shop`, `trip_number: 0`, `garment_type: brova|final`. **Brova-parking rule:** if the order has ANY brova, ALL finals flip `waiting_cut → waiting_for_acceptance` (parked until a brova is accepted).
- **C — Confirm:** `checkout_status: confirmed`, invoice # generated, shelf/fabric stock decremented. `order_phase` stays `new`. Confirmation is idempotent on its idempotency key (a lost-response retry must not double-decrement stock or double-issue an invoice).

**2. Cashier payment** — see §3.

**3. Dispatch to workshop** — all fresh garments (`trip_number = 0`) → `location: transit_to_workshop`, `trip_number → 1`; order → `order_phase: in_progress`. Parked finals (`waiting_for_acceptance`) are dispatched alongside brovas but stay parked.

**4. Workshop receives** — garments → `location: workshop`. "Receive" parks (`in_production: false`); "Receive & Start" schedules (`in_production: true`). Parked finals (`waiting_for_acceptance`) and accepted brovas **never** get `in_production: true`.

**5. Workshop production** — scheduler assigns date + plan; garment advances `waiting_cut → cutting → sewing → finishing → ironing → quality_check → ready_for_dispatch`. `soaking` is parallel; `post_cutting` disabled.

**6. Workshop dispatches to shop** — `location: transit_to_shop`, `in_production: false`, `feedback_status: null` (cleared).

- **Accept-with-Fix stranded-finals confirmation (workshop dispatch only).** An Accept-with-Fix brova must travel back to the shop *together with* its order's finals. So when a workshop dispatch batch includes an **Accept-with-Fix brova** (a `brova` back at the workshop, `ready_for_dispatch`, `acceptance_status: true` — the durable marker; a plain-Accept brova never returns to the workshop and a Reject-Repair brova has `acceptance_status: false`, so neither triggers this) **and** the same order still has ≥1 **final** at the workshop not in this batch (`location: workshop`/`transit_to_workshop`, `piece_stage NOT IN (ready_for_dispatch, completed, discarded)` — i.e. still in production), the UI must show a blocking confirm: the finals are not ready yet — send the brova without them? Confirm dispatches as selected; cancel aborts. UI-only safety prompt; it does not change any lifecycle state or RPC. Outside this exact pairing there is no dispatch confirmation.

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
- **Reject-Redo:** original is `discarded` permanently. The **workshop manually creates** a replacement garment row (FK-linked to the original); it inherits specs and starts fresh at `trip 1 / waiting_cut`. A replacement can itself be redone → unbounded replacement chain (no cap — accepted).

**Finals release** (manual "Start Production"): parked finals `waiting_for_acceptance → waiting_cut`, then through normal production. **Stuck state (accepted):** if ALL brovas were rejected (none ever accepted) and a brova still exists to act on, finals park indefinitely — manual intervention only, no timeout. (Contrast: the *orphaned-finals* edge in §2.6, where the only brova is gone, is NOT accepted and must release the finals.)

**Final collection:**

| Outcome | piece_stage | fulfillment_type | Next |
|---------|-------------|------------------|------|
| Accept – collected | `completed` | `collected` | Terminal |
| Accept – delivered (home delivery) | `completed` | `delivered` | Terminal |
| Needs Repair | `brova_trialed` | — | Alteration cycle (trip+1) |
| Needs Redo (non-alteration) | `discarded` | — | Replacement row (workshop manual) |
| Needs Redo (alteration-type order) | NOT discarded | `needs_redo` | Same row loops back (customer property never discarded) |

**Sending garments back** (Shop alterations / "Return to Workshop"): `piece_stage: waiting_cut`, `location: transit_to_workshop`, `trip_number += 1`, `in_production: false`, production fields cleared. No max trip (accepted).

**Workshop re-receives** (Alterations section, all trip ≥ 2): one section covers every returning garment (brova/final trip 2+) and QC-fail rework regardless of trip. No brova-approval gate here. Resets `piece_stage: waiting_cut` if still `brova_trialed` with feedback.

**QC fail:** **no trip increment.** Garment bounced to the earliest failed rework stage; a breadcrumb routes it back to QC; the attempt is logged in the trip's `qc_attempts`. Labeled `alt_p`. No max-attempt cap (accepted).

**Feedback updates the target spec, not just the verdict.** A feedback submission (brova trial or final collection) carries optional measurement deltas (each tagged with a reason) and style/option changes alongside the action. These are applied to the garment's own spec at submit time, so every downstream path picks them up: the same row that loops back on repair, the cloned row on a Reject-Redo replacement, and the parked finals when later released.

- **Measurement reason gates propagation.** `customer_request` writes a new measurement row and repoints `measurement_id`; `workshop_error` / `shop_error` are audit-only — the target is unchanged because the spec was right and the executor erred.
- **Brova feedback fans out to siblings.** Style/measurement changes from a brova's feedback also apply to every sibling garment on the order sharing that brova's `style_id` / `measurement_id` (unless the user scopes to "this garment only"). This is what lets parked finals inherit the brova's trial adjustments on release.

### 2.6 Cancellation / refund

Per-component (fabric/stitching/style/express/soaking) or shelf-qty refund, taken by the cashier. Records a `refund` payment_transaction (reason required); `orders.paid` drops via the summing trigger. Order stays `confirmed`. Affected garments get `refunded_*` flags. A **full garment refund → `piece_stage: discarded`** and offers optional fabric-restock (return uncut fabric to shop stock, default off). A **full-order cancel** sets `checkout_status: cancelled` — garments are NOT auto-discarded (in-progress workshop work may continue / orphan — accepted).

**Codified edge rules:**

- **Refund amount is capped.** A refund may not drive `orders.paid` below 0; without selected items it's capped at the overpayment; with items it's capped at the selected items' total + overpayment.
- **Post-hand-over exception.** A full refund of an already-`completed` (handed-over) garment refunds the money and sets `refunded_*` flags, but the garment **stays `completed`** — NOT discarded (you cannot un-deliver a physical garment), and **fabric-restock does not apply** even if requested (the fabric is in the customer's garment). Discard applies only when `piece_stage NOT IN (discarded, completed)`.
- **Refund-discard side-effects.** Discarding via refund also sets `in_production: false`, clears `start_time`, `feedback_status`, `acceptance_status`. `location` is left as-is — a garment refund-discarded while `transit_*` keeps its transit location and is silently dropped at the receiving step (no location/ledger reconciliation; documented, not auto-fixed).
- **Per-garment isolation.** A refund targeting one garment never mutates a sibling's stage or `refunded_*` flags.
- **Idempotent.** A refund replayed with the same idempotency key applies once.
- **Orphaned-finals rule (INTENDED — code does not yet do this; the lifecycle test asserts this and is _expected RED_ until the code is fixed).** Refund-discarding the **last remaining brova** on an order must release its parked finals (`waiting_for_acceptance → waiting_cut`) so they are not permanently orphaned. This is distinct from the accepted "all brovas rejected via feedback → park indefinitely" case: there a brova still exists to act on; here the only brova is gone, so the finals have no possible release path and MUST be freed. Refund/discard never auto-creates a replacement — replacement is the workshop's manual Reject-Redo action only.

### 2.7 Order-level phase

- `new` → not dispatched yet.
- `in_progress` → at least one garment past pre-dispatch.
- `completed` → ALL garments terminal (`piece_stage ∈ {completed, discarded}`). `discarded` does NOT block completion (9 completed + 1 discarded ⇒ order completed). Partial pickup is supported (individual garments completed via feedback).
- A cancelled order whose workshop garments keep progressing is the accepted orphan case (§2.6).
- The order-history view shows only `order_phase` — no garment detail there.

### 2.8 Status-label derivations

**Showroom labels** (Shop "Orders at Showroom"). Garment-state-driven. Shows orders with garments at shop, OR finals in transit (even with no shop items yet).

| Label | Condition | Staff action |
|-------|-----------|--------------|
| `alteration_in` | Alteration garment at shop needing trial/action (trip 2+ `awaiting_trial`, or `needs_repair`/`needs_redo` at alteration threshold) | Trial returning alteration |
| `alteration_out` | Alteration-type order (`order_type: ALTERATION`) — single label | Handle customer-brought alteration |
| `brova_trial` | Brova at shop, `piece_stage: awaiting_trial` | Customer tries brovas |
| `needs_action` | Any garment at shop with `feedback_status: needs_repair/needs_redo` | Send rejected garment back |
| `ready_for_pickup` | Everything else visible (incl. partial: some at shop, others out) | Customer collects ready items |

**Priority:** `alteration_in` > `brova_trial` > `needs_action` > `ready_for_pickup` (action-first). Old `partial_ready`/`awaiting_finals` were collapsed into `ready_for_pickup` (the list shows an x/y received count, so the distinction was redundant).

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
| Finals in production | Finals actively worked (not `waiting_for_acceptance`) |
| Brovas in production | Brovas being worked |

**Priority:** at shop > ready for dispatch > in transit > awaiting finals release/brova trial > finals in production > brovas in production > fallback "In production". If a brova is returning AND finals are in production → "Finals in production" wins (main order work).

---

## 3. Cashier, payments & EOD (shared spec)

- **Cashier split.** The cashier is a separate role-locked shell (single brand; tabs Cashier / Order History / End-of-Day). Order-taker confirms with `paid: 0`; the order enters the cashier queue (`confirmed` AND `paid: 0`). Payment is recorded as a `payment_transaction` (NOT via the confirm RPC); a trigger sums transactions → `orders.paid`. Partial/installment payments supported. Payment recording is idempotent on its key (a retry must not double-credit).
- **Pickup is ungated on payment** (intentional). The cashier may hand over / deliver garments while a balance is outstanding — it is staff judgment, not gated on feedback completion or finals-ready state.
- **EOD / register close.** Reconciles cash basis (collected/refunded/net) vs accrual (orders booked) + cash-movement log + per-cashier, then freezes the day.
  - **Who:** the **cashier opens AND closes** their own register session (close needs only an active user). **Reopening a frozen/closed day is manager-only** — the sole manager gate in the EOD flow. (Rationale: EOD close must not be blocked waiting on a manager; altering a frozen day must be.)
  - **Reconciliation formula:** `expected_cash = opening_float + cash_payments − cash_refunds + cash_in − cash_out`; `variance = counted_cash − expected_cash` (negative = shortage). This equals the universal cash-drawer identity (cash in drawer = float + received − paid out); that identity, not any SQL, is the oracle.
  - **Per-session attribution:** a cash payment/refund recorded while a session is open is stamped to that session and counts toward THAT session's reconciliation on close.
  - **Idempotent close:** a replayed close (same key) returns the original summary and writes NO additional audit event.
  - **Append-only history:** every close writes a `register_close_events` row (never overwritten); the session row keeps only the LATEST close. Reopen + re-close ⇒ one additional event (a shortage-then-clean-reclose history is preserved).
  - **Frozen day rejects money:** with no open session for the brand, payment recording is rejected (no cash against a frozen/never-opened day).
- **Brand gate.** Which brands use the cashier flow is a single source of truth (a brand set + a case-normalizing helper; currently ERTH only). It drives whether the order-taker takes payment inline vs. routes to the cashier queue, the `/cashier` route guard, and sidebar visibility. Enabling another brand is a one-line set addition. Brands not in the set take payment inline at order-taking.

---

## 4. Inventory & transfers (shared spec)

The store/inventory area is **3 surfaces per app**: Inventory, Transfers, Reports (Shop also keeps End-of-Day as a separate financial page).

**Stock-movements ledger.** Every change to fabric/shelf/accessory stock writes an append-only `stock_movements` row, auto-logged by AFTER-UPDATE triggers. Callers stamp context (why/who/ref/supplier/cost/reason) before the UPDATE. If context is missing, the trigger defaults to `movement_type='adjustment'`, `reason='unattributed'` — **no change is ever silently unlogged.**

- **movement_type:** `restock` · `consumption` · `transfer_out` · `transfer_in` · `adjustment` · `waste` · `return`.
- Stock-mutating RPCs (restock, adjust, consume-for-order, transfer dispatch/receive, order completion) all stamp context before their UPDATEs.
- **Suppliers** are first-class, shared across all item types; the restock dialog can create one inline.
- **No silent stock edits:** the metadata edit dialog has no stock field — all stock changes go through Restock or Adjust, both requiring a reason.

**Transfers** replace the old 4 stage-pages per app with tabs `Needs my action` / `Active` / `All` / `History`. The per-row action is a function of transfer status × user role × side.

**Reports** = KPI cards (restocked/consumed/net/lost) + top items by movement type + recent adjustments, driven by aggregate RPCs.

**RBAC:**

```
inventory:restock  → owner-side manager + admin
inventory:adjust   → manager + admin (either side)
inventory:delete   → manager:shop + admin (hard-delete if unused, archive if FK-referenced)
suppliers:manage   → manager + admin
transfers:request  → staff + manager (either side)
transfers:approve  → manager + admin (gated by side at render-time)
transfers:dispatch → manager + admin (source side)
transfers:receive  → staff + manager (destination side)
transfers:cancel   → manager + admin
```

**Backfill:** a one-shot script seeds the ledger from existing transfer history (transfer_out/in/waste); refuses to re-run if backfilled rows exist. Direct edits and order consumption have no history → not backfilled.

**Deprecated (present, drop later):** the old single-stock columns are still trigger-synced for safety; app reads use the split shop/workshop stock. A couple of unused app references remain — drop after migrating them.

---

## 5. Shop app (`apps/pos-interface`) rules

**Role shells.** Order-taker shell (order creation, garment tracking, customer mgmt) and a separate role-locked Cashier shell (§3). Brand is determined by the authenticated user.

**Tech conventions** (match these; don't re-architect): TanStack Router (file-based, generated route tree), TanStack Query + Supabase SDK for server state (no direct DB access from the frontend), Zustand for local state, React Hook Form + Zod for forms, Shadcn/Radix + Tailwind for UI, `@/*` path alias.

**UI direction — shop-first professional** (boutique look retired):

- **Type:** Marcellus serif KEPT for headings (intentional brand voice). Body/UI text is Inter (Arabic falls back to Cairo). Montserrat is retained ONLY by the bespoke login/landing pages (they carry their own inline typography — do not globally remove it). The Hidayatullah Arabic font is reserved exclusively for the brand wordmark — never UI text.
- **Neutral base + brand-as-accent only:** a neutral cool-gray/white system. Brand classes recolor ONLY the primary/ring/sidebar-active tokens (ERTH = very dark green, SAKKBA = very dark navy). Never re-tint border/muted/input/secondary/accent/background per brand — chrome stays neutral on every brand.
- **Shape:** `--radius: 0.5rem`. Cards border-led (`rounded-lg border`, no card shadow). Avoid `rounded-xl/2xl` and decorative shadows on content.
- **No "AI-default" gradients / garish accent fills** on form steps — neutral surfaces + semantic tokens; the single brand primary is the only saturated color in a region.

---

## 6. Workshop app (`apps/workshop`) rules

The workshop is an **operational tool**, not a marketing page — dense-data / control-panel (Linear/Datadog/Vercel-admin), not boutique.

**Typography (enforced):** Inter + JetBrains Mono only (no Marcellus/Montserrat/decorative). Root 17px / line-height 1.4 (don't override per page). One typographic role per element — match the role table (don't invent ad-hoc sizes; add a role if needed). Max weight 600 (page titles), 500 (section titles/table headers/emphasis), 400 (body/data). **Never `font-bold`/`font-black`** — fix weak values with color contrast or size, not weight. Sentence case; no uppercase+tracking-wider except true acronyms (QC, ID, INV-). Table headers are medium + muted, not bold.

**Color (enforced):** semantic tokens only (`--status-ok/warn/bad/info` + `bg-muted`/`text-muted-foreground`). **Forbidden:** `bg-{color}-100 text-{color}-800` and raw `bg-red-50`/`text-emerald-700`-style classes on chips/badges/pills — replace with the token when you touch such a file. Dark icon tints (700-shade) are OK for must-stay-identifiable indicator icons (express, home delivery, soaking, returns) — never -500. Brand badges are dark/saturated (ERTH emerald-900, SAKKBA blue-900, QASS zinc-800) — never light brand pills. **One signal wins color per region** — if a row has a colored stage badge, the location next to it is plain text.

**Shape & layout:** single radius `rounded-md` (cards/chips/badges/buttons/inputs); `rounded-full` only for 1–2px status dots. No card shadow (border only; shadows are for popovers/dialogs). No decorative `border-l-2` unless it encodes real state (discarded = red left-border). Card chrome (tints/rings) only for exceptional states (`opacity-60` parked, red `border-l-2` discarded) — never to restate what a badge already says.

**No emoji in UI.** Lucide icons or plain text. Satisfaction = stars/text, never face emoji.

**Hierarchy by reduction, not addition.** To make something prominent, reduce the noise around it rather than bold/color it.

**Compose from the shared primitives** (PageHeader, SectionCard, SectionLabel, StatusBanner, StatsCard, EmptyState, LoadingSkeleton, MetadataChip) instead of re-writing the same Tailwind. If you're about to write `bg-card border border-border rounded-md`, `uppercase tracking-wider`, or `bg-red-50 text-red-800` — use the primitive. A layout pattern repeated across 2+ pages becomes a new primitive, not duplicated classes.

**Date handling (correctness rule).** All date comparisons use the workshop's local-timezone helpers (`getLocalDateStr` / `toLocalDateStr` / `getLocalMidnightUtc`). **Never** `new Date().toISOString().slice(0,10)` for date comparisons — it yields the UTC date, wrong in non-UTC timezones.

---

## 7. Maintainable-code ruleset (both apps)

1. **Spec-first.** A behavior change updates §2–§6 here *before* the code. No silent divergence.
2. **Simplicity.** Minimum code that satisfies the spec. No speculative abstraction, configurability, or error handling for impossible states. If 200 lines could be 50, write 50.
3. **Surgical changes.** Touch only what the task requires. Match surrounding style even if you'd do it differently. Don't refactor or "improve" adjacent code. Remove only the orphans *your* change creates; flag pre-existing dead code, don't delete it.
4. **Descriptive errors.** No bare "Error"/"Failed"/"Something went wrong". Name the operation and surface the cause (e.g. `updateGarment: failed to update garment <id>: <db error>`).
5. **Reach for shared primitives / helpers first.** Duplicating a pattern 2+ times means extract a primitive.
6. **Tests are oracles, not mirrors** (§0.5). Expected values come from this file or a universal invariant; never from the RPC/trigger body. A spec-vs-code conflict is a RED test = a finding to surface, never a test to relax.
7. **Idempotency is mandatory on retryable mutations.** Order confirm, payment, refund, sales-order create, register close — each takes an idempotency key; a lost-response replay must produce exactly one effect. (Production runs on a tier with a real lost-response tail; this is not optional.)
8. **DB migration discipline.** Don't guess remote DB state — inspect it first. Write migrations idempotent (`IF NOT EXISTS`). The schema is built via `db:push`; apply new migrations directly — the `db:migrate` runner is not usable.
9. **Invariants never to break silently:**
   - `users.brands` is stored **lowercase**; the brand-access check lowercases only the probe, so an uppercase entry silently denies access.
   - Garment lifecycle transitions only through the documented branches (§2.5) — no ad-hoc `piece_stage` writes.
   - All money flows through `payment_transactions` (the trigger owns `orders.paid`); never write `orders.paid` directly.
   - All stock changes go through the stamping RPCs so the ledger stays complete.
   - Workshop date logic uses local-tz helpers (§6).
10. **Step completion is earned, not inferred.** A wizard/stepper step is marked complete only by an explicit user act *on that step* — clicking its Continue, or a Save that performs the step's work. Never auto-complete a step merely because pre-existing data exists (e.g. the customer has historical measurements). Loading a customer or reloading a draft order may pre-fill and warm caches, but the step stays incomplete until the user acts. Reused prior data needs an explicit Continue; a Save during the order both saves and completes (no separate Continue). Two carve-outs, both still "earned": (a) a fully finalized record (e.g. a `confirmed` order) marks all its steps complete — the finalization *is* the explicit act; (b) on reload, a completed *later* step in a sequential stepper implies its prerequisites were completed in a prior session (the later step is unreachable otherwise), so they may be marked complete too — this is earned-by-prior-act, not inferred-from-data.

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

**Tests:** unit suites under `@repo/database` + the Shop app; the spec-as-oracle lifecycle suite (`test:workflow`) runs real RPCs/triggers against an ephemeral Postgres and encodes §2–§4. A RED lifecycle test is a caught spec violation (or an intended-RED documented gap, e.g. §2.6 orphaned-finals) — never relax it to green.

---

## 9. Environment variables

- Frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (in `apps/pos-interface/.env`).
- Database: `DATABASE_URL`; optional `TRANSACTION_URL` (pooler, port 6543).

---

## 10. Open questions (pending client decisions)

Open questions for the client live in `OPEN_QUESTIONS.docx`. When one is resolved, fold the decision into §2–§6 here and remove it from that file.

---

## 11. Deployment hardening checklist (do these at the host / proxy, not in code)

The app is internal-only but reachable from the public internet via a domain on a VPS. The code-level hardening (PIN policy, lockout, server-side throttle, RLS, SECURITY DEFINER `search_path`) is in place; the items below are the deployment-layer half — they live wherever this is hosted (VPS reverse proxy, Cloudflare in front, Tailscale tunnel, etc.) and **must be re-applied if the deployment moves**. Treat this as a host-config TODO, not a coding TODO.

0. **Drop `get_login_users` (and the picker calls in the four login pages).** It returns the full active-user roster to anon to make dev role-switching fast. On a public domain that's free staff enumeration for anyone who hits the URL. Before going live: `DROP FUNCTION IF EXISTS get_login_users();` in `triggers.sql`, and remove the `db.rpc("get_login_users")` `useEffect` blocks in `apps/pos-interface/src/routes/(auth)/login.tsx`, `apps/pos-interface/src/routes/(auth)/erth/login.tsx`, `apps/pos-interface/src/routes/(auth)/sakkba/login.tsx`, `apps/workshop/src/routes/(auth)/login.tsx`. The typed-username form already in each page handles login without the picker.
1. **Rate-limit the auth endpoints at the reverse proxy.** Cap `POST /rest/v1/rpc/login_with_pin` and `POST /auth/v1/token` at ~10/min per IP with burst smoothing. The DB has a per-user lockout and a 0.5s pg_sleep on bad PINs (verify_pin in triggers.sql), but those don't stop a parallel attacker hammering many users from one IP — only the network layer does.
2. **Force HTTPS, enforce HSTS.** `login_with_pin` returns a one-time password the client immediately exchanges for a JWT; if any path runs over plaintext HTTP that credential is sniffable. Set `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`, redirect HTTP→HTTPS at the proxy, do not bind port 80 to the app at all.
3. **No HTTP listener for the API at all.** Same reasoning as above — TLS-only on the public surface.
4. **(Stretch, biggest single win) Put the app behind a private tunnel** (Tailscale / WireGuard / Cloudflare Access). If only authenticated tunnel members can reach the domain, every public-internet brute-force / enumeration concern in this file collapses to "internal LAN" — the original threat model. The app code is already designed for that model; the public domain is what stretches it.
5. **Per-IP / global lockout.** Not implementable in plpgsql without piping the client IP through (PostgREST doesn't expose it to RPC bodies). If you want this layer, do it at the proxy (fail2ban-style: lock an IP after N 4xx responses on the login endpoint within a window). Per-user lockout is already in `verify_pin`.
6. **TLS termination + upstream.** If TLS terminates at the proxy and is re-proxied to Supabase, confirm the upstream leg is also TLS. Don't let the one-time password from `login_with_pin` ride plaintext over a "trusted" internal network.
7. **CSP / framing.** Set `Content-Security-Policy` (script-src 'self' + Supabase host), `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`. Cheap defense-in-depth at the proxy.
8. **Service-role key blast radius.** The service-role key must live only on the server side (Edge Functions, admin scripts). Never bake it into a `VITE_*` env var. CI guard: grep-fail any commit that introduces `VITE_*SERVICE*` or `SERVICE_ROLE` in `apps/`.
9. **Backup & rotation.** Schedule DB backups; have a rotation plan for the Supabase service-role key and a procedure for revoking it if it leaks (it does not appear in this repo today — keep it that way).

If any of these aren't yet in place at the chosen deployment, the in-code hardening still holds — these stack on top, they don't replace it.

---

## Appendix A — Implementation map (NON-AUTHORITATIVE — may drift)

Navigation aid only. If anything here disagrees with §1–§7, **the spec wins and this is stale**. Do not cite these as the source of a test's expected value.

- **Schema & shared types:** `packages/database/src/schema.ts`, `packages/database/src/utils.ts` (`isAlteration`, `getAlterationNumber`, `evaluateBrovaFeedback`, `getShowroomStatus`).
- **Lifecycle RPCs/triggers:** `packages/database/src/triggers.sql` — `save_work_order_garments`, `complete_work_order`, `record_payment_transaction`, `toggle_home_delivery`, `collect_garments`, `dispatch_order`, `receive_garments`, `dispatch_garments_to_shop`, `release_finals`, `create_replacement_garment`, `create_complete_sales_order`, `recompute_order_phase`, `open_register`/`close_register`/`reopen_register`, `can_access_brand`, the `stock_movements` triggers.
- **Spec-as-oracle suite:** `packages/database/src/__tests__/workflow*.test.ts` + driver/fixtures in `packages/database/scripts/lifecycle/`. Config: `vitest.workflow.config.ts`.
- **Shop:** `apps/pos-interface/src` — `api/`, `hooks/`, `routes/` (`$main/`, `cashier/`), `components/forms|order-management|orders-at-showroom|cashier`, `context/auth.tsx`, `lib/constants.ts` (`BRANDS_WITH_CASHIER`, `brandUsesCashier`), `index.css`.
- **Workshop:** `apps/workshop/src` — `routes/(main)/assigned` (order labels), `components/shared/PageShell.tsx` + `StageBadge.tsx`, `lib/production-logic.ts`, `lib/qc-spec.ts`, `lib/utils.ts` (date helpers), `index.css` (typography role table — read first when touching workshop UI).
- **Companion docs:** `MIGRATION_PLAN.md` (stage definitions, transition/SQL specs), `SHOP_FLOW_AND_ARCHITECTURE.md` (Shop workflows & architecture decisions).

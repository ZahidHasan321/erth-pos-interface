# SPEC.md

The **verbatim specification** of this product's features and workflows (§1–§6). Single source of truth: code implements it, it does not define it.

> Governance (how to use this spec, spec-as-oracle, change protocol) lives in `CLAUDE.md` §0. Project working rules, build/dev commands, env vars, and UI/code conventions live in `ENGINEERING.md` (§7–§9, §11–§12). `CLAUDE.md` carries a lean one-paragraph-per-area summary of this file — when that summary and this file differ, **this file wins**.

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

**Brand types — showroom vs home-based.** The three brands split into two operating models — a single classification (a brand set + a case-normalizing helper, like the cashier set in §3) that drives lifecycle, payment, fulfilment, and surface visibility:

- **Showroom brand — ERTH.** Has the physical showroom and holds **all** stock. Full lifecycle (brova + finals), a role-locked **cashier** that takes payment and performs final handover (§3), and pickup-or-delivery fulfilment.
- **Home-based brands — SAKKBA, QASS.** No showroom, no cashier — payment is taken **inline at order-taking** (§3). **No brova** (finals only, straight through production); **delivery-only** (pickup removed; `home_delivery` forced true at order-taking); and final handover/completion happens on a per-brand **Delivery page** — the home-brand analogue of the cashier's handover (§5). They hold **no stock of their own**: their fabric is drawn from ERTH's shop stock.

**Everything is per-brand and stays within its own brand shell** — a brand's Delivery page, orders, and surfaces never appear under another brand. The **only** cross-brand view is ERTH's fabric-usage report, which attributes fabric consumption to the consuming brand (§4).

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
| `needs_investigation` | Vestigial — the §2.10 repeated-returns auto-hold was removed; never set true, no writer, retained (no destructive drop) |

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
- **Return counters (§2.10):** *alteration returns* = `trip_number − 1` (this trip-based count); *quality returns* = QC fails. Derived metrics only (QC analytics / performance attribution, §6) — the repeated-returns auto-hold they once drove was removed.

### 2.4 Step-by-step flow

**1. Order created** (Shop, order-taker). Three phases:
- **A — Create:** customer selected → `checkout_status: draft`, `order_phase: new`.
- **B — Save garments:** created `piece_stage: waiting_cut`, `location: shop`, `trip_number: 0`, `garment_type: brova|final`. **Brova-parking rule:** if the order has ANY brova, ALL finals flip `waiting_cut → waiting_for_acceptance` (parked until a brova is accepted).
- **C — Confirm:** `checkout_status: confirmed`, invoice # generated, shelf/fabric stock decremented. `order_phase` stays `new`. Idempotent on its key (a lost-response retry must not double-decrement stock or double-issue an invoice). Each garment's four toggle options (§2.11) must carry a Yes/No value at confirmation (the shop form defaults them to No; the workshop add-garment form requires an explicit choice) — an unfilled one blocks confirmation.

**2. Cashier payment** — see §3.

**3. Dispatch to workshop** — all fresh garments (`trip_number = 0`) → `location: transit_to_workshop`, `trip_number → 1`; order → `order_phase: in_progress`. Parked finals are dispatched alongside brovas but stay parked.

**4. Workshop receives** — garments → `location: workshop`. "Receive" parks (`in_production: false`); "Receive & Start" schedules (`in_production: true`). Parked finals (`waiting_for_acceptance`) and accepted brovas **never** get `in_production: true`.

**5. Workshop production** — scheduler assigns date + plan; garment advances `waiting_cut → cutting → sewing → finishing → ironing → quality_check → ready_for_dispatch`. `soaking` parallel; `post_cutting` disabled.

**6. Workshop dispatches to shop** — `location: transit_to_shop`, `in_production: false`, `feedback_status: null` (cleared).

- **Accept-with-Fix stranded-finals confirmation (workshop dispatch only; UI-only).** An Accept-with-Fix brova must travel back *with* its order's finals. When a dispatch batch includes an Accept-with-Fix brova (a `brova` back at the workshop, `ready_for_dispatch`, `acceptance_status: true` — the durable marker; plain-Accept never returns and Reject-Repair has `acceptance_status: false`, so neither triggers this) **and** the same order has ≥1 **final** still in production at the workshop not in this batch (`location: workshop`/`transit_to_workshop`, `piece_stage NOT IN (ready_for_dispatch, completed, discarded)`), show a blocking confirm: the finals aren't ready — send the brova without them? Confirm dispatches as selected; cancel aborts. No lifecycle/RPC state changes.
- **Linked-order stranded-sibling confirmation (workshop dispatch only; UI-only).** A second dispatch guard, for the cross-order case: when the batch's order belongs to a **link group** (§2.13) and a **linked sibling order** still has garments on the workshop side not in this batch, confirm before splitting the group. See §2.13 for the exact predicate. Outside these two cases there is no dispatch confirmation; both may apply to one batch.

**7. Shop receives** — brovas → `piece_stage: awaiting_trial`; finals → `piece_stage: ready_for_pickup`; both `location: shop`.

**8. Brova trial → finals release → collection** — all outcomes in §2.5.

**Home-based brand variant (§1).** A home-based brand's WORK order runs the same production spine with the brova surface removed. At **1B** every garment is created `final` — no brova, so no brova-parking and all start `waiting_cut`. At **1C** payment is taken inline (no cashier queue; step 2 is skipped) and `home_delivery` is forced true (pickup is not offered). Production (3–6) is identical. At **7** finals land `ready_for_pickup` as usual. **8 has no trial:** once **every** garment of the order is back at the shop and `ready_for_pickup`, the order is handed over as a whole on the brand's **Delivery page** (§5), stamping the same final handover (`fulfillment_type: delivered`, `piece_stage: completed`, `order_phase: completed`). With no brova, `acceptance_status` / `feedback_status` are never written and the §2.5 branch tree does not apply.

### 2.5 Branch tree — every outcome

**Brova trial:**

| Action | piece_stage | feedback_status | acceptance_status | Finals | Back to workshop? |
|--------|-------------|-----------------|-------------------|--------|-------------------|
| Accept | `brova_trialed` | `accepted` | `true` | released | No |
| Accept with Fix | `brova_trialed` | `needs_repair` | `true` | released | Yes (trip+1, later) |
| Reject – Repair | `brova_trialed` | `needs_repair` | `false` | stay parked | Yes (trip+1) |
| Reject – Redo | **`discarded`** (terminal) | `needs_redo` | `false` | stay parked | No — see redo outcomes below |

- **Finals-release gate:** ANY one brova with `acceptance_status: true` releases ALL parked finals. Mixed outcomes (B1 accept, B2 reject) → finals still released; B2 reworked in parallel.
- **Reject-Redo is decided at the brova trial — shop-initiated** (the previously-deferred showroom-initiation; the workshop no longer creates replacements). Choosing redo discards the original brova permanently (`discarded`, `needs_redo`, `acceptance_status: false`). **Redo no longer captures a `root_cause`** — fault attribution was a workshop step in the old flow; it now belongs to the investigation flow (§2.10, deferred), not the shop's operational redo. The discarded original's scrap is annotated **without** attribution (`root_cause` left null). The staff then picks **one of three redo outcomes** (an explicit required choice — no default):

  1. **Replacement from our stock** (company fabric, `fabric_source: IN`). A fresh FK-linked replacement row is created **at the shop** (`location: shop`, `trip 0`, `waiting_cut`), inheriting the (feedback-corrected) spec. Its fresh cut of `fabric_length` is **auto-consumed from shop stock** at creation (same side/guard as order confirmation); the replacement then **waits in the shop dispatch queue** and is dispatched to the workshop like any fresh garment, running the whole production process and returning for its own trial. Replacements can themselves be redone → unbounded chain (accepted). If shop stock is **short**, the replacement is created but **parked in dispatch** (`waiting_material`) — not dispatchable until restocked, the fresh `-L` consumption **deferred** to the resume step (the scrap annotation below is still written: the discard is a fact now).
  2. **Replacement from the customer's fabric** (`fabric_source: OUT`). The same shop-created replacement, flagged **customer-must-provide** and **parked in dispatch** (`customer_decision`) — nothing is consumed or wasted from our stock. It waits until the customer brings the cloth, then resumes and dispatches. The replacement's fabric source is a **redo-time choice** and may differ from the original's (the scrap annotation below keys on the *original's* source, the consume/park on the *replacement's*).
  3. **No replacement — discard & promote a final to brova.** No replacement row is created. The staff picks **one parked final**, which is **promoted to a brova** (`garment_type: final → brova`, released `waiting_for_acceptance → waiting_cut`), goes through production and returns for its own trial; the **remaining finals stay parked** on this promoted brova (the discarded brova's `replaced_by_garment_id` points at it, so the §2.8 "finals waiting on replacement brova" label applies). The promotion is **recorded on the promoted row** (audit). No fresh fabric is consumed — the final's cut was already committed at confirmation. The customer **refund** for the discarded brova is the cashier's §2.6 action (the feedback page is feedback-only and writes no money). If there is **no parked final to promote** (single-garment order, finals already collected), the outcome is just discard + cashier refund — nothing is promoted, no replacement auto-created.

  **Common to all three:** the **discarded original's already-cut fabric is recorded as net-zero material waste** (qty conservation), surfaced in the waste report (§4) — it does **not** return to stock — **but only for company (`IN`) original fabric**; a customer-brought (`OUT`) original was never in our stock, so no annotation. The annotation carries **no `root_cause`** (left null — see above; attribution is the investigation flow's job, §2.10).
  **Resume (shop dispatch).** A replacement parked `waiting_material` / `customer_decision` is un-parked from the shop dispatch queue once the blocker clears: `waiting_material` re-runs the deferred fresh `-L` consumption; `customer_decision` just clears the flag (the customer's cloth never touches our stock). The scrap annotation, already written at creation, is not re-written.

**Finals release** (manual "Start Production"): parked finals `waiting_for_acceptance → waiting_cut`, then normal production. **Stuck state (accepted):** if ALL brovas were rejected (none ever accepted) and a brova still exists to act on, finals park indefinitely — manual intervention only, no timeout. (Contrast the §2.6 orphaned-finals edge: the only brova is gone, so finals must release.)

**Final collection.** Finals do **not** go through the trial-feedback form — *feedback (the satisfaction / measurement-review / accept-repair-redo form) is a brova-trial concept only.* A final is **collected at handover** (the cashier shell, §3): marked `collected` or `delivered`, pickup ungated on payment. The outcome rows below remain valid lifecycle transitions, but **how a problem with a finished thobe is raised without a feedback form** (misfit → repair/alteration, or needs-redo) is an OPEN showroom decision — see the feedback open-questions draft (`QUESTIONS_SHOP.md`). Until resolved, treat the rows below as the lifecycle targets, not as a feedback-form flow.

| Outcome | piece_stage | fulfillment_type | Next |
|---------|-------------|------------------|------|
| Accept – collected | `completed` | `collected` | Terminal |
| Accept – delivered (home delivery) | `completed` | `delivered` | Terminal |
| Needs Repair | `brova_trialed` | — | Alteration cycle (trip+1) |
| Needs Redo (non-alteration) | `discarded` | — | Replacement row — same fabric-auto-consume / material-waste / `root_cause`-capture / OUT-parking / material-unavailable rules as Reject-Redo above |
| Needs Redo (alteration-type order) | NOT discarded | `needs_redo` | Same row loops back (customer property never discarded) — **but `order_type: ALTERATION` (alteration-out, §2.14) has no feedback/trial form, so this verdict is unreachable for it; a still-wrong alteration-out is re-issued as a fresh alteration order** |

**Sending garments back** (Shop "Return to Workshop"): `piece_stage: waiting_cut`, `location: transit_to_workshop`, `trip_number += 1`, `in_production: false`, production fields cleared. No max trip.

**Workshop re-receives** (Alterations section, trip ≥ 2): one section covers every returning garment (brova/final trip 2+) and QC-fail rework regardless of trip. No brova-approval gate. Resets `piece_stage: waiting_cut` if still `brova_trialed` with feedback.

**QC fail:** **no trip increment.** Garment bounced to the earliest failed rework stage; a breadcrumb routes it back to QC; the attempt is logged in the trip's `qc_attempts`. Labeled `alt_p`. No max-attempt cap.

**Feedback updates the target spec, not just the verdict.** A feedback submission (at the brova trial) carries optional measurement deltas (each reason-tagged) and style/option changes, applied to the garment's spec at submit time — so every downstream path inherits them: the row that loops back on repair, the cloned Reject-Redo replacement, and parked finals on release.

- **Feedback changes are within the first cut — size never grows.** The fabric is cut once (the manually-entered `fabric_length`, committed at order confirmation); after that **only the measurement (adjusted within the existing cut) and the style options can change** — the garment's *size cannot be increased* beyond what was cut. So a feedback change never needs additional fabric and never re-checks/re-consumes stock. A genuine size increase is only possible via a **Reject-Redo** (a fresh garment, fresh cut, auto-consumed — §2.5 redo rules). This is why feedback touches the spec but never `fabric_length`/stock.

- **Measurement reason gates propagation.** `customer_request` **and** `shop_error` write a new measurement row and repoint `measurement_id` — both mean the *recorded spec itself was wrong* (the customer wants a different size; the shop recorded the measurement wrong), so the target must change. `workshop_error` is audit-only (the spec was right, the workshop built it wrong — target unchanged, garment re-fixed to spec). These map to the §2.9 taxonomy: `customer_request`≡`customer_change`, `shop_error`≡`showroom_error`, `workshop_error`≡`production_error`.
- **A reason alone flags a measurement — no new value required.** A measurement surfaces as a flagged alteration/QC item when its value **changed** OR a fault reason was recorded against it, *even with no corrected number entered*. A reason-only flag is recorded (in the feedback diff + `difference_reasons`) and shown in the workshop QC terminal so the executor re-checks that measurement against the **unchanged** target spec (it does not propagate — only `customer_request` *with* a value re-points the spec). The "flagged" rule is one shared predicate used by both the shop recorder and the workshop terminal.
- **Attachments are filed per style option, not in one shared bucket.** Each feedback photo/voice note is captured against a specific style option (collar, cuff, jabzour, …) so the workshop sees it **beside the exact style it describes** and knows where the issue is. The workshop terminal renders each style's media next to that style; any media not tied to a style (legacy feedback from before this rule) shows in a separate read-only group.
- **Feedback is one record per brova, per trip — finals are assignment targets only.** Brovas are the only feedback unit; there is no per-final verdict or feedback form. Parked finals are assignment targets for the measurement and style overrides described below; they do not submit their own feedback. This replaces the old per-final "Adopt/Keep measurement (forced, no default) + match-brova/custom style" model.

- **Measurement override (below the measurement table).** When a spec-correcting reason (`customer_request` or `shop_error`) is recorded with a value, the system stages exactly **one new derived measurement** for the brova (e.g. "M3, derived from M1") — multiple corrected fields still produce a single new measurement. Below the measurement table an override grid lists every other garment whose assignment may be affected: **parked finals AND the sibling brova if it originally shared this brova's measurement** (measurement propagation is order-scoped — the per-brova rule governs only the feedback record, not which garments the new measurement is applied to).

  The grid defaults are **bounded by shared source measurement**: garments that originally shared the brova's `measurement_id` default to adopting the new measurement with the corrected values pre-filled (a staff convenience, not a forced choice — supersedes the old forced-no-default rule); garments that did not share the brova's measurement default to keeping their own. "Apply to all" applies to the shared group only, not to non-shared garments. The per-garment selector is **fully open** — it lists every measurement currently in play (originals and the new derived one), so staff may manually assign the new measurement to a non-shared garment. Reassigning a garment from one new measurement to a different new measurement triggers a confirmation step. A **right-side verification sheet** lists every measurement in play with its lineage (original or "derived from M1") and which garments follow it, so staff can verify before submitting.

  Cross-brova pre-fill: after a brova is submitted and its shared-group garments are repointed to the new measurement, opening a sibling brova that originally shared the same measurement shows its correction form pre-filled from the already-corrected measurement. (The pre-fill derives from the committed database state, not from an unsubmitted draft.)

  A correction is only adoptable when a spec-correcting reason produced a new measurement row; `workshop_error` is audit-only and offers no measurement to adopt.

- **Style override (finals only — never touches another brova).** Below the measurement section, a style override block covers parked finals only; it never modifies another brova's style. The default is each final **keeps its own existing style** (no auto-propagation from the brova). An opt-in **"apply brova style to all finals"** action copies the brova's corrected style onto all finals. If any final has a different collar type from the brova, this action opens a **three-way prompt**: apply to all finals (including the different-collar ones), apply only to finals that share the brova's collar type (leaving the different-collar finals untouched), or cancel. With no different-collar final the style is applied directly. Full per-final style editing is available in all cases.

- **Feedback editing is gated by two locks (either closes the form to read-only history).** Acceptance does **not** lock: after Accept or Accept-with-Fix the feedback stays correctable until production starts — for finals (gate 2) or for this brova's own fix/alteration (gate 1, the brova leaves the shop). (1) The brova must be physically in the shop: once dispatched to the workshop (needs-fix — i.e. its alteration/fix production) or after the garment is completed/delivered/collected, the page shows the previous feedback history read-only. (2) Once any final in the order is **in production** — the workshop has *started* it (`in_production: true`, which the "Receive & Start" step sets while the piece is still `waiting_cut`) or it has reached `cutting`/later — no feedback can be added or edited and finals cannot be reassigned — the page becomes read-only order-wide. Note the boundary: a brova's acceptance *releases* parked finals to `waiting_cut` but does **not** itself lock the page; editing stays open until the workshop actually starts a final.

- **Feedback is a brova concept only — finals and returned Accept-with-Fix brovas are collect-only.** The only garments that are *feedback subjects* (appear on the trial-feedback page and surface a feedback action at the showroom) are **brovas at the shop that still need a trial**. **Finals are never fed back** (they are handed over and collected at the cashier, §3 — see "Final collection" above). A **returned Accept-with-Fix brova is also collect-only**: the customer already accepted at the original trial, so when its fix comes back it is **handed over, not trialed again** — no second feedback form. Only the **Reject-Repair** branch (the customer never accepted) re-trials on return. The two cases are told apart by the persisted `acceptance_status` (Accept-with-Fix `true`, Reject-Repair `false`), which survives the dispatch round-trip while the per-trip verdict (`feedback_status`) is cleared on return: an accepted brova carrying **no live verdict** has been through its fix and come back (collect-only), whereas a *freshly* recorded Accept-with-Fix still at the shop keeps its verdict and stays editable until production (the gate above). On receive-at-shop an already-accepted brova therefore lands at `ready_for_pickup` (collect), not `awaiting_trial`.

- **A style change reprices the order on feedback submit (staff-confirmed).** A style change at the brova trial rewrites the garment's style spec (so the workshop builds the right thing) **and** recomputes the price for the garments whose style actually changed — the active garment plus any parked finals the change was propagated to. The new per-garment style price is computed with the **same catalogue/rules engine used at order creation** (price is never derived from two different logics), so the **flat-override styles (qallabi collar, designer) keep their fixed price**: tweaking other options on a flat-priced garment moves nothing, and only a flip *into or out of* a flat style changes its price. The submit-confirmation step shows the **old → new order total and the delta** so staff settle the change deliberately; if no priced field moved (e.g. a flat-style option tweak, or a measurement-only correction) there is no price line and no reprice — **but a style-spec change still mints an invoice revision (§3) even when `order_total` does not move**, because the printed style line items changed (a measurement-only correction changes neither the price nor a printed style field, so it does not bump). The recompute is **style-only** — **fabric/stitching/delivery/express are not repriced**, only the style component of `order_total` moves (the delta is added to the current total, so any earlier discount/delivery adjustment is preserved). It writes each changed garment's style-price snapshot, the work order's style charge, and `order_total`, **never `orders.paid`** (collection stays the cashier's job at settlement, §3); it is **idempotent** and **audit-only** (records who/why + the old→new delta, no approval gate; can move the total up or down; a drop below amount-paid leaves a credit for a manual cashier refund, §2.6). **The needs-redo verdict does not reprice here** — the discard/replacement/promote lifecycle owns its own material and pricing handling. On submit the page shows a **non-blocking reminder** of the resulting money state — extra to pay, balance still due, a refund owed (overpaid), or fully settled — and points staff to the cashier; on a needs-redo submit it instead reminds that **any refund the customer wants for the discarded brova is the cashier's manual call** (the cashier already sees the discarded garment in the order and refunds it per §2.6). The reminder never collects or refunds anything — collection and refunds are always the cashier's manual action.

### 2.6 Cancellation / refund

Per-component (fabric/stitching/style/express/soaking) or shelf-qty refund, taken by the cashier. Records a `refund` payment_transaction (reason required); `orders.paid` drops via the summing trigger. Order stays `confirmed`. Affected garments get `refunded_*` flags. A **full garment refund → `piece_stage: discarded`**, offering optional fabric-restock (return uncut fabric to shop stock, default off). A **full-order cancel** sets `checkout_status: cancelled` — garments NOT auto-discarded (in-progress workshop work may continue/orphan — accepted).

**Refund policy is staff judgment — the system imposes no restriction (decided 2026-06-03).** There is deliberately **no automated stage / material-ownership / fault gating** and **no "consult factory before refunding started production" block** — the cashier decides full / partial / no refund per amount and reason, by hand. The system enforces only the mechanical guardrails below (amount cap, reason required, full-garment discard, orphaned-finals release, idempotency); it does not compute *who is owed what*. (Supersedes the Q5 stage/ownership/fault matrix that Group B had drafted — that matrix is **not** built.)

**Edge rules:**

- **Capped amount.** A refund may not drive `orders.paid` below 0; without selected items it's capped at the overpayment; with items, at the selected items' total + overpayment.
- **Post-hand-over exception.** A full refund of an already-`completed` (handed-over) garment refunds money + sets `refunded_*` flags but the garment **stays `completed`** (you can't un-deliver it), and **fabric-restock does not apply** even if requested. Discard applies only when `piece_stage NOT IN (discarded, completed)`.
- **Refund-discard side-effects.** Also sets `in_production: false`, clears `start_time`, `feedback_status`, `acceptance_status`. `location` is left as-is — a garment refund-discarded while `transit_*` keeps its transit location and is silently dropped at the receiving step (documented, not auto-fixed).
- **Per-garment isolation.** A refund on one garment never mutates a sibling's stage or `refunded_*` flags.
- **Idempotent** on the idempotency key.
- **Orphaned-finals rule.** Refund-discarding the **last remaining brova** releases its parked finals (`waiting_for_acceptance → waiting_cut`). Distinct from the "all brovas rejected → park indefinitely" case: there a brova still exists to act on; here the only brova is gone, so the finals have no release path. The §2.6 refund-discard never auto-creates a replacement and never promotes a final — those are the brova-trial **redo outcomes** (§2.5). Contrast §2.5 outcome 3, where redo deliberately **promotes one final to a new brova** (re-trial) rather than releasing all finals straight to production: the refund-discard path is the cashier's pure-refund exit (finals go to production untried), the redo-promote path preserves the trial.

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
| `alteration_in` | Alteration garment at shop needing trial/action (trip 2+ `awaiting_trial`, or `needs_repair`/`needs_redo` at alteration threshold) **and not already accepted** (`acceptance_status ≠ true`) — a returned **Accept-with-Fix** brova is excluded (collect-only; it lands `ready_for_pickup`) | Trial returning alteration (Reject-Repair only) |
| `alteration_out` | Alteration-type order (`order_type: ALTERATION`) — single label (§2.14) | View the order; collect/hand over at the cashier (no feedback form) |
| `brova_trial` | Brova at shop, `piece_stage: awaiting_trial` | Customer tries brovas |
| `needs_action` | Any garment at shop with `feedback_status: needs_repair/needs_redo` | Send rejected garment back |
| `ready_for_pickup` | Everything else visible (incl. partial: some at shop, others out) | Customer collects ready items |

**Priority:** `alteration_in` > `brova_trial` > `needs_action` > `ready_for_pickup` (action-first). `partial_ready`/`awaiting_finals` were collapsed into `ready_for_pickup` (the list shows an x/y received count).

Worked scenarios: B1 accepted + B2 rejected → `needs_action`. B1 accepted, finals not here → `ready_for_pickup`. Finals ready, one brova still repairing → `ready_for_pickup`. 4 collected, 1 needs fix → `needs_action`. Returning final (trip 2+) clean → `ready_for_pickup`. Returning final rejected again → `alteration_in`. Returning **Accept-with-Fix** brova (accepted) → `ready_for_pickup` (collect-only, no re-trial); returning **Reject-Repair** brova (never accepted) → `alteration_in` (re-trial). No shop items but finals in transit → `ready_for_pickup`.

**Workshop labels** (order-level, Production Tracker). Brova returns/alterations also tracked as individual garments in their own tabs.

| Status | Condition |
|--------|-----------|
| At shop | All garments at shop |
| Ready for dispatch | All workshop garments at `ready_for_dispatch` |
| In transit to shop | Garments in transit, nothing active at workshop (or only parked finals) |
| Brovas in transit | Brovas in transit to shop, only parked finals remain |
| Awaiting finals release | Brovas at shop + ≥1 accepted, finals still parked |
| Awaiting brova trial | Brovas at shop + none accepted yet, finals parked |
| Finals waiting on replacement brova | Finals parked at `waiting_for_acceptance` while a `discarded` brova's replacement brova is still in flight (`replaced_by_garment_id` set, replacement `piece_stage NOT IN (completed, discarded)`) — the replacement brova is either a freshly-created redo replacement (§2.5 outcomes 1–2) or a **promoted final** (§2.5 outcome 3). **Flag-only** — finals correctly stay parked; the replacement brova will release them on acceptance. Distinct from the §2.6 last-brova-refund-discarded **auto-release** (there the only brova is gone, so finals must release; here a replacement brova exists, so they stay parked). |
| Finals in production | Finals actively worked (not `waiting_for_acceptance`) |
| Brovas in production | Brovas being worked |

**Priority:** at shop > ready for dispatch > in transit > awaiting finals release/brova trial > finals waiting on replacement brova > finals in production > brovas in production > fallback "In production". If a brova is returning AND finals are in production → "Finals in production" wins (main order work).

### 2.9 Root-cause taxonomy (shared attribution vocabulary)

A single canonical **"who is responsible / why did this happen"** vocabulary, shared by everything that attributes a quality event: redo + scrap recording (§2.5), redo material waste (§4), performance attribution (§6). No feature redefines the set.

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

- **Measurement-reason gates (§2.5)** = the measurement-scoped view of this taxonomy: `customer_request`≡`customer_change`, `shop_error`≡`showroom_error`, `workshop_error`≡`production_error`. Keep the shop-**recorded** (`showroom_error`) vs workshop-**executed** (`production_error`) split — don't collapse measurement into one bucket. The split is what drives propagation: a **recorded** error (the spec is wrong) re-points the spec; an **executed** error (the build is wrong) leaves the spec and re-fixes the garment.
- **Waste physical-reason categories (§4 `WASTE_REASONS`: `supplier_defect` / `staff_mistake` / `customer_damage` / `lost` / `mis_cut` / `other`)** are a separate axis — "what physically happened to the stock," not "who is responsible." A redo's wasted fabric can carry **both** a `WASTE_REASONS` reason and a `root_cause`. Damage/Waste keeps `WASTE_REASONS`; this taxonomy does not replace it.

**Persistence.** The DB enum `root_cause` is the single source of truth (mirrored in `schema.ts`); the value→responsible-party mapping lives in exactly one SQL helper (`root_cause_responsible_party`). The frontend label set (`ROOT_CAUSES`) imports these six values — no group invents its own.

---

### 2.10 Repeated-returns investigation — auto-hold removed (Q3)

A garment that keeps coming back is **no longer auto-flagged, hidden, or blocked**. The earlier auto-hold — flag `needs_investigation` at **≥ 2 quality / ≥ 3 total returns**, drop the garment out of production, and reject any restart until a manager recorded an investigation, with a manager-resolution dialog (root cause / decision / corrective actions) on a workshop **Decisions** surface — has been **removed in both apps**. Nothing holds or blocks a garment on repeated returns.

**Two return counters survive as derived metrics** — both computed, never hand-maintained, and now feeding only QC analytics / performance attribution (§6), no auto-hold:

- **Quality returns** = the count of **QC fails** in the garment's history (each `result: "fail"` quality-check attempt in `trip_history`). QC-fail rework does not bump the trip, so this is independent of trip number.
- **Alteration returns** = **`trip_number − 1`** (trip 1 = initial production; each later trip is one customer-driven return to the workshop, §2.3).
- **Total** = quality + alteration.

**Investigation / root-cause handling is being redesigned and will live elsewhere** (not a workshop auto-hold surface); it is unspecified here until that design lands. The `needs_investigation` column and the `garment_investigations` table are **retained but vestigial** (no writer, the column never set true) — no destructive drop, matching the `redo_priority` precedent (§6).

### 2.11 Toggle option fields — present-or-absent (shop defaults to No)

Four garment style options are **present-or-absent** answers — **Yes** (the garment has it) or **No** (it does not):

- **`wallet_pocket`, `pen_holder`, `mobile_pocket`, `small_tabaggi`**.

(`collar_position` was previously a fifth toggle here; it is now a **categorical body measurement** — see §2.12.)

**Shop order entry defaults to No (a tick).** On the shop new-work-order garment form each toggle is a single **tick mark** that defaults to **No** — the order-taker ticks only the ones the garment has, and an un-ticked toggle persists as an explicit **No**. There is no "not filled" entry state and no toggle-driven confirmation block on this form: a default-No garment confirms. Editing an existing garment shows the stored answer (a stored `true` is ticked; a stored `false`/null reads as **No**). (The workshop add-garment form still presents each toggle unselected and requires an explicit Yes/No.)

**QC is deliberately not defaulted — explicit answer, both directions.** QC keeps the "not filled" entry state: the inspector is shown each field **unselected** and **cannot leave any of the four blank** — each must be answered to submit QC. Because the spec always carries a real answer (Yes or No), QC checks each field **whether the spec says Yes or No** (not only when Yes): the inspector records what is actually on the garment, and a mismatch in **either** direction is a non-conformity (spec Yes + built absent → fail; spec No + built present → fail).

The answer flows through feedback/redo/replacement like any other style change (§2.5).

### 2.12 Categorical body measurements — shoulder slope & collar position

Two body measurements are **categorical** rather than numeric. Both live on the `measurements` row (per customer, alongside the numeric dimensions — **not** on the garment), are entered as a required choice with **no silent default**, and flow through measurement entry/update/feedback/QC/read-out the same way.

**Shoulder slope** is recorded as one of four fixed shapes — **Sloped Down** (high on the left, dropping to the right), **Sloped Up** (low on the left, rising to the right), **Straight** (level), **Peaked** (rises to a centre point, drops to both sides). Shown unfilled, it must be picked before a measurement / add-garment record is saved (an absent value on a legacy row reads as unfilled and must be answered on edit).

**Collar position** is **Up**, **Down**, or **Standard** (Standard is the neutral position; it is a real choice, stored as the **absence** of up/down — null). It was previously a §2.11 garment style toggle; per stakeholder direction it is a body measurement and is entered next to the shoulder slope. An absent stored value reads as **Standard**.

Both are **categorical** (not numeric tape dimensions): they appear wherever measurements are entered, updated, fed back, QC'd, or shown read-only. In feedback each is corrected like any spec measurement — a spec-correcting reason (Customer Request / Shop Error) re-points it on the newly minted measurement (§2.5). QC verifies each **both directions** by equality (spec value vs. observed), like the §2.11 fields, and the inspector cannot leave it blank. (Printed/positioned diagram templates and the invoice card render the numeric measurements only — these categorical fields are not placed on those fixed layouts; the collar Up/Down annotation still appears in the order/cashier invoices.)

### 2.13 Order linking — deliver several orders together

A customer with multiple in-flight orders can have them **linked** so they share one delivery date and are produced, tracked, and handed over as one set. Linking is a **shop order-management action** (the link / unlink pages); the workshop never links or unlinks — it only **sees** the link and is kept from splitting the group at dispatch.

- **What can link.** Only **confirmed `WORK` orders of the same customer** (never alteration orders, drafts, or completed orders). Two or more orders form a group: one is the **primary**, the rest are **children**. A child carries `work_orders.linked_order_id = <primary order id>` (+ `linked_date`); the **primary's `linked_order_id` is null**. Unlinking clears `linked_order_id`, stamps `unlinked_date`, and restores the order's own delivery date. Linking (and unlinking, per order) applies a single **shared delivery date** across the group.
- **Link-group key.** The group an order belongs to is keyed by **`COALESCE(linked_order_id, order_id)`** — i.e. the **primary's order id**. Every member (primary + children) resolves to the same key; an unlinked order is a group of one (key = its own id). All workshop-side grouping derives from this key; nothing new is stored.
- **Production Tracker shows the group together.** In the workshop Production Tracker the orders of a link group are **clustered adjacently** under a shared "Linked" treatment (a group header carrying the shared delivery date), so staff read them as one deliverable rather than unrelated rows. Members sort to the position of the group's most-urgent member so the cluster stays contiguous; a lone order is rendered exactly as before.
- **Dispatch warns when the group would be split — workshop-side stranding (workshop dispatch only; UI-only).** A linked group is meant to reach the shop together, so dispatching one order's garments while a **linked sibling still has garments on the workshop side** strands the group. When a dispatch batch's order belongs to a link group **and another order in that group has ≥1 garment still at the workshop** not in this batch — `location: workshop`/`transit_to_workshop`, `piece_stage NOT IN (completed, discarded)` (a `ready_for_dispatch` sibling counts: it's ready but not yet selected; a sibling already `transit_to_shop` does **not**, it is already heading to the shop) — show a **blocking confirm** naming the linked order and the count, with the option to send anyway or cancel. This is purely a UI guard: confirming dispatches exactly the selected garments, cancelling aborts; **no lifecycle/RPC state changes**, and the link itself is untouched. It composes with the §2.4·6 Accept-with-Fix stranded-finals confirmation (either or both reasons may apply to one batch).

### 2.14 Alteration-out — customer-brought garment repair

A customer brings in a **completed** garment to be fixed. This is distinct from **alteration-in** (the brova-trial alteration cycle, §2.3/§2.5, where a garment we are mid-producing returns at trip 2+ off a feedback verdict). Alteration-out is its own order: `order_type: ALTERATION`, garments `garment_type: alteration` (created `trip 0`, `waiting_cut`, `location: shop`), a separate invoice sequence, a **manually-entered order total** (not fabric/style-derived), and **never auto-discarded** (it is the customer's property). It runs the **same production flow** as any garment (dispatch → workshop receive → produce → dispatch back).

- **Internal vs external is the primary per-garment choice (required, no default).** **Internal** = a garment **we made**; the order-taker must link the **source garment** from the customer's prior orders (`original_garment_id` — the reference). **External** = made by another shop; no source. The choice is also stored explicitly as `bufi_ext` = `"Internal"` / `"External"` (deletion-robust marker; `original_garment_id` is `ON DELETE SET NULL`).
- **Record only the changes.** Intake captures only the fields that change, as sparse `alteration_measurements` (field → new value) + `alteration_styles` (field → new value). There is **no full-measurement-set mode** and **no current/baseline value shown** — only the **new target value** is entered/displayed, for **both** internal and external (consistency; an external garment has no recorded original, so showing current-vs-new for only internal would confuse). For internal, the source garment's spec is available as a **read-only reference** only; it never pre-fills or mixes into the change set. A garment needs ≥1 change to confirm.
- **Workshop QC checks only the changed fields**, for both internal and external — the flagged measurement keys and the flagged style keys, never the full spec (an external garment has no full spec, and untouched parts must not fail). Expected values come from the recorded changes (changed style expected from `alteration_styles`, not the empty style columns). Quality ratings still apply.
- **Collect-only — no feedback.** After the workshop returns it, the garment lands `ready_for_pickup` and is **collected/handed over at the cashier** like a final (§3, pickup ungated on payment). Alteration-out has **no feedback / satisfaction / trial form** at any point. If a returned alteration is still wrong, staff create a **fresh alteration order**.

---

## 3. Cashier, payments & EOD

- **Cashier split.** A separate role-locked shell (single brand; tabs Pending / All Orders / Order History / End-of-Day). Order-taker confirms with `paid: 0` → order enters the cashier queue (`confirmed` AND `paid: 0`). Payment is recorded as a `payment_transaction` (NOT via the confirm RPC); a trigger sums transactions → `orders.paid`. Partial/installment supported. Idempotent on its key. The **Pending** tab is the focused initial-processing queue (WORK only; minimal filters); **All Orders** is the filtered list (all order types) for follow-up payment/handover/refund.
- **WORK cashier-processing gate.** A confirmed WORK order is **pending cashier processing** until a cashier acts on it, and **cannot be dispatched to the workshop** before then. Processing is either (a) **confirm without payment** — clears the gate with no money and **no open register required** — or (b) recording **any payment** (advance/full/partial, which does require an open register). Either sets a one-time `cashier_processed_at` marker (idempotent; never cleared). The **marker, not payment, is the dispatch gate**: a confirmed-without-payment order (still `paid: 0`) is dispatchable; an unprocessed order is not (the `dispatch_order` RPC rejects it, and the dispatch queue hides it). The marker is also set whenever a WORK order's first payment is recorded anywhere (bulk page or per-order detail), so a paid order is never stranded as pending. **SALES and ALTERATION are not gated** and never enter the Pending queue. Order-taker confirm persists the order's agreed **advance** to `work_orders.advance` for ERTH too (informational — drives the cashier's Advance preset; it is NOT a payment, so `paid` stays 0).
- **Bulk processing.** From the Pending queue the cashier may select several WORK orders and process them together: **confirm-without-payment** for all, or **take payment** for all in one **atomic, idempotent** batch. The bulk-payment page is **payment only** (no refund/handover). Per-order amount entry with **Advance** (the order's `work_orders.advance`) and **Full** (remaining balance) presets, plus apply-to-all shortcuts. The batch is **all-or-nothing**: a single rejection (over-amount, closed register) aborts the entire batch so no order is partially or silently collected. Each order's money still flows through `record_payment_transaction` → the `orders.paid` trigger (never written directly) and counts toward the open session's reconciliation.
- **Invoice & revisions.** Confirmation issues the order's invoice (`work_orders.invoice_number`) at **revision 0 — the original**: the invoice the customer is given and signs. Plain payments (advance / installment / full) record a `payment_transaction` but **do NOT** mint a revision — paying does not change the invoice. A **revision** is minted whenever the **content of the signed invoice changes** on a confirmed order — not only its total. The triggering events are: a **refund** (§3 refund); a **brova-trial style change** (§2.5) — **whether or not it moves the price**, because the printed style line items change (so a flat-priced qallabi/designer swap, or any net-zero style edit, still re-issues the invoice even though `order_total` is unchanged); and a **delivery-type change** (home ↔ pickup, below). Each such event bumps `work_orders.invoice_revision` by one — idempotently (a replayed RPC must not double-bump; a no-op change that alters nothing — a same-price reprice with no spec change, or a delivery toggle to the value already set — does not bump). **Plain payments and measurement-only corrections do not bump**: the numeric tape dimensions and the collar Up/Down annotation are not "style" line items in this sense, so a measurement correction re-issues nothing. Revision 0 prints with **no suffix**; revision N (≥1) prints as `<invoice>-R<N>`. The cashier's Order-History reprints the **proper signed invoice** — the same `OrderInvoice` / `SalesInvoice` document used at order-taking (full Arabic line items + the captured customer signature), reflecting the current revision — while the history still lists **every** payment/refund transaction; staff therefore never need to keep multiple paper invoices. *(Adding a line item to a confirmed order is not yet a supported operation; when built it will mint a revision through the same mechanism.)*
- **Delivery-type change (confirmed orders).** The cashier can switch a confirmed order between **home delivery** and **pickup**. This swaps the delivery charge into `order_total` (home → the `HOME_DELIVERY` price, pickup → 0) and propagates `home_delivery` to the work order and its garments; it **never touches `orders.paid`**, and is **rejected if the new total would fall below the amount already paid** (refund the excess first). Because it changes the invoice's delivery line, it **mints an invoice revision** (idempotent; a toggle to the value already set is a no-op and does not bump).
- **Pickup is ungated on payment** (intentional). The cashier may hand over/deliver with a balance outstanding — staff judgment, not gated on feedback completion or finals-ready state.
- **EOD / register close.** Reconciles cash basis (collected/refunded/net) vs accrual (orders booked) + cash-movement log + per-cashier, then freezes the day.
  - **Who:** the **cashier opens AND closes** their own session (close needs only an active user). **Reopening a frozen/closed day is manager-only** — the sole manager gate in EOD. (EOD close must not wait on a manager; altering a frozen day must.)
  - **Reconciliation:** `expected_cash = opening_float + cash_payments − cash_refunds + cash_in − cash_out`; `variance = counted_cash − expected_cash` (negative = shortage). This is the universal cash-drawer identity (drawer = float + received − paid out) — that identity, not any SQL, is the oracle.
  - **Blind cash count (cashier never sees the target).** The close screen takes only the counted cash; it never shows `expected_cash` or `variance`, so the count can't be back-solved to mask an over/short. Expected/variance stay hidden everywhere in the cashier shell — the close dialog, the post-close register-closed screen, and the cashier's EOD tab (and its printout). The full reconciliation (expected/counted/variance) is visible only in the manager Store > End of Day report. Server-side reconciliation is unchanged — only its visibility is gated.
  - **Per-session attribution:** a cash payment/refund recorded while a session is open is stamped to it and counts toward THAT session's reconciliation on close.
  - **Idempotent close:** a replayed close (same key) returns the original summary and writes NO additional audit event.
  - **Append-only history:** every close writes a `register_close_events` row (never overwritten); the session row keeps only the latest close. Reopen + re-close ⇒ one additional event.
  - **Frozen day rejects money:** with no open session for the brand, payment recording is rejected.
- **Brand gate (brand type, §1).** The cashier is the **showroom-brand** surface; which brands use it is a single source of truth (a brand set + a case-normalizing helper; currently ERTH only). It drives inline-payment-vs-cashier-queue routing, the `/cashier` route guard, and sidebar visibility. Brands not in the set are **home-based**: they take payment **inline at order-taking** and have **no cashier** — their final handover/completion is done on a per-brand **Delivery page** instead (§5).

---

## 4. Inventory & transfers

The store/inventory area is **4 surfaces per app**: Inventory, Transfers, Stocktake, Reports (Shop also keeps End-of-Day as a separate financial page).

**Two stocks, each side blind to the other.** **Fabric and shelf items live only in shop stock — the workshop never holds them**; they are bought, stocked, and consumed entirely shop-side (a work order's fabric is decremented from shop stock at confirmation, never from any workshop count). **Accessories are the only stock that crosses sides**, so an accessory carries both a **shop stock** and a **workshop stock**, counted independently and never summed. **Each app shows only its own side's count** — everywhere (lists, item detail pages, transfer screens). Concretely: the **shop**'s Inventory/Stocktake/Reports cover fabric, shelf, and accessories; the **workshop**'s cover **accessories only** (no fabric/shelf surface, no fabric-usage report). Stock crosses sides only via a recorded **accessory** transfer.

**Ownership — who creates what.**
- The **shop** buys and creates **fabrics** and **shelf items**, and holds the only stock of them. Fabric also carries a **season** (`summer`/`winter`, optional) shown on the item so staff can eyeball a season's stock.
- The **workshop** owns **accessories** — its operating stock. An accessory is **anything the workshop holds as equipment/supplies** (e.g. laptops, scissors, printers, sewing supplies); not restricted to a fixed list.
- A side may **restock/adjust** stock it physically holds, but only the **owning** side creates the catalogue entry (the workshop has no "Add fabric/shelf"; the shop has no "Add accessory"). Accessories are workshop-owned but, once transferred, can be held and adjusted on the shop side too.

**Customer-brought fabric.** A garment may use the customer's own cloth (`fabric_source: OUT`), recorded descriptively (colour/source/length) with no catalogue link. Never part of either stock, never decremented. (Redo/refund handling in §2.5/§2.6.)

**Stock-movements ledger.** Every stock change writes an append-only `stock_movements` row, auto-logged by AFTER-UPDATE triggers. Callers stamp context (why/who/ref/supplier/cost/reason) before the UPDATE. Missing context → the trigger defaults to `movement_type='adjustment'`, `reason='unattributed'` — **no change is ever silently unlogged.**

- **movement_type:** `restock` · `consumption` · `transfer_out` · `transfer_in` · `adjustment` · `waste` · `return`.
- Stock-mutating RPCs (restock, adjust, consume-for-order, transfer dispatch/receive, order completion) all stamp context before their UPDATEs.
- **Brand attribution on consumption.** A work-order fabric `consumption` row also carries the **consuming brand** (the order's `brand`), stamped from the order at confirmation. Because home-based brands (§1) hold no stock and draw their fabric from ERTH's shared shop pool, this is what lets ERTH's fabric report show how each brand draws it down (Reports, below). Other movement types need no brand.
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

**Redo material waste** (resolves §2.9's forward-reference). When a redo discards a garment (§2.5), its already-cut fabric is scrap — but that length already left stock as a `-L consumption` at order confirmation, so a second decrement would double-count and break conservation. Instead the scrap is recorded as a **net-zero `waste` annotation**: a `stock_movements` row with `qty_delta = 0` carrying the wasted length in `annotated_qty` (a column alongside `qty_delta`) and the per-unit `unit_cost`. The `stock_movements.root_cause` column is left **null** — the shop redo (§2.5) no longer captures attribution; if a redo later needs a responsible party, the redesigned investigation flow (§2.10, TBD) records it. The replacement's fresh cut is a **real `-L consumption`**; net ledger change is `-2L` (one wasted cut + one good replacement physically gone) → conservation holds exactly.

- **Company vs. customer fabric.** Company fabric (catalogue-linked) → the replacement auto-consumes a fresh `-L` and the scrap is annotated as above. Customer-brought fabric (`fabric_source: OUT`) → **neither** consumed nor wasted from our stock (never part of either count); the replacement is flagged customer-must-provide and parked (§2.5). These two axes are keyed independently at redo: the scrap annotation follows the **original's** fabric source (company `IN` only), while consume/park follows the **replacement's** chosen source (§2.5).
- **Waste report surfaces it.** Aggregates count waste via `SUM(ABS(qty_delta) + COALESCE(annotated_qty, 0))` so annotations (real qty `0`, length in `annotated_qty`) and real wastes (length in `qty_delta`, `annotated_qty` null) sum without double-counting. A **waste-by-`root_cause`** aggregate (qty + cost, `cost = Σ qty × unit_cost`) joins the existing by-reason-category breakdown.

**Transfers — request → send → receive (no approval gate).** **Only accessories are ever transferred** — fabric and shelf never cross to the workshop, so neither app offers them as a transfer item type (both the request/send picker and the list filters are accessories-only).
- **Request:** either side requests accessories + quantities from the other, **without seeing the source side's stock** (invisibility holds).
- **Send:** the owning side fulfils directly — **no approve step**. Sends the **full**, a **partial**, or **none**. Sent stock leaves the source count and travels **in transit**.
- **Receive:** the destination confirms arrival; stock lands in its count. A partially-sent transfer stays open for the remainder.
- **Direct / bulk send:** a side may **push** accessories with no request (e.g. returning a batch of devices). Bulk send is atomic — all decrements + in-transit rows commit or roll back together.
- UI tabs: `Needs my action` / `Active` / `All` / `History`. Per-row action = transfer status (`requested` → send · `dispatched`/`partially_received` → receive) × role × side. No `approved` state, no approve/reject.

**Reports** — each side's reports cover **its own stock movements only** (its `location`). The **shop** reports KPI cards (restocked/consumed/net/lost), top items by movement type, and recent adjustments; its **fabric** report additionally breaks **consumption down by consuming brand** (ERTH vs the home-based brands, §1) — the **only** cross-brand view in the system; every other surface is per-brand. The **workshop** holds no fabric, so it has **no consumption / fabric-usage report** — its reports cover only the accessory flows it actually has (restocked, received, sent out, lost). Both surface a **waste breakdown** (by reason category, with cost impact) on a ~2-week cadence and the stocktake-history view.

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

## 5. Shop app (`apps/pos-interface`) — behavioral rules

> UI direction, typography, and tech-stack conventions for this app live in `ENGINEERING.md` §11.

**Role shells.** Order-taker shell (order creation, garment tracking, customer mgmt) and a separate role-locked Cashier shell (§3). Brand is determined by the authenticated user.

**Home-based brand order-taking (§1).** For a home-based brand the new-work-order form takes payment **inline** (no cashier deferral) and **forces home delivery** — the Pick-Up option is not shown and `home_delivery` is set true on every garment. Garments are created **final only** — the brova option is not offered — so the order has no trial and no parked finals.

**Delivery page (home-based brands).** Each home-based brand shell carries a dedicated **Delivery** surface — the home-brand analogue of ERTH's cashier handover (§3), scoped to that brand and **never shown on ERTH**. It lists the brand's confirmed WORK orders that are **ready to deliver**: every garment of the order back at the shop and `ready_for_pickup` (the same readiness the showroom `ready_for_pickup` label derives, §2.8). Delivery is **whole-order, all-or-nothing** — the action is enabled only when **all** the order's garments are present, and completing it hands over the entire order in one step through the shared handover RPC (every garment → `piece_stage: completed`, `fulfillment_type: delivered`; `order_phase: completed`). A delivered order leaves the ready list for a delivered/history view. **No money is handled here** (payment was taken at order-taking) — it is purely the final-handover completion these brands otherwise lack.

---

## 6. Workshop app (`apps/workshop`) — behavioral rules

> Typography, color, layout, primitives, and date-handling conventions for this app live in `ENGINEERING.md` §12.

**Worker team (unit) assignment — explicit, never silently defaulted.** A worker (a `resources` row) belongs to a **unit** (team) within its production stage. In create/edit, the manager **explicitly picks the team** for **every station the worker runs** — cutting, sewing, finishing, ironing, quality-check — via a visible, required picker (with inline "create team" when a station's first/second team is needed). Never silently default to the first/lowest-id unit (that silently re-pins e.g. a second-cutting-table worker back to "Team A" on every routine edit). On edit, each picker is pre-filled from the worker's *actual* current unit (not recomputed), so saving an unrelated field never moves their team. **Soaking is excluded** (all-hands, negligible labor; not on the Performance page) and keeps auto-assignment; `post_cutting` is disabled.

**Redo replacements arrive shop-initiated (§2.5); the redo-priority queue is dropped.** Redo is decided at the brova trial in the shop: `root_cause` (§2.9) is captured there and the replacement is created **at the shop**, waiting in the **shop dispatch queue**. The only special state is the dispatch wait, marked by `redo_parked_reason` — a replacement short on company fabric is `waiting_material`, a customer-fabric (`OUT`) replacement is `customer_decision` — and the **shop resume** action un-parks it (re-running the deferred `-L` consumption for `waiting_material`; just clearing the flag for `customer_decision`, since the customer's cloth never touches our stock; the scrap annotation written at creation is **not** re-recorded), then dispatches it. Once dispatched the replacement is a **100% normal garment** in the workshop — there is no `immediate`/`next_slot`/`parked` redo prioritisation, no workshop "redo to create" / "parked redos" sections, and no workshop create/resume actions. (The `redo_priority` column is retained but unused/vestigial — no destructive drop. The repeated-returns investigation auto-hold was removed — §2.10.)

**Linked orders are visible, not editable (§2.13).** Order linking is a shop action; the workshop only **sees** it. The Production Tracker **clusters a link group's orders adjacently** under a shared "Linked" header so they read as one deliverable, and the **dispatch page warns** before sending one order's garments while a linked sibling still has garments on the workshop side (the stranded-sibling confirmation, §2.4·6 / §2.13). The workshop never links or unlinks.

**Performance scoring — per-station model (Q1).** The Performance page scores production at the **same granularity each station is assigned** (the worker-team rule above):

- **Individual** scoring for **cutting, finishing, ironing, quality-check** — each worker carries their own output / efficiency / quality.
- **Sewing is scored at the unit (team) level only** — members share the unit's output; there is **no** individual sewing-operator breakdown (the objective is unit performance, not internal competition).
- **Soaking does not appear on the Performance page at all** — a time-based technical stage with negligible labor; it lives in the workflow surfaces (scheduler / dashboard) only, never as a scored worker, unit, or summary stat.
- **Defect attribution is per station/unit** (a stage that caused a QC fail is genuinely attributable to who executed it) — kept. **Customer acceptance is NOT team-attributable** (see redo impact): a customer accepting/rejecting at trial is a whole-production outcome, so there is **no per-unit "accept rate"** (the page keeps only the whole-shop accept rate).

**Redo performance impact (Q14) — attribution by `root_cause`, no blanket penalty.** A redo's performance cost is charged to the **responsible party derived from its `root_cause` (§2.9)** — never a blanket penalty on the factory:

| `root_cause` | Responsible party | Performance impact |
|---|---|---|
| `production_error` | production | production team impacted — quality score, redo rate, waste cost |
| `qc_escape` | QC | QC impacted — **but** a customer rejecting **design/style** (not a technical defect) is a `customer_change`, not a `qc_escape`, so QC is **not** penalized for taste |
| `showroom_error` | showroom | showroom responsibility — factory **not** penalized |
| `customer_change` | customer | no internal penalty |
| `material_defect` | supplier | supplier — factory **not** penalized |
| `other` | unattributed | no party penalized |

- **Labor on a redone (discarded) garment is double-classified:** it still counts as **productive effort for capacity analysis** (the work really happened) **and** as **failed-quality cost** in performance reporting — the two are never netted against each other.
- The Performance page surfaces a **redo impact by responsible party** breakdown (redo count + wasted-material cost), reading the redo material-waste annotations (§4, tagged `reason='redo'`) grouped by `root_cause`. Material cost is recorded only for **company** fabric — customer-brought (`OUT`) redos carry the attribution but no material cost (§4).

**Per-defect team attribution (manual).** On a QC fail, the **fail dialog** shows each defect as **Found → Should be** with a **"Caused by" column**: the inspector tags each failed row (measurement / option / quality aspect) with the production stage that caused it — **cutting / sewing / finishing / ironing** (soaking is a water dunk and QC is the inspection itself, so **neither is attributable**). The responsible **individual** (cutting / finishing / ironing) or **sewing unit** is resolved "underneath" from that trip's `worker_history` (falling back to `production_plan`) and frozen on the attempt as `defect_attributions`. Attribution is **optional per defect** (a blank row stays unattributed → bucketed `(unassigned)`) and does **not** gate sending the piece back; it is **manual** — an automatic error-type→stage suggestion is a planned future enhancement. The separate "Return through stages" picker is unchanged and independent (attribution is blame, not routing).

**QC analytics (Q2) — the 1–5 ratings, used analytically.** The QC pass/fail rule is unchanged (any quality aspect rated **< 4** = non-conformity → back to production); on top of it a **QC Analytics** surface reads the stored ratings/breadcrumbs (the per-attempt `quality_ratings`, `failed_measurements`, `failed_options`, `return_stages`, `defect_attributions` accumulated in each garment's QC history) for a date range and shows:

- **Defect-category breakdown** — each quality aspect (seam, ironing, front pocket, collar, jabzour, hemming) analyzed separately: average rating + fail count + sample size, worst-first.
- **Measurement- and option/specification-defect breakdown** — the same lens extended to spec defects (which measurement fields / which options fail most). The four toggle options (§2.11) are checked both ways (spec Yes built absent, or spec No built present), so a defect surfaces in either direction.
- **Defect origin by stage** — fails grouped by the `return_stages` the QC routed them back to (where quality problems come from).
- **Defects by team & worker** — every attributed defect (the `defect_attributions` above) grouped by the responsible stage and the worker/unit who did it, with a measurement/option/quality split, worst-first. The headline lens for *who* causes defects, not just *what* fails.
- **Quality trend over time** — average rating per day, so a team/period rising (3.8 → 4.6) or declining (4.8 → 4.2) is visible.
- This **per-defect attribution supersedes** the prior "aspect→team ownership left to the client" note. It remains **distinct from** the Performance page's per-unit defect rate (the QC-fail rate a unit's stage caused, §6 Q1), which is the routing-based view derived from `return_stages` / where pieces were sent back.

Headline attempt-level pass rate (passes / inspections) and inspection count anchor the page; garment-level first-pass yield (no QC fail across all attempts) stays on the Performance page. Ranged on each attempt's own inspection date, so a garment still in production counts from the moment it was inspected.

**No Decisions / Needs-Investigation surface in the workshop.** The repeated-returns auto-hold and its manager-resolution dialog were **removed** (§2.10) — no garment is held or surfaces for a decision on repeated returns. Redo replacement creation and the parked-redo resume are **shop-side** (redo is decided at the brova trial, §2.5; the replacement waits/resumes in the shop dispatch queue), so they do **not** appear as a workshop decision surface or as "Create replacement" actions on the workshop order/garment pages. **Sidebar organization:** **QC Analytics and Performance** live in an **Insights** group (analytics, not people management), leaving *People* for team + user management.

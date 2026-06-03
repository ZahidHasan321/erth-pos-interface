# Open Questions V2 — Decisions & Implementation Tracker

**Source:** client answers in `OPEN_QUESTIONS_V2 Answers.docx` (received 2026-05-30), responding to the questions in `OPEN_QUESTIONS_V2_DRAFT.md`.

**Purpose.** This file is the working plan for turning the client's answers into shipped behavior. We work **group by group** (same-area issues batched so they land in one session). For each group the loop is:

1. **Spec first** — fold the decision into the relevant `CLAUDE.md` section(s) (§2–§6). Editing the spec first makes the blast radius visible (the lifecycle tests that now disagree show what the change touches).
2. **Code** — make the code (and the spec-as-oracle lifecycle tests) match.
3. **Mark DONE here**, then strike the question from `OPEN_QUESTIONS_V2_DRAFT.md` / the client docx.

> The spec (`CLAUDE.md`) stays the single source of truth. This tracker is scaffolding — it is allowed to drift once a group is folded into the spec.

**Status legend:** ☐ TODO · ◐ IN PROGRESS · ☑ DONE · ⏸ DEFERRED (awaiting a showroom/retail decision — no factory answer given)

**Working scope (2026-06-01).** Implement the **workshop-related, client-answered** items now — Groups **C**, **D**, the workshop/inventory slices of **A**, and the new **Group F** (inventory ownership & transfers). **Shop/showroom items are deferred** — Group **B** (refunds) and Q6–Q8, plus Group A's showroom-initiation / showroom-visibility / customer-communication. **Inventory (Groups E & F) is built in both apps** since the stock tables are shared.

---

## Decision index

| Q | Topic | Group | Status |
|---|-------|-------|--------|
| Q1 | Performance scoring per station (individual vs team) | D | ☐ |
| Q2 | QC 1–5 ratings → analytics | C | ☐ |
| Q3 | Investigation workflow for repeated returns | C | ☐ |
| Q4 | Explicit team assignment for all stations | D | ☑ |
| Q5 | Refund rules (by stage / material ownership / fault) | B | ◐ |
| Q6 | Home delivery two-step flow | — | ⏸ |
| Q7 | Trial media access / privacy | — | ⏸ |
| Q8 | Cash register / EOD walkthrough | — | ⏸ |
| Q9 | Low-stock alerts | E | ☑ |
| Q10 | Stocktake / periodic physical count | E | ☑ |
| Q11 | Damage / waste tracking (separate from Adjust) | E | ☑ |
| Q12 | Redo — material & waste handling | A | ◐ (workshop/inventory slice shipped; customer-charging deferred) |
| Q13 | Redo — priority, ownership, visibility | A | ◐ (factory priority queue + finals-flag shipped; showroom-visibility / customer-comms deferred) |
| Q14 | Redo — performance impact | A / D | ☐ (unblocked — `root_cause` now captured on redo) |
| — | Inventory ownership, stock visibility & transfer flow (this session) | F | ☑ |

---

## Cross-cutting: unified root-cause taxonomy  ☑ SETTLED (2026-06-02)

> **Settled** ahead of Groups A/C/D. Folded into `CLAUDE.md` **§2.9** (the authoritative definition) and the DB: `root_cause` enum (idempotent `CREATE TYPE` in `triggers.sql`, mirrored as `rootCauseEnum` in `schema.ts`) + the `root_cause_responsible_party(root_cause)` IMMUTABLE SQL helper (the single value→responsible-party mapping Q14 keys off). The frontend `ROOT_CAUSES` constant is intentionally deferred to the first group that surfaces it (no dead code before then). §2.9 also nails down the three-axes rule: this taxonomy is **distinct from** the §2.5 measurement-reason gates (its measurement-scoped view) and the §4 `WASTE_REASONS` physical-reason axis — never collapsed.

Q3, Q12, and Q14 each define their own list of "why did this happen" reasons. They overlap but are worded differently. **Before** implementing any of those groups, we settle one shared enum so investigation, waste classification, and performance attribution all speak the same language. The settled set (each value carries a **responsible party**, which is what Q14 keys performance impact off):

| Root cause | Responsible party | Maps from |
|------------|-------------------|-----------|
| `production_error` (cutting / sewing / finishing / ironing / execution-measurement) | production team | Q14 Case 1; Q3 "workshop execution"; Q12 "internal error" |
| `qc_escape` (technical defect QC let pass) | QC | Q14 Case 2; Q3 "QC escape" |
| `showroom_error` (wrong measurement taken, wrong option entered, bad briefing) | showroom | Q14 Case 3; Q3 "showroom/specification"; Q12 "measurement error" (shop-side) |
| `customer_change` (change of mind / expectation mismatch) | customer | Q14 Case 4; Q3 "customer expectation"; Q12 "customer-requested change" |
| `material_defect` (supplier quality) | supplier | Q14 Case 5; Q3 "material issue"; Q12 "material defect" |
| `other` (+ free-text note) | — | all three |

> Note on measurement errors: a measurement can be wrong because the **shop recorded it wrong** (`showroom_error`) or the **workshop executed it wrong** (`production_error`). This mirrors the existing §2.5 measurement-reason gates (`customer_request` / `shop_error` / `workshop_error`). Keep that distinction — don't collapse measurement into a single bucket.

---

## Group A — Redo lifecycle, material & waste  ◐ (workshop/inventory slice shipped 2026-06-03)

**Answers:** Q12, Q13 (overlaps Q3 investigation, Q14 performance, and the §2.5 / §2.6 lifecycle rules).

This is the big one — every "Redo" concern handled together.

### Decisions

**Who creates a Redo (Q13).** A Redo is **initiated at the showroom** following customer interaction — *not* by the factory. The factory **receives** the Redo as an operational instruction to execute. (Spec change: §2.5 currently says "the workshop manually creates a replacement.")

**Rejected garment (Q12.1).** The discarded thobe is recorded in a **Rejected / Scrap Garment Inventory** for audit, root-cause analysis, quality-cost tracking, and possible component/material recovery. (Today it's just `piece_stage: discarded` with no scrap view.)

**Consumed material (Q12.2).** Already-cut/sewn fabric is recorded as **material waste** with a root-cause classification (unified taxonomy above). Consumed material does **NOT** return to stock.

**Replacement garment (Q12.3).** The replacement **automatically consumes fresh material from stock** — manual handling is not acceptable (stock accuracy). (Spec change: §2.5 / Q12 today says the system does NOT auto-deduct for the replacement.)

**Company vs customer fabric (Q12).** The system must distinguish **company-owned** vs **customer-owned** fabric. If more customer fabric is needed, the customer must provide it. (New: today there's no record of customer-brought fabric.)

**Material unavailability (Q12.4).** If replacement material is unavailable, the Redo is **parked pending manager decision**: reorder / substitute / customer consultation / refund.

**Cost responsibility (Q12, cost section).** Internal error → company absorbs wasted material + labor + replacement. Customer-requested change → customer may be charged per policy.

**Factory priority queue (Q13).** A Redo enters a **manager-controlled high-priority queue** on the factory side (not auto-queued as normal production, but not auto-disrupting the schedule either). Factory manager decides: immediate priority / next available slot / parked pending issue (waiting material, customer decision, approval, or technical clarification).

**Linked finals flag (Q13) — FLAG, not release.** When finals are parked waiting on a **replacement** brova that is being made (a Redo is in flight), they **correctly stay parked** — the replacement will release them on acceptance — but the system must clearly flag **"X finals waiting on replacement BROVA."** Silent parking is **not acceptable**. This is *flag-only*; we do **not** auto-release here.

> ⚠️ Do **not** conflate this with the §2.6 **orphaned-finals AUTO-RELEASE** rule (handled in Group B): that fires when the **last** brova is *refund-discarded with no replacement coming* — there the finals have no possible release path, so they **must be released** (`waiting_for_acceptance → waiting_cut`). That rule was the pre-existing "expected RED" lifecycle test (**now GREEN — shipped in Group B, 2026-06-02**) and was **not** created by these answers; Q5/Q13 only reinforce the shared principle that finals must never be *silently* orphaned. Redo-in-flight ⇒ flag & keep parked; last-brova-gone ⇒ release.

**Showroom visibility (Q13).** Since the showroom initiated the Redo, it gets full visibility of the redo's lifecycle: created → accepted by factory → in progress → waiting issue resolution → revised ETA → completed/ready for next customer action.

**Customer communication (Q13).** The system should **trigger a required customer-communication action** — but it is **not fully automatic** (staff still makes the call).

**Prioritization logic (Q13).** Priority depends on root cause, customer urgency, linked orders, material availability, factory load.

### Spec to update (`CLAUDE.md`)
- §2.5 Reject-Redo branch — change "workshop manually creates replacement" → "showroom-initiated; factory receives & schedules"; add auto-consume of replacement fabric; add scrap-garment + material-waste recording.
- §2.6 — add the Q13 **"X finals waiting on replacement BROVA"** flag (flag-only: finals parked on an in-flight replacement brova stay parked, just made visible). The separate orphaned-finals **auto-release** rule (last brova refund-discarded, no replacement) is its own item — shipped in Group B.
- §4 — add scrap-garment inventory + the customer-vs-company fabric distinction; redo waste is a `waste` movement with root-cause classification.
- §6 — factory high-priority Redo queue in the scheduler/tracker.

### Code touchpoints (non-authoritative)
- DB: `create_replacement_garment` (auto-consume fabric, link scrap, stamp waste ledger), `release_finals` / orphaned-finals release, new scrap-garment + customer-fabric records.
- Workshop: scheduler high-priority queue + redo status flag; Production Tracker labels (§2.8).
- Shop: redo creation action; showroom redo-status visibility; customer-communication prompt.
- Lifecycle suite: ~~flip the §2.6 orphaned-finals test to GREEN~~ ☑ done (shipped in Group B, 2026-06-02); add redo-fabric-waste + auto-consume oracles.

### Progress (2026-06-03) — workshop/inventory slice ☑; showroom parts + Q14 still deferred/open

Scope shipped per the working-scope rule (workshop-answered items now; showroom deferred). Redo stays **workshop-initiated** (showroom-initiation deferred). Three scope calls locked with the client this session: **root_cause captured at the workshop redo step** (not shop); **scrap inventory = data only** (no dedicated view — the discarded row + `root_cause` + `replaced_by_garment_id` link + waste-ledger rows ARE the scrap record); **redo priority queue = full manager control**.

- ☑ **Spec** — `CLAUDE.md` §2.5 (auto-consume + material-waste + root_cause-capture + OUT-parking + material-unavailable parking), §2.8 ("Finals waiting on replacement brova" flag-only label), §4 (redo material-waste net-zero annotation + company-vs-customer + waste-by-root_cause report), §6 (factory redo priority queue + resume-parked).
- ☑ **DB** (`triggers.sql` + `schema.ts`, applied via `db:triggers`): enums `redo_priority` / `redo_parked_reason`; columns `garments.root_cause` / `redo_priority` / `redo_parked_reason` / `redo_customer_must_provide_fabric` + `stock_movements.annotated_qty` / `root_cause`. `create_replacement_garment` rewritten (idempotent; auto-consumes the replacement's fresh `-L` from shop_stock; writes the scrapped original's L as a **net-zero `waste` annotation** `qty_delta=0, annotated_qty=L, unit_cost, root_cause` — conservation holds at `-2L`; parks on short stock `waiting_material` / OUT cloth `customer_decision`; keeps the double-replacement guard). New `resume_parked_redo`, `finals_waiting_on_replacement_brova`, `get_waste_by_root_cause`; reports changed to `SUM(ABS(qty_delta)+COALESCE(annotated_qty,0))`.
- ☑ **Tests** — new `workflow.conservation-redo.test.ts` (T1–T9 + resume no-op), oracles anchored to spec/conservation not the RPC body. `test:workflow` **93/93** green (the pre-existing ~83 + 10 new).
- ☑ **Workshop app** — redo creation rerouted off the client-side insert onto the RPC; new `RedoDialog` (required root-cause + priority pickers, surfaces parked outcomes) launched from the redo-pending dashboard card and the two `?replaces=` sites; scheduler gains a pinned "Redo — immediate" section, a `next_slot` redo chip, and a "Parked redos — needs manager decision" section with a **Resume** action; order-detail status label gains "Finals waiting on replacement brova". `check-types` clean, no new lint.
- ☐ **Still deferred/open (NOT shipped):** showroom-initiation of the redo; showroom redo-lifecycle visibility; the required customer-communication prompt; **charging the customer** for customer-fault waste (Q12 cost section — a cashier/showroom billing action); the **replacement-of-replacement chain flag** (Q13 q3, overlaps Q3 investigation — Group C); and **Q14 performance impact** (Group D — now unblocked since redo `root_cause` is captured). Q12/Q13 are **not** closeable until the deferred showroom items land; left annotated (not struck) in the draft.

---

## Group B — Refunds  ◐

**Answers:** Q5 (overlaps Group A fabric handling and the §2.6 orphaned-finals release).

### Decisions

Refund rules depend on **order stage**, **material ownership**, and **responsibility**.

**Case 1 — order waiting for brova approval.**
- *1A — brova accepted, finals cancelled:* unused **company** fabric returns to stock; **customer** fabric is returned to the customer; customer refund = total paid − brova cost.
- *1B — brova rejected:* if internal error → **full** customer refund. Always: rejected brova recorded as scrap/rejected garment; unused company fabric returns to stock; customer fabric returned.

**Case 2 — production already started after brova approval (or orders with no brova).** Refund is **NOT automatic**. Boutique management consults the factory (production stage, consumed labor, consumed materials), then decides **full / partial / no** refund.

**⚠️ Gaps in the Q5 answer — confirm with client before coding:**
- *Scenario B refund amount when **not** internal error.* The answer only specifies "internal error → full refund." It's silent on a brova rejection caused by customer change of mind / showroom error (full? minus brova cost, like 1A? partial?).
- *Fate of the finals in Scenario B.* Scenario A explicitly cancels the finals; Scenario B ("brova rejected") doesn't say. If the rejected brova is the last one and nothing replaces it, this is exactly the §2.6 orphaned-finals **auto-release** case (below) — confirm that's the intent.

### Spec to update (`CLAUDE.md`)
- §2.6 Cancellation/refund — add the stage/ownership/fault matrix; brova-rejected scrap + fabric-return path; the "no automatic refund once production started" gate.
- §2.6 orphaned-finals **auto-release** — this group is where the pre-existing "expected RED" rule shipped ☑ (2026-06-02; last brova refund-discarded with no replacement → release parked finals; lifecycle test now GREEN — see Progress below). Not newly mandated by Q5, but Q5's brova-refund cases are what exercise it. (Distinct from the Q13 flag-only behavior in Group A.)

### Code touchpoints (non-authoritative)
- DB: refund RPC / `record_payment_transaction` refund path — fabric-restock split (company vs customer), refund-cap rules (already in §2.6), brova-reject scrap.
- Shop/cashier: refund UI cases; the "consult factory before refunding started production" gate.

### Progress (2026-06-02) — one sub-item shipped; rest of group still ☐
- ☑ **§2.6 orphaned-finals AUTO-RELEASE shipped** (the pre-existing "expected RED" lifecycle test is now GREEN). When the **last** brova on an order is **refund-discarded** and no replacement is coming, its parked finals are released `waiting_for_acceptance → waiting_cut` so they can never be silently orphaned. Implemented in `record_payment_transaction` (added `garment_type` to the discard `SELECT INTO`; after a brova discard, if no non-discarded brova remains, release the order's parked finals). Never auto-creates a replacement. Correctly does **not** fire while a replacement brova is in flight (that is the Group A flag-only case) nor while another brova still exists to act on (the accepted "park indefinitely" case). `CLAUDE.md` §2.6 updated from "INTENDED / expected-RED" to implemented; §8 reference generalized; the lifecycle test dropped its "(EXPECTED RED)" label. Applied live via `db:triggers` + verified in `pg_get_functiondef`. Shipped incidentally alongside the stock-conservation pass (see the dedicated section below), not as a full Group B implementation.
- ☐ **Still TODO (the bulk of Group B):** the refund stage/ownership/fault matrix (Case 1A/1B, Case 2 "no automatic refund once production started"), brova-reject scrap recording + company-vs-customer fabric return, the "consult factory before refunding started production" gate, and the two flagged **client gaps** in Q5 (Scenario-B non-internal-error refund amount; explicit confirmation of the broader finals-fate intent). Q5 is **not** closeable until these land.

---

## Group C — QC analytics & investigation workflow  ☐

**Answers:** Q2, Q3 (root-cause taxonomy shared with Group A/D; counters shared with Group D).

### Decisions

**Q2 — use the 1–5 ratings analytically** (the pass/fail rule stays: any aspect < 4 = non-conformity → back to production). Add:
- **Breakdown by defect category** — seam, ironing, front pocket, collar, jabzour, hemming, analyzed separately.
- **Team analytics** — strengths, weaknesses, recurring quality issues.
- **Trends over time** — e.g. a team rising 3.8 → 4.6 vs declining 4.8 → 4.2.
- **Comparison between teams.**
- Extend the same analytical approach to **measurement-related** and **option/specification-related** defects.

**Q3 — investigation workflow.**
- **Trigger:** a garment hits **2 quality-related returns** OR **3 total returns of any type**.
- **On trigger:** garment is **automatically blocked** — no further processing until a manager reviews.
- **Manager flow:** (1) record root cause (unified taxonomy); (2) compare QC history / return history / actual reason for return; (3) decide next action — continue correction / remake (Redo) / refund; (4) define short-term corrective action; (5) define medium/long-term preventive action.
- **Tracking:** return history is always displayed.
- **Counters:** quality returns and alteration returns are tracked **separately**.

### Spec to update (`CLAUDE.md`)
- §2 — add the investigation trigger + auto-block transition (a new gated state; note it does **not** violate the §7.9 "only documented branches" rule because we're documenting it here).
- §2.1 / §2.3 — separate quality-return vs alteration-return counters.
- §6 — QC analytics surfaces (defect-category breakdown, team trends/comparison) + the "Needs Investigation" manager view.

### Code touchpoints (non-authoritative)
- DB: investigation trigger + block flag; counters on the garment/trip records.
- Workshop: QC analytics page (uses the already-stored 1–5 numbers), investigation list + manager review flow, return-history display.

---

## Group D — Performance & team structure  ☐

**Answers:** Q1, Q4, Q14 (Q14 performance impact also lives partly in Group A; root-cause taxonomy shared).

### Decisions

**Q1 — scoring model.**
- **Individual** scoring for **cutting, finishing, ironing, QC**.
- **Sewing = team / unit level only** (no individual operator breakdown — the objective is unit performance, not internal competition).
- **Soaking** does **not** appear on the Performance page (time-based technical stage, negligible labor) — workflow stage only.

**Q4 — team assignment.** Multiple teams may exist in future for non-sewing stations. The system must support **explicit team assignment for all operational stations** (cutting, sewing, finishing, ironing, QC). **Silent default to Team A is not acceptable.**

**Q14 — Redo's performance impact** (depends on root cause — no blanket penalty):
- *Production error* → production team impacted (quality score, redo rate, waste cost).
- *QC escape* → QC impacted. But if the customer rejects **design/style** rather than technical quality → QC **not** penalized.
- *Showroom / specification error* → showroom responsibility; factory **not** penalized.
- *Customer change of mind* → no internal penalty.
- *Supplier / material issue* → factory **not** penalized.
- **Labor accounting:** labor on rejected garments still counts as **productive effort for capacity analysis**, but is **simultaneously classified as failed quality cost** in performance reporting.

> This resolves the deferred "drop team-level acceptRate" decision (memory `project_drop_team_accept_rate`): customer **design** rejection is whole-production / not team-attributable, consistent with Q14.

### Spec to update (`CLAUDE.md`)
- §6 — Performance page: per-station scoring model; team assignment for all stations in worker create/edit; redo impact rules + labor-as-capacity-vs-quality-cost split.

### Code touchpoints (non-authoritative)
- Workshop: Performance page (station scoring, redo-impact attribution); worker create/edit team picker for all stations (kill the silent Team-A default).
- DB: team assignment fields per station; performance aggregate RPCs keyed on root cause.

### Progress (2026-06-02) — Q4 shipped; Q1 + Q14 still ☐
- ☑ **Q4 explicit team assignment shipped.** Spec `CLAUDE.md` §6 — new "Worker team (unit) assignment — explicit, never silently defaulted" rule. Code (workshop): the sewing-only unit picker generalized to **all operational stations** (cutting / sewing / finishing / ironing / quality-check) — `TEAM_ASSIGNABLE_STAGES` + `STAGE_TEAM_LABELS` in `lib/job-functions.ts`; `UserFormState.sewing_unit_id` → `unit_ids` (per-stage map); `SewingUnitPicker`/`CreateSewingUnitDialog` → generic `UnitPicker(stage)`/`CreateUnitDialog(stage)`; one **required** visible picker per selected operational job (with inline "New team"); `isUserFormValid` requires a team for each operational station. **The silent lowest-id default is gone:** `new.tsx`/`$userId.edit.tsx` submit `form.unit_ids[stage]` for operational stations (soaking keeps the default fallback); **edit pre-fills each station's team from the worker's *actual* resource row** (not recomputed), so saving an unrelated field can't re-pin them. Edit init now also waits for the resources query so required pickers aren't left empty. Backend unchanged — `auth-admin` already reassigns `unit_id` per stage generically. Workshop type-checks clean; no new lint issues. No DB change (assignment already lives in `resources.unit_id`).
- ☐ **Still TODO:** Q1 per-station scoring model (Performance page) and Q14 redo performance impact (depends on Group A capturing redo `root_cause`).

---

## Group E — Inventory: low-stock, stocktake, damage/waste  ☑

**Answers:** Q9, Q10, Q11 (Q11 waste reporting is fed by Group A's redo material waste).

**Two clarifications decided in the 2026-06-01 session** (both under-specified in the answers):
- **Stocktake overdue "hard block" → soft block (banner only).** No RPC/functional lock; overdue status is computed per side and surfaced as a persistent, dismissible banner (tier 1 warn / tier 3 >3-days hard nag) + a once-per-session entry modal at tier 3. Discipline by nagging.
- **Waste manager-approval → RBAC gate by cost.** Below a single cost threshold (`WASTE_APPROVAL_THRESHOLD` = 25, mirrored in `record_waste`) any waste-permitted user records directly; at/above, only a manager/admin — the RPC rejects an over-threshold waste from a non-manager. No pending/queued state.

### Decisions

**Q9 — low-stock alerts (Option C, both):**
- Always-visible **"Need to Restock"** list at the top of inventory.
- **Active notifications** when stock drops below threshold.
- **Manager sets the minimum per item**, based on supplier lead time, consumption rate, replenishment cost, operational criticality.

**Q10 — stocktake (mandatory, monthly minimum):**
- Periodic physical count becomes a controlled discipline. Minimum **once per month**.
- **Escalation if overdue:** (1) warning → (2) manager override allowed → (3) **hard system block after 3 days overdue**.
- **Workflow (accepted as proposed):** Stocktake screen → full item list → physical-count entry → variance calc → mandatory variance reason → manager validation → historical reporting.

**Q11 — damage / waste (separate from Adjust):**
- Dedicated **Damage / Waste** action, distinct from Adjust.
- Categorized reasons: supplier defect / staff mistake / customer damage / lost / mis-cut / other + note.
- **Quantity damaged** (not the new total).
- **Optional photo.**
- **Manager approval above a defined threshold.**
- **Cost impact recorded.**
- **Reporting every 2 weeks.**

### Spec to update (`CLAUDE.md`)
- §4 — low-stock thresholds + "Need to Restock" surface + notifications; the Damage/Waste action (distinct from Adjust) with its reason categories, qty, photo, approval gate, cost impact; stocktake workflow + the overdue-escalation/hard-block rule; reporting cadences (waste every 2 weeks).

### Code touchpoints (non-authoritative)
- DB: per-item minimum threshold; stocktake session + variance records; Damage/Waste as a stamped `waste` movement with category + cost.
- Both apps' Inventory surfaces: restock list, notifications, stocktake screen, Damage/Waste dialog, reports (KPIs + waste-by-reason).

### Progress (2026-06-01)
- ☑ Spec §4 — low-stock alerts, stocktake (soft-block), Damage/Waste action + RBAC block; surfaces intro now "4 surfaces"; RBAC adds `inventory:waste` / `inventory:stocktake`.
- ☑ **DB layer** (`schema.ts` + `triggers.sql`, idempotent, one `db:triggers` apply): `stock_movements.image_url`; `low_stock` notification type + `_notify_low_stock_crossing` (falling-edge, per side, SECURITY DEFINER) wired into the audit triggers; `record_waste` RPC (qty/category/photo/cost, idempotent, `is_manager_or_above` cost gate); `stocktake_sessions` + `stocktake_counts` (RLS select-only, DEFINER write RPCs) + `start_stocktake` / `save_stocktake_counts` / `validate_stocktake` (manager-gated) / `get_stocktake_status`; image_url session-var cleared in restock/adjust/consume.
- ☑ **Q11 Damage/Waste** — `WASTE_REASONS` + threshold const (both apps), `DamageWasteDialog` (both apps), wired on item-detail action; removed `damaged`/`lost` from Adjust; `recordWaste` API + `uploadWastePhoto`; movement history shows category label + photo link; `inventory:waste` RBAC.
- ☑ **Q9 low-stock** — itemized "Need to Restock" list atop inventory (both apps, replaces the count banner); `low_stock` notification icon/link/filter in both bells + both notifications pages.
- ☑ **Q10 stocktake** — `api/stocktake.ts` + Stocktake screen (count entry, variance, mandatory reason, manager Validate, history) + `StocktakeBanner` (soft-block, tier-3 modal) on inventory, both apps; route + sidebar + `/store/stocktake` RBAC; route trees regenerated.
- ☑ Both apps type-check clean; `store.test.ts` 65/65.
- ☑ **Applied to DB** — `db:triggers` run; verified present: `record_waste`, `start_stocktake`, `save_stocktake_counts`, `validate_stocktake`, `get_stocktake_status`, `_notify_low_stock_crossing`; `stocktake_sessions` + `stocktake_counts`; `low_stock` enum value; `stock_movements.image_url`. (`ALTER TYPE ADD VALUE` applied cleanly inside the single-transaction apply.)
- ☑ **UX polish** — per-app agents refined the Group E surfaces (presentation-only, verified): one dominant alert region on the inventory list (StocktakeBanner headline; Need-to-Restock recessive/collapsible; Low-Stock KPI → expands the list); stocktake ergonomics (All/Uncounted/Variances filter, progress bar, sticky header, Save-vs-Validate clarity, non-manager explanation); softened, informative waste manager-gate; **workshop fully tokenized to `--status-*` (§6)**; a11y pass (aria-labels/live/required, focus, reduced-motion). Both apps type-check clean; RPC calls + query keys confirmed unchanged.
- ☑ Struck Q9/Q10/Q11 from `OPEN_QUESTIONS_V2_DRAFT.md`.

---

## Group F — Inventory ownership, stock visibility & transfer flow  ☑

**Source:** client clarifications during the 2026-06-01 working session (not a numbered V2 question). Already folded into `CLAUDE.md` §4.

### Decisions
- **Two stocks, mutual invisibility.** `shop_stock` + `workshop_stock` are counted independently; each app shows **only its own side's** count — in lists, item detail, and transfer screens. Stock crosses sides only via a recorded transfer.
- **Ownership.** Shop creates **fabrics + shelf items**; workshop creates **accessories**. Each side *holds* the other's items as transferred-in stock (fabric at the workshop, accessories at the shop) — view-only for create, but may restock/adjust its own on-hand count. Shelf is shop-only (the workshop never shows it).
- **Fabric season.** `season` (`summer`/`winter`) is shown on the fabric and settable on create/edit; staff bulk-send a season manually. No auto-filter.
- **Customer fabric.** `fabric_source: OUT` — recorded descriptively, never part of either stock, never decremented.
- **Transfers: request → send → receive, NO approve.** The source side fulfils a requested transfer **directly** with whatever it has (full / partial / none). The requester does **not** see the source side's stock. Plus **bulk/direct send** with no request (e.g. the season-change push).

### Spec to update (`CLAUDE.md`)
- §4 rewritten ☑ — two-stocks/invisibility, ownership, customer fabric, no-approve transfer flow. Code now matches the spec (the transfers refactor landed).

### Progress
- ☑ Spec §4 — full model
- ☑ Workshop inventory — Shelf tab removed; cross-side "Shop" stock removed (list + detail + restock); "Add fabric" hidden; RBAC shelf → shop-owned. Type-checks clean.
- ☑ Shop RBAC — shelf → shop `full` (was wrongly view-only); accessories confirmed view-only.
- ☑ Shop inventory visibility — "Workshop" column stripped from all 3 list tabs (remaining column relabeled "Stock"); detail `StockBreakdown` reduced to a single "At shop" card, quick actions to one Restock/Adjust (shop), dialogs hardcoded to `shop`. Type-checks clean.
- ☑ Fabric season — shop create/edit dialog (Radix select) + detail `MetadataCard` (native select) + colored row badge; read-only neutral chip in the workshop fabric list. `createFabric` widened to accept `season`. Type-checks clean.
- ☑ **Transfers refactor (drop approve)** — `dispatch_transfer` guard `approved`→`requested`; `approve_transfer`/`reject_transfer` DROPped; `notify_transfer_status_change` simplified. `approved`/`rejected` enum values kept-but-dead (Postgres can't drop enum values). Both apps: `primaryActionFor` `requested`→`dispatch`; approve/reject hooks + API fns removed; drawer `requested`→**Send** (stepper Requested→Sent→Received); list/badge/empty copy de-approved; `transfers:approve` removed from both RBACs; request-mode now hides source-side stock (§4 invisibility). State-machine unit test (`store.test.ts`) rewritten to the no-approve flow (65/65 green). Both apps type-check clean.
- ☑ **Applied to DB** — `db:triggers` run against the remote Supabase DB; verified `approve_transfer`/`reject_transfer` are dropped and `dispatch_transfer` (new `requested` guard) is present.
- ☑ **Notification deep-links fixed** — transfer notifications (`notifications.tsx` + `notification-bell.tsx`, both apps) repointed from the dead `/store/approve-requests?tab=…` route to `/store/transfers`. (This was pre-existing breakage; fixed alongside since it referenced the removed "approved" concept.)

### Code touchpoints (non-authoritative)
- Workshop ✓: `routes/(main)/store/inventory.tsx`, `inventory_.$type.$id.tsx`, `lib/rbac.ts`.
- Shop: `lib/rbac.ts` ✓; `routes/$main/store/inventory.index.tsx` ✓, `inventory.$itemType.$itemId.tsx` ✓, `api/fabrics.ts` ✓ (season).
- Transfers ✓ (both apps + DB): `lib/transfers.ts`, `components/store/transfer-constants.ts`, `routes/.../transfers.tsx` + `transfers_.new.tsx`, `components/transfers/TransferDetailDrawer.tsx`, `hooks/useTransfers.ts`, `api/transfers.ts`, `lib/rbac.ts`, `components/app-sidebar.tsx` / `layout/WorkshopSidebar.tsx`; DB `triggers.sql` + `schema.ts` enum; test `__tests__/store.test.ts`.

---

## Stock-conservation hardening + conservation test suite  ☑ (2026-06-02)

Not a numbered V2 question — a hardening pass over the already-shipped inventory RPCs (Groups E & F) plus the core money/lifecycle paths, driven by the universal invariant **stock is conserved (never silently created/destroyed; the ledger's signed `qty_delta` sums to the net physical change)**. Grouped here because it strengthens E/F and is where the §2.6 orphaned-finals auto-release (Group B) actually shipped.

- ☑ **Loss / invention / ledger paths fixed in `triggers.sql`** (all applied live + verified): `FOR UPDATE` locks on `record_waste` / `adjust_stock` (→ `validate_stocktake`) reads; transfer negative-qty guards on `dispatch_transfer` / `receive_transfer`; cross-transfer item isolation on `dispatch_transfer`; over-receive guard; order-confirm on-hand guard on `complete_work_order` / `complete_sales_order` / `create_complete_sales_order` (reject when on-hand < required — never negative; OUT customer fabric excluded) + early-return when already `confirmed` (no double-decrement on fresh-key re-confirm); capped shelf-refund restock; refund fabric-restock gated to `fabric_source = 'IN'`; lost-in-transit `waste` row recorded as a **net-zero** audit annotation (`qty_delta = 0`, shortfall in `notes` + `missing_qty`) so the ledger conserves. Frontend: stock columns `Omit`-ed from every `updateFabric/updateShelf(Item)/updateAccessory` type in both apps (no browser-side ledger bypass).
- ☑ **Order-confirm on-hand guard folded into `CLAUDE.md` §4**; the legacy `stock`/`real_stock` deprecation note corrected (kept current by inline writes in the consumption/refund RPCs — no sync trigger).
- ☑ **Two spec-anchored conservation test files** added to the `test:workflow` suite (`workflow.conservation-transfers-orders.test.ts` + `workflow.conservation-refund-waste.test.ts`): transfer conservation identity, neg-qty / cross-transfer / no-double-move guards, over-stock-confirm rejection, idempotent-by-state re-confirm, capped refund, §2.6 paid-floor + idempotent replay, OUT-fabric / post-handover no-restock, `record_waste` (incl. cost-threshold manager gate), `adjust_stock`, `validate_stocktake` atomicity. Every `expect` anchored to a spec rule or universal invariant, never the RPC body (§0.5 oracle-not-mirror).
- ☑ **Harness helper** `tryInSavepoint(tx, fn)` added to `scripts/lifecycle/db.ts` — scopes an expected `RAISE` in a SAVEPOINT so the outer test tx survives for the "nothing moved" post-check (postgres.js `sql.begin` otherwise poisons the whole tx on the first error). Models production (PostgREST wraps each RPC in its own tx).
- ☑ **Executed on Docker:** full `test:workflow` suite **83/83 green** (including the now-passing §2.6 orphaned-finals test).

---

## Deferred — awaiting showroom / retail decision  ⏸

The factory explicitly gave **no decision** on these; they concern boutique/customer-facing operations and must be validated with **showroom / retail management** before we touch code. Keep them in `OPEN_QUESTIONS_V2_DRAFT.md` until answered.

- **Q6 — Home delivery.** One-step (cashier finalizes, drivers offline) vs two-step (out-for-delivery → delivered).
- **Q7 — Trial media access / privacy.** Who sees trial photos/voice/signatures; public bucket vs short-lived links.
- **Q8 — Cash register / EOD walkthrough.** Confirm the full opening-float / reconciliation / freeze / manager-reopen flow + the edge-case table.

---

*As each group ships, fold its decisions into `CLAUDE.md` §2–§6, mark it ☑ here, and remove the corresponding questions from `OPEN_QUESTIONS_V2_DRAFT.md`.*

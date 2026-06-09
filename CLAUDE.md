# CLAUDE.md

Lean **index + governance** for this product. The authoritative detailed spec is `SPEC.md` (§1–§6); the working rules / build / conventions are `ENGINEERING.md` (§7–§9, §11–§12). This file carries §0 governance, a one-paragraph-per-area summary of each spec area, and the companion-doc index — **read the detailed files on demand** (see "When to read which file" below).

---

## 0. How to use these files (governance — read first)

1. **`SPEC.md` is the spec.** Every feature, branch, and edge case lives there in plain language (§1–§6). This file is its lean index — the per-area summaries below are lossy; when a summary and `SPEC.md` differ, **`SPEC.md` wins**. Behavior not described in `SPEC.md` isn't specified — surface the gap, don't infer it from code.
2. **Spec-as-oracle.** The lifecycle test suite encodes `SPEC.md`. Test vs. code disagree → the code is the bug. Spec vs. code disagree → the spec wins (fix the code; or if the rule itself is wrong, change `SPEC.md` deliberately first, then the code). A test's expected value comes from the spec or a universal invariant (accounting identity, idempotency property) — never copied from an RPC/trigger body. A test derived from the implementation is green by construction and catches nothing.
3. **Change protocol.** A new edge case → add it to `SPEC.md`, then match code + tests. A workflow/feature change → edit `SPEC.md` first (the now-disagreeing tests reveal the blast radius), then the code. Change the spec only deliberately; never bend it to match what the code happens to do. Update this file's summary in the same change so the index stays honest.
4. **Code-decoupled.** `SPEC.md` §1–§6 describe *what* and *why* — no file paths or line numbers. Code locations live only in `IMPLEMENTATION_MAP.md` (§10), which is non-authoritative and may drift. If it disagrees with the spec, the spec wins.

**When to read which file** (each is read on demand — keyword → file):

- garment / lifecycle / order / piece_stage / brova / final / dispatch / trial / refund / cancellation / status labels / root-cause / investigation → **`SPEC.md` §2**
- cashier / payment / EOD / register / reconciliation → **`SPEC.md` §3**
- inventory / stock / transfer / stocktake / waste / low-stock / suppliers / RBAC → **`SPEC.md` §4**
- domain / entities / architecture → **`SPEC.md` §1**; shop behavior → **§5**; workshop behavior (performance, QC analytics, decisions hub, scheduling) → **§6**
- build / dev commands / test / migration / idempotency / code rules → **`ENGINEERING.md` §7–§9**
- UI / typography / color / layout / primitives / Tailwind / date helpers → **`ENGINEERING.md` §11 (shop) / §12 (workshop)**
- "where does this code live?" → **`IMPLEMENTATION_MAP.md`**; deploy hardening → **`DEPLOYMENT_HARDENING.md`**

---

## 1. Domain & architecture → `SPEC.md` §1

Dishdasha production & POS (brands ERTH/SAKKBA/QASS); two order types — **WORK** (custom tailoring) and **SALES** (pre-made shelf). **The system thinks in garments, not orders:** an order is a container, each garment row tracks one physical piece independently, and order state is derived from its garments. **Two apps, one DB** — Shop (`apps/pos-interface`) and Workshop (`apps/workshop`); the frontend never touches the DB directly — all writes go through RPCs/triggers so lifecycle rules are enforced server-side.

## 2. The garment lifecycle (the heart) → `SPEC.md` §2

Per-garment tracking (`piece_stage`, `feedback_status`, `acceptance_status`, `location`, `trip_number`, `garment_type`, `trip_history`, `needs_investigation`). Stage chain `waiting_for_acceptance → … → completed`; terminal = `completed`/`discarded`; `soaking` parallel; `post_cutting` disabled. Key flows: brova-parking (any brova parks all finals), dispatch (`trip 0→1`), workshop receive/produce/dispatch-back, the **brova-trial branch tree** (Accept / Accept-with-Fix / Reject-Repair / Reject-Redo) with the finals-release gate, **shop-initiated redo** at the brova trial with three required-choice outcomes (replacement from our stock / from the customer's fabric / discard + promote a parked final to the new brova) — a replacement is FK-linked and created at the shop, waiting in the dispatch queue until dispatched like any garment (fabric auto-consumed + net-zero scrap waste annotation; **no `root_cause` captured at redo** — deferred to investigation; the workshop redo-priority queue is dropped), final collection (handover only — **no feedback form for finals**), alteration trips (no max), QC-fail rework (no trip increment, `alt_p`). **Feedback is the brova-trial form only — finals are not fed back; they are collected at handover (§3 cashier), not through a feedback/satisfaction form (§2.5).** Feedback is one record per brova, per trip; finals are assignment targets only (no per-final verdict/form). Feedback updates the *target spec*: a spec-correcting measurement row mints one new derived measurement, and an override section below the table lets staff assign it to parked finals and shared-measurement siblings (shared-group garments default to adopting with values pre-filled; non-shared garments default to keeping their own; the per-garment selector is fully open). Style override is finals-only, defaults to each final keeping its own, with an opt-in apply-to-all that prompts on different-collar finals. A right-side sheet shows every measurement in play with lineage. Editing is gated by production, not acceptance (Accept/Accept-with-Fix stay correctable): brova must be in the shop (it leaves on dispatch for its own fix/alteration), and the page locks read-only order-wide once any final is **in production** (workshop-started: `in_production: true`, which can occur while still `waiting_cut` — acceptance releasing finals does not itself lock). **A style change reprices the order on feedback submit:** it rewrites the garment spec **and** recomputes the style price for the garments that changed (active garment + propagated finals) using the same order-creation engine (so qallabi/designer flat styles keep their fixed price), shows the staff an old→new `order_total` delta to confirm, and rolls the delta into `order_total`/`style_charge` via the idempotent audit-only `reprice_order_styles` (never touches `orders.paid` — collection stays §3 cashier; needs_redo excluded; only the style component moves). Cancellation/refund is staff judgment with mechanical guardrails only (§2.6). Order phase derived from garments (§2.7); showroom/workshop status labels (§2.8); shared **root-cause taxonomy** (§2.9); **repeated-returns auto-hold investigation** at ≥2 quality OR ≥3 total returns (§2.10); **five toggle options** (`wallet_pocket`/`pen_holder`/`mobile_pocket`/`small_tabaggi` Yes/No + `collar_position` Up/Down/Standard) are **explicit required choices, no silent default**, and QC checks them both ways (§2.11). A **`shoulder_slope`** categorical body measurement (four fixed shapes — sloped down/up, straight, peaked — on the `measurements` row, required no-default) flows through measurement entry/update/feedback/QC/read-out; QC verifies it both ways by equality (§2.12). **Order linking** (§2.13) lets a customer's confirmed WORK orders share one delivery date as a group (child `linked_order_id` → primary; group key `COALESCE(linked_order_id, order_id)`); linking is shop-only, but the workshop now **sees** it — the Production Tracker clusters a group's orders adjacently and workshop dispatch warns before stranding a linked sibling still on the workshop side (UI-only guard).

## 3. Cashier, payments & EOD → `SPEC.md` §3

Separate role-locked cashier shell. Order-taker confirms `paid: 0` → order enters the cashier queue; payment is a `payment_transaction` (a trigger sums it into `orders.paid` — **never write `orders.paid` directly**); partial/installment; idempotent. **Pickup is ungated on payment** (staff judgment). EOD register close: the cashier opens AND closes their own session, **reopening a frozen day is manager-only**; reconciliation follows the cash-drawer identity `expected_cash = float + cash_payments − cash_refunds + cash_in − cash_out`; idempotent close; append-only `register_close_events`; a frozen day rejects money. Brand gate (currently ERTH only) routes inline-payment vs cashier-queue.

## 4. Inventory & transfers → `SPEC.md` §4

Four surfaces per app (Inventory, Transfers, Stocktake, Reports). **Fabric + shelf live only in shop stock (workshop never holds them — fabric is consumed shop-side at confirmation); accessories are the only stock that crosses sides** (carry both shop + workshop counts), so the **workshop's surfaces are accessories-only** (no fabric/shelf inventory, no fabric-usage report) and **transfers carry accessories only**. Each side blind to the other; crossing only via a recorded accessory transfer. Ownership: shop creates fabrics + shelf, workshop owns accessories (anything it operates — devices/supplies, not a fixed list); customer-brought fabric (`fabric_source: OUT`) is never in either stock. Append-only `stock_movements` ledger — **all changes via stamping RPCs, nothing silently unlogged**. Order confirm rejects on insufficient stock (locks the row, never negative). Low-stock alerts (per-item threshold, **falling-edge** notification). Mandatory monthly stocktake (soft-enforced; manager validates). Damage/Waste (categorized reason + cost-threshold manager gate) is distinct from Adjust. Redo material waste = **net-zero annotation** (`annotated_qty` + `root_cause`) so conservation holds. Transfers are request → send → receive (**no approval gate**; bulk send atomic). RBAC table per surface.

## 5. Shop app (`apps/pos-interface`) → `SPEC.md` §5 · conventions `ENGINEERING.md` §11

Order-taker shell + a separate role-locked Cashier shell (§3); brand is determined by the authenticated user. UI direction, typography, and tech-stack conventions live in `ENGINEERING.md` §11.

## 6. Workshop app (`apps/workshop`) → `SPEC.md` §6 · conventions `ENGINEERING.md` §12

Operational control-panel tool. **Worker team (unit) assignment is explicit, never silently defaulted.** Redo priority queue (`immediate` / `next_slot` / `parked` + `redo_parked_reason`; resume-parked re-consumes fabric). **Per-station performance scoring** (individual cutting/finishing/ironing/QC; sewing at unit level; soaking excluded); **redo performance impact attributed by `root_cause`** (no blanket factory penalty). QC analytics over the stored 1–5 ratings (`< 4` = fail). Needs-Investigation view (§2.10) and a consolidated **Decisions hub** for every garment awaiting a manager decision. Typography/color/layout/code conventions live in `ENGINEERING.md` §12.

---

## 10. Companion docs (read on demand — kept out of the always-loaded index)

- **`SPEC.md`** — the authoritative detailed product spec (§1–§6). The oracle; on any conflict with code or with this index, the spec wins.
- **`ENGINEERING.md`** — project working rules (§7), build/dev commands (§8), env vars (§9), and per-app UI/code conventions (§11 shop, §12 workshop).
- **`IMPLEMENTATION_MAP.md`** — where code lives (schema, lifecycle RPCs/triggers, the spec-as-oracle suite, app directories). Non-authoritative nav aid; on any conflict the spec wins.
- **`DEPLOYMENT_HARDENING.md`** — deploy-time host/proxy hardening checklist (not coding guidance; re-apply if the deployment moves).

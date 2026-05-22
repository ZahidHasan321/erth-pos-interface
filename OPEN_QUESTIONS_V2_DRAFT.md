# Open Questions — v2

Pending client decisions — ERTH / Autolinium

A second pass of behaviors the system already touches but the specification has not locked in. These questions came out of tracing the workshop's end-to-end garment flow — receiving, production, QC, dispatch, alterations, and how refunds interact with all of them. Same shape as v1: Scenario → What the system does today → Core question → Edge cases. Once a question is resolved, the decision is folded into the product spec and the entry is removed from this document.

## Contents

8. Refunds — should the system ever block one based on where the order is?
9. Last trial garment is refunded — what happens to the finals waiting on it?
10. Trial garment is repaired and ready, but the finals aren't — send it alone?
11. Should staff ever release the finals before any trial garment is accepted?
12. A thobe has come back five times — does staff need to know?

---

## 8. Refunds — should the system ever block one based on where the order is?

**Scenario.** The normal reason for a refund is a quality problem with our work — a defect on a thobe, a fit issue we couldn't resolve, a mistake. Refunds because the customer simply changed their mind are not the norm, especially once the order is being made or has been handed over. But edge cases do happen, and staff need a way to handle them.

Three moments where a refund might be requested:

- (a) **The order was cancelled days ago** and there is still money on it that was never returned.
- (b) **A thobe is being sewn at the workshop right now** — the customer wants out of that one specifically.
- (c) **The customer collected everything yesterday** and is back claiming a defect, or simply unhappy.

**What today does.** The system blocks none of these. As long as the register is open, the cashier types a reason, and the amount does not exceed what was paid, the refund goes through. The thinking has been: keep the option open, the reason field is the record, and staff judgment decides whether it is warranted. We have never explicitly chosen this — it is just where we landed.

**Core question.** For each moment, should the system step in? Pick one column per row:

- **A — Allow (today's behavior).** Cashier can refund, reason is the record.
- **M — Manager only.** Cashier sees the screen but the refund needs a manager to approve.
- **B — Block entirely.** The system refuses; the situation has to be resolved another way.

| Moment | A / M / B |
|---|---|
| Refund on an order that has already been cancelled | ☐ ☐ ☐ |
| Refund on a thobe currently being made at the workshop | ☐ ☐ ☐ |
| Refund after the customer has collected the order | ☐ ☐ ☐ |

**Edge cases to follow up.** Whether shelf-item refunds (pre-made garments) follow the same rules as custom-work refunds. Whether the workshop tailor mid-sewing should be told "stop, this is refunded" when (b) happens. What counts as "cancelled" — an order-level cancel vs. every garment refunded individually.

---

## 9. Last trial garment is refunded — what happens to the finals waiting on it?

**Scenario.** A customer orders 4 thobes. We make 1 trial garment (brova) first; the other 3 (finals) are parked at the workshop, waiting for the customer to try the brova so we know the fit is right. Before the customer even comes in to try, they call and refund the brova specifically — they changed their mind about its fabric but want the other 3 to continue.

The brova is gone. The 3 finals are still parked, waiting for a brova that no longer exists.

**What today does.** The refund discards the brova. Nothing touches the parked finals. They stay parked forever — they never show up in any "needs action" list, no manager is told. Months later someone might notice. Until then the customer's 3 thobes are silently frozen.

**Core question.** When the last remaining trial garment on an order is removed by a refund and the finals were waiting on it, the finals should:

- (a) Automatically be released to start production — the only reason they were parked is gone.
- (b) Stay parked, but the order shows up in a "needs manager attention" list — the manager decides whether to release them, refund them too, or do something else.
- (c) Be refunded / cancelled automatically along with the brova — treat the whole order as the customer pulling out.
- (d) Something else?

**Edge cases to follow up.** What if some finals had already been released earlier (an earlier brova was accepted) and the refund is on a later, separate brova? What if a replacement brova was made (Reject-Redo) and then the replacement is refunded? Whether the answer changes when the refund was a staff-side correction vs. the customer changing their mind.

---

## 10. Trial garment is repaired and ready, but the finals aren't — send it alone?

**Scenario.** A customer tried a brova and accepted it with a small fix — "the collar's fine, just take in the chest a bit." The brova went back to the workshop, the fix is done, the brova is ready to go to the shop. The same order's 3 finals are still being sewn — they will not be ready for another two days.

The point of an Accept-with-Fix brova is to give the customer a finished thobe of the design they signed off on, usually paired with the rest of the order so they collect everything together.

**What today does.** The workshop dispatch screen pops a warning: *"this order still has 3 finals in production — send the brova without them?"* If staff confirm, it ships. If they cancel, it waits. The warning only appears on this one screen; if a different way of dispatching is ever used, no warning.

**Core question.** When a fixed-up trial garment is ready and the finals are not:

- (a) Same as today — warn the staff but let them choose. Sometimes the customer is impatient and wants the brova back early.
- (b) Refuse — the brova waits with the finals, they all travel together. Avoids the customer making two trips to collect.
- (c) Allow it without a warning — the workshop does not need to second-guess; whoever is at the dispatch desk decides.

**Edge cases to follow up.** What if one final is already on its way to the shop from a previous batch? What if a final has been cancelled (refunded) — does that count as "ready"? What if the customer specifically asked for the brova back early?

---

## 11. Should staff ever release the finals before any trial garment is accepted?

**Scenario.** An order has trial garments (brovas) and finals. The finals are parked at the workshop, waiting for the customer to try a brova and accept the fit. Staff opens the parking screen and hits "Start Production" on the finals — but no brova has been accepted yet. Maybe none have even been tried.

**What today does.** The system releases the finals. Production starts. The customer has not yet confirmed the fit on any trial garment. If the trial later comes back with major changes, the finals are already being made with the old measurements.

**Core question.**

- (a) Same as today — staff can release finals whenever they decide; it is a judgment call.
- (b) Block the release until at least one brova on the order has been accepted by the customer. The whole point of parking finals is to wait for that signal — releasing early defeats it.
- (c) Allow it but require a written reason (override note), so it is clear later why finals were released without an accepted trial.

**Edge cases to follow up.** The customer never trials the brova at all (no-show) — eventually finals must be released somehow; what is the path? The brova was refunded and there is no brova left to accept (overlaps with Q9). Manager override: should a manager be able to bypass the rule when the customer is in a rush?

---

## 12. A thobe has come back five times — does staff need to know?

**Scenario.** A thobe was made for a customer, came back as a small alteration, went back, came back again, and again, and again. Maybe the customer is hard to please, maybe something genuinely keeps going wrong. Either way, this thobe has had 5 trips between the shop and the workshop. Same thing for quality check: a QC inspection has failed 6 times in a row on one thobe.

**What today does.** The system tracks every trip and every QC attempt — there is no cap, the spec is intentionally unbounded. But nothing on screen highlights this thobe. To a tailor picking it up off the rack today, it looks like any other returning alteration.

**Core question.** At some point this thobe is unusual enough that someone with more authority should look at it.

- (a) Same as today — no highlighting. Trust staff to notice.
- (b) Soft warning on the thobe's card after, say, 3 alterations or 3 failed QC attempts — visible but does not block work.
- (c) Hard gate — after the threshold a manager must explicitly approve continuing, otherwise the thobe is parked.

**Edge cases to follow up.** What thresholds feel right (3? 5?). Whether QC attempts and alteration trips count toward the same limit or separate ones. Whether the count resets if the workshop creates a fresh replacement thobe (Reject-Redo).

---

Resolved questions are folded into the product spec and removed from this document. New questions follow the same shape: Scenario → What the system does today → Core question → Edge cases to follow up.

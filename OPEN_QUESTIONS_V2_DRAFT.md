# Open Questions — v2

*Pending decisions — ERTH / Autolinium*

This is a second set of questions about how the system should work. Each one is short: we tell you what the system does today, propose how we think it should work, and ask either a specific question or just for your confirmation. Once you answer, we fold the decision into the spec and remove the question from this list.

---

## Q1. Performance — individual scoring for every station except sewing and soaking. Right?

**What we have right now.** The Performance page shows raw counts per worker and per team. Cutters, finishers, ironers, and QC inspectors each get their own number. Sewers are credited at the team level — whoever finished a thobe on the terminal gets the count, so a sewer who worked on a thobe but didn't close it shows 0. Soakers always show 0 because no one is recorded as starting or finishing a soak (any soaker can act on any thobe). There are no targets, no trends, no comparison baseline.

**Questions for you.**

1. **Sewing.** Sewing is a team effort — multiple sewers touch one thobe. If you want to see individual sewers under each team, what should count toward each one? Today only the sewer who pressed "Done" is credited; the sewer who started the thobe is invisible.
2. **Soakers.** Soaking is mostly wall-clock waiting (12 hours in a bath), not labor. The work is starting and stopping the soak. Should soakers be on the Performance page at all? If yes, what counts as a soaker's work — putting a thobe in, taking it out, both?

*Or — if the overall direction (individual scoring for the rest, team for sewing, special handling for soakers) is wrong, tell us how it should work.*

---

## Q2. QC ratings — we collect 1–5 numbers; how should we use them?

**What we have right now.** When the QC inspector checks a thobe, they rate six things on a 1–5 scale: seam, ironing, front pocket, collar, jabzour, hemming. Anything below 4 on any aspect fails the thobe; everything 4 or higher passes. Today only the pass/fail decision drives anything — the 1–5 numbers themselves are stored on every QC attempt but never shown anywhere or aggregated.

**Questions for you.**

1. Do you want the 1–5 numbers used somewhere, or is pass/fail enough?
2. If used — pick what you want (one or more):
   - Per-team averages (so the manager spots which aspect a team is weakest at).
   - Just the weakest aspect per team (one focused signal — "Team A weakest at hemming").
   - Trends over time (a team improving from 3.8 to 4.6 is a different story from one sliding from 4.8 to 4.2 — both pass).
   - Only inside the investigation workflow in Q3 (when a thobe is flagged, show its full rating history; otherwise the numbers stay in the database).

---

## Q3. A thobe has come back 5 times — should there be an investigation workflow?

**What we have right now.** The system tracks every trip back to the workshop and every QC attempt — unbounded by design (no cap). But nothing on screen highlights a thobe that has come back many times. To a tailor picking it up off the rack, a thobe on its 5th alteration looks like any other returning alteration.

**Questions for you.**

1. Do you want the system to flag a thobe after some number of returns? You pick the number (we don't).
2. If yes, what should happen when it's flagged?
   - A small warning on the thobe's card (visible everywhere, doesn't block work).
   - A dedicated "Needs Investigation" list the manager opens.
   - The thobe is parked until a manager explicitly approves continuing.
3. What does an investigation actually do — manager records a root cause (measurement issue / fabric issue / customer expectation / our error), decides the next step (continue / remake / refund), and closes it? Or simpler?
4. Should alteration trips and QC failures count toward the same limit, or separate ones?

---

## ~~Q4. Two cutting tables — explicit team assignment~~ — ✅ RESOLVED (Group D, 2026-06-02)

**Answer:** the system supports **explicit team assignment for all operational stations** (cutting, sewing, finishing, ironing, QC) — a visible, required team picker (with inline "create team") in worker create/edit. **Silent default to "Team A" is gone**, and editing a worker no longer re-pins them to the first team. Soaking is excluded (all-hands). Folded into `CLAUDE.md` §6 and shipped in the workshop app. See `OPEN_QUESTIONS_V2_DECISIONS.md` → Group D.

---

## Q5. Refunds — should the system ever block one? And what about parked finals if their trial thobe is refunded?

**What we have right now.** The cashier can refund anything as long as the register is open, the cashier types a reason, and the refund amount doesn't exceed what was paid. The system blocks nothing — not for cancelled orders, not for thobes in mid-production, not for already-collected thobes. (One related safety gap is now closed: if the **only** trial thobe (brova) on an order is refunded with no replacement coming, the finals that were parked waiting on it are now **automatically released to production** rather than silently parked forever — see Question 2. Everything else below is still as described.)

**Questions for you.**

**Question 1.** For each situation below, what should the system do?

| Situation | Allow (today) / Manager only / Block |
|-----------|--------------------------------------|
| Refund on an order that was cancelled days ago | ☐ Allow ☐ Manager only ☐ Block |
| Refund on a thobe currently being made at the workshop | ☐ Allow ☐ Manager only ☐ Block |
| Refund after the customer has already collected the thobe | ☐ Allow ☐ Manager only ☐ Block |
| Refund the only trial thobe (brova) while finals are still parked waiting on it | ☐ Allow ☐ Manager only ☐ Block |

**Question 2 — only if the last row is allowed.** When the last trial thobe is refunded and the finals were waiting on it, what should happen to the parked finals?

- (a) Automatically released to start production (the reason they were parked is gone).
- (b) Stay parked but show up in a "needs manager attention" list.
- (c) Refunded along with the trial — treat the whole order as the customer pulling out.
- (d) Other.

> **Already implemented (2026-06-02): (a).** To eliminate the silent-orphan bug, the system now does (a) for this exact case — when the **last** brova on an order is refunded and no replacement is being made, its parked finals are automatically released to production. (When a *replacement* brova is in flight, the finals correctly stay parked — the replacement will release them.) **Confirm (a) is what you want, or tell us if you'd prefer (b)/(c)/(d)** — we'll change it. Question 1 (whether the refund should be allowed/manager-only/blocked at all) is still open.

---

## Q6. Home delivery — the cashier marks it "delivered" at the counter. Is that right?

**What we have right now.** When the cashier hits "Hand Over," the thobe is marked **completed** immediately — whether the customer is picking up at the counter or it's a home delivery. The home-delivery thobes stay sitting in the shop, waiting for a driver, but the system already says they're done. There is no driver step, no proof of delivery, no address verification, no tracking after handover. The "home delivery" tag and the fee are the only difference; the workflow is the same.

**Questions for you.**

- Is the one-step model right — cashier finalises everything, drivers handle the rest offline?
- Or should home delivery be a two-step flow — cashier marks "out for delivery," and a separate action (driver, manager, or someone confirming receipt) marks it actually delivered? The thobe is only `completed` after that second step.

---

## Q7. Trial photos and voice notes — who should see them?

**What we have right now.** During a trial, staff sometimes take photos of the customer wearing the thobe, record voice notes in the customer's own words ("chest looser by two fingers"), and capture signatures on a tablet. Same kinds of media can be attached at QC. Today **every workshop terminal, every cashier, and every staff with order access sees all of it.** No filtering. The files themselves live in a public bucket — guessable URLs would open them in any browser without a login.

**Questions for you.**

1. Should every workshop terminal see customer trial photos (which can include the customer's body or face), or only fit-reference photos that are clearly about the thobe?
2. Should the cashier see all feedback media, or only what's relevant to handover (e.g., the customer's signature)?
3. Should the files themselves be protected (each photo loads through a short-lived link that expires), or is the current public-URL setup fine?

---

## Q8. Cash register and end-of-day — a plain-English walkthrough; is this what you want?

This one is longer than the others because we want you to read through the whole day at the counter and confirm that's how you want it to work.

### A normal day, step by step

**9:00 AM — Opening the register.**

Ahmed arrives at the ERTH shop. Before he can take any payment, he opens the day's register. He hits "Open Register" and **types in the opening float** — the cash already in the drawer (say, 50 KWD left in overnight). The system records: ERTH, today's date, opened by Ahmed, opening float 50 KWD.

- The register is **per brand** (ERTH has one, SAKKBA has its own). They cannot share a till.
- The register is **per day** — once opened today, it cannot be opened again today.
- **The opening float is typed in by the cashier.** It does NOT carry over from yesterday's closing cash automatically. If Ahmed forgets and types 0, the day's math will be off by 50 KWD.
- **The register must be open** to take any payment. A customer at 8:55 AM cannot pay until the register is open.

**Through the day — payments and refunds.**

Customers come in. Ahmed records each payment: 30 KWD cash, 100 KWD card, 50 KWD cash. He also processes a refund — 20 KWD cash refund on a defective thobe returned yesterday. All of these are attached to today's ERTH register session.

If Ahmed leaves at 1 PM and Khaled takes over at 2 PM, **they share the same register session.** Whoever closes at the end of the day reconciles the whole day together — there is no per-shift breakdown.

**6:00 PM — Closing the register.**

Ahmed counts the cash physically in the drawer and types the number into the close screen. Say he counts 110 KWD.

The system computes what the drawer **should** have:

> opening float (50) + cash payments (80) − cash refunds (20) = **110 KWD expected**

It compares to what was counted (110). Difference = 0. The day closes cleanly.

If the count had been 105, the system would show a **shortage of 5 KWD** and ask for a note. The day still closes — the shortage is just recorded with the note. Same for an overage (115 KWD → +5 KWD, requires note). The system **does not block, does not call a manager, does not flag for review.** It just records.

**After close — the day is frozen.**

Once closed:
- **No more payments or refunds** can be recorded for today's ERTH register. A customer at 6:30 PM with cash is refused ("register is not open").
- Tomorrow morning, a fresh register is opened — opening float typed in again.

**To fix something after close:** a **manager (and only a manager)** can reopen yesterday's session. After reopen, payments/refunds can be added; the manager then closes again. Every close is logged separately in an audit trail that is never overwritten.

### Question for you

**Is this how you want the cash register to work?**

- (a) Yes, all of the above is fine.
- (b) Mostly — point out which parts need to change (the edge-case table below helps surface candidates).
- (c) No — describe how it should work.

### Edge cases — please confirm each

| # | Situation | What the system does today | Confirm |
|---|-----------|---------------------------|---------|
| 1 | The cashier forgets to close at end of day | Tomorrow's cashier cannot open a new register until yesterday's is closed (by anyone with permission) | ☐ Yes ☐ No |
| 2 | A customer walks in at 7 PM, after close, with cash | Payment is refused. Manager must reopen, record the payment, close again | ☐ Yes ☐ No |
| 3 | End-of-day count is short (or over) | Recorded with a note. The day closes. No manager approval needed, no automatic flag | ☐ Yes ☐ No |
| 4 | A customer pays half today, half tomorrow | Each payment lands in its own day's session | ☐ Yes ☐ No |
| 5 | A refund the day after a sale | Refund counts against tomorrow's session, not the sale's day | ☐ Yes ☐ No |
| 6 | The cashier typed the opening float wrong | The end-of-day variance will be off by that amount. The cashier writes a note; close goes through. Cannot edit opening float mid-day | ☐ Yes ☐ No |
| 7 | Shift change mid-day (Ahmed → Khaled) | Same register session. Whoever closes is responsible for the whole day's count | ☐ Yes ☐ No |
| 8 | A card payment, later refunded in cash | Card payment counted in card totals; cash refund reduces the drawer. The two are not netted automatically | ☐ Yes ☐ No |

### Other points to clarify with you

- **Opening float source.** Today the cashier types it. Some shops prefer the system auto-fill yesterday's closing cash and just confirm. Which do you want?
- **Shortage threshold for manager attention.** Today any shortage is just recorded with a note. Should a shortage above some amount (you pick) require manager approval?
- **Cash in / cash out during the day.** If the cashier takes money out of the drawer to buy supplies, or adds cash from somewhere else mid-day, do you want a UI button for this? (The system supports recording it.)
- **Closing rule.** Today there's no deadline to close. Do you want a hard rule (must close by midnight) or just a warning?

---

## ~~Q9. Low stock~~ · ~~Q10. Stocktake~~ · ~~Q11. Damage & waste~~ — ✅ RESOLVED (Group E, 2026-06-01)

These three were answered and **shipped** — folded into `CLAUDE.md` §4 and built in both apps + DB. See `OPEN_QUESTIONS_V2_DECISIONS.md` → Group E.

- **Q9 — Low stock:** both (always-visible "Need to Restock" list **and** active `low_stock` notifications on the threshold-crossing edge); per-item minimum set by a manager, per-type default fallback.
- **Q10 — Stocktake:** monthly per-side count; the proposed workflow (Stocktake screen → counts → variance → mandatory reason → manager validates → history) as-is; overdue escalation is a **soft block** (dismissible banner + tier-3 entry modal, nothing locked).
- **Q11 — Damage/Waste:** dedicated action separate from Adjust, with the proposed reason categories, quantity-damaged, optional photo, recorded cost impact, waste-by-reason report; manager approval above a cost threshold is an **RBAC gate by amount** (over-threshold waste from a non-manager is rejected — no pending queue).

---

## Q12. When a thobe is rejected as "Redo," what happens to the fabric — both the cut one and the new one?

**What we have right now.** When a customer rejects a trial thobe as "Redo" (the design is wrong, not a small fix), the original thobe is **discarded** and the workshop manually creates a replacement that starts from scratch. But the fabric already cut and sewn into the original is wasted — it can't go back to stock — and the system handles none of this:

- The original fabric was deducted from stock at order confirmation. The discarded thobe sits in the system, but the fabric is not in stock and not in any waste report.
- The replacement needs fresh fabric. Today the system does NOT automatically deduct again — it's a manual decision on the workshop floor.
- If the original fabric is out of stock, discontinued, or was brought by the customer themselves, the system has no path to handle any of it.

This is related to V1 Q5 (Reject-Redo), which covered re-trial / delivery date / whether to charge for the labor — but never the fabric.

**Questions for you.**

1. **The wasted (already-cut) fabric** — should it be recorded as waste so it shows up in monthly waste reports (Q11)? If yes, what reason category — "workshop mistake," "customer change of mind," both depending on fault, or something else?
2. **The fresh fabric for the replacement** — should the system automatically deduct it from stock when the replacement is created, or stay manual (today)?
3. **Who absorbs the cost of the wasted fabric** — the workshop (default today), or charged to the customer when the rejection was their fault?
4. **Stock-out and special cases.** If the customer's original fabric is no longer available, what should happen?
   - Original fabric **out of stock but reorderable** → the replacement waits (parked) until restock arrives. Is this right, or should the customer be called to substitute?
   - Original fabric **discontinued** → workshop suggests a substitute and the customer is called; OR the order is refunded; OR something else.
   - **Customer brought their own fabric** (their own bolt, not from our stock) → there may not be spare. Customer must bring more, or refund. The system has no record of customer-brought fabric today — should it?
   - **Last roll, multiple orders waiting on it** → who gets priority — this redo, or new orders not yet started?

> **Partly implemented (2026-06-03) — workshop/inventory slice.** The replacement now **auto-consumes fresh fabric** from stock; the discarded original's already-cut fabric is recorded as **material waste** classified by `root_cause` (surfaced in the waste report with cost), and does **not** return to stock; **company vs. customer fabric** is distinguished — customer-brought (`OUT`) cloth is never decremented/wasted and the replacement parks until the customer provides more; if shop fabric is short the replacement **parks pending a manager decision** (reorder / substitute / consult / refund) instead of failing. **Still open:** whether to **charge the customer** for customer-fault waste (a cashier/showroom billing decision), and the discontinued-fabric / last-roll-priority special cases beyond the generic "park pending manager."

---

## Q13. After a Redo is created, where does the replacement go, who hears about it, and what does the customer know?

**What we have right now.** When the workshop manually creates a replacement thobe, it appears at `waiting_cut` — but the spec doesn't really say where it shows up after that. Best we can tell, it joins the regular production list with no special tag. The finals that were parked on the original brova stay parked silently. The shop staff who took the customer's rejection don't necessarily see when the workshop has actually started the replacement. And the customer is never told anything by the system — any communication is a manual phone call.

**Questions for you.**

1. **Where does the replacement enter the workshop's view?**
   - Auto-queued into the scheduler immediately (today's behavior, as far as we can tell).
   - Parked, requires the manager to manually schedule it.
   - Bumped to the front of the queue (urgent because the customer is already waiting).
   - Other.

2. **Parked finals during the Redo.** The finals are waiting on a brova that no longer exists — a fresh replacement is being made. Should the manager see a clear flag on the order ("3 finals waiting on a replacement brova in production"), or is the current silent-park behavior fine?

3. **Replacement-of-replacement chain.** Today an order can go through unlimited redos. After some number (you pick), should the order be flagged for manager attention? (Overlaps with Q3 investigation workflow — same answer, or different?)

4. **Shop-side visibility.** When the workshop has accepted the Redo and started the replacement, should the shop staff (who took the rejection) see it? E.g., a status update on the order, or a "redo in progress, new ETA: X" line.

5. **Customer communication.** When a replacement is started, should the system prompt the shop to call/notify the customer (new delivery date, no charge confirmation, reason)? Or is this kept fully manual?

> **Partly implemented (2026-06-03) — factory side.** The replacement now enters a **manager-controlled high-priority queue**: at creation the manager sets `immediate` / `next available slot` / `parked` (with a parked reason — waiting material / customer decision / approval / clarification), and the scheduler surfaces a pinned "Redo — immediate" section, tags `next_slot` redos, and lists parked redos with a **Resume** action. The **parked-finals flag** (q2) ships: an order whose finals wait on an in-flight replacement brova shows "Finals waiting on replacement brova" (flag-only — they stay parked). **Still open (deferred to the showroom/retail decision):** shop-side redo-lifecycle **visibility** (q4), the **customer-communication** prompt (q5), and the **replacement-of-replacement chain** flag (q3 — folded into the Q3 investigation workflow, Group C).

---

## Q14. How should a Redo affect Performance numbers?

*(Only applies if you said yes to a Performance page in Q1.)*

**What we have right now.** Performance only counts what was **completed**. A discarded thobe doesn't count toward anyone's number. So today: the cutter who cut the original, the sewer team who sewed it, the QC inspector who passed it — none of them are credited for the original work. The replacement, when finished, gets counted as a fresh thobe (effectively counted once, not twice).

But this leaves real questions unanswered.

**Questions for you.**

1. **The original work — should it count at all?** Today: zero credit (it was discarded). Some shops prefer to give partial credit for the effort, others want it to count as a negative mark. Which?

2. **The replacement.** When the same team makes the replacement, today they get credit for it (it's a new thobe in the system). Is that right, or should a replacement count as half (since the team had a hand in the failed original too)?

3. **QC inspector's pass-rate.** If QC passed the original and the customer then rejected the design, does the QC inspector's pass-rate stay clean, or take a hit? Their job is technical quality, not design — but the rejection is on the team's overall output.

4. **Time on a discarded thobe.** Real labor was spent — cutting, sewing, finishing the discarded thobe. Should that time count as productive labor (worker was working) or overhead (no usable output)?

5. **Whose "fault."** If the workshop has a way to mark a Redo as "our mistake" vs. "customer change of mind" (linked to Q12 q3), should the Performance impact differ — e.g., our-mistake redos hurt the responsible team's numbers; customer-mind redos don't?

---

*Resolved questions are folded into the product spec and removed from this document.*

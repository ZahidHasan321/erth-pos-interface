/**
 * Workshop order-level status labels (Production Tracker) — CLAUDE.md §2.8
 * "Workshop labels" AS THE SINGLE SOURCE OF TRUTH.
 *
 * §2.8 specifies, given an order's garment states, ONE order-level label plus a
 * strict priority chain:
 *
 *   at shop > ready for dispatch > in transit > awaiting finals release /
 *   awaiting brova trial > finals in production > brovas in production > fallback.
 *
 * Two layers are tested, both anchored to §2.8 (never to the SQL body, §0.2):
 *
 *   A. assigned_order_status_label(...) — the pure decision table. Each §2.8 row
 *      and every priority rule the spec calls out (incl. "Finals in production
 *      wins over a returning brova") is asserted directly.
 *
 *   B. get_assigned_orders_page(...) end-to-end — real garments are driven into
 *      each §2.8 state through the lifecycle helpers; the view computes the flags
 *      and the page RPC emits the label. This covers the garment-state → flag
 *      derivation (assigned_order_agg), not just the decision table.
 *
 * NOTE on "Finals waiting on replacement brova": §2.8 marks it **flag-only** — it
 * is surfaced by the dedicated finals_waiting_on_replacement_brova() function
 * (covered by workflow.conservation-redo.test.ts T8), NOT as a value in this
 * mutually-exclusive status label. Its absence here is by design.
 *
 * Every end-to-end test runs in a rolled-back transaction; committed reference
 * data is untouched.
 */
import { describe, it, expect, afterAll } from "vitest";
import { sql, inRolledBackTx, only, type Tx } from "../../scripts/lifecycle/db";
import * as wf from "../../scripts/lifecycle/driver";

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

// ───────────────────────────────────────────────────────────────────────────
// A. Decision table — assigned_order_status_label(13 booleans) vs §2.8
// ───────────────────────────────────────────────────────────────────────────

type Flags = {
  all_at_shop: boolean;
  has_workshop_garment: boolean;
  all_workshop_ready: boolean;
  has_transit_to_shop: boolean;
  only_parked_at_workshop: boolean;
  brovas_in_transit_to_shop: boolean;
  finals_active_workshop: boolean;
  brovas_all_at_shop: boolean;
  has_any_brova: boolean;
  any_brova_accepted: boolean;
  finals_parked: boolean;
  brovas_at_workshop: boolean;
  has_alteration: boolean;
};

const NONE: Flags = {
  all_at_shop: false,
  has_workshop_garment: false,
  all_workshop_ready: false,
  has_transit_to_shop: false,
  only_parked_at_workshop: false,
  brovas_in_transit_to_shop: false,
  finals_active_workshop: false,
  brovas_all_at_shop: false,
  has_any_brova: false,
  any_brova_accepted: false,
  finals_parked: false,
  brovas_at_workshop: false,
  has_alteration: false,
};

async function dlabel(overrides: Partial<Flags>): Promise<string> {
  const f = { ...NONE, ...overrides };
  const r = only(
    await sql`SELECT assigned_order_status_label(
      ${f.all_at_shop}, ${f.has_workshop_garment}, ${f.all_workshop_ready},
      ${f.has_transit_to_shop}, ${f.only_parked_at_workshop}, ${f.brovas_in_transit_to_shop},
      ${f.finals_active_workshop}, ${f.brovas_all_at_shop}, ${f.has_any_brova},
      ${f.any_brova_accepted}, ${f.finals_parked}, ${f.brovas_at_workshop}, ${f.has_alteration}
    ) AS label`,
    "assigned_order_status_label",
  );
  return r.label as string;
}

describe("§2.8 decision table — each label", () => {
  it("all garments at shop → 'At shop'", async () => {
    expect(await dlabel({ all_at_shop: true })).toBe("At shop");
  });

  it("all workshop garments at ready_for_dispatch → 'Ready for dispatch'", async () => {
    expect(await dlabel({ has_workshop_garment: true, all_workshop_ready: true })).toBe(
      "Ready for dispatch",
    );
  });

  it("garments in transit, nothing active at workshop → 'In transit to shop'", async () => {
    expect(await dlabel({ has_transit_to_shop: true })).toBe("In transit to shop");
  });

  it("garments in transit with only parked finals at workshop → 'In transit to shop'", async () => {
    expect(
      await dlabel({
        has_transit_to_shop: true,
        has_workshop_garment: true,
        only_parked_at_workshop: true,
      }),
    ).toBe("In transit to shop");
  });

  it("brova in transit to shop, an active non-final garment still at workshop → 'Brovas in transit'", async () => {
    // Distinct from 'In transit to shop': here a workshop garment is still active
    // (only_parked=false, has_workshop=true) so the generic in-transit branch is
    // not taken; with no active finals, the returning-brova label wins.
    expect(
      await dlabel({
        brovas_in_transit_to_shop: true,
        has_transit_to_shop: true,
        has_workshop_garment: true,
        only_parked_at_workshop: false,
        finals_active_workshop: false,
        has_any_brova: true,
      }),
    ).toBe("Brovas in transit");
  });

  it("brovas at shop + ≥1 accepted + finals parked → 'Awaiting finals release'", async () => {
    expect(
      await dlabel({
        has_any_brova: true,
        brovas_all_at_shop: true,
        finals_parked: true,
        any_brova_accepted: true,
      }),
    ).toBe("Awaiting finals release");
  });

  it("brovas at shop + none accepted + finals parked → 'Awaiting brova trial'", async () => {
    expect(
      await dlabel({
        has_any_brova: true,
        brovas_all_at_shop: true,
        finals_parked: true,
        any_brova_accepted: false,
      }),
    ).toBe("Awaiting brova trial");
  });

  it("finals actively worked at workshop → 'Finals in production'", async () => {
    expect(await dlabel({ finals_active_workshop: true })).toBe("Finals in production");
  });

  it("brovas being worked at workshop → 'Brovas in production'", async () => {
    expect(await dlabel({ brovas_at_workshop: true })).toBe("Brovas in production");
  });

  it("no distinguishing state → fallback 'In production'", async () => {
    expect(await dlabel({})).toBe("In production");
  });
});

describe("§2.8 decision table — priority chain", () => {
  it("'At shop' wins over everything else (priority 1)", async () => {
    expect(
      await dlabel({
        all_at_shop: true,
        // every lower-priority signal also set — must not change the label.
        has_workshop_garment: true,
        all_workshop_ready: true,
        finals_active_workshop: true,
        brovas_at_workshop: true,
      }),
    ).toBe("At shop");
  });

  it("'Ready for dispatch' wins over 'In transit to shop'", async () => {
    expect(
      await dlabel({
        has_workshop_garment: true,
        all_workshop_ready: true,
        has_transit_to_shop: true,
      }),
    ).toBe("Ready for dispatch");
  });

  it("'In transit to shop' wins over the awaiting labels", async () => {
    expect(
      await dlabel({
        has_transit_to_shop: true,
        has_any_brova: true,
        brovas_all_at_shop: true,
        finals_parked: true,
        any_brova_accepted: true,
      }),
    ).toBe("In transit to shop");
  });

  it("acceptance distinguishes 'Awaiting finals release' from 'Awaiting brova trial'", async () => {
    const base = { has_any_brova: true, brovas_all_at_shop: true, finals_parked: true };
    expect(await dlabel({ ...base, any_brova_accepted: true })).toBe("Awaiting finals release");
    expect(await dlabel({ ...base, any_brova_accepted: false })).toBe("Awaiting brova trial");
  });

  it("a returning brova while finals are in production → 'Finals in production' wins (§2.8)", async () => {
    expect(
      await dlabel({
        finals_active_workshop: true,
        brovas_at_workshop: true, // a brova is back at the workshop too
      }),
    ).toBe("Finals in production");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// B. End-to-end — real garment states → get_assigned_orders_page status_label
// ───────────────────────────────────────────────────────────────────────────

type G = wf.GarmentRow;

/** Drive an order's garments into a target state, force it in_progress, and read
 *  back the status_label the Production Tracker page emits for that order. */
async function labelFor(
  tx: Tx,
  specs: { garment_type: "brova" | "final" }[],
  mutate: (tx: Tx, garments: G[], orderId: number) => Promise<void>,
): Promise<string> {
  const { orderId, garments } = await wf.createWorkOrder(tx, specs);
  await mutate(tx, garments, orderId);
  // Status labels only apply to in-progress orders; force it after the garment
  // edits so the recompute-phase trigger can't leave it 'new'.
  await tx`UPDATE work_orders SET order_phase = 'in_progress' WHERE order_id = ${orderId}`;

  const r = only(
    await tx`SELECT get_assigned_orders_page('all', p_page_size => 100) AS r`,
    "get_assigned_orders_page",
  );
  const page = r.r as { data: Array<{ order_id: number; status_label: string }> };
  const row = page.data.find((d) => d.order_id === orderId);
  if (!row) throw new Error(`order ${orderId} not present in the assigned page`);
  return row.status_label;
}

const set = (tx: Tx, id: string, fields: { location?: string; piece_stage?: string; acceptance_status?: boolean }) =>
  tx`UPDATE garments SET
       location = COALESCE(${fields.location ?? null}::location, location),
       piece_stage = COALESCE(${fields.piece_stage ?? null}::piece_stage, piece_stage),
       acceptance_status = ${fields.acceptance_status ?? null}
     WHERE id = ${id}::uuid`;

const brovaIds = (gs: G[]) => gs.filter((g) => g.garment_type === "brova").map((g) => g.id);
const finalIds = (gs: G[]) => gs.filter((g) => g.garment_type === "final").map((g) => g.id);

describe("§2.8 end-to-end — real garment states drive the page label", () => {
  it("all garments at shop → 'At shop'", async () => {
    await inRolledBackTx(async (tx) => {
      const label = await labelFor(tx, [{ garment_type: "brova" }], async (tx, gs) => {
        await set(tx, brovaIds(gs)[0]!, { location: "shop", piece_stage: "awaiting_trial" });
      });
      expect(label).toBe("At shop");
    });
  });

  it("all workshop garments at ready_for_dispatch → 'Ready for dispatch'", async () => {
    await inRolledBackTx(async (tx) => {
      const label = await labelFor(tx, [{ garment_type: "final" }, { garment_type: "final" }], async (tx, gs) => {
        for (const id of finalIds(gs)) await set(tx, id, { location: "workshop", piece_stage: "ready_for_dispatch" });
      });
      expect(label).toBe("Ready for dispatch");
    });
  });

  it("a garment in transit to shop, nothing at workshop → 'In transit to shop'", async () => {
    await inRolledBackTx(async (tx) => {
      const label = await labelFor(tx, [{ garment_type: "final" }], async (tx, gs) => {
        await set(tx, finalIds(gs)[0]!, { location: "transit_to_shop", piece_stage: "ready_for_dispatch" });
      });
      expect(label).toBe("In transit to shop");
    });
  });

  it("brova accepted at shop, final still parked → 'Awaiting finals release'", async () => {
    await inRolledBackTx(async (tx) => {
      const label = await labelFor(tx, [{ garment_type: "brova" }, { garment_type: "final" }], async (tx, gs) => {
        await set(tx, brovaIds(gs)[0]!, { location: "shop", piece_stage: "brova_trialed", acceptance_status: true });
        await set(tx, finalIds(gs)[0]!, { location: "workshop", piece_stage: "waiting_for_acceptance" });
      });
      expect(label).toBe("Awaiting finals release");
    });
  });

  it("brova at shop NOT accepted, final still parked → 'Awaiting brova trial'", async () => {
    await inRolledBackTx(async (tx) => {
      const label = await labelFor(tx, [{ garment_type: "brova" }, { garment_type: "final" }], async (tx, gs) => {
        await set(tx, brovaIds(gs)[0]!, { location: "shop", piece_stage: "awaiting_trial" });
        await set(tx, finalIds(gs)[0]!, { location: "workshop", piece_stage: "waiting_for_acceptance" });
      });
      expect(label).toBe("Awaiting brova trial");
    });
  });

  it("a final actively sewing at the workshop → 'Finals in production'", async () => {
    await inRolledBackTx(async (tx) => {
      const label = await labelFor(tx, [{ garment_type: "final" }], async (tx, gs) => {
        await set(tx, finalIds(gs)[0]!, { location: "workshop", piece_stage: "sewing" });
      });
      expect(label).toBe("Finals in production");
    });
  });

  it("a brova actively sewing at the workshop → 'Brovas in production'", async () => {
    await inRolledBackTx(async (tx) => {
      const label = await labelFor(tx, [{ garment_type: "brova" }], async (tx, gs) => {
        await set(tx, brovaIds(gs)[0]!, { location: "workshop", piece_stage: "sewing" });
      });
      expect(label).toBe("Brovas in production");
    });
  });

  it("final in production while a brova is also back at the workshop → 'Finals in production' wins (§2.8)", async () => {
    await inRolledBackTx(async (tx) => {
      const label = await labelFor(tx, [{ garment_type: "brova" }, { garment_type: "final" }], async (tx, gs) => {
        await set(tx, brovaIds(gs)[0]!, { location: "workshop", piece_stage: "cutting" });
        await set(tx, finalIds(gs)[0]!, { location: "workshop", piece_stage: "sewing" });
      });
      expect(label).toBe("Finals in production");
    });
  });
});

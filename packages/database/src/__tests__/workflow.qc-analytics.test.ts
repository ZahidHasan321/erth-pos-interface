/**
 * QC analytics suite — CLAUDE.md §6 "QC analytics (Q2)" AS THE SINGLE SOURCE OF
 * TRUTH. Pins get_qc_analytics: the 1–5 quality ratings + failed-key breadcrumbs
 * stored per qc_attempt are aggregated into defect-category averages/fail counts,
 * measurement/option/stage defect counts, and a per-day quality trend, ranged on
 * each attempt's own inspection date.
 *
 * TEST DISCIPLINE (CLAUDE.md §0.2 / §7 — tests are oracles, not mirrors): the
 * test CONSTRUCTS a known trip_history (two qc_attempts with explicit ratings,
 * failed keys, return stages, dated in a far-future window no real row occupies)
 * and every `expect` is the value computed BY HAND from that input — never read
 * off the RPC body. The aggregation rules being verified come from §6 Q2.
 *
 * Every test runs in a rolled-back transaction; committed reference data is
 * untouched.
 */
import { describe, it, expect, afterAll } from "vitest";
import { sql, inRolledBackTx, only, type Tx } from "../../scripts/lifecycle/db";
import * as wf from "../../scripts/lifecycle/driver";

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

// Far-future window: no seed/committed qc_attempt is dated here, so the analytics
// see ONLY the two attempts this test crafts. (now()±1min is unsafe — the seed
// builds within the same minute as the run.)
const DAY = "2099-03-15";
const TS = `${DAY}T10:00:00+00:00`;

async function craftQcGarment(tx: Tx): Promise<string> {
  const { garments } = await wf.createWorkOrder(tx, [{ garment_type: "final" }]);
  const gId = garments[0]!.id;
  // Two attempts, both dated in-window:
  //   #1 FAIL — seam 5, ironing 3 (<4 ⇒ a fail), collar 4; failed chest /
  //             pocket_style; returned to ironing + sewing.
  //   #2 PASS — seam 4, ironing 5, collar 4; no failed keys.
  await tx`
    UPDATE garments SET trip_history = jsonb_build_array(
      jsonb_build_object(
        'trip', 1,
        'qc_attempts', jsonb_build_array(
          jsonb_build_object(
            'result', 'fail',
            'date', ${TS}::timestamptz,
            'quality_ratings', jsonb_build_object('seam', 5, 'ironing', 3, 'collar', 4),
            'failed_quality', jsonb_build_array('ironing'),
            'failed_measurements', jsonb_build_array('chest'),
            'failed_options', jsonb_build_array('pocket_style'),
            'return_stages', jsonb_build_array('ironing', 'sewing')
          ),
          jsonb_build_object(
            'result', 'pass',
            'date', ${TS}::timestamptz,
            'quality_ratings', jsonb_build_object('seam', 4, 'ironing', 5, 'collar', 4)
          )
        )
      )
    )
    WHERE id = ${gId}
  `;
  return gId;
}

async function analytics(tx: Tx) {
  const from = `${DAY} 00:00:00+00`;
  const to = `${DAY} 23:59:59+00`;
  const row = only(
    await tx`SELECT get_qc_analytics(${from}::timestamptz, ${to}::timestamptz) AS r`,
    "get_qc_analytics",
  ) as unknown as {
    r: {
      total_attempts: number;
      pass: number;
      fail: number;
      by_aspect: Record<string, { avg: number; rated: number; fails: number }>;
      measurement_defects: Record<string, number>;
      option_defects: Record<string, number>;
      stage_defects: Record<string, number>;
      trend: Array<{ date: string; avg: number | null; attempts: number }>;
    };
  };
  return row.r;
}

describe("get_qc_analytics aggregates the 1–5 ratings & defect breakdowns (CLAUDE.md §6 Q2)", () => {
  it("totals, per-aspect avg/fails, measurement/option/stage defects, and the daily trend match the hand-computed input", async () => {
    await inRolledBackTx(async (tx) => {
      await craftQcGarment(tx);
      const r = await analytics(tx);

      // Totals: 2 attempts, 1 pass, 1 fail (the crafted input).
      expect(r.total_attempts).toBe(2);
      expect(r.pass).toBe(1);
      expect(r.fail).toBe(1);

      // Defect-category breakdown (§6 Q2): each aspect averaged across the 2
      // attempts; a fail is a rating < 4.
      //   seam   = (5+4)/2 = 4.5, 0 fails
      //   ironing= (3+5)/2 = 4.0, 1 fail (the 3)
      //   collar = (4+4)/2 = 4.0, 0 fails
      expect(r.by_aspect.seam).toEqual({ avg: 4.5, rated: 2, fails: 0 });
      expect(Number(r.by_aspect.ironing!.avg)).toBeCloseTo(4, 2);
      expect(r.by_aspect.ironing!.rated).toBe(2);
      expect(r.by_aspect.ironing!.fails).toBe(1);
      expect(Number(r.by_aspect.collar!.avg)).toBeCloseTo(4, 2);
      expect(r.by_aspect.collar!.fails).toBe(0);

      // Spec-defect lens (§6 Q2): one failed measurement, one failed option.
      expect(r.measurement_defects).toEqual({ chest: 1 });
      expect(r.option_defects).toEqual({ pocket_style: 1 });

      // Defect origin by stage (§6 Q2): attempt #1 returned to ironing + sewing.
      expect(r.stage_defects).toEqual({ ironing: 1, sewing: 1 });

      // Trend (§6 Q2): one day; mean of ALL six ratings = (5+3+4+4+5+4)/6 = 4.17;
      // 2 attempts that day.
      expect(r.trend.length).toBe(1);
      expect(r.trend[0]!.date).toBe(DAY);
      expect(r.trend[0]!.attempts).toBe(2);
      expect(Number(r.trend[0]!.avg)).toBeCloseTo(25 / 6, 2);
    });
  });
});

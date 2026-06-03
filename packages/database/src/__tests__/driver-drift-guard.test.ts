/**
 * driver-drift-guard.test.ts
 *
 * Parses every `file:line` (and `file:line-line`) citation out of
 * packages/database/scripts/lifecycle/driver.ts and asserts:
 *   1. The cited file exists and has at least `citedLine` lines.
 *   2. Anchor tokens — the key table/RPC/column names the driver function
 *      mutates — appear within ±40 lines of the cited line in the real file.
 *
 * Failure messages name the driver function, cited path:line, and missing
 * token so a human knows exactly what to re-audit.
 *
 * Run via the default `pnpm --filter @repo/database test` (no Docker needed).
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// ─── Repo root (packages/database/src/__tests__/ → ../../../../) ─────────────
const REPO_ROOT = path.resolve(__dirname, "../../../../");
const DRIVER_PATH = path.join(
  REPO_ROOT,
  "packages/database/scripts/lifecycle/driver.ts",
);
const TRIGGERS_SQL_PATH = path.join(
  REPO_ROOT,
  "packages/database/src/triggers.sql",
);
const APPS_ROOT = path.join(REPO_ROOT, "apps");
const DB_SRC_ROOT = path.join(REPO_ROOT, "packages/database/src");

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Return every line (1-indexed) of a file as an array. */
function readLines(filePath: string): string[] {
  return fs.readFileSync(filePath, "utf8").split("\n");
}

/**
 * Glob-resolve a filename suffix (e.g. "feedback.$orderId.tsx" or
 * "customer-demographics/pending-orders-dialog.tsx") inside the apps/ tree
 * by matching file paths that END with the given suffix. Returns the absolute
 * path of the unique match. Throws a descriptive error if 0 or >1 matches.
 */
function resolveBareName(
  suffix: string,
  driverFn: string,
  rawCitation: string,
): string {
  // Normalize suffix: forward-slash separator, no leading slash
  const normalizedSuffix = suffix.replace(/\\/g, "/").replace(/^\//, "");
  const results: string[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        const rel = full.replace(/\\/g, "/");
        if (rel.endsWith("/" + normalizedSuffix) || rel === normalizedSuffix) {
          results.push(full);
        }
      }
    }
  }
  walk(APPS_ROOT);

  if (results.length === 0) {
    throw new Error(
      `[driver-drift-guard] ${driverFn}: citation "${rawCitation}" — ` +
        `file suffix "${suffix}" not found anywhere under apps/. Re-audit the citation.`,
    );
  }
  if (results.length > 1) {
    throw new Error(
      `[driver-drift-guard] ${driverFn}: citation "${rawCitation}" — ` +
        `"${suffix}" is ambiguous: found at\n  ${results.join("\n  ")}\n` +
        `Fix the citation to use a full relative path.`,
    );
  }
  return results[0]!;
}

/**
 * Resolve a citation path string to an absolute file path.
 * Handles:
 *   - "apps/workshop/src/api/garments.ts"              → absolute under REPO_ROOT
 *   - "apps/pos-interface/src/api/orders.ts"           → absolute under REPO_ROOT
 *   - "packages/database/src/triggers.sql"             → absolute under REPO_ROOT
 *   - "triggers.sql"                                   → DB_SRC_ROOT/triggers.sql
 *   - bare filename "feedback.$orderId.tsx"            → glob-suffix under apps/
 *   - partial path "customer-demographics/foo.tsx"     → glob-suffix under apps/
 *   - "src/utils.ts"                                   → DB_SRC_ROOT/utils.ts
 *   - "garments.ts"                                    → glob-suffix under apps/
 */
function resolveCitationPath(
  citedPath: string,
  driverFn: string,
  rawCitation: string,
): string {
  // Full path rooted at repo root (starts with apps/ or packages/)
  if (citedPath.startsWith("apps/") || citedPath.startsWith("packages/")) {
    return path.join(REPO_ROOT, citedPath);
  }
  // Relative to db/src (e.g. "src/utils.ts")
  if (citedPath.startsWith("src/")) {
    return path.join(REPO_ROOT, "packages/database", citedPath);
  }
  // Pure filename or partial path (no leading known prefix) — glob under apps/
  // Known exceptions that live in db/src, not apps/
  if (citedPath === "triggers.sql") {
    return TRIGGERS_SQL_PATH;
  }
  // Everything else: treat as a suffix to search under apps/
  return resolveBareName(citedPath, driverFn, rawCitation);
}

/** Check whether all tokens appear within ±window lines of anchorLine. */
function tokensInWindow(
  lines: string[],
  anchorLine: number, // 1-indexed
  tokens: string[],
  windowSize = 40,
): { missing: string[] } {
  const start = Math.max(0, anchorLine - 1 - windowSize);
  const end = Math.min(lines.length, anchorLine - 1 + windowSize + 1);
  const slice = lines.slice(start, end).join("\n");

  const missing = tokens.filter((t) => !slice.includes(t));
  return { missing };
}

// ─── Citation registry ────────────────────────────────────────────────────────
//
// Each entry describes one JSDoc citation in driver.ts.
// `citedLine` is the PRIMARY line number cited (first if a range like :905-916).
// `anchorTokens` are strings that MUST appear near that line in the real file.
//
// Derivation rule: pick the primary table name + RPC name (if any) + 1–2
// distinctive column names the driver function mutates that should be stable
// anchor points in the real code.

interface Citation {
  /** Name of the driver function whose JSDoc contains this citation. */
  driverFn: string;
  /** Citation string exactly as it appears in the JSDoc (path:line or path:line-line). */
  rawCitation: string;
  /** File path portion (before the colon). */
  citedPath: string;
  /** Primary (first) line number. */
  citedLine: number;
  /**
   * Tokens that must appear within ±40 lines of citedLine in the real file.
   * Keep tight: table/RPC name + 1-2 distinctive column mutations.
   */
  anchorTokens: string[];
}

const CITATIONS: Citation[] = [
  // ── createOrder ────────────────────────────────────────────────────────────
  // Real createOrder is a generic insert with idempotency; it doesn't hardcode
  // checkout_status / order_type — those come in via the order arg. Anchor on
  // the function name + the work_orders upsert it performs and idempotency_key.
  {
    driverFn: "createOrder",
    rawCitation: "apps/pos-interface/src/api/orders.ts:418",
    citedPath: "apps/pos-interface/src/api/orders.ts",
    citedLine: 418,
    anchorTokens: ["createOrder", "work_orders", "idempotency_key"],
  },

  // ── recordPayment ──────────────────────────────────────────────────────────
  {
    driverFn: "recordPayment",
    rawCitation: "triggers.sql:885",
    citedPath: "triggers.sql",
    citedLine: 885,
    anchorTokens: [
      "record_payment_transaction",
      "p_order_id",
      "p_transaction_type",
    ],
  },

  // ── toggleHomeDelivery ─────────────────────────────────────────────────────
  {
    driverFn: "toggleHomeDelivery",
    rawCitation: "triggers.sql:1189",
    citedPath: "triggers.sql",
    citedLine: 1189,
    anchorTokens: ["toggle_home_delivery", "p_home_delivery", "p_order_id"],
  },

  // ── collectGarments ────────────────────────────────────────────────────────
  {
    driverFn: "collectGarments",
    rawCitation: "triggers.sql:1251",
    citedPath: "triggers.sql",
    citedLine: 1251,
    anchorTokens: ["collect_garments", "p_garment_ids", "p_order_id"],
  },

  // ── dispatchOrder ──────────────────────────────────────────────────────────
  {
    driverFn: "dispatchOrder",
    rawCitation: "triggers.sql:1307",
    citedPath: "triggers.sql",
    citedLine: 1307,
    anchorTokens: [
      "dispatch_order",
      "transit_to_workshop",
      "dispatch_log",
    ],
  },

  // ── workshopReceive → receive_garments RPC (REAL, not a mirror) ────────────
  {
    driverFn: "workshopReceive",
    rawCitation: "triggers.sql:1370",
    citedPath: "triggers.sql",
    citedLine: 1370,
    anchorTokens: [
      "receive_garments",
      "ready_for_dispatch",
      "waiting_for_acceptance",
    ],
  },

  // ── runProduction (scheduleGarments) — still a faithful mirror ─────────────
  {
    driverFn: "runProduction (scheduleGarments)",
    rawCitation: "apps/workshop/src/api/garments.ts:928",
    citedPath: "apps/workshop/src/api/garments.ts",
    citedLine: 928,
    anchorTokens: ["scheduleGarments", "production_plan", "in_production"],
  },

  // ── runProduction (completeAndAdvance) — still a faithful mirror ───────────
  // Not auto-extracted from the JSDoc (":1037" has no path prefix); kept for
  // documentation + anchor coverage of the second mirrored function.
  {
    driverFn: "runProduction (completeAndAdvance)",
    rawCitation: "apps/workshop/src/api/garments.ts:1037",
    citedPath: "apps/workshop/src/api/garments.ts",
    citedLine: 1037,
    anchorTokens: ["completeAndAdvance", "piece_stage", "completion_time"],
  },

  // ── submitQc → resolveQcOutcome (REAL shared decision) ────────────────────
  {
    driverFn: "submitQc (resolveQcOutcome)",
    rawCitation: "apps/workshop/src/lib/production-logic.ts:194",
    citedPath: "apps/workshop/src/lib/production-logic.ts",
    citedLine: 194,
    anchorTokens: ["resolveQcOutcome", "ready_for_dispatch", "qc_rework_stages"],
  },

  // ── submitQc (persistence shape — still mirrors app submitQc) ──────────────
  {
    driverFn: "submitQc (persistence)",
    rawCitation: "apps/workshop/src/api/garments.ts:1097",
    citedPath: "apps/workshop/src/api/garments.ts",
    citedLine: 1097,
    anchorTokens: ["submitQc", "trip_history", "evaluateQc"],
  },

  // ── submitQcReal (evaluateQc — REAL verdict) ──────────────────────────────
  {
    driverFn: "submitQcReal (evaluateQc)",
    rawCitation: "apps/workshop/src/lib/qc-spec.ts:213",
    citedPath: "apps/workshop/src/lib/qc-spec.ts",
    citedLine: 213,
    anchorTokens: ["evaluateQc", "enabledKeys", "failed_measurements"],
  },

  // ── submitQcReal → resolveQcOutcome (REAL shared decision) ────────────────
  {
    driverFn: "submitQcReal (resolveQcOutcome)",
    rawCitation: "apps/workshop/src/lib/production-logic.ts:194",
    citedPath: "apps/workshop/src/lib/production-logic.ts",
    citedLine: 194,
    anchorTokens: ["resolveQcOutcome", "ready_for_dispatch", "qc_rework_stages"],
  },

  // ── submitQcReal (persistence shape — still mirrors app submitQc) ──────────
  {
    driverFn: "submitQcReal (persistence)",
    rawCitation: "apps/workshop/src/api/garments.ts:1177",
    citedPath: "apps/workshop/src/api/garments.ts",
    citedLine: 1177,
    anchorTokens: ["resolveQcOutcome", "qc_rework_stages", "trip_history"],
  },

  // ── workshopDispatch → dispatch_garments_to_shop RPC (REAL) ───────────────
  {
    driverFn: "workshopDispatch",
    rawCitation: "triggers.sql:1450",
    citedPath: "triggers.sql",
    citedLine: 1450,
    anchorTokens: [
      "dispatch_garments_to_shop",
      "transit_to_shop",
      "feedback_status",
    ],
  },

  // ── shopReceive ────────────────────────────────────────────────────────────
  {
    driverFn: "shopReceive",
    rawCitation: "receiving-brova-final.tsx:53",
    citedPath: "receiving-brova-final.tsx",
    citedLine: 53,
    anchorTokens: ["awaiting_trial", "ready_for_pickup", "location"],
  },

  // ── brovaFeedback (evaluateBrovaFeedback) ──────────────────────────────────
  {
    driverFn: "brovaFeedback (evaluateBrovaFeedback)",
    rawCitation: "src/utils.ts:329",
    citedPath: "src/utils.ts",
    citedLine: 329,
    anchorTokens: [
      "evaluateBrovaFeedback",
      "acceptanceStatus",
      "feedbackStatus",
    ],
  },

  // ── brovaFeedback (updateGarment call in feedback page) ───────────────────
  {
    driverFn: "brovaFeedback (feedback page updateGarment)",
    rawCitation: "feedback.$orderId.tsx:876",
    citedPath: "feedback.$orderId.tsx",
    citedLine: 876,
    anchorTokens: [
      "evaluateBrovaFeedback",
      "piece_stage",
      "acceptance_status",
    ],
  },

  // ── releaseFinals ──────────────────────────────────────────────────────────
  {
    driverFn: "releaseFinals",
    rawCitation: "triggers.sql:1429",
    citedPath: "triggers.sql",
    citedLine: 1429,
    anchorTokens: [
      "release_finals",
      "waiting_for_acceptance",
      "waiting_cut",
    ],
  },

  // ── finalCollect ───────────────────────────────────────────────────────────
  {
    // finalCollect/finalReject are no longer mirrors — the driver imports the
    // REAL buildFinalGarmentPayload (the same fn feedback.$orderId.tsx calls),
    // so the citation points at that shared module.
    driverFn: "finalCollect",
    rawCitation: "apps/pos-interface/src/lib/feedback-payload.ts:16",
    citedPath: "apps/pos-interface/src/lib/feedback-payload.ts",
    citedLine: 16,
    anchorTokens: ["buildFinalGarmentPayload", "completed", "fulfillment_type"],
  },

  // ── finalReject ────────────────────────────────────────────────────────────
  {
    driverFn: "finalReject",
    rawCitation: "apps/pos-interface/src/lib/feedback-payload.ts:16",
    citedPath: "apps/pos-interface/src/lib/feedback-payload.ts",
    citedLine: 16,
    anchorTokens: ["discarded", "needs_redo", "brova_trialed"],
  },

  // ── sendBackToWorkshop ─────────────────────────────────────────────────────
  {
    driverFn: "sendBackToWorkshop",
    rawCitation: "apps/pos-interface/src/api/garments.ts:120",
    citedPath: "apps/pos-interface/src/api/garments.ts",
    citedLine: 120,
    anchorTokens: [
      "dispatchGarmentToWorkshop",
      "transit_to_workshop",
      "trip_number",
    ],
  },

  // ── createReplacement → create_replacement_garment RPC (REAL) ─────────────
  {
    driverFn: "createReplacement",
    rawCitation: "triggers.sql:1527",
    citedPath: "triggers.sql",
    citedLine: 1527,
    anchorTokens: [
      "create_replacement_garment",
      "replaced_by_garment_id",
      "waiting_cut",
    ],
  },

  // ── createSalesOrder ───────────────────────────────────────────────────────
  {
    driverFn: "createSalesOrder",
    rawCitation: "triggers.sql:453",
    citedPath: "triggers.sql",
    citedLine: 453,
    anchorTokens: [
      "create_complete_sales_order",
      "p_customer_id",
      "p_shelf_items",
    ],
  },

  // ── createAlterationOrder ──────────────────────────────────────────────────
  // Driver cites a range :85-218 covering the full function body.
  // "alteration_orders" INSERT is at line ~160 (outside ±40 from line 85),
  // so anchor on tokens present in the function header + the orders INSERT.
  {
    driverFn: "createAlterationOrder",
    rawCitation: "apps/pos-interface/src/api/alteration-orders.ts:85-218",
    citedPath: "apps/pos-interface/src/api/alteration-orders.ts",
    citedLine: 85,
    anchorTokens: [
      "createAlterationOrder",
      "order_type",
      "checkout_status",
    ],
  },

  // ── cancelOrder ────────────────────────────────────────────────────────────
  // Cited as a partial path in the driver: "customer-demographics/pending-orders-dialog.tsx:200"
  // Real function calls updateOrder({ checkout_status: 'cancelled' }, orderId).
  {
    driverFn: "cancelOrder",
    rawCitation: "customer-demographics/pending-orders-dialog.tsx:200",
    citedPath: "customer-demographics/pending-orders-dialog.tsx",
    citedLine: 200,
    anchorTokens: ["checkout_status", "cancelled", "updateOrder"],
  },
];

// ─── Cross-check: verify the citation list matches what's in driver.ts ────────
//
// Parse driver.ts at test time and compare the set of raw citations. If a
// new citation is added to driver.ts but not to CITATIONS above, one test
// will fail with an actionable message. This prevents silent omissions.

function extractCitationsFromDriver(driverSource: string): string[] {
  // Match `file:line` or `file:line-line` patterns inside JSDoc comments.
  // Patterns look like:  (sometext.ts:123) or apps/foo/bar.ts:123  or triggers.sql:800
  const citationRe =
    /\(?([\w$./-]+\.(?:ts|tsx|sql)):([\d]+-?[\d]*)\)?/g;

  const found = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = citationRe.exec(driverSource)) !== null) {
    // Only capture citations that appear inside JSDoc comment blocks
    // (lines starting with * or /*)
    const lineStart = driverSource.lastIndexOf("\n", m.index);
    const lineText = driverSource.slice(lineStart + 1, m.index + m[0]!.length);
    if (lineText.trimStart().startsWith("*") || lineText.trimStart().startsWith("/*")) {
      found.add(`${m[1]!}:${m[2]!}`);
    }
  }
  return [...found];
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("driver.ts citation inventory is complete", () => {
  it("every citation in driver.ts appears in the CITATIONS registry", () => {
    const driverSource = fs.readFileSync(DRIVER_PATH, "utf8");
    const found = extractCitationsFromDriver(driverSource);

    const registered = new Set(CITATIONS.map((c) => c.rawCitation));
    const unregistered = found.filter((c) => !registered.has(c));

    expect(
      unregistered,
      `The following citations are in driver.ts JSDoc but NOT in the CITATIONS ` +
        `registry in driver-drift-guard.test.ts. Add them:\n  ${unregistered.join("\n  ")}`,
    ).toHaveLength(0);
  });
});

describe("driver.ts citations: file exists and has enough lines", () => {
  for (const c of CITATIONS) {
    it(`${c.driverFn} → ${c.rawCitation} — file exists with ≥${c.citedLine} lines`, () => {
      let absPath: string;
      try {
        absPath = resolveCitationPath(c.citedPath, c.driverFn, c.rawCitation);
      } catch (err) {
        throw new Error(String(err));
      }

      expect(
        fs.existsSync(absPath),
        `[driver-drift-guard] ${c.driverFn}: cited file "${c.citedPath}" resolved to ` +
          `"${absPath}" which does NOT exist. Re-audit this mirror against the real code.`,
      ).toBe(true);

      const lines = readLines(absPath);
      expect(
        lines.length,
        `[driver-drift-guard] ${c.driverFn}: cited file "${c.citedPath}" has only ` +
          `${lines.length} lines but the citation points at line ${c.citedLine}. ` +
          `Re-audit this mirror against the real code.`,
      ).toBeGreaterThanOrEqual(c.citedLine);
    });
  }
});

describe("driver.ts citations: anchor tokens present near cited line (±40 lines)", () => {
  for (const c of CITATIONS) {
    it(`${c.driverFn} → ${c.rawCitation} — anchor tokens present`, () => {
      let absPath: string;
      try {
        absPath = resolveCitationPath(c.citedPath, c.driverFn, c.rawCitation);
      } catch (err) {
        // File resolution errors are covered by the previous suite; skip here.
        return;
      }

      if (!fs.existsSync(absPath)) {
        // Existence covered by previous suite; skip here.
        return;
      }

      const lines = readLines(absPath);
      if (lines.length < c.citedLine) {
        // Line-count covered by previous suite; skip here.
        return;
      }

      const { missing } = tokensInWindow(lines, c.citedLine, c.anchorTokens);

      expect(
        missing,
        `[driver-drift-guard] DRIFT DETECTED\n` +
          `  driver fn  : ${c.driverFn}\n` +
          `  cited at   : ${c.rawCitation}\n` +
          `  missing    : ${missing.map((t) => `"${t}"`).join(", ")}\n` +
          `  → The real function may have moved or changed. ` +
          `Re-audit this mirror against the real code.`,
      ).toHaveLength(0);
    });
  }
});

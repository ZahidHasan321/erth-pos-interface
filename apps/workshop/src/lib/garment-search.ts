// ── Shared garment search predicate ──────────────────────────────────────────
// One predicate for every garment/order search box in the workshop app. Before
// this, ~8 hand-copied copies disagreed on which fields matched (assigned
// omitted garment_id; board/terminals/history added fabric+style). This unifies
// the CORE fields everywhere; the extra catalog fields (fabric/style) are
// opt-in via `opts` for the pages that legitimately search on them.
//
// Matching rules (consistent across every caller):
//   • text fields are compared case-insensitively (.toLowerCase())
//   • phone is matched with all whitespace stripped from BOTH sides, so
//     "1234 5678" matches a stored "12345678" and vice-versa.

/** The subset of garment/order fields the search predicate reads. */
export interface GarmentSearchRow {
  customer_name?: string | null;
  customer_mobile?: string | null;
  invoice_number?: number | null;
  order_id?: number | null;
  garment_id?: string | null;
  fabric_name?: string | null;
  style_name?: string | null;
}

export interface GarmentSearchOpts {
  /** Also match the linked fabric and style names (board, terminals, history). */
  includeFabricStyle?: boolean;
}

/**
 * Returns true when `query` matches the row on the core fields (customer name,
 * order #, invoice #, phone, garment id) — and, when `includeFabricStyle` is
 * set, also on fabric/style names.
 *
 * An empty/whitespace-only query matches everything (callers typically
 * short-circuit before calling, but this keeps the predicate total).
 */
export function matchesGarmentSearch(
  row: GarmentSearchRow,
  query: string,
  opts?: GarmentSearchOpts,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const qDigits = q.replace(/\s+/g, "");

  // Core fields — identical for every search box.
  if ((row.customer_name ?? "").toLowerCase().includes(q)) return true;
  if (row.order_id != null && String(row.order_id).includes(q)) return true;
  if (row.invoice_number != null && String(row.invoice_number).includes(q)) return true;
  if ((row.customer_mobile ?? "").replace(/\s+/g, "").includes(qDigits)) return true;
  if ((row.garment_id ?? "").toLowerCase().includes(q)) return true;

  // Opt-in catalog fields.
  if (opts?.includeFabricStyle) {
    if ((row.fabric_name ?? "").toLowerCase().includes(q)) return true;
    if ((row.style_name ?? "").toLowerCase().includes(q)) return true;
  }

  return false;
}

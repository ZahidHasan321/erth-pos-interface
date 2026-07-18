import type { DispatchHistoryRow, OrderGarmentTotals } from "@/api/garments";
import { parseUtcTimestamp, getLocalDateStr, TIMEZONE } from "@/lib/utils";

// The printed manifest is per ORDER, not per garment: the shop receiving the
// delivery cares about "order #123, brova in, finals still with us", not about
// eight near-identical garment rows. One printed row = one order dispatched on
// one day; a later trip for the same order prints as its own row.

const TYPE_ORDER = ["brova", "final", "alteration"] as const;

const TYPE_LABEL: Record<string, [singular: string, plural: string]> = {
  brova: ["Brova", "Brovas"],
  final: ["Final", "Finals"],
  alteration: ["Alteration", "Alterations"],
};

export interface DispatchPrintGroup {
  key: string;
  order_id: number;
  invoice_number: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  brand: string | null;
  /** Earliest dispatch time within the group. */
  dispatched_at: string;
  /** Garment suffixes only ("123-1" -> 1), ascending. */
  suffixes: string[];
  /** Per type: how many went out vs how many the order holds in total. */
  counts: { type: string; dispatched: number; total: number }[];
}

/**
 * Suffix of a garment code: "123-2" -> "2". Falls back to the whole code when
 * it does not follow the "<order>-<n>" shape.
 */
function garmentSuffix(row: DispatchHistoryRow): string {
  const code = row.garment_code;
  if (!code) return row.garment_id.slice(0, 8);
  const prefix = `${row.order_id}-`;
  return code.startsWith(prefix) ? code.slice(prefix.length) : code;
}

export function groupDispatchRows(
  rows: DispatchHistoryRow[],
  totals: OrderGarmentTotals,
): DispatchPrintGroup[] {
  const groups = new Map<string, DispatchHistoryRow[]>();

  for (const row of rows) {
    const day = getLocalDateStr(parseUtcTimestamp(row.dispatched_at));
    const key = `${row.order_id}|${day}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }

  const built = [...groups.entries()].map(([key, bucket]) => {
    const head = bucket[0];

    const dispatchedByType: Record<string, number> = {};
    for (const r of bucket) {
      const type = r.garment_type ?? "final";
      dispatchedByType[type] = (dispatchedByType[type] ?? 0) + 1;
    }

    const orderTotals = totals[head.order_id] ?? {};
    // Show every type the order holds, so a type with none dispatched still
    // reads "0/4 Finals" - that absence is the point of the sheet.
    const types = [...new Set([...Object.keys(orderTotals), ...Object.keys(dispatchedByType)])];
    const counts = types
      .sort((a, b) => {
        const ia = TYPE_ORDER.indexOf(a as (typeof TYPE_ORDER)[number]);
        const ib = TYPE_ORDER.indexOf(b as (typeof TYPE_ORDER)[number]);
        return (ia < 0 ? TYPE_ORDER.length : ia) - (ib < 0 ? TYPE_ORDER.length : ib);
      })
      .map((type) => ({
        type,
        dispatched: dispatchedByType[type] ?? 0,
        total: orderTotals[type] ?? dispatchedByType[type] ?? 0,
      }))
      .filter((c) => c.total > 0);

    const suffixes = bucket
      .map(garmentSuffix)
      .sort((a, b) => {
        const na = Number(a);
        const nb = Number(b);
        if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
        return a.localeCompare(b);
      });

    const earliest = bucket.reduce(
      (min, r) => (r.dispatched_at < min ? r.dispatched_at : min),
      head.dispatched_at,
    );

    return {
      key,
      order_id: head.order_id,
      invoice_number: head.invoice_number,
      customer_name: head.customer_name,
      customer_phone: head.customer_phone,
      brand: head.brand,
      dispatched_at: earliest,
      suffixes,
      counts,
    } satisfies DispatchPrintGroup;
  });

  // Newest first, matching the on-screen history order.
  return built.sort((a, b) => b.dispatched_at.localeCompare(a.dispatched_at));
}

function countLabel(type: string, total: number): string {
  const labels = TYPE_LABEL[type];
  if (!labels) return type;
  return total === 1 ? labels[0] : labels[1];
}

export function DispatchHistoryPrint({
  groups,
  periodLabel,
  garmentCount,
}: {
  groups: DispatchPrintGroup[];
  periodLabel: string;
  garmentCount: number;
}) {
  return (
    <div className="dispatch-print-sheet">
      <div className="dispatch-print-header">
        <h1>Dispatch Manifest</h1>
        <p>
          Workshop to Shop &middot; {periodLabel} &middot; {groups.length} order
          {groups.length === 1 ? "" : "s"} &middot; {garmentCount} garment
          {garmentCount === 1 ? "" : "s"}
        </p>
      </div>

      <table className="dispatch-print-table">
        <thead>
          <tr>
            <th className="dispatch-col-date">Date</th>
            <th className="dispatch-col-order">Order</th>
            <th className="dispatch-col-customer">Customer</th>
            <th className="dispatch-col-garments">Garments</th>
            <th className="dispatch-col-counts">Dispatched</th>
            <th className="dispatch-col-brand">Brand</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const d = parseUtcTimestamp(g.dispatched_at);
            return (
              <tr key={g.key}>
                <td className="dispatch-col-date">
                  {d.toLocaleDateString("en-GB", { timeZone: TIMEZONE })}
                </td>
                <td className="dispatch-col-order">
                  <div className="dispatch-print-primary">#{g.order_id}</div>
                  <div className="dispatch-print-secondary">
                    Inv {g.invoice_number ?? "-"}
                  </div>
                </td>
                <td className="dispatch-col-customer">
                  <div className="dispatch-print-primary">{g.customer_name ?? "Unknown"}</div>
                  {g.customer_phone && (
                    <div className="dispatch-print-secondary">{g.customer_phone}</div>
                  )}
                </td>
                <td className="dispatch-col-garments">{g.suffixes.join(", ")}</td>
                <td className="dispatch-col-counts">
                  {g.counts.map((c) => (
                    <div key={c.type} className="dispatch-print-count">
                      {c.dispatched}/{c.total} {countLabel(c.type, c.total)}
                    </div>
                  ))}
                </td>
                <td className="dispatch-col-brand">{g.brand ?? "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="dispatch-print-signoff">
        <div>
          <span>Dispatched by</span>
          <div className="dispatch-print-rule" />
        </div>
        <div>
          <span>Received by</span>
          <div className="dispatch-print-rule" />
        </div>
        <div>
          <span>Date</span>
          <div className="dispatch-print-rule" />
        </div>
      </div>
    </div>
  );
}

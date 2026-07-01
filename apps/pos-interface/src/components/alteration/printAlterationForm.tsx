import { pdf } from "@react-pdf/renderer";
import { formatMeasurement } from "@repo/database";

import { AlterationPdfDocument, type AlterationSheet } from "./alteration-pdf-document";
import type { AlterationIssueMatrixValues } from "./alteration-checkbox-matrix-config";
import { FIELD_MEASUREMENT_MAP } from "@/components/measurement-preview/dishdasha-template-layout";
import { toLocalDateStr } from "@/lib/utils";

/** Minimal shape needed to print — a flattened alteration Order (see
 *  getAlterationOrderById): order-level invoice/dates/customer + garment rows. */
export type AlterationPrintOrder = {
  id?: number;
  invoice_number?: number | null;
  received_date?: string | null;
  comments?: string | null;
  customer?: { name?: string | null; phone?: string | null } | null;
  garments?: Array<{
    alteration_measurements?: Record<string, number> | null;
    alteration_issues?: Record<string, Record<string, boolean>> | null;
    bufi_ext?: string | null;
    delivery_date?: string | null;
    notes?: string | null;
  }> | null;
};

/** Build the body-template overlay: template cell id → formatted fraction string,
 *  using the authoritative field → measurement-column map (shared with the
 *  measurement preview / workshop terminal). Only changed fields are filled. */
function buildMeasurementValues(
  am: Record<string, number> | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!am) return out;
  for (const [fieldId, key] of Object.entries(FIELD_MEASUREMENT_MAP)) {
    const v = am[key as string];
    if (v != null) {
      const s = formatMeasurement(v);
      if (s) out[fieldId] = s;
    }
  }
  return out;
}

function buildSheets(order: AlterationPrintOrder): AlterationSheet[] {
  const invoice = String(order.invoice_number ?? order.id ?? "");
  const customerName = order.customer?.name ?? "";
  const customerPhone = order.customer?.phone ?? "";
  const receivedDate = toLocalDateStr(order.received_date ?? null) ?? "";
  const garments = order.garments ?? [];

  return garments.map((g) => ({
    measurementValues: buildMeasurementValues(g.alteration_measurements),
    reasonValues: (g.alteration_issues ?? {}) as AlterationIssueMatrixValues,
    meta: {
      nFat: invoice,
      qty: "1",
      customerName,
      customerPhone,
      bufiExt: g.bufi_ext ?? "",
      receivedDate,
      requestedDate: toLocalDateStr(g.delivery_date ?? null) ?? "",
      comments: g.notes ?? order.comments ?? "",
    },
  }));
}

/** Render the alteration form (one page per garment) and open it in a new tab
 *  for printing. Mirrors viewEodReport's popup-safe open-then-fill pattern. */
export async function viewAlterationForm(order: AlterationPrintOrder): Promise<void> {
  const sheets = buildSheets(order);
  if (sheets.length === 0) return;
  // Open the tab synchronously so it isn't blocked as a popup.
  const win = window.open("about:blank", "_blank");
  const blob = await pdf(<AlterationPdfDocument sheets={sheets} />).toBlob();
  const url = URL.createObjectURL(blob);
  if (win) {
    win.location.href = url;
  } else {
    window.open(url, "_blank");
  }
}

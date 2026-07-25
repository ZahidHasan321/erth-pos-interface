// Brand resolution for the printable invoices / receipts. The active brand is
// applied as a class on <html> by the route shells (see `$main/route.tsx` and
// `cashier/route.tsx`), so the invoice components can read it directly instead
// of threading a prop through every call site. Defaults to ERTH.
import ErthLogo from "@/assets/erth-light.svg";
import SakkbaLogo from "@/assets/Sakkba.png";
import QassLogo from "@/assets/qass-dark.svg";

export type InvoiceBrandKey = "ERTH" | "SAKKBA" | "QASS";

export interface InvoiceBrand {
  key: InvoiceBrandKey;
  /** Display name as it appears in "{name} Clothing". */
  name: string;
  logo: string;
}

const BRANDS: Record<InvoiceBrandKey, InvoiceBrand> = {
  ERTH: { key: "ERTH", name: "ERTH", logo: ErthLogo },
  SAKKBA: { key: "SAKKBA", name: "Sakkba", logo: SakkbaLogo },
  QASS: { key: "QASS", name: "QASS", logo: QassLogo },
};

const BY_SLUG: Record<string, InvoiceBrand> = {
  erth: BRANDS.ERTH,
  sakkba: BRANDS.SAKKBA,
  qass: BRANDS.QASS,
};

/**
 * Resolve the active brand. The URL's first segment is the brand shell and is
 * available on the very first render; the <html> class is only applied in the
 * shell's effect, so a document mounted in the same commit (the hidden invoice
 * on the order form) would otherwise read no class and fall back to ERTH.
 */
export const getInvoiceBrand = (): InvoiceBrand => {
  if (typeof window !== "undefined") {
    const slug = window.location.pathname.split("/")[1]?.toLowerCase();
    if (slug && BY_SLUG[slug]) return BY_SLUG[slug];
  }
  const cl = typeof document !== "undefined" ? document.documentElement.classList : null;
  if (cl?.contains("qass")) return BRANDS.QASS;
  if (cl?.contains("sakkba")) return BRANDS.SAKKBA;
  return BRANDS.ERTH;
};

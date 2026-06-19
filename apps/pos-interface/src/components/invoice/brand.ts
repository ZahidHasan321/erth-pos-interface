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

/** Resolve the active brand from the <html> class list. */
export const getInvoiceBrand = (): InvoiceBrand => {
  const cl = typeof document !== "undefined" ? document.documentElement.classList : null;
  if (cl?.contains("qass")) return BRANDS.QASS;
  if (cl?.contains("sakkba")) return BRANDS.SAKKBA;
  return BRANDS.ERTH;
};

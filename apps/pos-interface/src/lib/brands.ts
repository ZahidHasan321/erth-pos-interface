import ErthLogo from "@/assets/erth-light.svg";
import SakkbaLogo from "@/assets/Sakkba.png";
import QassLogo from "@/assets/qass-dark.svg";
import { BRAND_NAMES } from "./constants";

export type BrandKey = (typeof BRAND_NAMES)[keyof typeof BRAND_NAMES];

export interface BrandMeta {
  key: BrandKey;
  /** Display name for headers, the brand switcher and access-denied labels. */
  name: string;
  /** Logo suited to a light background (dark ink, used without any tint). */
  logo: string;
}

export const BRAND_META: Record<BrandKey, BrandMeta> = {
  [BRAND_NAMES.showroom]: { key: BRAND_NAMES.showroom, name: "Erth", logo: ErthLogo },
  [BRAND_NAMES.fromHome]: { key: BRAND_NAMES.fromHome, name: "Sakkba", logo: SakkbaLogo },
  [BRAND_NAMES.qass]: { key: BRAND_NAMES.qass, name: "Qass", logo: QassLogo },
};

/**
 * The brands a user may operate. An empty/null `brands` array means
 * unrestricted access (mirrors the `canAccess` rule on /home and the
 * `hasBrandMismatch` check in the $main loader).
 */
export function accessibleBrands(userBrands: string[] | null | undefined): BrandMeta[] {
  const all = Object.values(BRAND_META);
  if (!userBrands || userBrands.length === 0) return all;
  return all.filter((b) => userBrands.includes(b.key));
}

// Shared style-label registry: single source of truth for the Arabic names
// of garment style options, keyed by the canonical option codes stored on a
// garment. English labels are NOT redefined here — they are derived from the
// existing order-entry option lists in
// `components/forms/fabric-selection-and-options/constants.ts` so the two
// never drift. Arabic comes from the stakeholder spec (Interface Pages.xlsx:
// Sheet2 + Customer Profile Management). Used by the printable invoices.
import {
  collarTypes,
  collarButtons,
  jabzourTypes,
  topPocketTypes,
  sidePocketTypes,
  cuffTypes,
  type BaseOption,
} from "@/components/forms/fabric-selection-and-options/constants";

/* ---------- Arabic maps (code -> Arabic display) ---------- */

/** Model / base style. */
export const modelAr: Record<string, string> = {
  kuwaiti: "كويتي كلاسيك",
  design: "ديزاين",
};

/** Collar (الغولة). */
export const collarAr: Record<string, string> = {
  COL_QALLABI: "قلابي",
  COL_DOWN_COLLAR: "عادي - دائري",
  COL_JAPANESE: "ياباني",
  COL_STRAIT_COLLAR: "عادي - مربع",
};

/** Collar button (زرار الغولة) — registry only, not shown in the invoice table. */
export const collarButtonAr: Record<string, string> = {
  COL_ARAVI_ZARRAR: "زرار عربي",
  COL_ZARRAR__TABBAGI: "طباقي + زرار",
  COL_TABBAGI: "طباقي",
  COL_SMALL_TABBAGI: "طباقي صغير",
  COL_NO_BUTTON: "بدون زرار",
};

/** Cuffs (بزمات). */
export const cuffAr: Record<string, string> = {
  CUF_DOUBLE_GUMSHA: "بزمة فرنسي",
  CUF_MURABBA_KABAK: "كبق مربع",
  CUF_MUSALLAS_KABBAK: "كبق مثلث",
  CUF_MUDAWAR_KABBAK: "كبق دائري",
  CUF_NO_CUFF: "بدون بزمة",
};

/** Jabzour (الجبزور). Bain = مكشوف (visible), Magfi = مخفي (hidden). */
export const jabzourAr: Record<string, string> = {
  JAB_BAIN_MURABBA: "مربع مكشوف",
  JAB_BAIN_MUSALLAS: "مثلث مكشوف",
  JAB_MAGFI_MURABBA: "مربع مخفي",
  JAB_MAGFI_MUSALLAS: "مثلث مخفي",
  JAB_SHAAB: "سحاب",
};

/** Front pocket (الجيب الأمامي) — registry only. */
export const frontPocketAr: Record<string, string> = {
  FRO_MUSALLAS_FRONT_POCKET: "زوايا مثلث",
  FRO_MURABBA_FRONT_POCKET: "زوايا مربعة",
  FRO_MUDAWWAR_FRONT_POCKET: "زوايا دائرية",
  FRO_MUDAWWAR_MAGFI_FRONT_POCKET: "زوايا دائرية + حشوة",
};

/** Side pocket (الجيب الجانبي) — registry only. */
export const sidePocketAr: Record<string, string> = {
  SID_MUDAWWAR_SIDE_POCKET: "زوايا دائرية",
};

/** Interlining / hashwa thickness (الحشوات). */
export const hashwaAr: Record<string, string> = {
  SINGLE: "سنقل",
  DOUBLE: "دبل",
  TRIPLE: "تريبل",
  "NO HASHWA": "بدون حشوة",
};

/** Side lines (الخط الجانبي). */
export const linesAr: Record<number, string> = {
  1: "خط",
  2: "خطين",
};

/* ---------- English (derived from order-entry option lists) ---------- */

const enFrom = (opts: BaseOption[]): Record<string, string> =>
  Object.fromEntries(opts.map((o) => [o.value, o.displayText]));

/** code -> English display text, sourced from the order-entry constants. */
export const STYLE_LABELS_EN: Record<string, string> = {
  ...enFrom(collarTypes),
  ...enFrom(collarButtons),
  ...enFrom(jabzourTypes),
  ...enFrom(topPocketTypes),
  ...enFrom(sidePocketTypes),
  ...enFrom(cuffTypes),
  kuwaiti: "Kuwaiti",
  design: "Designer",
};

/** code -> Arabic display, across every category. */
export const STYLE_LABELS_AR: Record<string, string> = {
  ...modelAr,
  ...collarAr,
  ...collarButtonAr,
  ...cuffAr,
  ...jabzourAr,
  ...frontPocketAr,
  ...sidePocketAr,
  ...hashwaAr,
};

/** Look up the Arabic label for any option code (undefined if unknown). */
export const styleLabelAr = (code: string | null | undefined): string | undefined =>
  code ? STYLE_LABELS_AR[code] : undefined;

import type { Garment } from "@repo/database";

// The garment columns that make up a garment's "style". A subset of these drive
// price (collar_type, cuffs_type, jabzour_1, small_tabaggi, lines, style,
// thicknesses, front_pocket_type — see calculateGarmentStylePrice); the rest are
// spec-only (the accessory toggles, jabzour_2). We carry the whole set so
// "match brova" / "custom" fully define the final's design. (collar_position is
// a body measurement now — lives on `measurements`, handled via the measurement
// override flow, not here.)
export const STYLE_FIELDS = [
  "style",
  "lines",
  "collar_type",
  "collar_button",
  "collar_thickness",
  "small_tabaggi",
  "cuffs_type",
  "cuffs_thickness",
  "front_pocket_type",
  "front_pocket_thickness",
  "jabzour_1",
  "jabzour_2",
  "jabzour_thickness",
  "wallet_pocket",
  "pen_holder",
  "mobile_pocket",
] as const;

export type StyleFields = Partial<Pick<Garment, (typeof STYLE_FIELDS)[number]>>;

/** Extract the style-field subset from a garment (absent → null, never undefined). */
export function pickStyleFields(g: Partial<Garment>): StyleFields {
  const out: Record<string, unknown> = {};
  for (const k of STYLE_FIELDS) out[k] = (g as Record<string, unknown>)[k] ?? null;
  return out as StyleFields;
}

/** Only the keys where `next` differs from `cur` — the minimal write. */
export function diffStyleFields(cur: StyleFields, next: StyleFields): StyleFields {
  const out: Record<string, unknown> = {};
  for (const k of STYLE_FIELDS) {
    const a = (cur as Record<string, unknown>)[k] ?? null;
    const b = (next as Record<string, unknown>)[k] ?? null;
    if (a !== b) out[k] = b;
  }
  return out as StyleFields;
}

// --- Jabzour <-> select-value mapping (jabzour_1 = BUTTON|ZIPPER, jabzour_2 =
// the actual style; Shaab is the only ZIPPER form). Mirrors the order form and
// the existing feedback option mapping. ---
export function jabzourToSelectValue(g: Partial<Garment>): string {
  if (g.jabzour_1 === "ZIPPER") return "JAB_SHAAB";
  return (g.jabzour_2 as string) || "";
}

export function applyJabzourSelect(value: string): StyleFields {
  if (value === "JAB_SHAAB") return { jabzour_1: "ZIPPER" };
  return { jabzour_1: "BUTTON", jabzour_2: value };
}

/**
 * Map the brova's feedback option verdicts/replacements to garment style-field
 * updates. Extracted verbatim from the feedback save handler so the live price
 * preview and the persisted write derive the brova's resulting style identically.
 *
 * `optionIds` are the present option rows ("collar", "collarBtn", "jabzour",
 * "frontPocket", "cuff", "smallTabaggi", "penHolder", "walletPocket",
 * "mobilePocket", "lines").
 */
export function buildBrovaStyleUpdates(args: {
  optionIds: string[];
  optionChecks: Record<string, boolean>;
  styleChanges: Record<string, string>;
  hashwaChanges: Record<string, string>;
  garment: Partial<Garment>;
}): StyleFields {
  const { optionIds, optionChecks, styleChanges, hashwaChanges, garment } = args;
  const updates: Record<string, unknown> = {};
  for (const id of optionIds) {
    const mainRejected = optionChecks[`${id}-main`] === false;
    const mainNewValue = styleChanges[id];
    const hashwaRejected = optionChecks[`${id}-hashwa`] === false;
    const hashwaNewValue = hashwaChanges[id];

    if (mainRejected && mainNewValue) {
      if (id === "collar") updates.collar_type = mainNewValue;
      else if (id === "collarBtn") updates.collar_button = mainNewValue;
      else if (id === "frontPocket") updates.front_pocket_type = mainNewValue;
      else if (id === "cuff") updates.cuffs_type = mainNewValue;
      else if (id === "jabzour") {
        if (mainNewValue === "JAB_SHAAB") {
          const secondary = styleChanges["jabzour_2"];
          updates.jabzour_1 = "ZIPPER";
          if (secondary) updates.jabzour_2 = secondary;
        } else {
          updates.jabzour_1 = "BUTTON";
          updates.jabzour_2 = mainNewValue;
        }
      } else if (id === "lines") {
        const parsed = Number(mainNewValue);
        if (parsed === 1 || parsed === 2) updates.lines = parsed;
      }
    }
    // Boolean accessory toggles — a rejection flips the spec away from what the
    // customer saw on the brova. We apply an ABSOLUTE target, not a relative
    // `!current` flip: `mainNewValue` carries the "Yes"/"No" target frozen at
    // rejection time (and persisted as the option's new_value), so re-submitting
    // the same feedback after the spec was already corrected and the garment
    // refetched is idempotent. A relative flip would toggle BACK on every
    // re-submit — corrupting the spec and re-moving money for the priced
    // small_tabaggi. First pass (no frozen target yet) derives it from the
    // as-built garment, which is correct because the garment is still as-built.
    if (mainRejected) {
      const boolCol: Record<string, "small_tabaggi" | "pen_holder" | "wallet_pocket" | "mobile_pocket"> = {
        smallTabaggi: "small_tabaggi",
        penHolder: "pen_holder",
        walletPocket: "wallet_pocket",
        mobilePocket: "mobile_pocket",
      };
      const col = boolCol[id];
      if (col) {
        updates[col] =
          mainNewValue === "Yes" ? true
          : mainNewValue === "No" ? false
          : !garment[col];
      }
    }
    if (hashwaRejected && hashwaNewValue) {
      if (id === "frontPocket") updates.front_pocket_thickness = hashwaNewValue;
      else if (id === "cuff") updates.cuffs_thickness = hashwaNewValue;
      else if (id === "jabzour") updates.jabzour_thickness = hashwaNewValue;
      else if (id === "collar") updates.collar_thickness = hashwaNewValue;
    }
  }
  return updates as StyleFields;
}


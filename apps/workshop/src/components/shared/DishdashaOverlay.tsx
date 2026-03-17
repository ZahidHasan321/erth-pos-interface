import { STYLE_IMAGE_MAP, ACCESSORY_ICONS } from "@/lib/style-images";
import { DishdashaDiagram } from "./DishdashaDiagram";
import type { WorkshopGarment, Measurement } from "@repo/database";

// ── Helpers ─────────────────────────────────────────────────────

const THICKNESS: Record<string, string> = {
  SINGLE: "SINGLE",
  DOUBLE: "DOUBLE",
  TRIPLE: "TRIPLE",
  "NO HASHWA": "NO HASHWA",
};

function StyleRow({ image, label, badge, size = "h-10", rotate }: {
  image?: string;
  label?: string;
  badge?: string;
  size?: string;
  rotate?: boolean;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {badge && (
        <span
          className="text-[7px] font-black uppercase tracking-wider text-zinc-500 shrink-0"
          style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
        >
          {badge}
        </span>
      )}
      {image ? (
        <img src={image} alt={label ?? ""} className={`${size} w-auto object-contain ${rotate ? "rotate-90" : ""}`} />
      ) : (
        <span className="text-[11px] font-bold uppercase text-zinc-400">{label || "—"}</span>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────

interface DishdashaOverlayProps {
  garment: WorkshopGarment;
  measurement: Measurement | null | undefined;
}

export function DishdashaOverlay({ garment, measurement }: DishdashaOverlayProps) {
  const g = garment as any;

  const frontPocket = g.front_pocket_type ? STYLE_IMAGE_MAP[g.front_pocket_type] : null;
  const collarType = g.collar_type ? STYLE_IMAGE_MAP[g.collar_type] : null;
  const collarButton = g.collar_button ? STYLE_IMAGE_MAP[g.collar_button] : null;
  const cuffsEntry = g.cuffs_type ? STYLE_IMAGE_MAP[g.cuffs_type] : null;
  const cuffsType = cuffsEntry?.image ? cuffsEntry : null;

  // jabzour_1 is DB enum (BUTTON/ZIPPER). Actual style key lives in jabzour_2.
  // ZIPPER = Shaab + sub-style in jabzour_2. BUTTON = jabzour_2 is the style.
  const isShaab = g.jabzour_1 === "ZIPPER";
  const jabzourPrimary = isShaab
    ? STYLE_IMAGE_MAP["JAB_SHAAB"]
    : g.jabzour_2 ? STYLE_IMAGE_MAP[g.jabzour_2] : null;
  const jabzourSecondary = isShaab && g.jabzour_2 ? STYLE_IMAGE_MAP[g.jabzour_2] : null;

  return (
      <div className="bg-white border rounded-xl overflow-hidden print:border-none print:rounded-none">
        <div className="flex">

          {/* Dishdasha diagram */}
          <DishdashaDiagram measurement={measurement} className="flex-1 min-w-0 p-2 max-h-[600px]" />

          {/* Style options */}
          <div className="py-2 pr-3 relative -left-[5%] flex flex-col justify-evenly">

            {/* Front pocket + pen */}
            {frontPocket && (
              <div className="flex items-center gap-0.5">
                <StyleRow
                  image={frontPocket.image}
                  badge={THICKNESS[g.front_pocket_thickness] || undefined}
                  size="h-14"
                />
                {g.pen_holder && (
                  <img src={ACCESSORY_ICONS.pen} alt="Pen" className="h-8 w-auto object-contain -rotate-90" />
                )}
              </div>
            )}

            {/* Collar group: type + button/tabaggi */}
            <div className="flex flex-col gap-1">
              {collarType && (
                <StyleRow image={collarType.image} />
              )}
              {(collarButton || g.small_tabaggi) && (
                <div className="flex items-center gap-2">
                  {collarButton && (
                    <img src={collarButton.image} alt="" className="h-10 w-auto object-contain" />
                  )}
                  {g.small_tabaggi && (
                    <img src={ACCESSORY_ICONS.smallTabaggi} alt="Small Tabaggi" className="h-7 w-auto object-contain" />
                  )}
                </div>
              )}
            </div>

            {/* Jabzour: if zipper show shaab + design, if button show design only */}
            {(jabzourPrimary || jabzourSecondary) && (
              <div className="flex items-center">
                <span
                  className="text-[7px] font-black uppercase tracking-tighter text-zinc-500 shrink-0 leading-none -mr-3 z-10"
                  style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
                >
                  {THICKNESS[g.jabzour_thickness] || "NO HASHWA"}
                </span>
                {isShaab && jabzourPrimary && (
                  <img src={jabzourPrimary.image} alt="" className="h-10 w-auto object-contain rotate-90" />
                )}
                {jabzourSecondary && (
                  <img src={jabzourSecondary.image} alt="" className="h-10 w-auto object-contain rotate-90" />
                )}
                {!isShaab && jabzourPrimary && (
                  <img src={jabzourPrimary.image} alt="" className="h-10 w-auto object-contain rotate-90" />
                )}
              </div>
            )}

            {/* Side pocket with wallet/phone inside */}
            <div className="relative inline-flex">
              <img src={STYLE_IMAGE_MAP["SID_MUDAWWAR_SIDE_POCKET"]?.image} alt="Side Pocket" className="h-24 w-auto object-contain block" />
              <div className="absolute top-0 left-0 w-full h-full flex flex-col items-start justify-center gap-0.5">
                {g.wallet_pocket && (
                  <img src={ACCESSORY_ICONS.wallet} alt="Wallet" className="h-8 w-auto object-contain ml-1 scale-[0.8]" />
                )}
                <img src={ACCESSORY_ICONS.phone} alt="Mobile" className="h-8 w-auto object-contain ml-1 scale-[0.8]" />
              </div>
            </div>

            {/* Cuffs */}
            {cuffsType && (
              <StyleRow
                image={cuffsType.image}
                badge={THICKNESS[g.cuffs_thickness] || undefined}
              />
            )}

            {/* Lines */}
            {g.lines && g.lines > 1 && (
              <span className="text-[11px] font-bold uppercase text-zinc-800">
                {g.lines} Lines
              </span>
            )}


          </div>
        </div>
      </div>
  );
}

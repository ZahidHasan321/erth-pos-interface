import templateSvg from "@/assets/print/template.svg";
import { STYLE_IMAGE_MAP, ACCESSORY_ICONS } from "@/lib/style-images";
import {
  qualityCheckTemplateFields,
  type QualityTemplateFieldId,
} from "../print/quality-check-field-layout";
import type { WorkshopGarment, Measurement } from "@repo/database";

// ── Measurement helpers (mirrors TerminalQualityTemplatePrint) ───

const FIELD_MAP: Record<QualityTemplateFieldId, keyof Measurement> = {
  collar: "collar_width",
  wk1: "collar_height",
  lengthFront: "length_front",
  lengthBack: "length_back",
  elbow: "elbow",
  shoulder: "shoulder",
  sideUpper: "armhole_front",
  sleeves: "sleeve_length",
  armhole: "armhole",
  width: "sleeve_width",
  sideLower: "armhole_provision",
  upperChest: "chest_upper",
  chest: "chest_front",
  halfChest: "chest_back",
  waistFront: "waist_front",
  waistBack: "waist_back",
  bottom: "bottom",
};

function fmtFrac(v: number): string {
  const whole = Math.floor(v);
  const rem = v - whole;
  if (rem < 0.01) return `${whole}`;
  if (Math.abs(rem - 0.25) < 0.01) return `${whole} ¼`;
  if (Math.abs(rem - 0.5) < 0.01) return `${whole} ½`;
  if (Math.abs(rem - 0.75) < 0.01) return `${whole} ¾`;
  return v.toFixed(1);
}

function fmtVal(raw: unknown, degree: number): string {
  if (raw == null || raw === "") return "";
  const n = Number(raw);
  if (!Number.isFinite(n) || n === 0) return "";
  return fmtFrac(degree ? n - degree : n);
}

function fmtThick(v: string | null | undefined): string {
  if (!v) return "—";
  const n = v.trim().toUpperCase();
  if (n === "S" || n === "SINGLE") return "SINGLE";
  if (n === "D" || n === "DOUBLE") return "DOUBLE";
  if (n === "T" || n === "TRIPLE") return "TRIPLE";
  if (n === "N" || n === "NO HASHWA") return "NO HASHWA";
  return n;
}

// ── Shared sub-components ────────────────────────────────────────

function SectionBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-zinc-200 rounded overflow-hidden">
      <div className="px-2 py-[3px] bg-zinc-100 border-b border-zinc-200">
        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
          {title}
        </span>
      </div>
      <div className="p-2">{children}</div>
    </div>
  );
}

function AccessoryBadge({
  icon,
  label,
  rotate,
}: {
  icon: string;
  label: string;
  rotate?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold border border-zinc-200 rounded-full px-2 py-0.5 bg-zinc-50">
      <img
        src={icon}
        alt=""
        className={`h-3 w-auto object-contain ${rotate ? "-rotate-90" : ""}`}
      />
      {label}
    </span>
  );
}

// ── Main component ───────────────────────────────────────────────

interface DishdashaOverlayProps {
  garment: WorkshopGarment;
  measurement: Measurement | null | undefined;
}

export function DishdashaOverlay({
  garment,
  measurement,
}: DishdashaOverlayProps) {
  const g = garment as any;
  const m = measurement;
  const degree = m?.degree ? Number(m.degree) : 0;

  const fmtM = (key: keyof Measurement) =>
    m ? fmtVal(m[key], degree) : "";

  const styleLabel = String(g.style ?? "kuwaiti").toUpperCase();
  const lineCount = String(g.lines ?? 1);
  const lineLabel =
    lineCount === "1" ? "SINGLE" : lineCount === "2" ? "DOUBLE" : lineCount;
  const garmentDisplayId = g.garment_id ?? g.id?.slice(0, 8);

  const frontPocket = g.front_pocket_type
    ? STYLE_IMAGE_MAP[g.front_pocket_type]
    : null;
  const collarType = g.collar_type ? STYLE_IMAGE_MAP[g.collar_type] : null;
  const collarButton = g.collar_button
    ? STYLE_IMAGE_MAP[g.collar_button]
    : null;
  const cuffsEntry = g.cuffs_type ? STYLE_IMAGE_MAP[g.cuffs_type] : null;
  const cuffsType = cuffsEntry?.image ? cuffsEntry : null;

  const isShaab = g.jabzour_1 === "ZIPPER";
  const jabzourPrimary = isShaab
    ? STYLE_IMAGE_MAP["JAB_SHAAB"]
    : g.jabzour_2
      ? STYLE_IMAGE_MAP[g.jabzour_2]
      : null;
  const jabzourSecondary =
    isShaab && g.jabzour_2 ? STYLE_IMAGE_MAP[g.jabzour_2] : null;

  const sidePocket = STYLE_IMAGE_MAP["SID_MUDAWWAR_SIDE_POCKET"];

  return (
    <div className="bg-white border border-zinc-300 rounded-xl overflow-hidden text-zinc-900">
      {/* ── Header ── */}
      <div className="flex items-stretch border-b border-zinc-300 min-h-[60px]">
        {/* Garment ID block */}
        <div className="flex flex-col justify-center px-4 py-3 border-r border-zinc-300 min-w-[90px] shrink-0">
          <span className="text-[8px] font-black uppercase tracking-[0.18em] text-zinc-400 leading-none mb-1">
            N FAT
          </span>
          <span className="text-2xl font-black font-mono leading-none text-zinc-900">
            {garmentDisplayId}
          </span>
        </div>

        {/* Customer / Invoice */}
        <div className="flex-1 px-4 py-3 flex flex-col justify-center gap-0.5 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm leading-tight">
              <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mr-1.5">
                Customer
              </span>
              <span className="font-semibold">{g.customer_name ?? "—"}</span>
            </span>
            <span className="text-sm leading-tight">
              <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mr-1.5">
                Invoice
              </span>
              <span className="font-semibold">
                #{g.invoice_number ?? "—"}
              </span>
            </span>
          </div>
        </div>

        {/* Brand */}
        <div className="flex items-center justify-center px-4 py-3 border-l border-zinc-300 shrink-0">
          <span className="text-sm font-black uppercase tracking-widest border-2 border-zinc-900 rounded-full px-3 py-1 leading-none">
            {g.order_brand ?? "ERTH"}
          </span>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex min-h-0">
        {/* Template frame with measurement cells */}
        <div
          className="relative shrink-0 border-r border-zinc-200"
          style={{ width: "57%", aspectRatio: "793.76 / 1122.56" }}
        >
          <img
            src={templateSvg}
            alt="Measurement template"
            className="absolute inset-0 w-full h-full object-contain"
          />

          {qualityCheckTemplateFields.map((field) => {
            const key = FIELD_MAP[field.id as QualityTemplateFieldId];
            const val = m ? fmtVal(m[key], degree) : "";
            if (!val) return null;
            const isVertical =
              "orientation" in field && field.orientation === "vertical";
            return (
              <div
                key={field.id}
                className="absolute flex items-center justify-center bg-white/95 border border-zinc-500 font-black text-zinc-900 leading-none"
                style={{
                  left: `${field.left}%`,
                  top: `${field.top}%`,
                  width: `${field.width}%`,
                  height: `${field.height}%`,
                  fontSize: "clamp(7px, 1.45%, 11px)",
                  writingMode: isVertical ? "vertical-rl" : undefined,
                  borderRadius: "1.5px",
                }}
              >
                {val}
              </div>
            );
          })}

          {!m && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm text-zinc-300 italic font-medium">
                No measurements
              </span>
            </div>
          )}
        </div>

        {/* Style panel */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-y-auto">
          {/* Style / Line / Type meta row */}
          <div className="grid grid-cols-3 border-b border-zinc-200 shrink-0">
            {[
              styleLabel,
              `LINE ${lineLabel}`,
              (g.garment_type ?? "FINAL").toUpperCase(),
            ].map((v, i) => (
              <div
                key={i}
                className={`px-2 py-2 text-center text-[10px] font-black uppercase tracking-wide ${i < 2 ? "border-r border-zinc-200" : ""}`}
              >
                {v}
              </div>
            ))}
          </div>

          {/* Sections */}
          <div className="p-2 flex flex-col gap-1.5">
            {/* Front Pocket */}
            <SectionBlock title="Front Pocket">
              <div className="flex gap-2 items-start">
                {frontPocket?.image ? (
                  <img
                    src={frontPocket.image}
                    alt={frontPocket.label}
                    className="h-10 w-auto object-contain shrink-0"
                  />
                ) : (
                  <div className="h-10 w-10 border border-zinc-200 bg-zinc-50 flex items-center justify-center text-[8px] font-bold text-zinc-400 shrink-0">
                    POCKET
                  </div>
                )}
                <div className="flex flex-col gap-0.5 text-[11px] font-bold">
                  <span>H {fmtM("top_pocket_length") || "—"}</span>
                  <span>W {fmtM("top_pocket_width") || "—"}</span>
                  <span className="text-zinc-500 text-[10px]">
                    {fmtThick(g.front_pocket_thickness)}
                  </span>
                </div>
              </div>
              {g.pen_holder ? (
                <div className="mt-1">
                  <AccessoryBadge
                    icon={ACCESSORY_ICONS.pen}
                    label="PEN"
                    rotate
                  />
                </div>
              ) : null}
            </SectionBlock>

            {/* Jabzour */}
            <SectionBlock title="Jabzour">
              <div className="flex gap-2 items-start">
                <div className="flex gap-1 shrink-0">
                  {jabzourPrimary?.image ? (
                    <img
                      src={jabzourPrimary.image}
                      alt=""
                      className="h-9 w-auto object-contain rotate-90"
                    />
                  ) : (
                    <div className="h-9 w-9 border border-zinc-200 bg-zinc-50 flex items-center justify-center text-[8px] font-bold text-zinc-400">
                      JAB
                    </div>
                  )}
                  {jabzourSecondary?.image && (
                    <img
                      src={jabzourSecondary.image}
                      alt=""
                      className="h-9 w-auto object-contain rotate-90"
                    />
                  )}
                </div>
                <div className="flex flex-col gap-0.5 text-[11px] font-bold">
                  <span>L {fmtM("jabzour_length") || "—"}</span>
                  <span className="text-zinc-500 text-[10px]">
                    {fmtThick(g.jabzour_thickness)}
                  </span>
                </div>
              </div>
            </SectionBlock>

            {/* Side Pocket */}
            <SectionBlock title="Side Pocket">
              <div className="flex gap-2 items-start">
                {sidePocket?.image ? (
                  <img
                    src={sidePocket.image}
                    alt="Side Pocket"
                    className="h-12 w-auto object-contain shrink-0"
                  />
                ) : (
                  <div className="h-12 w-10 border border-zinc-200 bg-zinc-50 flex items-center justify-center text-[8px] font-bold text-zinc-400 shrink-0">
                    SIDE
                  </div>
                )}
                <div className="flex flex-col gap-0.5 text-[11px] font-bold">
                  <span>H {fmtM("side_pocket_length") || "—"}</span>
                  <span>W {fmtM("side_pocket_width") || "—"}</span>
                </div>
              </div>
              <div className="mt-1 flex gap-1 flex-wrap">
                {g.wallet_pocket ? (
                  <AccessoryBadge
                    icon={ACCESSORY_ICONS.wallet}
                    label="WALLET"
                  />
                ) : null}
                <AccessoryBadge
                  icon={ACCESSORY_ICONS.phone}
                  label="MOBILE"
                />
              </div>
            </SectionBlock>

            {/* Cuffs */}
            <SectionBlock title="Cuffs">
              <div className="flex gap-2 items-start">
                {cuffsType?.image ? (
                  <img
                    src={cuffsType.image}
                    alt={cuffsType.label}
                    className="h-9 w-auto object-contain shrink-0"
                  />
                ) : (
                  <div className="h-9 w-9 border border-zinc-200 bg-zinc-50 flex items-center justify-center text-[8px] font-bold text-zinc-400 shrink-0">
                    CUFFS
                  </div>
                )}
                <div className="text-[10px] font-bold text-zinc-500">
                  {fmtThick(g.cuffs_thickness)}
                </div>
              </div>
            </SectionBlock>

            {/* Collar */}
            <SectionBlock title="Collar">
              <div className="flex gap-2 items-start">
                {collarType?.image ? (
                  <img
                    src={collarType.image}
                    alt={collarType.label}
                    className="h-9 w-auto object-contain shrink-0"
                  />
                ) : (
                  <div className="h-9 w-9 border border-zinc-200 bg-zinc-50 flex items-center justify-center text-[8px] font-bold text-zinc-400 shrink-0">
                    COLLAR
                  </div>
                )}
                <div className="flex flex-col gap-0.5 text-[11px] font-bold">
                  <span>H {fmtM("collar_height") || "—"}</span>
                  <span>W {fmtM("collar_width") || "—"}</span>
                </div>
              </div>
              {(collarButton?.image || g.small_tabaggi) ? (
                <div className="mt-1 flex gap-1 flex-wrap">
                  {collarButton?.image ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold border border-zinc-200 rounded-full px-2 py-0.5 bg-zinc-50">
                      <img src={collarButton.image} alt="" className="h-3.5 w-auto" />
                      BUTTON
                    </span>
                  ) : null}
                  {g.small_tabaggi ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold border border-zinc-200 rounded-full px-2 py-0.5 bg-zinc-50">
                      <img src={ACCESSORY_ICONS.smallTabaggi} alt="" className="h-3.5 w-auto" />
                      SMALL TABAGGI
                    </span>
                  ) : null}
                </div>
              ) : null}
            </SectionBlock>

            {/* Lines (only shown when > 1) */}
            {g.lines && g.lines > 1 ? (
              <div className="flex items-center justify-center py-1 border border-zinc-200 rounded text-[11px] font-black uppercase tracking-wide">
                {g.lines} Lines
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Notes ── */}
      {g.notes ? (
        <div className="border-t border-zinc-300 px-4 py-2 text-sm">
          <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mr-2">
            Notes
          </span>
          <span className="font-medium">{g.notes}</span>
        </div>
      ) : null}
    </div>
  );
}

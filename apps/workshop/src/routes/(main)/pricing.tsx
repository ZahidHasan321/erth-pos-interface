import React, { useState, useMemo } from "react";
import { SlidingPillSwitcher } from "@repo/ui/sliding-pill-switcher";
import { createFileRoute } from "@tanstack/react-router";
import { usePrices, useUpdatePrice, useStyles, useUpdateStylePrice } from "@/hooks/usePricing";
import { LoadingSkeleton } from "@/components/shared/PageShell";
import { Input } from "@repo/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Pencil, Check, X, ChevronDown, Tag } from "lucide-react";
import { PageHeader } from "@/components/shared/PageShell";
import { IconNeedle, IconScissors, IconHome, IconBolt, IconDroplet } from "@tabler/icons-react";
import type { Brand, Price, Style } from "@repo/database";

// ── Image imports ─────────────────────────────────────────────────────────────
import japaneseCollar    from "@/assets/collar-assets/collar-types/Japanese.png";
import qalabiCollar      from "@/assets/collar-assets/collar-types/Qallabi.png";
import roundCollar       from "@/assets/collar-assets/collar-types/Down Collar.png";
import straitCollar      from "@/assets/collar-assets/collar-types/Strait Collar.png";
import araviZarrar       from "@/assets/collar-assets/collar-buttons/Aravi Zarrar.png";
import zarrarTabbagi     from "@/assets/collar-assets/collar-buttons/Zarrar + Tabbagi.png";
import tabbagi           from "@/assets/collar-assets/collar-buttons/Tabbagi.png";
import smallTabbagi      from "@/assets/collar-assets/Small Tabbagi.png";
import bainMurabba       from "@/assets/jabzour-assets/Bain Murabba.png";
import bainMusallas      from "@/assets/jabzour-assets/Bain Musallas.png";
import magfiMurabba      from "@/assets/jabzour-assets/Magfi Murabba.png";
import magfiMusallas     from "@/assets/jabzour-assets/Magfi  Musallas.png";
import shaab             from "@/assets/jabzour-assets/Shaab.png";
import mudawwarMagfiPocket from "@/assets/top-pocket-assets/Mudawwar Magfi Front Pocket.png";
import murabbaPocket     from "@/assets/top-pocket-assets/Murabba Front Pocket.png";
import musallasPocket    from "@/assets/top-pocket-assets/Musallas Front Pocket.png";
import mudawwarPocket    from "@/assets/top-pocket-assets/Mudawwar Front Pocket.png";
import mudawwarSide      from "@/assets/side-pocket-assets/Mudawwar Side Pocket.png";
import doubleGumsha      from "@/assets/sleeves-assets/sleeves-types/Double Gumsha.png";
import murabbaKabak      from "@/assets/sleeves-assets/sleeves-types/Murabba Kabak.png";
import musallasKabbak    from "@/assets/sleeves-assets/sleeves-types/Musallas Kabbak.png";
import mudawarKabbak     from "@/assets/sleeves-assets/sleeves-types/Mudawar Kabbak.png";

export const Route = createFileRoute("/(main)/pricing")({
  component: PricingPage,
  head: () => ({ meta: [{ title: "Pricing" }] }),
});

// ── Code → image map ──────────────────────────────────────────────────────────

const CODE_IMAGE: Record<string, string> = {
  COL_QALLABI:                    qalabiCollar,
  COL_DOWN_COLLAR:                roundCollar,
  COL_JAPANESE:                   japaneseCollar,
  COL_STRAIT_COLLAR:              straitCollar,
  COL_ARAVI_ZARRAR:               araviZarrar,
  "COL_ZARRAR__TABBAGI":          zarrarTabbagi,
  COL_TABBAGI:                    tabbagi,
  COL_SMALL_TABBAGI:              smallTabbagi,
  JAB_BAIN_MURABBA:               bainMurabba,
  JAB_BAIN_MUSALLAS:              bainMusallas,
  JAB_MAGFI_MURABBA:              magfiMurabba,
  JAB_MAGFI_MUSALLAS:             magfiMusallas,
  JAB_SHAAB:                      shaab,
  FRO_MUDAWWAR_MAGFI_FRONT_POCKET: mudawwarMagfiPocket,
  FRO_MURABBA_FRONT_POCKET:       murabbaPocket,
  FRO_MUSALLAS_FRONT_POCKET:      musallasPocket,
  FRO_MUDAWWAR_FRONT_POCKET:      mudawwarPocket,
  SID_MUDAWWAR_SIDE_POCKET:       mudawwarSide,
  CUF_DOUBLE_GUMSHA:              doubleGumsha,
  CUF_MURABBA_KABAK:              murabbaKabak,
  CUF_MUSALLAS_KABBAK:            musallasKabbak,
  CUF_MUDAWAR_KABBAK:             mudawarKabbak,
};

// ── Config ────────────────────────────────────────────────────────────────────

const PRICE_META: Record<string, {
  label: string; unit: string; icon: React.ComponentType<{ className?: string }>; color: string; bg: string;
}> = {
  STITCHING_ADULT:   { label: "Adult Stitching",   unit: "per garment",         icon: IconNeedle,       color: "text-blue-700",    bg: "bg-blue-500/10"    },
  STITCHING_CHILD:   { label: "Child Stitching",   unit: "per garment",         icon: IconScissors,     color: "text-cyan-700",    bg: "bg-cyan-500/10"    },
  HOME_DELIVERY:     { label: "Home Delivery",     unit: "per order",           icon: IconHome,         color: "text-emerald-700", bg: "bg-emerald-500/10" },
  EXPRESS_SURCHARGE: { label: "Express Surcharge", unit: "per express garment", icon: IconBolt,         color: "text-amber-700",   bg: "bg-amber-500/10"   },
  SOAKING_CHARGE:    { label: "Soaking Charge",    unit: "per soaking garment", icon: IconDroplet,      color: "text-sky-700",     bg: "bg-sky-500/10"     },
};

interface SubGroupConfig {
  component: string;
  label: string;
  isAddon?: boolean;
}

interface GarmentPartConfig {
  key: string;
  label: string;
  subGroups: SubGroupConfig[];
}

const GARMENT_PARTS: GarmentPartConfig[] = [
  { key: "base",         label: "Style & Lines", subGroups: [{ component: "base", label: "Style" }, { component: "lines", label: "Lines" }] },
  { key: "collar",       label: "Collar",        subGroups: [{ component: "collar_type", label: "Type" }, { component: "collar_button", label: "Button" }, { component: "collar_accessory", label: "Accessory" }] },
  { key: "jabzour",      label: "Jabzour",       subGroups: [{ component: "jabzour_type", label: "Type" }, { component: "jabzour_thickness", label: "Hashwa", isAddon: true }] },
  { key: "front_pocket", label: "Front Pocket",  subGroups: [{ component: "pocket_type", label: "Type" }, { component: "pocket_thickness", label: "Hashwa", isAddon: true }] },
  { key: "side_pocket",  label: "Side Pocket",   subGroups: [{ component: "side_pocket_type", label: "Type" }] },
  { key: "cuffs",        label: "Cuffs",         subGroups: [{ component: "cuffs_type", label: "Type" }, { component: "cuffs_thickness", label: "Hashwa", isAddon: true }] },
];

const BRAND_TABS = [
  { value: "ERTH"   as Brand, label: "ERTH",   indicator: "bg-emerald-600" },
  { value: "SAKKBA" as Brand, label: "SAKKBA",  indicator: "bg-blue-600"    },
  { value: "QASS"   as Brand, label: "QASS",    indicator: "bg-violet-600"  },
] as const;

const BRAND_INDICATOR: Record<Brand, string> = {
  ERTH:   "bg-emerald-600",
  SAKKBA: "bg-blue-600",
  QASS:   "bg-violet-600",
};

const BRAND_STRIPE: Record<Brand, string> = {
  ERTH:   "border-t-2 border-t-emerald-500/60",
  SAKKBA: "border-t-2 border-t-blue-500/60",
  QASS:   "border-t-2 border-t-violet-500/60",
};

// ── Inline Editor ─────────────────────────────────────────────────────────────

function InlineEditor({ value, onSave, onCancel, isPending, compact }: {
  value: string;
  onSave: (v: number) => void;
  onCancel: () => void;
  isPending: boolean;
  compact?: boolean;
}) {
  const [editValue, setEditValue] = useState(value);
  const submit = () => {
    const num = parseFloat(editValue);
    if (isNaN(num) || num < 0) { toast.error("Enter a valid positive number"); return; }
    onSave(num);
  };

  if (compact) {
    // Card editing: stacked layout that fills the card's bottom panel
    return (
      <div className="flex flex-col items-center gap-1.5 w-full px-1">
        <Input
          type="number" step="0.001" min="0" value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") onCancel(); }}
          className="w-full h-8 text-sm font-mono text-center"
          autoFocus
        />
        <div className="flex gap-2">
          <button onClick={submit} disabled={isPending} className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors">
            <Check className="w-3.5 h-3.5" /> OK
          </button>
          <button onClick={onCancel} className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-muted-foreground bg-muted/50 hover:bg-muted transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Input
        type="number" step="0.001" min="0" value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") onCancel(); }}
        className="w-24 h-8 text-sm font-mono text-right"
        autoFocus
      />
      <button onClick={submit} disabled={isPending} className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50 transition-colors">
        <Check className="w-3.5 h-3.5" />
      </button>
      <button onClick={onCancel} className="p-1.5 rounded-md text-muted-foreground hover:bg-muted/50 transition-colors">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── System Charges ────────────────────────────────────────────────────────────

function SystemCharges({ prices, brand }: { prices: Price[]; brand: Brand }) {
  const updatePrice = useUpdatePrice();
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
      {prices.map((price) => {
        const meta = PRICE_META[price.key];
        if (!meta) return null;
        const Icon = meta.icon;
        const isEditing = editing === price.key;

        return (
          <div key={price.key} className={cn(
            "border rounded-xl bg-card p-4 shadow-sm transition-all group cursor-default",
            BRAND_STRIPE[brand],
            isEditing && "ring-2 ring-primary/20",
          )}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className={cn("p-1.5 rounded-lg shrink-0", meta.bg)}>
                  <Icon className={cn("w-4 h-4", meta.color)} />
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground leading-tight">{meta.label}</p>
              </div>
              {!isEditing && (
                <button
                  onClick={() => setEditing(price.key)}
                  className="p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              )}
            </div>
            {isEditing ? (
              <InlineEditor
                value={String(price.value)}
                onSave={(v) => updatePrice.mutate({ key: price.key, brand, value: v }, {
                  onSuccess: () => setEditing(null),
                  onError: (e) => toast.error(e.message),
                })}
                onCancel={() => setEditing(null)}
                isPending={updatePrice.isPending}
              />
            ) : (
              <>
                <p className="text-2xl font-black tracking-tight tabular-nums leading-none">
                  {Number(price.value).toFixed(3)}
                  <span className="text-[10px] font-bold text-muted-foreground/40 ml-0.5">KD</span>
                </p>
                <p className="text-[11px] text-muted-foreground mt-1 truncate">{meta.unit}</p>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Style Image Card ──────────────────────────────────────────────────────────
// Used for type options that have images (collar, jabzour, pocket, cuffs)

function StyleImageCard({ style }: { style: Style }) {
  const updateStyle = useUpdateStylePrice();
  const [editing, setEditing] = useState(false);
  const image = CODE_IMAGE[style.code ?? ""] ?? null;
  const rate = Number(style.rate_per_item ?? 0);
  const hasCost = rate > 0;

  return (
    <div className={cn(
      "group relative flex flex-col border border-border rounded-xl overflow-hidden bg-card w-[108px] shrink-0 transition-all",
      editing ? "ring-2 ring-primary/30 shadow-lg" : "hover:shadow-md hover:border-border/80",
    )}>
      {/* Thumbnail — clean, no overlapping badges */}
      <div className="relative bg-muted/20 h-24 overflow-hidden flex items-center justify-center">
        {image ? (
          <img
            src={image}
            alt={style.name}
            className="w-full h-full object-contain p-1.5 group-hover:scale-[1.04] transition-transform duration-300"
          />
        ) : null}

        {/* Edit button — center overlay on hover */}
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/0 group-hover:bg-black/5"
          >
            <div className="bg-white rounded-lg shadow-md p-1.5">
              <Pencil className="w-3 h-3 text-foreground/70" />
            </div>
          </button>
        )}
      </div>

      {/* Name + price / editor */}
      <div className="px-2 py-2 border-t border-border/40 flex flex-col items-center gap-0.5 min-h-[3.5rem] justify-center">
        {editing ? (
          <InlineEditor
            value={String(style.rate_per_item ?? "0")}
            onSave={(v) => updateStyle.mutate({ id: style.id, rate_per_item: v }, {
              onSuccess: () => setEditing(false),
              onError: (e) => toast.error(e.message),
            })}
            onCancel={() => setEditing(false)}
            isPending={updateStyle.isPending}
            compact
          />
        ) : (
          <>
            <p className="text-xs font-semibold text-foreground/75 leading-tight text-center">{style.name}</p>
            <p className={cn(
              "text-[11px] font-bold tabular-nums",
              hasCost ? "text-primary" : "text-muted-foreground/40",
            )}>
              {hasCost ? `${rate.toFixed(3)} KD` : "Free"}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ── Hashwa Card ───────────────────────────────────────────────────────────────
// Card-style component for thickness options — matches image card dimensions

/** "Jabzour - Single Hashwa" → "Single" | "Jabzour - No Hashwa" → "No Hashwa" */
function hashwaShortName(name: string): string {
  const afterDash = name.split(" - ")[1] ?? name;
  return afterDash.replace(/ Hashwa$/, "").trim() || afterDash;
}

const HASHWA_ORDER = ["Single", "Double", "Triple", "No Hashwa"] as const;

/** Returns the single letter shown in the card visual area */
function hashwaGlyph(shortName: string): string {
  if (shortName === "Single")   return "S";
  if (shortName === "Double")   return "D";
  if (shortName === "Triple")   return "T";
  if (shortName.startsWith("No")) return "N";
  return shortName[0];
}

function HashwaCard({ style }: { style: Style }) {
  const updateStyle = useUpdateStylePrice();
  const [editing, setEditing] = useState(false);
  const rate = Number(style.rate_per_item ?? 0);
  const hasCost = rate > 0;
  const shortName = hashwaShortName(style.name);
  const glyph = hashwaGlyph(shortName);

  return (
    <div className={cn(
      "group relative flex flex-col border rounded-xl overflow-hidden w-[108px] shrink-0 transition-all",
      "bg-slate-50/80 border-slate-200/70",
      editing ? "ring-2 ring-slate-300/60 shadow-lg" : "hover:shadow-md hover:border-slate-300/80",
    )}>
      {/* Visual area — glyph only, no overlapping badge */}
      <div className="relative h-24 flex items-center justify-center overflow-hidden">
        <span className={cn(
          "text-3xl font-black tabular-nums select-none tracking-tight",
          shortName.startsWith("No") ? "text-rose-300/80" : "text-emerald-300/80",
        )}>
          {glyph}
        </span>

        {/* Edit overlay */}
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-slate-100/0 group-hover:bg-slate-100/50"
          >
            <div className="bg-white/90 rounded-lg shadow-md p-1.5">
              <Pencil className="w-3 h-3 text-slate-500" />
            </div>
          </button>
        )}
      </div>

      {/* Label + price / editor */}
      <div className="px-2 py-2 border-t border-slate-200/60 flex flex-col items-center gap-0.5 min-h-[3.5rem] justify-center">
        {editing ? (
          <InlineEditor
            value={String(style.rate_per_item ?? "0")}
            onSave={(v) => updateStyle.mutate({ id: style.id, rate_per_item: v }, {
              onSuccess: () => setEditing(false),
              onError: (e) => toast.error(e.message),
            })}
            onCancel={() => setEditing(false)}
            isPending={updateStyle.isPending}
            compact
          />
        ) : (
          <>
            <p className="text-xs font-semibold text-slate-600 leading-tight">{shortName}</p>
            <p className={cn(
              "text-[11px] font-bold tabular-nums",
              hasCost ? "text-slate-700" : "text-slate-400",
            )}>
              {hasCost ? `+${rate.toFixed(3)} KD` : "Free"}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ── Style Glyph Card ──────────────────────────────────────────────────────────
// For items with no image (base style, lines) — same card dimensions, letter glyph

function styleGlyph(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("kuwaiti"))                return "K";
  if (n.includes("design"))                return "D";
  if (n === "line 2" || n.endsWith(" 2"))  return "2";
  if (n.includes("line"))                  return "1";
  return name[0]?.toUpperCase() ?? "?";
}

function StyleGlyphCard({ style }: { style: Style }) {
  const updateStyle = useUpdateStylePrice();
  const [editing, setEditing] = useState(false);
  const rate = Number(style.rate_per_item ?? 0);
  const hasCost = rate > 0;
  const glyph = styleGlyph(style.name);

  return (
    <div className={cn(
      "group relative flex flex-col border border-border rounded-xl overflow-hidden w-[108px] shrink-0 transition-all bg-card",
      editing ? "ring-2 ring-primary/30 shadow-lg" : "hover:shadow-md hover:border-border/80",
    )}>
      {/* Visual area */}
      <div className="relative bg-muted/20 h-24 flex items-center justify-center overflow-hidden">
        <span className="text-3xl font-black select-none tracking-tight text-muted-foreground/25">
          {glyph}
        </span>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/0 group-hover:bg-black/5"
          >
            <div className="bg-white rounded-lg shadow-md p-1.5">
              <Pencil className="w-3 h-3 text-foreground/70" />
            </div>
          </button>
        )}
      </div>

      {/* Name + price / editor */}
      <div className="px-2 py-2 border-t border-border/40 flex flex-col items-center gap-0.5 min-h-[3.5rem] justify-center">
        {editing ? (
          <InlineEditor
            value={String(style.rate_per_item ?? "0")}
            onSave={(v) => updateStyle.mutate({ id: style.id, rate_per_item: v }, {
              onSuccess: () => setEditing(false),
              onError: (e) => toast.error(e.message),
            })}
            onCancel={() => setEditing(false)}
            isPending={updateStyle.isPending}
            compact
          />
        ) : (
          <>
            <p className="text-xs font-semibold text-foreground/75 leading-tight text-center">{style.name}</p>
            <p className={cn("text-[11px] font-bold tabular-nums", hasCost ? "text-primary" : "text-muted-foreground/40")}>
              {hasCost ? `${rate.toFixed(3)} KD` : "Free"}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ── Garment Part Group ────────────────────────────────────────────────────────

function GarmentPartGroup({ config, byComponent }: {
  config: GarmentPartConfig;
  byComponent: Map<string, Style[]>;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const allItems = config.subGroups.flatMap((sg) => byComponent.get(sg.component) ?? []);
  const addonSubGroups = config.subGroups.filter((sg) => sg.isAddon);

  const totalCount = allItems.length;
  const unpricedCount = allItems.filter((s) => Number(s.rate_per_item ?? 0) === 0).length;
  const hasHashwa = addonSubGroups.length > 0;

  if (!totalCount) return null;

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card shadow-sm">
      {/* Header */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-muted/15 transition-colors"
      >
        <span className="font-bold text-sm tracking-tight">{config.label}</span>

        <div className="flex items-center gap-1.5">
          {hasHashwa && (
            <span className="text-[10px] font-semibold px-1.5 py-px rounded-md bg-slate-100 text-slate-500 border border-slate-200/70">
              hashwa
            </span>
          )}
          {unpricedCount > 0 && (
            <span className="text-[10px] font-semibold px-1.5 py-px rounded-md bg-amber-50 text-amber-600 border border-amber-200/70">
              {unpricedCount} unpriced
            </span>
          )}
        </div>

        <ChevronDown className={cn(
          "w-4 h-4 ml-auto text-muted-foreground/40 transition-transform duration-200",
          collapsed && "-rotate-90",
        )} />
      </button>

      {/* Body — grid-rows transition for smooth slide */}
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: collapsed ? "0fr" : "1fr" }}
      >
        <div className="overflow-hidden">
        <div className="border-t border-border/40">
          {/* Type sub-groups */}
          {config.subGroups.filter((sg) => !sg.isAddon).map((sg) => {
            const items = byComponent.get(sg.component) ?? [];
            if (!items.length) return null;

            return (
              <div key={sg.component}>
                {/* Sub-label only if multiple sub-groups */}
                {config.subGroups.filter((x) => !x.isAddon).length > 1 && (
                  <div className="px-4 py-1.5 border-b border-border/30 bg-muted/20">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">
                      {sg.label}
                    </span>
                  </div>
                )}

                {/* Card grid — image card if photo exists, glyph card otherwise */}
                <div className={cn(
                  "p-3 flex flex-wrap gap-2",
                  addonSubGroups.length > 0 && "border-b border-border/30",
                )}>
                  {items.map((style) =>
                    CODE_IMAGE[style.code ?? ""]
                      ? <StyleImageCard key={style.id} style={style} />
                      : <StyleGlyphCard key={style.id} style={style} />
                  )}
                </div>
              </div>
            );
          })}

          {/* Hashwa (addon) sub-groups — card grid matching type cards */}
          {addonSubGroups.map((sg) => {
            const rawItems = byComponent.get(sg.component) ?? [];
            if (!rawItems.length) return null;
            const items = [...rawItems].sort((a, b) => {
              const ai = HASHWA_ORDER.indexOf(hashwaShortName(a.name) as typeof HASHWA_ORDER[number]);
              const bi = HASHWA_ORDER.indexOf(hashwaShortName(b.name) as typeof HASHWA_ORDER[number]);
              return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
            });

            return (
              <div key={sg.component} className="p-3 flex flex-wrap gap-2">
                {items.map((style) => (
                  <HashwaCard key={style.id} style={style} />
                ))}
              </div>
            );
          })}
        </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function PricingPage() {
  const [brand, setBrand] = useState<Brand>("ERTH");
  const { data: prices, isLoading: pricesLoading } = usePrices(brand);
  const { data: styles, isLoading: stylesLoading } = useStyles(brand);

  const isLoading = pricesLoading || stylesLoading;

  const byComponent = useMemo(() => {
    const map = new Map<string, Style[]>();
    for (const s of styles ?? []) {
      const comp = s.component ?? "__unknown__";
      if (!map.has(comp)) map.set(comp, []);
      map.get(comp)!.push(s);
    }
    return map;
  }, [styles]);

  const pricedCount = useMemo(
    () => (styles ?? []).filter((s) => Number(s.rate_per_item) > 0).length,
    [styles],
  );

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">

      {/* ── Page header ── */}
      <PageHeader
        icon={Tag}
        title="Pricing"
        subtitle={isLoading ? "Loading..." : `${(prices ?? []).filter((p) => PRICE_META[p.key]).length} system charges · ${pricedCount} priced style options`}
      >
        <SlidingPillSwitcher
          value={brand}
          options={BRAND_TABS}
          onChange={setBrand}
          indicatorClassName={BRAND_INDICATOR[brand]}
        />
      </PageHeader>

      {isLoading ? (
        <LoadingSkeleton count={5} />
      ) : (
        <div className="space-y-6">

          {/* System charges */}
          {prices?.length ? (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 mb-2.5">
                System Charges
              </p>
              <SystemCharges prices={prices} brand={brand} />
            </div>
          ) : null}

          {/* Style options by garment part */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 mb-2.5">
              Style Options
            </p>
            <div className="space-y-2">
              {GARMENT_PARTS.map((part) => (
                <GarmentPartGroup
                  key={part.key}
                  config={part}
                  byComponent={byComponent}
                />
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

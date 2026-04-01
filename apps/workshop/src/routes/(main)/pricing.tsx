import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { usePrices, useUpdatePrice, useStyles, useUpdateStylePrice } from "@/hooks/usePricing";
import { PageHeader, LoadingSkeleton } from "@/components/shared/PageShell";
import { Input } from "@repo/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Tag, Pencil, Check, X, ChevronDown, Shirt, Truck, Zap } from "lucide-react";
import type { Brand, Price, Style } from "@repo/database";

export const Route = createFileRoute("/(main)/pricing")({
  component: PricingPage,
  head: () => ({ meta: [{ title: "Pricing" }] }),
});

// ── Config ──────────────────────────────────────────────────────────────────

const PRICE_META: Record<string, {
  label: string;
  unit: string;
  icon: typeof Tag;
  color: string;       // text color for icon + value
  bg: string;           // tinted background
  border: string;
}> = {
  STITCHING_ADULT:   { label: "Adult Stitching",   unit: "per garment",        icon: Shirt, color: "text-blue-700",    bg: "bg-blue-500/10",    border: "border-blue-200" },
  STITCHING_CHILD:   { label: "Child Stitching",   unit: "per garment",        icon: Shirt, color: "text-cyan-700",    bg: "bg-cyan-500/10",    border: "border-cyan-200" },
  HOME_DELIVERY:     { label: "Home Delivery",      unit: "per order",          icon: Truck, color: "text-emerald-700", bg: "bg-emerald-500/10", border: "border-emerald-200" },
  EXPRESS_SURCHARGE:  { label: "Express Surcharge", unit: "per express garment", icon: Zap,   color: "text-amber-700",  bg: "bg-amber-500/10",   border: "border-amber-200" },
};

const STYLE_TYPES = [
  { key: "Style",         label: "Style Type",     color: "text-indigo-600",  bg: "bg-indigo-50",  border: "border-indigo-200",  stripe: "bg-indigo-500" },
  { key: "Collar",        label: "Collar",         color: "text-violet-600",  bg: "bg-violet-50",  border: "border-violet-200",  stripe: "bg-violet-500" },
  { key: "Collar Button", label: "Collar Button",  color: "text-fuchsia-600", bg: "bg-fuchsia-50", border: "border-fuchsia-200", stripe: "bg-fuchsia-500" },
  { key: "Jabzour",       label: "Jabzour",        color: "text-rose-600",    bg: "bg-rose-50",    border: "border-rose-200",    stripe: "bg-rose-500" },
  { key: "Front Pocket",  label: "Front Pocket",   color: "text-teal-600",    bg: "bg-teal-50",    border: "border-teal-200",    stripe: "bg-teal-500" },
  { key: "Side Pocket",   label: "Side Pocket",    color: "text-orange-600",  bg: "bg-orange-50",  border: "border-orange-200",  stripe: "bg-orange-500" },
  { key: "Cuff",          label: "Cuff",           color: "text-sky-600",     bg: "bg-sky-50",     border: "border-sky-200",     stripe: "bg-sky-500" },
] as const;

// ── Shared inline editor ────────────────────────────────────────────────────

function InlineEditor({
  value,
  onSave,
  onCancel,
  isPending,
}: {
  value: string;
  onSave: (v: number) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [editValue, setEditValue] = useState(value);

  const submit = () => {
    const num = parseFloat(editValue);
    if (isNaN(num) || num < 0) {
      toast.error("Enter a valid positive number");
      return;
    }
    onSave(num);
  };

  return (
    <div className="flex items-center gap-1.5 animate-scale-in">
      <Input
        type="number"
        step="0.001"
        min="0"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") onCancel();
        }}
        className="w-24 h-8 text-sm font-mono text-right"
        autoFocus
      />
      <button
        onClick={submit}
        disabled={isPending}
        className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50 transition-colors"
      >
        <Check className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={onCancel}
        className="p-1.5 rounded-md text-muted-foreground hover:bg-muted/50 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── System Charges — card grid with prominent values ────────────────────────

function SystemCharges({ prices, brand }: { prices: Price[]; brand: Brand }) {
  const updatePrice = useUpdatePrice();
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger-children">
      {prices.map((price) => {
        const meta = PRICE_META[price.key];
        if (!meta) return null;
        const Icon = meta.icon;
        const isEditing = editing === price.key;

        return (
          <div
            key={price.key}
            className={cn(
              "relative border rounded-xl overflow-hidden bg-card transition-all",
              isEditing && "ring-2 ring-primary/20",
            )}
          >
            <div className="p-4">
              {/* Icon + edit button */}
              <div className="flex items-start justify-between mb-3">
                <div className={cn("p-2 rounded-lg", meta.bg)}>
                  <Icon className={cn("w-5 h-5", meta.color)} />
                </div>
                {!isEditing && (
                  <button
                    onClick={() => setEditing(price.key)}
                    className="p-1.5 rounded-md text-muted-foreground/30 hover:text-primary hover:bg-primary/10 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Value */}
              {isEditing ? (
                <div className="mb-1">
                  <InlineEditor
                    value={String(price.value)}
                    onSave={(v) =>
                      updatePrice.mutate(
                        { key: price.key, brand, value: v },
                        {
                          onSuccess: () => { toast.success(`${meta.label} updated`); setEditing(null); },
                          onError: (e) => toast.error(e.message),
                        },
                      )
                    }
                    onCancel={() => setEditing(null)}
                    isPending={updatePrice.isPending}
                  />
                </div>
              ) : (
                <p className="text-2xl font-black tracking-tight tabular-nums leading-none">
                  {Number(price.value).toFixed(3)}
                  <span className="text-xs font-bold text-muted-foreground/50 ml-1">KD</span>
                </p>
              )}

              {/* Label */}
              <p className="text-xs font-medium text-muted-foreground mt-1.5">{meta.label}</p>
              <p className="text-[10px] text-muted-foreground/50">{meta.unit}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Style Groups (collapsible) ──────────────────────────────────────────────

function StyleGroups({ styles }: { styles: Style[] }) {
  const updateStyle = useUpdateStylePrice();
  const [editing, setEditing] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const grouped = useMemo(() => {
    const map = new Map<string, Style[]>();
    for (const s of styles) {
      const type = s.type ?? "Other";
      if (!map.has(type)) map.set(type, []);
      map.get(type)!.push(s);
    }
    return map;
  }, [styles]);

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });

  return (
    <div className="space-y-3 stagger-children">
      {STYLE_TYPES.map((type) => {
        const items = grouped.get(type.key);
        if (!items?.length) return null;

        const isCollapsed = collapsed.has(type.key);
        const pricedCount = items.filter((s) => Number(s.rate_per_item) > 0).length;

        return (
          <div key={type.key} className={cn("border overflow-hidden shadow-sm", type.border)}>
            {/* Group header */}
            <button
              onClick={() => toggle(type.key)}
              className={cn("w-full flex items-center gap-3 px-4 py-3 text-left transition-colors", type.bg)}
            >
              <div className={cn("w-2 self-stretch rounded-full shrink-0 -my-3 -ml-4", type.stripe)} />
              <span className="font-bold text-sm">{type.label}</span>
              <span className={cn(
                "text-xs font-black tabular-nums px-2 py-0.5 rounded-full bg-white/80",
                type.color,
              )}>
                {items.length}
              </span>
              {pricedCount > 0 && (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-md">
                  {pricedCount} priced
                </span>
              )}
              <ChevronDown className={cn(
                "w-4 h-4 ml-auto text-foreground/30 transition-transform",
                isCollapsed && "-rotate-90",
              )} />
            </button>

            {/* Options list */}
            {!isCollapsed && (
              <div className="bg-card">
                {items.map((style, i) => {
                  const isEditing = editing === style.id;
                  const rate = Number(style.rate_per_item ?? 0);
                  const hasCost = rate > 0;

                  return (
                    <div
                      key={style.id}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2.5 transition-colors",
                        i < items.length - 1 && "border-b",
                        isEditing ? "bg-primary/5" : "hover:bg-muted/20",
                      )}
                    >
                      {/* Option name */}
                      <span className={cn(
                        "text-sm flex-1 min-w-0 truncate",
                        hasCost ? "font-semibold" : "text-muted-foreground",
                      )}>
                        {style.name}
                      </span>

                      {/* Rate */}
                      {isEditing ? (
                        <InlineEditor
                          value={String(style.rate_per_item ?? "0")}
                          onSave={(v) =>
                            updateStyle.mutate(
                              { id: style.id, rate_per_item: v },
                              {
                                onSuccess: () => { toast.success(`${style.name} updated`); setEditing(null); },
                                onError: (e) => toast.error(e.message),
                              },
                            )
                          }
                          onCancel={() => setEditing(null)}
                          isPending={updateStyle.isPending}
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          {hasCost ? (
                            <span className="font-mono font-bold text-sm tabular-nums">
                              {rate.toFixed(3)}
                              <span className="text-[10px] font-bold text-muted-foreground/50 ml-1">KD</span>
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground/30 font-medium">Free</span>
                          )}
                          <button
                            onClick={() => setEditing(style.id)}
                            className="p-1.5 rounded-md text-muted-foreground/30 hover:text-primary hover:bg-primary/10 transition-colors"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Brand Tabs ─────────────────────────────────────────────────────────────

const BRAND_TABS: { value: Brand; label: string; color: string; bg: string; active: string }[] = [
  { value: "ERTH",   label: "ERTH",   color: "text-emerald-700", bg: "hover:bg-emerald-50", active: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300" },
  { value: "SAKKBA", label: "SAKKBA", color: "text-blue-700",    bg: "hover:bg-blue-50",    active: "bg-blue-100 text-blue-800 ring-1 ring-blue-300" },
  { value: "QASS",   label: "QASS",   color: "text-violet-700",  bg: "hover:bg-violet-50",  active: "bg-violet-100 text-violet-800 ring-1 ring-violet-300" },
];

// ── Main Page ───────────────────────────────────────────────────────────────

function PricingPage() {
  const [brand, setBrand] = useState<Brand>("ERTH");
  const { data: prices, isLoading: pricesLoading } = usePrices(brand);
  const { data: styles, isLoading: stylesLoading } = useStyles(brand);

  const isLoading = pricesLoading || stylesLoading;

  const pricedStyleCount = useMemo(
    () => (styles ?? []).filter((s) => Number(s.rate_per_item) > 0).length,
    [styles],
  );

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <PageHeader
        icon={Tag}
        title="Pricing"
        subtitle={
          isLoading
            ? "Loading..."
            : `${prices?.length ?? 0} system charges · ${pricedStyleCount} priced style options`
        }
      />

      {/* Brand tabs */}
      <div className="flex gap-1.5 mb-5">
        {BRAND_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setBrand(tab.value)}
            className={cn(
              "px-4 py-1.5 rounded-lg text-xs font-black tracking-wide transition-all",
              brand === tab.value ? tab.active : `${tab.color} ${tab.bg} bg-transparent`,
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingSkeleton count={5} />
      ) : (
        <div className="space-y-6">
          {/* System charges — card grid */}
          {prices?.length ? <SystemCharges prices={prices} brand={brand} /> : null}

          {/* Style options — collapsible groups */}
          <div>
            <h2 className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/60 mb-3">
              Style Options
            </h2>
            {styles?.length ? (
              <StyleGroups styles={styles} />
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No style options configured</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Pencil, Plus, Search, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Switch } from "@repo/ui/switch";
import { Textarea } from "@repo/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@repo/ui/dialog";
import { cn } from "@/lib/utils";
import { CODE_IMAGE } from "@/components/pricing/style-images";
import {
  useStyles,
  useStylePricingRules,
  useUpsertStylePricingRule,
  useDeleteStylePricingRule,
} from "@/hooks/usePricing";
import type { StylePricingRuleInput } from "@/api/pricing";
import type { Brand, Style, StylePricingRule, StyleRuleType } from "@repo/database";

type Props = { brand: Brand };

export function StylePricingRulesSection({ brand }: Props) {
  const { data: rules, isLoading: rulesLoading } = useStylePricingRules(brand);
  const { data: styles, isLoading: stylesLoading } = useStyles(brand);
  const [editing, setEditing] = useState<StylePricingRule | "new" | null>(null);

  const loading = rulesLoading || stylesLoading;

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-sm font-medium text-muted-foreground">
          Style Pricing Rules
        </p>
        <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={() => setEditing("new")}>
          <Plus className="w-3.5 h-3.5" />
          Add Rule
        </Button>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading rules…</p>
      ) : !rules || rules.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl p-6 text-center bg-muted/10">
          <p className="text-sm text-muted-foreground">
            No override rules yet. By default every selected style adds its <code className="text-[11px] bg-muted px-1 py-0.5 rounded">rate_per_item</code> to the garment price.
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1.5">
            Add a rule to make a specific style code (like Designer or Qallabi) a flat rate that wipes out all other style options.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <RuleCard
              key={rule.id}
              rule={rule}
              styles={styles ?? []}
              onEdit={() => setEditing(rule)}
            />
          ))}
        </div>
      )}

      <RuleDialog
        open={editing !== null}
        rule={editing === "new" ? null : editing}
        brand={brand}
        styles={styles ?? []}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

// ── Rule Card ─────────────────────────────────────────────────────────────────

function RuleCard({ rule, styles, onEdit }: { rule: StylePricingRule; styles: Style[]; onEdit: () => void }) {
  const upsert = useUpsertStylePricingRule();
  const del = useDeleteStylePricingRule();

  const styleName = useMemo(
    () => styles.find((s) => s.code === rule.style_code)?.name ?? rule.style_code,
    [styles, rule.style_code],
  );

  const toggleActive = () => {
    upsert.mutate(
      {
        id: rule.id,
        brand: rule.brand,
        style_code: rule.style_code,
        rule_type: rule.rule_type,
        flat_rate: rule.flat_rate != null ? Number(rule.flat_rate) : null,
        priority: rule.priority,
        active: !rule.active,
        description: rule.description,
      },
      {
        onError: (e) => toast.error(`Could not toggle rule: ${e.message}`),
      },
    );
  };

  const handleDelete = () => {
    if (!confirm(`Delete rule for ${rule.style_code}? This restores default additive pricing for this style.`)) return;
    del.mutate(rule.id, {
      onError: (e) => toast.error(`Could not delete rule: ${e.message}`),
      onSuccess: () => toast.success(`Deleted rule for ${rule.style_code}`),
    });
  };

  const rate = rule.flat_rate != null ? Number(rule.flat_rate) : null;

  return (
    <div className={cn(
      "border rounded-xl p-3 bg-card transition-all flex items-center gap-3",
      rule.active ? "border-border" : "border-border/40 opacity-60",
    )}>
      <div className={cn(
        "p-2 rounded-lg shrink-0",
        rule.rule_type === "flat_override" ? "bg-amber-500/10 text-amber-700" : "bg-slate-500/10 text-slate-600",
      )}>
        <Zap className="w-4 h-4" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{styleName}</span>
          <code className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{rule.style_code}</code>
          <span className={cn(
            "text-[11px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded",
            rule.rule_type === "flat_override" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600",
          )}>
            {rule.rule_type === "flat_override" ? "Flat override" : "Additive"}
          </span>
          {rule.priority !== 0 && (
            <span className="text-[11px] text-muted-foreground">priority {rule.priority}</span>
          )}
        </div>
        {rule.rule_type === "flat_override" && rate != null && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Garment price = <span className="font-mono font-medium tabular-nums text-foreground">{rate.toFixed(3)} KD</span>. Other style options ignored.
          </p>
        )}
        {rule.description && (
          <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">{rule.description}</p>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <div className="flex items-center gap-1.5">
          <Switch checked={rule.active} onCheckedChange={toggleActive} disabled={upsert.isPending} />
        </div>
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onEdit}>
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={handleDelete} disabled={del.isPending}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ── Edit/Add Dialog ───────────────────────────────────────────────────────────

function RuleDialog({
  open,
  rule,
  brand,
  styles,
  onClose,
}: {
  open: boolean;
  rule: StylePricingRule | null;
  brand: Brand;
  styles: Style[];
  onClose: () => void;
}) {
  const upsert = useUpsertStylePricingRule();

  const [styleCode, setStyleCode] = useState(rule?.style_code ?? "");
  const [ruleType, setRuleType] = useState<StyleRuleType>(rule?.rule_type ?? "flat_override");
  const [flatRate, setFlatRate] = useState(rule?.flat_rate != null ? String(rule.flat_rate) : "");
  const [priority, setPriority] = useState(String(rule?.priority ?? 0));
  const [active, setActive] = useState(rule?.active ?? true);
  const [description, setDescription] = useState(rule?.description ?? "");

  // Reset form when dialog opens with a different rule
  const keyForReset = rule?.id ?? (open ? "new" : "closed");
  useResetForm(keyForReset, () => {
    setStyleCode(rule?.style_code ?? "");
    setRuleType(rule?.rule_type ?? "flat_override");
    setFlatRate(rule?.flat_rate != null ? String(rule.flat_rate) : "");
    setPriority(String(rule?.priority ?? 0));
    setActive(rule?.active ?? true);
    setDescription(rule?.description ?? "");
  });

  const handleSave = () => {
    if (!styleCode) {
      toast.error("Pick a style code");
      return;
    }
    if (ruleType === "flat_override") {
      const rate = parseFloat(flatRate);
      if (isNaN(rate) || rate < 0) {
        toast.error("Enter a valid flat rate (>= 0)");
        return;
      }
    }
    const priorityNum = parseInt(priority, 10);
    if (isNaN(priorityNum)) {
      toast.error("Priority must be a number");
      return;
    }

    const input: StylePricingRuleInput = {
      id: rule?.id,
      brand,
      style_code: styleCode,
      rule_type: ruleType,
      flat_rate: ruleType === "flat_override" ? parseFloat(flatRate) : null,
      priority: priorityNum,
      active,
      description: description.trim() || null,
    };

    upsert.mutate(input, {
      onSuccess: () => {
        toast.success(rule ? "Rule updated" : "Rule created");
        onClose();
      },
      onError: (e) => toast.error(`Could not save rule: ${e.message}`),
    });
  };

  // Thickness ("hashwa") rows are add-ons to their parent type, not independently
  // rule-able — exclude them from the tile grid entirely.
  const ADDON_COMPONENTS = new Set(["jabzour_thickness", "pocket_thickness", "cuffs_thickness"]);

  // Group tiles by garment part so the picker isn't one long flat grid.
  // Order matches the main pricing page.
  const PART_GROUPS: { label: string; components: string[] }[] = [
    { label: "Style & Lines", components: ["base", "lines"] },
    { label: "Collar",        components: ["collar_type", "collar_button", "collar_accessory"] },
    { label: "Jabzour",       components: ["jabzour_type"] },
    { label: "Front Pocket",  components: ["pocket_type"] },
    { label: "Side Pocket",   components: ["side_pocket_type"] },
    { label: "Cuffs",         components: ["cuffs_type"] },
  ];

  // Distinct rule-able style codes for this brand (addons excluded).
  const codeOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: { code: string; name: string; component: string | null }[] = [];
    for (const s of styles) {
      if (!s.code || seen.has(s.code)) continue;
      if (s.component && ADDON_COMPONENTS.has(s.component)) continue;
      seen.add(s.code);
      out.push({ code: s.code, name: s.name, component: s.component });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styles]);

  const [styleQuery, setStyleQuery] = useState("");
  useEffect(() => { if (!open) setStyleQuery(""); }, [open]);

  const filteredCodeOptions = useMemo(() => {
    const q = styleQuery.trim().toLowerCase();
    if (!q) return codeOptions;
    return codeOptions.filter((o) =>
      o.name.toLowerCase().includes(q) ||
      o.code.toLowerCase().includes(q) ||
      (o.component ?? "").toLowerCase().includes(q),
    );
  }, [codeOptions, styleQuery]);

  const selectedOption = codeOptions.find((o) => o.code === styleCode);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl h-[85vh] flex flex-col gap-4 overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>{rule ? "Edit Pricing Rule" : "Add Pricing Rule"}</DialogTitle>
        </DialogHeader>

        {/* Style picker — the only scrolling section. */}
        <div className="flex flex-col min-h-0 flex-1">
          <div className="flex items-center justify-between gap-3 mb-2 shrink-0">
            <Label className="text-xs font-medium">Style</Label>
            {!rule && (
              <div className="relative w-56">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={styleQuery}
                  onChange={(e) => setStyleQuery(e.target.value)}
                  placeholder="Search styles…"
                  className="h-8 pl-7 text-xs"
                />
              </div>
            )}
          </div>
          {rule ? (
            <div className="border border-border rounded-md p-3 flex items-center gap-3 bg-muted/30 shrink-0">
              <StyleThumb
                code={styleCode}
                alt={selectedOption?.name ?? styleCode}
                size="sm"
              />
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">
                  {selectedOption?.name ?? styleCode}
                </div>
              </div>
              <p className="ml-auto text-[11px] text-muted-foreground max-w-[18ch] text-right">
                Style cannot be changed. Delete and recreate to retarget.
              </p>
            </div>
          ) : filteredCodeOptions.length === 0 ? (
            <div className="border border-dashed border-border rounded-md p-6 text-center text-xs text-muted-foreground shrink-0">
              No styles match "{styleQuery}".
            </div>
          ) : (
            <div className="overflow-y-auto pr-1 min-h-0 flex-1 space-y-4">
              {PART_GROUPS.map((group) => {
                const items = filteredCodeOptions.filter(
                  (o) => o.component && group.components.includes(o.component),
                );
                if (items.length === 0) return null;
                return (
                  <section key={group.label}>
                    <div className="text-[11px] font-medium text-muted-foreground mb-2 sticky top-0 bg-background py-1">
                      {group.label}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {items.map((opt) => {
                        const selected = opt.code === styleCode;
                        return (
                          <button
                            key={opt.code}
                            type="button"
                            onClick={() => setStyleCode(opt.code)}
                            className={cn(
                              "relative text-left border rounded-md p-2 transition-colors self-start",
                              "hover:border-foreground/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              selected ? "border-primary ring-2 ring-primary/30 bg-primary/5" : "border-border",
                            )}
                          >
                            {selected && (
                              <span className="absolute top-1.5 right-1.5 bg-primary text-primary-foreground rounded-full w-4 h-4 flex items-center justify-center z-10">
                                <Check className="w-3 h-3" />
                              </span>
                            )}
                            <StyleThumb code={opt.code} alt={opt.name} />
                            <div className="mt-2 text-xs font-medium truncate">{opt.name}</div>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
              {/* Any style whose component is unknown to the group map — render under "Other" so nothing disappears. */}
              {(() => {
                const known = new Set(PART_GROUPS.flatMap((g) => g.components));
                const orphans = filteredCodeOptions.filter((o) => !o.component || !known.has(o.component));
                if (orphans.length === 0) return null;
                return (
                  <section>
                    <div className="text-[11px] font-medium text-muted-foreground mb-2 sticky top-0 bg-background py-1">
                      Other
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {orphans.map((opt) => {
                        const selected = opt.code === styleCode;
                        return (
                          <button
                            key={opt.code}
                            type="button"
                            onClick={() => setStyleCode(opt.code)}
                            className={cn(
                              "relative text-left border rounded-md p-2 transition-colors self-start",
                              "hover:border-foreground/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              selected ? "border-primary ring-2 ring-primary/30 bg-primary/5" : "border-border",
                            )}
                          >
                            {selected && (
                              <span className="absolute top-1.5 right-1.5 bg-primary text-primary-foreground rounded-full w-4 h-4 flex items-center justify-center z-10">
                                <Check className="w-3 h-3" />
                              </span>
                            )}
                            <StyleThumb code={opt.code} alt={opt.name} />
                            <div className="mt-2 text-xs font-medium truncate">{opt.name}</div>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })()}
            </div>
          )}
        </div>

        {/* Rule type */}
        <div className="shrink-0">
          <Label className="text-xs font-medium mb-2 block">Rule Type</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <RuleTypeCard
              selected={ruleType === "flat_override"}
              onSelect={() => setRuleType("flat_override")}
              title="Flat override"
              description="Garment style price = the flat rate. Other style options ignored. Stitching, express, and delivery still apply."
            />
            <RuleTypeCard
              selected={ruleType === "additive"}
              onSelect={() => setRuleType("additive")}
              title="Additive (default)"
              description="Add this style's rate to the garment. Use to disable an existing flat override."
            />
          </div>
        </div>

        {/* Numbers */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 shrink-0">
          {ruleType === "flat_override" ? (
            <div>
              <Label className="text-xs font-medium">Flat Rate (KD)</Label>
              <Input
                type="number"
                step="0.001"
                min="0"
                value={flatRate}
                onChange={(e) => setFlatRate(e.target.value)}
                onFocus={(e) => e.target.select()}
                className="h-9 font-mono"
                placeholder="e.g. 6.000"
              />
            </div>
          ) : (
            <div className="hidden sm:block" aria-hidden />
          )}
          <div>
            <Label className="text-xs font-medium">Priority</Label>
            <Input
              type="number"
              step="1"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              onFocus={(e) => e.target.select()}
              className="h-9 font-mono"
            />
            <p className="text-[11px] text-muted-foreground mt-1">Higher wins.</p>
          </div>
          <div>
            <Label className="text-xs font-medium">Active</Label>
            <div className="flex items-center h-9 gap-2">
              <Switch checked={active} onCheckedChange={setActive} />
              <span className="text-xs text-muted-foreground">{active ? "On" : "Off"}</span>
            </div>
          </div>
        </div>

        <div className="shrink-0">
          <Label className="text-xs font-medium">Description (optional)</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="When does this rule apply? Why?"
            rows={2}
          />
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={upsert.isPending}>
            {upsert.isPending ? "Saving…" : rule ? "Save Changes" : "Create Rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StyleThumb({ code, alt, size = "md" }: { code: string; alt: string; size?: "sm" | "md" }) {
  const box = size === "sm" ? "w-12 h-12" : "aspect-square w-full";
  const src = CODE_IMAGE[code];
  if (!src) {
    const glyph = (alt.trim()[0] ?? "?").toUpperCase();
    return (
      <div
        className={cn(
          box,
          "rounded-md bg-muted flex items-center justify-center text-muted-foreground/60 shrink-0 font-medium select-none",
          size === "sm" ? "text-base" : "text-3xl",
        )}
      >
        {glyph}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={cn(box, "rounded-md object-contain bg-muted shrink-0 p-1")}
    />
  );
}

function RuleTypeCard({
  selected,
  onSelect,
  title,
  description,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "text-left border rounded-md p-3 transition-colors relative",
        "hover:border-foreground/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-primary ring-2 ring-primary/30 bg-primary/5" : "border-border",
      )}
    >
      {selected && (
        <span className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full w-4 h-4 flex items-center justify-center">
          <Check className="w-3 h-3" />
        </span>
      )}
      <div className="text-sm font-medium pr-6">{title}</div>
      <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{description}</p>
    </button>
  );
}

// ── Helper: reset form state when a key changes ───────────────────────────────

function useResetForm(key: unknown, reset: () => void) {
  const prev = useRef(key);
  useEffect(() => {
    if (prev.current !== key) {
      prev.current = key;
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

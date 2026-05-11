import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Plus, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Switch } from "@repo/ui/switch";
import { Textarea } from "@repo/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@repo/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { cn } from "@/lib/utils";
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
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">
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
          <span className="font-semibold text-sm">{styleName}</span>
          <code className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{rule.style_code}</code>
          <span className={cn(
            "text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded",
            rule.rule_type === "flat_override" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600",
          )}>
            {rule.rule_type === "flat_override" ? "Flat override" : "Additive"}
          </span>
          {rule.priority !== 0 && (
            <span className="text-[10px] text-muted-foreground">priority {rule.priority}</span>
          )}
        </div>
        {rule.rule_type === "flat_override" && rate != null && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Garment price = <span className="font-mono font-bold tabular-nums text-foreground">{rate.toFixed(3)} KD</span>. Other style options ignored.
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

  // Distinct style codes for this brand
  const codeOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: { code: string; name: string; component: string | null }[] = [];
    for (const s of styles) {
      if (!s.code || seen.has(s.code)) continue;
      seen.add(s.code);
      out.push({ code: s.code, name: s.name, component: s.component });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [styles]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{rule ? "Edit Pricing Rule" : "Add Pricing Rule"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs font-semibold">Style Code</Label>
            <Select value={styleCode} onValueChange={setStyleCode} disabled={!!rule}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Pick a style…" />
              </SelectTrigger>
              <SelectContent>
                {codeOptions.map((opt) => (
                  <SelectItem key={opt.code} value={opt.code}>
                    <span className="font-medium">{opt.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{opt.code}</span>
                    {opt.component && (
                      <span className="ml-2 text-xs text-muted-foreground/60">· {opt.component}</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {rule && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Style code cannot be changed. Delete this rule and create a new one to target a different style.
              </p>
            )}
          </div>

          <div>
            <Label className="text-xs font-semibold">Rule Type</Label>
            <Select value={ruleType} onValueChange={(v) => setRuleType(v as StyleRuleType)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="flat_override">
                  Flat override — fixed price, ignore other style options
                </SelectItem>
                <SelectItem value="additive">
                  Additive — default behavior (sum of selected styles)
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground mt-1">
              {ruleType === "flat_override"
                ? "Garment style price = the flat rate below. Stitching, express, and delivery still apply."
                : "Use this to explicitly mark a style as additive (e.g. to disable an existing flat override)."}
            </p>
          </div>

          {ruleType === "flat_override" && (
            <div>
              <Label className="text-xs font-semibold">Flat Rate (KD)</Label>
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
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold">Priority</Label>
              <Input
                type="number"
                step="1"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                onFocus={(e) => e.target.select()}
                className="h-9 font-mono"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Higher wins.</p>
            </div>
            <div>
              <Label className="text-xs font-semibold">Active</Label>
              <div className="flex items-center h-9 gap-2">
                <Switch checked={active} onCheckedChange={setActive} />
                <span className="text-xs text-muted-foreground">{active ? "On" : "Off"}</span>
              </div>
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold">Description (optional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="When does this rule apply? Why?"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={upsert.isPending}>
            {upsert.isPending ? "Saving…" : rule ? "Save Changes" : "Create Rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

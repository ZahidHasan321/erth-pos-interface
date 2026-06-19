import { useState } from "react";
import { RotateCcw } from "lucide-react";
import type { Garment } from "@repo/database";
import { Button } from "@repo/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/select";
import { ConfirmationDialog } from "@repo/ui/confirmation-dialog";
import { cn } from "@/lib/utils";
import type {
  GarmentOverride,
  GarmentTag,
  MeasurementInPlay,
  StagedMeasurement,
} from "@/lib/feedback-overrides";
import { measurementReassignNeedsConfirm } from "@/lib/feedback-overrides";
import type { StyleFields } from "@/lib/feedback-finals";
import {
  jabzourToSelectValue,
  applyJabzourSelect,
  pickStyleFields,
} from "@/lib/feedback-finals";
import {
  collarTypes,
  collarButtons,
  jabzourTypes,
  topPocketTypes,
  cuffTypes,
  thicknessOptions,
} from "@/components/forms/fabric-selection-and-options/constants";

// Sentinel used in the Select to represent "keep current measurement (null)".
const KEEP_SENTINEL = "__keep__";

// ---------------------------------------------------------------------------
// GarmentTagLabel — the garment's per-order code (e.g. "12-1") plus a small
// type badge ("Final" / "Brova" / "Alt"). Replaces the old "Final 1" labels.
// ---------------------------------------------------------------------------

export function GarmentTagLabel({
  tag,
  className,
}: {
  tag: GarmentTag;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 min-w-0", className)}>
      <span className="font-mono text-sm font-semibold tabular-nums truncate">
        {tag.code}
      </span>
      <span
        className={cn(
          "shrink-0 rounded px-1 py-0.5 text-[11px] font-semibold uppercase leading-none tracking-wide",
          tag.type === "Brova" &&
            "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
          tag.type === "Final" &&
            "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
          tag.type === "Alteration" &&
            "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
        )}
      >
        {tag.type === "Alteration" ? "Alt" : tag.type}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// MeasurementOverrideSection
// ---------------------------------------------------------------------------

interface MeasurementOverrideSectionProps {
  targets: Garment[];
  sharedGroupIds: Set<string>;
  staged: StagedMeasurement | null;
  measurementsInPlay: MeasurementInPlay[];
  measurementLabel: (id: string | null) => string;
  garmentLabel: (id: string) => GarmentTag;
  garmentOverrides: Record<string, GarmentOverride>;
  readOnly: boolean;
  onOpenSheet: () => void;
  onSetMeasurement: (garmentId: string, assignment: string | null) => void;
  onApplyMeasurementToShared: () => void;
}

type MeasurementConfirmPending = {
  garmentId: string;
  next: string | null;
};

export function MeasurementOverrideSection({
  targets,
  sharedGroupIds,
  staged,
  measurementsInPlay,
  measurementLabel,
  garmentLabel,
  garmentOverrides,
  readOnly,
  onOpenSheet,
  onSetMeasurement,
  onApplyMeasurementToShared,
}: MeasurementOverrideSectionProps) {
  const [measurementConfirm, setMeasurementConfirm] =
    useState<MeasurementConfirmPending | null>(null);

  // Nothing to show until a correction stages a measurement.
  if (staged == null) return null;

  const stagedLocalIds = new Set([staged.localId]);

  function handleMeasurementChange(garmentId: string, value: string) {
    const next = value === KEEP_SENTINEL ? null : value;
    const current = garmentOverrides[garmentId]?.measurementAssignment ?? null;
    if (
      measurementReassignNeedsConfirm({ currentAssignment: current, nextAssignment: next, stagedLocalIds })
    ) {
      setMeasurementConfirm({ garmentId, next });
    } else {
      onSetMeasurement(garmentId, next);
    }
  }

  function confirmMeasurementReassign() {
    if (measurementConfirm) {
      onSetMeasurement(measurementConfirm.garmentId, measurementConfirm.next);
      setMeasurementConfirm(null);
    }
  }

  return (
    <div className="space-y-2">
      {/* Staged-measurement banner — single compact row */}
      <div className="flex items-center justify-between gap-3 rounded-md border border-amber-400/60 bg-amber-50/70 px-3 py-2 dark:border-amber-500/40 dark:bg-amber-950/20">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase leading-none tracking-wide text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            New measurement
          </span>
          {staged.derivedFromMeasurementId != null && (
            <span className="truncate text-sm font-medium text-amber-900 dark:text-amber-200">
              from {measurementLabel(staged.derivedFromMeasurementId)}
            </span>
          )}
          <span className="hidden shrink-0 text-xs text-amber-700/70 dark:text-amber-400/70 sm:inline">
            · saves on submit
          </span>
        </div>
        {!readOnly && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 shrink-0 border-amber-400/60 bg-amber-50 px-2 text-amber-900 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-200 dark:hover:bg-amber-900/40"
            onClick={onOpenSheet}
          >
            Verify
          </Button>
        )}
      </div>

      {/* Per-target measurement assignment grid */}
      <div className="rounded-lg border border-border bg-card">
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Measurement assignment</p>
            {!readOnly && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onApplyMeasurementToShared}
              >
                Apply to shared group
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-x-4 gap-y-2.5 px-4 py-3 sm:grid-cols-2 xl:grid-cols-3">
          {targets.map((g) => {
            const currentAssignment =
              garmentOverrides[g.id]?.measurementAssignment ?? null;
            const selectValue = currentAssignment ?? KEEP_SENTINEL;
            const isShared = sharedGroupIds.has(g.id);
            const showLineageHint =
              currentAssignment != null && currentAssignment === staged.localId;
            // "Keep current" surfaces the measurement the garment already carries.
            const ownLabel = g.measurement_id ? measurementLabel(g.measurement_id) : null;
            const keepLabel = ownLabel ? `Keep current (${ownLabel})` : "Keep current";

            return (
              <div key={g.id} className="flex items-start gap-2 min-w-0">
                {/* Content-sized (not a fixed w-28) so the garment code never gets
                    squeezed to "2…" once the FINAL badge + "shared" tag are present. */}
                <div className="flex items-center gap-1.5 shrink-0 pt-1.5">
                  <GarmentTagLabel tag={garmentLabel(g.id)} className="shrink-0" />
                  {isShared && (
                    <span className="text-xs text-muted-foreground shrink-0">shared</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  {readOnly ? (
                    <p className="text-sm text-muted-foreground pt-1.5">
                      {currentAssignment != null
                        ? measurementLabel(currentAssignment)
                        : keepLabel}
                    </p>
                  ) : (
                    <>
                      <Select
                        value={selectValue}
                        onValueChange={(v) => handleMeasurementChange(g.id, v)}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={KEEP_SENTINEL} className="text-sm">
                            {keepLabel}
                          </SelectItem>
                          {measurementsInPlay.map((m) => (
                            <SelectItem key={m.id} value={m.id} className="text-sm">
                              {measurementLabel(m.id)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {showLineageHint && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Adopts new measurement
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {targets.length === 0 && (
            <p className="col-span-full text-sm text-muted-foreground">
              No other garments to assign this measurement to.
            </p>
          )}
        </div>
      </div>

      {/* Measurement reassign confirmation (binary) */}
      <ConfirmationDialog
        isOpen={measurementConfirm != null}
        onClose={() => setMeasurementConfirm(null)}
        onConfirm={confirmMeasurementReassign}
        title="Reassign measurement?"
        description="You are moving this garment from one new measurement to a different new measurement. Confirm to proceed."
        confirmText="Reassign"
        cancelText="Cancel"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// FinalsCardOverride — per-attribute finals override strip rendered inside each
// style card so the override control sits directly under that card (§2.5).
// ---------------------------------------------------------------------------

const thicknessSelectOptions = thicknessOptions.map((t) => ({
  value: t.value,
  displayText: t.label,
}));

interface FinalsCardOverrideProps {
  optionId: string;
  finals: Garment[];
  garmentOverrides: Record<string, GarmentOverride>;
  garmentLabel: (id: string) => GarmentTag;
  brovaStyle: StyleFields;
  readOnly: boolean;
  onSetFinalStyle: (finalId: string, patch: StyleFields) => void;
}

type CardSelectOption = { value: string; displayText: string; image?: string | null };

function CardStyleSelect({
  label,
  value,
  options,
  onChange,
  className,
  originalValue,
}: {
  label?: string;
  value: string | null | undefined;
  options: CardSelectOption[];
  onChange: (v: string) => void;
  className?: string;
  // The final's own value for this field — flagged "(current)" in the list so
  // staff can see what they're changing from / reverting to.
  originalValue?: string | null;
}) {
  const selected = options.find((o) => o.value === value);
  return (
    <div className={cn("flex items-center gap-1.5 min-w-0", className)}>
      {label && <span className="text-xs text-muted-foreground shrink-0">{label}</span>}
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger className="h-9 text-sm flex-1 min-w-0">
          {selected ? (
            <span className="flex items-center gap-1.5 min-w-0">
              {selected.image && (
                <img src={selected.image} alt="" className="h-6 w-6 object-contain shrink-0" />
              )}
              <span className="truncate">{selected.displayText}</span>
            </span>
          ) : (
            <SelectValue placeholder="-" />
          )}
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-sm">
              <span className="flex items-center gap-2">
                {o.image && <img src={o.image} alt="" className="h-7 w-7 object-contain" />}
                {o.displayText}
                {originalValue != null && o.value === originalValue && (
                  <span className="text-xs text-muted-foreground ml-1">(current)</span>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function CardYesNo({
  value,
  onChange,
  original,
}: {
  value: boolean | null | undefined;
  onChange: (v: boolean) => void;
  // The final's own value — the matching button is tagged "(current)" so staff
  // see what they're changing from.
  original?: boolean | null;
}) {
  return (
    <div className="flex gap-1">
      {[
        { v: true, l: "Yes" },
        { v: false, l: "No" },
      ].map((o) => {
        const isOriginal = original != null && o.v === original;
        return (
          <button
            key={o.l}
            type="button"
            onClick={() => onChange(o.v)}
            className={cn(
              "flex-1 h-8 rounded-md border text-sm font-medium transition-colors",
              value === o.v
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border hover:bg-muted",
            )}
          >
            {o.l}
            {isOriginal && <span className="ml-1 text-xs font-normal opacity-70">(current)</span>}
          </button>
        );
      })}
    </div>
  );
}

function brovaFieldsForOption(optionId: string, brovaStyle: StyleFields): StyleFields {
  switch (optionId) {
    case "collar":
      return { collar_type: brovaStyle.collar_type ?? null, collar_thickness: brovaStyle.collar_thickness ?? null };
    case "collarBtn":
      return { collar_button: brovaStyle.collar_button ?? null };
    case "smallTabaggi":
      return { small_tabaggi: brovaStyle.small_tabaggi ?? null };
    case "jabzour":
      return {
        jabzour_1: brovaStyle.jabzour_1 ?? null,
        jabzour_2: brovaStyle.jabzour_2 ?? null,
        jabzour_thickness: brovaStyle.jabzour_thickness ?? null,
      };
    case "frontPocket":
      return { front_pocket_type: brovaStyle.front_pocket_type ?? null, front_pocket_thickness: brovaStyle.front_pocket_thickness ?? null };
    case "cuff":
      return { cuffs_type: brovaStyle.cuffs_type ?? null, cuffs_thickness: brovaStyle.cuffs_thickness ?? null };
    case "walletPocket":
      return { wallet_pocket: brovaStyle.wallet_pocket ?? null };
    case "penHolder":
      return { pen_holder: brovaStyle.pen_holder ?? null };
    case "mobilePocket":
      return { mobile_pocket: brovaStyle.mobile_pocket ?? null };
    case "lines":
      return { lines: brovaStyle.lines ?? null };
    default:
      return {};
  }
}

export function FinalsCardOverride({
  optionId,
  finals,
  garmentOverrides,
  garmentLabel,
  brovaStyle,
  readOnly,
  onSetFinalStyle,
}: FinalsCardOverrideProps) {
  if (finals.length === 0) return null;

  const brovaFields = brovaFieldsForOption(optionId, brovaStyle);
  const hasBrovaValue = Object.values(brovaFields).some((v) => v != null);

  function effectiveStyle(final: Garment): StyleFields {
    const override = garmentOverrides[final.id]?.styleOverride;
    return override ?? pickStyleFields(final);
  }

  // The final's OWN values for just this option's fields — what "reset" restores
  // and what's flagged "(original)" in the dropdowns.
  function ownForOption(final: Garment): StyleFields {
    return brovaFieldsForOption(optionId, pickStyleFields(final));
  }

  // True when this final's effective value for this option differs from its own.
  function isOverridden(final: Garment): boolean {
    const own = ownForOption(final);
    const eff = effectiveStyle(final);
    return (Object.keys(own) as (keyof StyleFields)[]).some(
      (k) => (eff[k] ?? null) !== (own[k] ?? null),
    );
  }

  function renderControl(final: Garment) {
    const eff = effectiveStyle(final);
    const own = pickStyleFields(final);

    switch (optionId) {
      case "collar":
        return (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <CardStyleSelect
              className="flex-1"
              value={eff.collar_type ?? null}
              originalValue={own.collar_type ?? null}
              options={collarTypes.map((o) => ({ value: o.value, displayText: o.displayText, image: o.image }))}
              onChange={(v) => onSetFinalStyle(final.id, { collar_type: v })}
            />
            <CardStyleSelect
              className="w-28 shrink-0"
              label="Hashwa"
              value={eff.collar_thickness ?? null}
              originalValue={own.collar_thickness ?? null}
              options={thicknessSelectOptions}
              onChange={(v) => onSetFinalStyle(final.id, { collar_thickness: v })}
            />
          </div>
        );
      case "collarBtn":
        return (
          <div className="flex-1 min-w-0">
            <CardStyleSelect
              value={eff.collar_button ?? null}
              originalValue={own.collar_button ?? null}
              options={collarButtons.map((o) => ({ value: o.value, displayText: o.displayText, image: o.image }))}
              onChange={(v) => onSetFinalStyle(final.id, { collar_button: v })}
            />
          </div>
        );
      case "smallTabaggi":
        return (
          <div className="flex-1 min-w-0">
            <CardYesNo
              value={eff.small_tabaggi}
              original={own.small_tabaggi}
              onChange={(v) => onSetFinalStyle(final.id, { small_tabaggi: v })}
            />
          </div>
        );
      case "jabzour": {
        const jabSelectVal = jabzourToSelectValue(eff);
        const isShaab = jabSelectVal === "JAB_SHAAB";
        const secondaryList = jabzourTypes.filter((o) => o.value !== "JAB_SHAAB");
        return (
          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <CardStyleSelect
                className="flex-1"
                value={jabSelectVal || null}
                originalValue={jabzourToSelectValue(own) || null}
                options={jabzourTypes.map((o) => ({ value: o.value, displayText: o.displayText, image: o.image }))}
                onChange={(v) => onSetFinalStyle(final.id, applyJabzourSelect(v))}
              />
              <CardStyleSelect
                className="w-28 shrink-0"
                label="Hashwa"
                value={eff.jabzour_thickness ?? null}
                originalValue={own.jabzour_thickness ?? null}
                options={thicknessSelectOptions}
                onChange={(v) => onSetFinalStyle(final.id, { jabzour_thickness: v })}
              />
            </div>
            {/* Shaab = Zipper → pick the style worn under the zipper (jabzour_2) */}
            {isShaab && (
              <CardStyleSelect
                label="Under zip"
                value={eff.jabzour_2 ?? null}
                originalValue={own.jabzour_1 === "ZIPPER" ? (own.jabzour_2 ?? null) : null}
                options={secondaryList.map((o) => ({ value: o.value, displayText: o.displayText, image: o.image }))}
                onChange={(v) => onSetFinalStyle(final.id, { jabzour_2: v })}
              />
            )}
          </div>
        );
      }
      case "frontPocket":
        return (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <CardStyleSelect
              className="flex-1"
              value={eff.front_pocket_type ?? null}
              originalValue={own.front_pocket_type ?? null}
              options={topPocketTypes.map((o) => ({ value: o.value, displayText: o.displayText, image: o.image }))}
              onChange={(v) => onSetFinalStyle(final.id, { front_pocket_type: v })}
            />
            <CardStyleSelect
              className="w-28 shrink-0"
              label="Hashwa"
              value={eff.front_pocket_thickness ?? null}
              originalValue={own.front_pocket_thickness ?? null}
              options={thicknessSelectOptions}
              onChange={(v) => onSetFinalStyle(final.id, { front_pocket_thickness: v })}
            />
          </div>
        );
      case "cuff":
        return (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <CardStyleSelect
              className="flex-1"
              value={eff.cuffs_type ?? null}
              originalValue={own.cuffs_type ?? null}
              options={cuffTypes.map((o) => ({ value: o.value, displayText: o.displayText, image: o.image }))}
              onChange={(v) => onSetFinalStyle(final.id, { cuffs_type: v })}
            />
            <CardStyleSelect
              className="w-28 shrink-0"
              label="Hashwa"
              value={eff.cuffs_thickness ?? null}
              originalValue={own.cuffs_thickness ?? null}
              options={thicknessSelectOptions}
              onChange={(v) => onSetFinalStyle(final.id, { cuffs_thickness: v })}
            />
          </div>
        );
      case "walletPocket":
        return (
          <div className="flex-1 min-w-0">
            <CardYesNo
              value={eff.wallet_pocket}
              original={own.wallet_pocket}
              onChange={(v) => onSetFinalStyle(final.id, { wallet_pocket: v })}
            />
          </div>
        );
      case "penHolder":
        return (
          <div className="flex-1 min-w-0">
            <CardYesNo
              value={eff.pen_holder}
              original={own.pen_holder}
              onChange={(v) => onSetFinalStyle(final.id, { pen_holder: v })}
            />
          </div>
        );
      case "mobilePocket":
        return (
          <div className="flex-1 min-w-0">
            <CardYesNo
              value={eff.mobile_pocket}
              original={own.mobile_pocket}
              onChange={(v) => onSetFinalStyle(final.id, { mobile_pocket: v })}
            />
          </div>
        );
      case "lines": {
        const linesVal = eff.lines != null ? String(eff.lines) : null;
        return (
          <div className="flex-1 min-w-0">
            <CardStyleSelect
              value={linesVal}
              originalValue={own.lines != null ? String(own.lines) : null}
              options={[
                { value: "1", displayText: "Single" },
                { value: "2", displayText: "Double" },
              ]}
              onChange={(v) => onSetFinalStyle(final.id, { lines: Number(v) as 1 | 2 })}
            />
          </div>
        );
      }
      default:
        return null;
    }
  }

  function renderReadOnly(final: Garment) {
    const eff = effectiveStyle(final);
    let text = "-";
    switch (optionId) {
      case "collar":
        text = [
          collarTypes.find((o) => o.value === eff.collar_type)?.displayText,
          eff.collar_thickness,
        ]
          .filter(Boolean)
          .join(" / ") || "-";
        break;
      case "collarBtn":
        text = collarButtons.find((o) => o.value === eff.collar_button)?.displayText ?? "-";
        break;
      case "smallTabaggi":
        text = eff.small_tabaggi == null ? "-" : eff.small_tabaggi ? "Yes" : "No";
        break;
      case "jabzour":
        text = jabzourTypes.find((o) => o.value === jabzourToSelectValue(eff))?.displayText ?? "-";
        break;
      case "frontPocket":
        text = topPocketTypes.find((o) => o.value === eff.front_pocket_type)?.displayText ?? "-";
        break;
      case "cuff":
        text = cuffTypes.find((o) => o.value === eff.cuffs_type)?.displayText ?? "-";
        break;
      case "walletPocket":
        text = eff.wallet_pocket == null ? "-" : eff.wallet_pocket ? "Yes" : "No";
        break;
      case "penHolder":
        text = eff.pen_holder == null ? "-" : eff.pen_holder ? "Yes" : "No";
        break;
      case "mobilePocket":
        text = eff.mobile_pocket == null ? "-" : eff.mobile_pocket ? "Yes" : "No";
        break;
      case "lines":
        text = eff.lines === 1 ? "Single" : eff.lines === 2 ? "Double" : "-";
        break;
    }
    return <span className="text-sm text-muted-foreground">{text}</span>;
  }

  // Controls with a secondary field (a Hashwa / under-zip select beside the main
  // picker) need a wider minimum cell; simple single-control options pack tighter.
  // auto-fill (not auto-fit) keeps cells at a sane width when there are only a few
  // finals, so a lone final never stretches to the full pane width.
  const wideControl = ["collar", "jabzour", "frontPocket", "cuff"].includes(optionId);
  const cellMin = wideControl ? "16rem" : "13rem";

  return (
    <div className="rounded-md border border-violet-500/25 bg-violet-500/5 p-2.5">
      <div className="flex items-center justify-between gap-2 mb-2 min-h-5">
        <span className="text-xs font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wide">Finals</span>
        {!readOnly && (
          <div className="flex items-center gap-3 shrink-0">
            {finals.some(isOverridden) && (
              <button
                type="button"
                onClick={() => {
                  for (const final of finals) onSetFinalStyle(final.id, ownForOption(final));
                }}
                className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
              >
                Reset all
              </button>
            )}
            {hasBrovaValue && (
              <button
                type="button"
                onClick={() => {
                  for (const final of finals) onSetFinalStyle(final.id, brovaFields);
                }}
                className="text-xs font-medium text-primary hover:underline"
              >
                Apply brova's value to all
              </button>
            )}
          </div>
        )}
      </div>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cellMin}, 1fr))` }}
      >
        {finals.map((final) => {
          const overridden = isOverridden(final);
          return (
            <div
              key={final.id}
              className={cn(
                "rounded-md border bg-muted/10 px-2 py-1.5 transition-colors",
                overridden ? "border-primary/40" : "border-border/50",
              )}
            >
              <div className="flex items-center justify-between gap-1 h-5 mb-1.5">
                <span className="font-mono text-sm font-semibold tabular-nums text-muted-foreground">
                  {garmentLabel(final.id).code}
                </span>
                {/* Reserved slot — fixed size whether or not the reset icon shows,
                    so toggling an override never reflows the cell or its neighbours. */}
                <span className="w-6 h-5 shrink-0 flex items-center justify-center">
                  {!readOnly && overridden && (
                    <button
                      type="button"
                      onClick={() => onSetFinalStyle(final.id, ownForOption(final))}
                      title="Reset to original"
                      aria-label="Reset to original"
                      className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <RotateCcw className="size-3.5" />
                    </button>
                  )}
                </span>
              </div>
              {readOnly ? renderReadOnly(final) : renderControl(final)}
            </div>
          );
        })}
      </div>
    </div>
  );
}


import { useMemo, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { ArrowRight, Check, Loader2, X, AlertTriangle, Star } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/dialog";
import { Skeleton } from "@repo/ui/skeleton";
import { parseMeasurementParts } from "@repo/database";

import { cn } from "@/lib/utils";
import { useSubmitQc } from "@/hooks/useGarmentMutations";
import { WorkerDropdown } from "@/components/shared/WorkerDropdown";
import { PIECE_STAGE_LABELS } from "@/lib/constants";
import {
  collarTypes,
  collarButtons,
  cuffTypes,
  jabzourTypes,
  topPocketTypes,
  thicknessOptions,
  smallTabaggiImage,
  penIcon,
  phoneIcon,
  walletIcon,
  type BaseOption,
} from "@/components/forms/add-garment/constants";
import {
  ImageOptionGrid,
  ThicknessPicker,
  IconToggle,
} from "@/components/forms/add-garment/StyleFields";
import {
  QC_MEASUREMENTS,
  QC_MEASUREMENT_GROUPS,
  QC_OPTIONS,
  QC_QUALITY,
  QC_RETURN_STAGES,
  QC_TOLERANCE,
  QC_QUALITY_THRESHOLD,
  evaluateQc,
  normalizeExpectedJabzour,
  type QcInputs,
  type QcOptionSpec,
} from "@/lib/qc-spec";

import type {
  WorkshopGarment,
  Measurement,
  PieceStage,
  ProductionPlan,
  TripHistoryEntry,
  QcAttempt,
} from "@repo/database";

interface Props {
  garment: WorkshopGarment;
  measurement: Measurement | null | undefined;
}

export function QualityCheckForm({ garment, measurement }: Props) {
  const router = useRouter();
  const submitMut = useSubmitQc();

  const plan = garment.production_plan as ProductionPlan | null;
  const plannedQC = plan?.quality_checker ?? "";

  // ── Rework mode detection ─────────────────────────────────────────────────
  // Find the most recent fail attempt in the current trip; if present, only
  // fields it flagged are re-checked. Previously-passing fields carry forward.
  const currentTrip = garment.trip_number ?? 1;
  const tripHistory = garment.trip_history as TripHistoryEntry[] | null;
  const tripEntry = tripHistory?.find((t) => t.trip === currentTrip);
  const lastFail: QcAttempt | undefined = tripEntry?.qc_attempts
    ?.filter((a) => a.result === "fail")
    .at(-1);

  const isRework = !!lastFail;
  const enabledKeys = useMemo(() => {
    if (!lastFail) {
      return new Set([
        ...QC_MEASUREMENTS.map((m) => m.key),
        ...QC_OPTIONS.map((o) => o.key),
        ...QC_QUALITY.map((q) => q.key),
      ]);
    }
    return new Set([
      ...(lastFail.failed_measurements ?? []),
      ...(lastFail.failed_options ?? []),
      ...(lastFail.failed_quality ?? []),
    ]);
  }, [lastFail]);

  const carryForward = lastFail ?? null;

  // ── Form state ────────────────────────────────────────────────────────────
  const [inspector, setInspector] = useState(plannedQC);
  const [overrideInspector, setOverrideInspector] = useState(false);

  const [measurements, setMeasurements] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    if (carryForward?.measurements) {
      for (const [k, v] of Object.entries(carryForward.measurements)) {
        if (v != null) init[k] = String(v);
      }
    }
    return init;
  });
  const [options, setOptions] = useState<Record<string, string | boolean | number | null>>(() => {
    return { ...(carryForward?.options ?? {}) };
  });
  const [quality, setQuality] = useState<Record<string, number>>(() => {
    return { ...(carryForward?.quality_ratings ?? {}) };
  });
  // Track which option fields the user has explicitly touched. Boolean toggles
  // can't be distinguished from "default false" via value alone, so we track
  // explicit interaction to avoid flashing red on untouched controls.
  const [touchedOptions, setTouchedOptions] = useState<Set<string>>(
    () => new Set(Object.keys(carryForward?.options ?? {})),
  );

  const setMeasurement = (key: string, val: string) =>
    setMeasurements((p) => ({ ...p, [key]: val }));
  const setOption = (key: string, val: string | boolean | number | null) => {
    setOptions((p) => ({ ...p, [key]: val }));
    setTouchedOptions((p) => {
      if (p.has(key)) return p;
      const next = new Set(p);
      next.add(key);
      return next;
    });
  };
  const setRating = (key: string, val: number) =>
    setQuality((p) => ({ ...p, [key]: val }));

  // ── Live evaluation (preview, also blocks submit when incomplete) ─────────
  const expectedMeasurements = (measurement ?? {}) as Record<string, unknown>;
  const expectedOptions: Record<string, unknown> = {};
  for (const o of QC_OPTIONS) expectedOptions[o.key] = (garment as any)[o.key];
  // jabzour_1/2 are stored in DB as enum + text; QC operator sees visual values.
  const j = normalizeExpectedJabzour(expectedOptions.jabzour_1, expectedOptions.jabzour_2);
  expectedOptions.jabzour_1 = j.jabzour_1;
  expectedOptions.jabzour_2 = j.jabzour_2;

  const numericInputs: QcInputs = useMemo(
    () => ({
      measurements: Object.fromEntries(
        Object.entries(measurements).map(([k, v]) => [k, Number(v)]),
      ),
      options,
      quality_ratings: quality,
    }),
    [measurements, options, quality],
  );

  const evaluation = useMemo(
    () => evaluateQc(expectedMeasurements, expectedOptions, numericInputs, enabledKeys),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [numericInputs, enabledKeys, garment, measurement],
  );

  // Completeness — every enabled input must have a value before submit.
  const missing: { key: string; label: string }[] = [];
  for (const m of QC_MEASUREMENTS) {
    if (!enabledKeys.has(m.key)) continue;
    const v = measurements[m.key];
    if (v == null || v === "" || !Number.isFinite(Number(v))) {
      missing.push({ key: m.key, label: m.label });
    }
  }
  for (const o of QC_OPTIONS) {
    if (!enabledKeys.has(o.key)) continue;
    if (o.type === "boolean") continue; // boolean default false is valid
    if (o.key === "lines") continue; // None is a valid choice
    // If the garment's expected value is null/empty, operator should leave it empty
    // too — forcing a value would cause a false mismatch (e.g. jabzour_1 not requested).
    const expected = expectedOptions[o.key];
    if (expected == null || expected === "") continue;
    if (options[o.key] == null || options[o.key] === "") {
      missing.push({ key: o.key, label: o.label });
    }
  }
  for (const q of QC_QUALITY) {
    if (!enabledKeys.has(q.key)) continue;
    if (!quality[q.key] || quality[q.key] < 1) {
      missing.push({ key: q.key, label: q.label });
    }
  }
  const canSubmit = !!inspector && missing.length === 0;

  // ── Submit flow ───────────────────────────────────────────────────────────
  const [failDialogOpen, setFailDialogOpen] = useState(false);
  const [returnStages, setReturnStages] = useState<Set<PieceStage>>(new Set());

  const handleSubmit = async () => {
    if (!canSubmit) return;

    // Re-eval right at submit (state already current).
    if (evaluation.result === "pass") {
      try {
        await submitMut.mutateAsync({
          id: garment.id,
          inspector,
          inputs: mergedInputsForSave(carryForward, enabledKeys, numericInputs),
          enabledKeys,
          returnStages: null,
        });
        toast.success(`${garment.garment_id} passed QC`);
        router.history.back();
      } catch (err: any) {
        toast.error(`QC submit failed: ${err?.message ?? "Unknown error"}`);
      }
    } else {
      // Pre-select stages from previous fail if rework, else empty.
      setReturnStages(new Set());
      setFailDialogOpen(true);
    }
  };

  const handleConfirmFail = async () => {
    if (returnStages.size === 0) return;
    try {
      await submitMut.mutateAsync({
        id: garment.id,
        inspector,
        inputs: mergedInputsForSave(carryForward, enabledKeys, numericInputs),
        enabledKeys,
        returnStages: [...returnStages],
      });
      const stageNames = QC_RETURN_STAGES
        .filter((s) => returnStages.has(s))
        .map((s) => PIECE_STAGE_LABELS[s as keyof typeof PIECE_STAGE_LABELS] ?? s)
        .join(" → ");
      toast.warning(`${garment.garment_id} returned to ${stageNames}`);
      setFailDialogOpen(false);
      router.history.back();
    } catch (err: any) {
      toast.error(`QC submit failed: ${err?.message ?? "Unknown error"}`);
    }
  };

  const toggleReturnStage = (s: PieceStage) =>
    setReturnStages((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  if (!measurement) {
    return (
      <div className="bg-card border rounded-xl p-4 shadow-sm">
        <Skeleton className="h-8 w-40 mb-3" />
        <p className="text-sm text-muted-foreground">
          Garment has no linked measurement snapshot — QC cannot proceed.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header — inspector + rework indicator */}
      <div className="bg-card border rounded-xl p-4 shadow-sm flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Quality Check
            {isRework && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-bold">
                <AlertTriangle className="w-3 h-3" />
                Rework — re-checking {enabledKeys.size} field
                {enabledKeys.size === 1 ? "" : "s"}
              </span>
            )}
          </h3>
          {inspector && !overrideInspector ? (
            <button
              onClick={() => setOverrideInspector(true)}
              className="flex items-center gap-2 text-sm cursor-pointer hover:opacity-80"
            >
              <span className="text-xs uppercase tracking-wider text-emerald-600 font-bold">
                Inspector
              </span>
              <span className="font-bold text-emerald-900">{inspector}</span>
              <span className="text-xs text-muted-foreground">(change)</span>
            </button>
          ) : (
            <WorkerDropdown
              responsibility="quality_check"
              value={inspector}
              onChange={(v) => {
                setInspector(v);
                setOverrideInspector(false);
              }}
              placeholder="QC Inspector"
            />
          )}
        </div>
      </div>

      {/* Step 1 — Measurements */}
      <SectionCard title="Step 1 — Measurements" subtitle={`Tolerance ±${QC_TOLERANCE}"`}>
        {QC_MEASUREMENT_GROUPS.map((group) => (
          <MeasurementTable
            key={group.title}
            title={group.title}
            keys={group.keys}
            values={measurements}
            enabledKeys={enabledKeys}
            failedKeys={new Set(evaluation.failed_measurements)}
            onChange={setMeasurement}
          />
        ))}
      </SectionCard>

      {/* Step 2 — Options */}
      <SectionCard title="Step 2 — Options">
        <OptionGroups
          values={options}
          enabledKeys={enabledKeys}
          failedKeys={new Set(evaluation.failed_options)}
          touchedKeys={touchedOptions}
          onChange={setOption}
        />
      </SectionCard>

      {/* Step 3 — Quality */}
      <SectionCard title="Step 3 — Quality" subtitle={`Score 1-5 (≥${QC_QUALITY_THRESHOLD} passes)`}>
        <QualityTable
          values={quality}
          enabledKeys={enabledKeys}
          failedKeys={new Set(evaluation.failed_quality)}
          onChange={setRating}
        />
      </SectionCard>

      {/* Submit */}
      <div className="bg-card border rounded-xl p-4 shadow-sm space-y-3">
        {!inspector && (
          <p className="text-xs text-red-600 font-medium">Select inspector to submit.</p>
        )}
        {missing.length > 0 && (
          <details className="text-xs">
            <summary className="font-medium text-red-600 cursor-pointer select-none">
              {missing.length} field{missing.length === 1 ? "" : "s"} pending — show
            </summary>
            <p className="mt-1 text-muted-foreground leading-relaxed">
              {missing.map((m) => m.label).join(", ")}
            </p>
          </details>
        )}
        <Button
          className="w-full h-12 text-base font-bold"
          disabled={!canSubmit || submitMut.isPending}
          onClick={handleSubmit}
        >
          {submitMut.isPending ? (
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          ) : null}
          Submit QC
        </Button>
      </div>

      {/* Fail dialog — show report + stage picker */}
      <Dialog open={failDialogOpen} onOpenChange={setFailDialogOpen}>
        <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3 bg-red-50/60 border-b border-red-100">
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-red-900">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              Failed QC — return to production
            </DialogTitle>
            <p className="text-xs text-red-800/80 mt-0.5">
              {garment.garment_id} · review the issues below, then pick which stages to send the
              piece back through.
            </p>
          </DialogHeader>

          <div className="px-5 py-4 max-h-[55vh] overflow-y-auto">
            <FailReport
              evaluation={evaluation}
              expectedMeasurements={expectedMeasurements}
              expectedOptions={expectedOptions}
              inputs={numericInputs}
            />
          </div>

          <div className="px-5 py-3 border-t bg-muted/30">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Return through stages
              </label>
              <span className="text-[11px] text-muted-foreground">
                {returnStages.size} selected
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {QC_RETURN_STAGES.map((s) => {
                const selected = returnStages.has(s);
                const label = PIECE_STAGE_LABELS[s as keyof typeof PIECE_STAGE_LABELS] ?? s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleReturnStage(s)}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors",
                      selected
                        ? "border-red-500 bg-red-100 text-red-900"
                        : "border-zinc-300 bg-background text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {selected && <Check className="w-3 h-3" />}
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <DialogFooter className="px-5 py-3 border-t">
            <Button variant="outline" onClick={() => setFailDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={returnStages.size === 0 || submitMut.isPending}
              onClick={handleConfirmFail}
            >
              {submitMut.isPending ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <X className="w-4 h-4 mr-1.5" />
              )}
              Send Back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Subcomponents ───────────────────────────────────────────────────────────

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card border rounded-xl p-4 shadow-sm">
      <div className="flex items-baseline justify-between mb-3">
        <h4 className="text-sm font-bold">{title}</h4>
        {subtitle && (
          <span className="text-xs text-muted-foreground">{subtitle}</span>
        )}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

// Multi-column measurement table — POS-style. Header row = label, then a
// decimal input row, then a fraction preview row. One <table> per group.
function MeasurementTable({
  title,
  keys,
  values,
  enabledKeys,
  failedKeys,
  onChange,
}: {
  title: string;
  keys: string[];
  values: Record<string, string>;
  enabledKeys: Set<string>;
  failedKeys: Set<string>;
  onChange: (key: string, val: string) => void;
}) {
  return (
    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden p-3">
      {title && <h4 className="text-sm font-semibold pb-2 text-foreground">{title}</h4>}
      <table className="w-full border-collapse table-fixed">
        <thead>
          <tr className="border-t border-border">
            {keys.map((key) => {
              const spec = QC_MEASUREMENTS.find((m) => m.key === key)!;
              return (
                <th
                  key={key}
                  className="border border-border px-1.5 py-1.5 text-[10px] text-muted-foreground font-semibold text-center leading-tight bg-muted/40"
                >
                  {spec.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {/* Decimal input row */}
          <tr>
            {keys.map((key) => {
              const enabled = enabledKeys.has(key);
              const measuredVal = values[key] ?? "";
              const measuredNum = Number(measuredVal);
              const hasValue = measuredVal !== "" && Number.isFinite(measuredNum);
              const isFailed = hasValue && failedKeys.has(key);
              return (
                <td key={key} className="border border-border px-1 py-1">
                  <Input
                    type="number"
                    step="0.125"
                    inputMode="decimal"
                    disabled={!enabled}
                    value={measuredVal}
                    onChange={(e) => onChange(key, e.target.value)}
                    className={cn(
                      "h-8 w-full text-center tabular-nums bg-transparent border-0 shadow-none px-1 focus:ring-1 focus:ring-primary",
                      !enabled && "bg-muted/30 text-muted-foreground",
                      isFailed && "ring-1 ring-red-400",
                    )}
                    placeholder="—"
                  />
                </td>
              );
            })}
          </tr>
          {/* Fraction row */}
          <tr>
            {keys.map((key) => {
              const measuredVal = values[key] ?? "";
              const measuredNum = measuredVal === "" ? null : Number(measuredVal);
              return (
                <td
                  key={key}
                  className="border border-border px-1 py-1 bg-muted/20 text-center"
                >
                  <div className="h-5 flex items-center justify-center">
                    {measuredNum != null && Number.isFinite(measuredNum) && (
                      <FractionPreview value={measuredNum} />
                    )}
                  </div>
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function FractionPreview({ value }: { value: number }) {
  const p = parseMeasurementParts(value);
  if (!p) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
      {p.negative && <span>-</span>}
      {(p.whole > 0 || p.numerator === 0) && <span>{p.whole}</span>}
      {p.numerator > 0 && (
        <span className="inline-flex flex-col items-center leading-none ml-0.5">
          <span className="text-[9px]">{p.numerator}</span>
          <span className="block h-px w-full bg-current" />
          <span className="text-[9px]">{p.denominator}</span>
        </span>
      )}
      {p.hasDegree && <span>°</span>}
    </span>
  );
}

// Style options grouped by garment area. Mirrors add-garment layout:
// thickness ("hashwa") sits inline with the part it belongs to; jabzour 1+2
// share a card; accessories (small_tabaggi/wallet/pen/mobile) are icon toggles.
function OptionGroups({
  values,
  failedKeys,
  touchedKeys,
  onChange,
}: {
  values: Record<string, string | boolean | number | null>;
  enabledKeys: Set<string>;
  failedKeys: Set<string>;
  touchedKeys: Set<string>;
  onChange: (key: string, val: string | boolean | number | null) => void;
}) {
  const text = (k: string) =>
    values[k] == null || values[k] === "" ? null : String(values[k]);
  const bool = (k: string) => Boolean(values[k]);
  // Only flag a field as failed in the live preview once the user has touched
  // it — keeps a fresh page from glowing red on every option.
  const failed = (k: string) => failedKeys.has(k) && touchedKeys.has(k);

  return (
    <div className="space-y-3">
      <OptionGroup title="Collar">
        <SubLabel failed={failed("collar_type")}>Type</SubLabel>
        <FailWrap failed={failed("collar_type")}>
          <ImageOptionGrid
            options={collarTypes}
            value={text("collar_type")}
            onChange={(v) => onChange("collar_type", v)}
            allowClear
          />
        </FailWrap>
        <SubLabel failed={failed("collar_button")}>Button</SubLabel>
        <FailWrap failed={failed("collar_button")}>
          <ImageOptionGrid
            options={collarButtons}
            value={text("collar_button")}
            onChange={(v) => onChange("collar_button", v)}
            allowClear
          />
        </FailWrap>
        <div className="flex flex-wrap gap-2">
          <FailWrap failed={failed("small_tabaggi")} inline>
            <IconToggle
              checked={bool("small_tabaggi")}
              onChange={(v) => onChange("small_tabaggi", v)}
              icon={smallTabaggiImage}
              label="Small Tabaggi"
            />
          </FailWrap>
        </div>
        <SubLabel failed={failed("collar_position")}>Position</SubLabel>
        <FailWrap failed={failed("collar_position")}>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={text("collar_position") === "up"}
                onChange={(e) => onChange("collar_position", e.target.checked ? "up" : null)}
              />
              UP
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={text("collar_position") === "down"}
                onChange={(e) => onChange("collar_position", e.target.checked ? "down" : null)}
              />
              DOWN
            </label>
          </div>
        </FailWrap>
        <div className="flex items-center gap-2">
          <SubLabel className="mb-0" failed={failed("collar_thickness")}>Thickness</SubLabel>
          <FailWrap failed={failed("collar_thickness")} inline>
            <ThicknessPicker
              value={text("collar_thickness")}
              onChange={(v) => onChange("collar_thickness", v)}
            />
          </FailWrap>
        </div>
      </OptionGroup>

      <OptionGroup title="Jabzour">
        <SubLabel failed={failed("jabzour_1")}>Type 1</SubLabel>
        <FailWrap failed={failed("jabzour_1")}>
          <ImageOptionGrid
            options={jabzourTypes}
            value={text("jabzour_1")}
            onChange={(v) => {
              onChange("jabzour_1", v);
              if (v !== "JAB_SHAAB" && values.jabzour_2 != null) {
                onChange("jabzour_2", null);
              }
            }}
            allowClear
          />
        </FailWrap>
        {(text("jabzour_1") === "JAB_SHAAB" || text("jabzour_2") != null) && (
          <>
            <SubLabel failed={failed("jabzour_2")}>
              Type 2{" "}
              {text("jabzour_1") === "JAB_SHAAB" ? (
                <span className="text-red-600">*</span>
              ) : (
                <span className="text-amber-600">
                  (clear — only used when Type 1 is Shaab)
                </span>
              )}
            </SubLabel>
            <FailWrap failed={failed("jabzour_2")}>
              <ImageOptionGrid
                options={jabzourTypes.filter((j) => j.value !== "JAB_SHAAB")}
                value={text("jabzour_2")}
                onChange={(v) => onChange("jabzour_2", v)}
                allowClear
              />
            </FailWrap>
          </>
        )}
        <div className="flex items-center gap-2">
          <SubLabel className="mb-0" failed={failed("jabzour_thickness")}>Thickness</SubLabel>
          <FailWrap failed={failed("jabzour_thickness")} inline>
            <ThicknessPicker
              value={text("jabzour_thickness")}
              onChange={(v) => onChange("jabzour_thickness", v)}
            />
          </FailWrap>
        </div>
      </OptionGroup>

      <OptionGroup title="Front pocket">
        <SubLabel failed={failed("front_pocket_type")}>Type</SubLabel>
        <FailWrap failed={failed("front_pocket_type")}>
          <ImageOptionGrid
            options={topPocketTypes}
            value={text("front_pocket_type")}
            onChange={(v) => onChange("front_pocket_type", v)}
            allowClear
          />
        </FailWrap>
        <div className="flex items-center gap-2">
          <SubLabel className="mb-0" failed={failed("front_pocket_thickness")}>Thickness</SubLabel>
          <FailWrap failed={failed("front_pocket_thickness")} inline>
            <ThicknessPicker
              value={text("front_pocket_thickness")}
              onChange={(v) => onChange("front_pocket_thickness", v)}
            />
          </FailWrap>
        </div>
        <SubLabel>Accessories</SubLabel>
        <div className="flex flex-wrap gap-2">
          <FailWrap failed={failed("wallet_pocket")} inline>
            <IconToggle
              checked={bool("wallet_pocket")}
              onChange={(v) => onChange("wallet_pocket", v)}
              icon={walletIcon}
              label="Wallet"
            />
          </FailWrap>
          <FailWrap failed={failed("pen_holder")} inline>
            <IconToggle
              checked={bool("pen_holder")}
              onChange={(v) => onChange("pen_holder", v)}
              icon={penIcon}
              label="Pen"
            />
          </FailWrap>
          <FailWrap failed={failed("mobile_pocket")} inline>
            <IconToggle
              checked={bool("mobile_pocket")}
              onChange={(v) => onChange("mobile_pocket", v)}
              icon={phoneIcon}
              label="Mobile"
            />
          </FailWrap>
        </div>
      </OptionGroup>

      <OptionGroup title="Cuffs">
        <SubLabel failed={failed("cuffs_type")}>Type</SubLabel>
        <FailWrap failed={failed("cuffs_type")}>
          <ImageOptionGrid
            options={cuffTypes}
            value={text("cuffs_type")}
            onChange={(v) => onChange("cuffs_type", v)}
            allowClear
          />
        </FailWrap>
        <div className="flex items-center gap-2">
          <SubLabel className="mb-0" failed={failed("cuffs_thickness")}>Thickness</SubLabel>
          <FailWrap failed={failed("cuffs_thickness")} inline>
            <ThicknessPicker
              value={text("cuffs_thickness")}
              onChange={(v) => onChange("cuffs_thickness", v)}
            />
          </FailWrap>
        </div>
      </OptionGroup>

      <OptionGroup title="Lines">
        <FailWrap failed={failed("lines")} inline>
          <LinesPicker
            value={typeof values.lines === "number" ? values.lines : null}
            onChange={(v) => onChange("lines", v)}
          />
        </FailWrap>
      </OptionGroup>
    </div>
  );
}

function FailWrap({
  failed,
  inline,
  children,
}: {
  failed?: boolean;
  inline?: boolean;
  children: React.ReactNode;
}) {
  if (!failed) return <>{children}</>;
  return (
    <div
      className={cn(
        "rounded-lg ring-1 ring-red-300 bg-red-50/40 p-1.5",
        inline && "inline-block",
      )}
    >
      {children}
    </div>
  );
}

function OptionGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-background p-3 space-y-2">
      <h5 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {title}
      </h5>
      {children}
    </div>
  );
}

function SubLabel({
  children,
  className,
  failed,
}: {
  children: React.ReactNode;
  className?: string;
  failed?: boolean;
}) {
  return (
    <div
      className={cn(
        "text-[11px] font-medium mb-1",
        failed ? "text-red-600 font-semibold" : "text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

function LinesPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const options: { value: number | null; label: string }[] = [
    { value: null, label: "None" },
    { value: 1, label: "1" },
    { value: 2, label: "2" },
  ];
  return (
    <div className="inline-flex rounded-lg border bg-background p-0.5">
      {options.map((o) => (
        <button
          key={o.label}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "px-4 py-1.5 rounded-md text-sm font-bold transition-colors",
            value === o.value
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function QualityTable({
  values,
  enabledKeys,
  failedKeys,
  onChange,
}: {
  values: Record<string, number>;
  enabledKeys: Set<string>;
  failedKeys: Set<string>;
  onChange: (key: string, val: number) => void;
}) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <tbody>
          {QC_QUALITY.map((q) => {
            const enabled = enabledKeys.has(q.key);
            const score = values[q.key] ?? 0;
            const isFailed = failedKeys.has(q.key) && score >= 1;
            return (
              <tr key={q.key} className="border-t first:border-t-0">
                <td className="px-3 py-2 font-medium">{q.label}</td>
                <td className="px-3 py-2 text-right">
                  <RatingPicker
                    value={score}
                    disabled={!enabled}
                    failed={isFailed}
                    onChange={(v) => onChange(q.key, v)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RatingPicker({
  value,
  disabled,
  failed,
  onChange,
}: {
  value: number;
  disabled: boolean;
  failed: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => onChange(n)}
          className={cn(
            "p-0.5 transition-all",
            disabled && "opacity-40 cursor-not-allowed",
            !disabled && "hover:scale-110",
          )}
        >
          <Star
            className={cn(
              "w-7 h-7",
              n <= value
                ? failed
                  ? "fill-red-500 text-red-500"
                  : "fill-amber-500 text-amber-500"
                : "text-zinc-300",
            )}
          />
        </button>
      ))}
    </div>
  );
}

// Map garment option keys to their image-bearing option arrays so we can
// render visual chips instead of raw enum values like "COL_DOWN_COLLAR".
const OPTION_IMAGE_LOOKUP: Record<string, BaseOption[]> = {
  collar_type: collarTypes,
  collar_button: collarButtons,
  jabzour_1: jabzourTypes,
  jabzour_2: jabzourTypes,
  front_pocket_type: topPocketTypes,
  cuffs_type: cuffTypes,
};

function FailReport({
  evaluation,
  expectedMeasurements,
  expectedOptions,
  inputs,
}: {
  evaluation: ReturnType<typeof evaluateQc>;
  expectedMeasurements: Record<string, unknown>;
  expectedOptions: Record<string, unknown>;
  inputs: QcInputs;
}) {
  const m = evaluation.failed_measurements.length;
  const o = evaluation.failed_options.length;
  const q = evaluation.failed_quality.length;
  if (m + o + q === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {m > 0 && <SummaryPill count={m} label={m === 1 ? "measurement" : "measurements"} />}
        {o > 0 && <SummaryPill count={o} label={o === 1 ? "option" : "options"} />}
        {q > 0 && <SummaryPill count={q} label="quality" />}
      </div>

      {m > 0 && (
        <ReportSection title="Measurements out of tolerance" hint={`±${QC_TOLERANCE}"`}>
          <div className="rounded-lg border border-red-200 bg-red-50/40 divide-y divide-red-100">
            {evaluation.failed_measurements.map((k) => {
              const spec = QC_MEASUREMENTS.find((mm) => mm.key === k)!;
              const exp = Number(expectedMeasurements[k]);
              const got = Number(inputs.measurements[k]);
              const diff =
                Number.isFinite(got) && Number.isFinite(exp) ? got - exp : null;
              return (
                <div
                  key={k}
                  className="flex items-center gap-3 px-3 py-2"
                >
                  <span className="text-xs font-semibold uppercase tracking-wider text-foreground flex-1 min-w-0 truncate">
                    {spec.label}
                  </span>
                  <MeasurementValue value={exp} muted />
                  <ArrowRight className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  <MeasurementValue value={got} highlight />
                  {diff != null && (
                    <span className="text-[11px] font-bold tabular-nums text-red-600 min-w-[52px] text-right">
                      {diff > 0 ? "+" : ""}
                      {diff.toFixed(3).replace(/\.?0+$/, "")}
                      {"\""}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </ReportSection>
      )}

      {o > 0 && (
        <ReportSection title="Mismatched options">
          <div className="grid grid-cols-1 gap-2">
            {evaluation.failed_options.map((k) => {
              const spec = QC_OPTIONS.find((oo) => oo.key === k)!;
              return (
                <OptionFailRow
                  key={k}
                  spec={spec}
                  expected={expectedOptions[k]}
                  got={inputs.options[k]}
                />
              );
            })}
          </div>
        </ReportSection>
      )}

      {q > 0 && (
        <ReportSection
          title="Quality below threshold"
          hint={`< ${QC_QUALITY_THRESHOLD}/5`}
        >
          <div className="rounded-lg border border-red-200 bg-red-50/40 divide-y divide-red-100">
            {evaluation.failed_quality.map((k) => {
              const spec = QC_QUALITY.find((qq) => qq.key === k)!;
              const score = inputs.quality_ratings[k] ?? 0;
              return (
                <div
                  key={k}
                  className="flex items-center gap-3 px-3 py-2"
                >
                  <span className="text-xs font-semibold uppercase tracking-wider flex-1 min-w-0 truncate">
                    {spec.label}
                  </span>
                  <div className="inline-flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        className={cn(
                          "w-4 h-4",
                          n <= score
                            ? "fill-red-500 text-red-500"
                            : "text-zinc-300",
                        )}
                      />
                    ))}
                  </div>
                  <span className="text-xs font-bold tabular-nums text-red-600 min-w-[28px] text-right">
                    {score}/5
                  </span>
                </div>
              );
            })}
          </div>
        </ReportSection>
      )}
    </div>
  );
}

function SummaryPill({ count, label }: { count: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-800 px-2.5 py-1 text-[11px] font-bold">
      <span className="tabular-nums">{count}</span>
      <span className="font-medium opacity-80">{label}</span>
    </span>
  );
}

function ReportSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-1.5">
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {title}
        </h4>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function MeasurementValue({
  value,
  muted,
  highlight,
}: {
  value: number;
  muted?: boolean;
  highlight?: boolean;
}) {
  if (!Number.isFinite(value)) {
    return <span className="text-xs text-muted-foreground italic">—</span>;
  }
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center min-w-[64px] h-7 px-2 rounded-md text-xs font-mono tabular-nums",
        muted && "bg-background border text-muted-foreground",
        highlight && "bg-red-100 border border-red-300 text-red-900 font-bold",
      )}
    >
      <FractionPreview value={value} />
    </span>
  );
}

function OptionFailRow({
  spec,
  expected,
  got,
}: {
  spec: QcOptionSpec;
  expected: unknown;
  got: unknown;
}) {
  const visual = OPTION_IMAGE_LOOKUP[spec.key];

  return (
    <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50/40 px-3 py-2">
      <span className="text-xs font-semibold uppercase tracking-wider flex-1 min-w-0 truncate">
        {spec.label}
      </span>
      {visual ? (
        <>
          <ImageOptionChip option={visual.find((b) => b.value === expected)} muted />
          <ArrowRight className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <ImageOptionChip option={visual.find((b) => b.value === got)} highlight />
        </>
      ) : (
        <>
          <TextOptionChip label={formatOptionText(spec, expected)} muted />
          <ArrowRight className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <TextOptionChip label={formatOptionText(spec, got)} highlight />
        </>
      )}
    </div>
  );
}

function ImageOptionChip({
  option,
  muted,
  highlight,
}: {
  option: BaseOption | undefined;
  muted?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-0.5 rounded-md p-1 min-w-[68px]",
        muted && "bg-background border",
        highlight && "bg-red-100 border border-red-300",
      )}
    >
      {option?.image ? (
        <img
          src={option.image}
          alt={option.alt ?? option.displayText}
          className="h-9 w-9 object-contain"
        />
      ) : (
        <div className="h-9 w-9 rounded bg-muted flex items-center justify-center text-[9px] text-muted-foreground font-semibold uppercase">
          None
        </div>
      )}
      <span
        className={cn(
          "text-[10px] font-medium leading-tight text-center",
          muted && "text-muted-foreground",
          highlight && "text-red-900 font-bold",
        )}
      >
        {option?.displayText ?? "—"}
      </span>
    </div>
  );
}

function TextOptionChip({
  label,
  muted,
  highlight,
}: {
  label: string;
  muted?: boolean;
  highlight?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center min-w-[60px] h-7 px-2.5 rounded-md text-xs font-medium",
        muted && "bg-background border text-muted-foreground",
        highlight && "bg-red-100 border border-red-300 text-red-900 font-bold",
      )}
    >
      {label}
    </span>
  );
}

function formatOptionText(spec: QcOptionSpec, val: unknown): string {
  if (spec.type === "boolean") return val ? "Yes" : "No";
  if (val == null || val === "") return "—";
  if (spec.key.endsWith("_thickness")) {
    const t = thicknessOptions.find((opt) => opt.value === val);
    if (t) return t.full;
  }
  if (spec.key === "lines") return String(val);
  return String(val);
}

/**
 * Compose the inputs to persist. For fields the operator just (re)entered we
 * use the new values; for fields not enabled this attempt (rework with passed
 * fields), we carry forward whatever was recorded last time so the saved
 * attempt is a complete snapshot. This keeps the audit trail consistent.
 */
function mergedInputsForSave(
  carryForward: QcAttempt | null,
  enabledKeys: Set<string>,
  current: QcInputs,
): QcInputs {
  if (!carryForward) return current;
  const merged: QcInputs = {
    measurements: { ...(carryForward.measurements ?? {}) },
    options: { ...(carryForward.options ?? {}) },
    quality_ratings: { ...(carryForward.quality_ratings ?? {}) },
  };
  for (const k of Object.keys(current.measurements)) {
    if (enabledKeys.has(k)) merged.measurements[k] = current.measurements[k]!;
  }
  for (const k of Object.keys(current.options)) {
    if (enabledKeys.has(k)) merged.options[k] = current.options[k]!;
  }
  for (const k of Object.keys(current.quality_ratings)) {
    if (enabledKeys.has(k)) merged.quality_ratings[k] = current.quality_ratings[k]!;
  }
  return merged;
}

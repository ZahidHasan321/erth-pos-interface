import { useEffect, useMemo, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { ArrowRight, Ban, Loader2, X, AlertTriangle, Star } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/select";
import { ShoulderSlopeSelect, ShoulderSlopeDisplay, type ShoulderSlopeValue } from "@repo/ui/shoulder-slope";
import { parseMeasurementParts } from "@repo/database";

import { cn } from "@/lib/utils";
import { useSubmitQc } from "@/hooks/useGarmentMutations";
import { WorkerDropdown } from "@/components/shared/WorkerDropdown";
import { StageChip } from "@/components/shared/plan-dialog-shared";
import { PIECE_STAGE_LABELS, STAGE_TO_PLAN_KEY } from "@/lib/constants";
import { getStageShape } from "@/lib/stage-shape";
import { QC_OPTION_TO_SECTION } from "@/lib/qc-corrections";
import { deriveReworkEnabledKeys } from "@/lib/production-logic";
import type { AlterationFilter } from "@/lib/alteration-filter";
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
  YesNoToggle,
  CollarPositionPicker,
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
  deriveExpectedQcOptions,
  type QcInputs,
  type QcOptionSpec,
  type CollarPosition,
} from "@/lib/qc-spec";

import type {
  WorkshopGarment,
  Measurement,
  PieceStage,
  ProductionPlan,
  TripHistoryEntry,
  QcAttempt,
  QcDefectAttribution,
} from "@repo/database";

/** Defect category → which failed_* list it came from. Keys the attribution state. */
type QcDefectCategory = QcDefectAttribution["category"];
const attrId = (category: QcDefectCategory, key: string) => `${category}:${key}`;

/** One garment contributor a QC defect can be blamed on (§6). Soaking (a water
 *  dunk) and QC (the inspection itself) are never attributable, so only the four
 *  production stages appear; sewing resolves to a unit, the rest to individuals. */
interface QcContributor {
  stage: QcDefectAttribution["stage"];
  scope: QcDefectAttribution["scope"];
  /** Resolved worker/unit name for this trip, or null when none on record. */
  name: string | null;
  /** Stage label, e.g. "Sewing". */
  label: string;
}

const QC_ATTRIBUTION_STAGES: QcDefectAttribution["stage"][] = [
  "cutting",
  "sewing",
  "finishing",
  "ironing",
];

/** Resolve who did each attributable stage on this trip: actual worker_history
 *  first, production_plan as fallback. Scope (worker vs unit) comes from the
 *  shared stage-shape rule so sewing is the only unit-scoped stage. */
function buildQcContributors(garment: WorkshopGarment): QcContributor[] {
  const history = (garment.worker_history ?? {}) as Record<string, string>;
  const plan = (garment.production_plan ?? {}) as Record<string, string>;
  return QC_ATTRIBUTION_STAGES.map((stage) => {
    const planKey = STAGE_TO_PLAN_KEY[stage];
    return {
      stage,
      scope: getStageShape(stage) === "unit" ? "unit" : "worker",
      name: history[planKey] ?? plan[planKey] ?? null,
      label: PIECE_STAGE_LABELS[stage as keyof typeof PIECE_STAGE_LABELS] ?? stage,
    };
  });
}

/** The three pocket accessories scope as a unit: an alteration/rework that
 *  flags any one surfaces all three, so the visually grouped "Accessories" row
 *  never appears half-populated (the Pen-disappears bug, §2.11). */
const QC_ACCESSORY_KEYS = ["wallet_pocket", "pen_holder", "mobile_pocket"];

/** Expand a flagged-key set so hard-coupled option groups travel together:
 *  jabzour_1 ↔ jabzour_2 (Shaab needs both), and the accessory trio. Mutates
 *  and returns the set. */
function coupleOptionGroups(flagged: Set<string>): Set<string> {
  if (flagged.has("jabzour_1") || flagged.has("jabzour_2")) {
    flagged.add("jabzour_1");
    flagged.add("jabzour_2");
  }
  if (QC_ACCESSORY_KEYS.some((k) => flagged.has(k))) {
    for (const k of QC_ACCESSORY_KEYS) flagged.add(k);
  }
  return flagged;
}

interface Props {
  garment: WorkshopGarment;
  measurement: Measurement | null | undefined;
  /** When true, scope QC to only the fields the shop flagged as needing fixes
   *  (alteration trip 2+ or alt-out garment). Quality ratings stay enabled
   *  so the inspector still scores overall workmanship. */
  isAlteration?: boolean;
  /** Reported issues — measurementKeys + visibleSections drive which inputs
   *  show. Null when alteration has no flagged fields (degenerate case where
   *  inspector signs off on ratings only). */
  alterationFilter?: AlterationFilter | null;
}

export function QualityCheckForm({
  garment,
  measurement,
  isAlteration = false,
  alterationFilter = null,
}: Props) {
  const router = useRouter();
  const submitMut = useSubmitQc();

  const plan = garment.production_plan as ProductionPlan | null;
  const plannedQC = plan?.quality_checker ?? "";

  // Alt-out garment (customer-brought, garment_type='alteration'). Its requested
  // changes live sparsely in alteration_styles, not the style columns, so QC must
  // scope to the changed keys and source expected option values from that JSON.
  const isAltOut = garment.garment_type === "alteration";

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

  // Basma group always renders — fields are optional, never block submit.
  // Operator leaves them blank if the garment has no basma.
  const visibleMeasurementKeys = useMemo(() => {
    const set = new Set<string>();
    for (const m of QC_MEASUREMENTS) set.add(m.key);
    return set;
  }, []);

  const enabledKeys = useMemo(() => {
    // QC-fail rework takes precedence: re-check only the previous fail's flagged fields.
    if (lastFail) {
      // Core narrowing: union of last fail's failed_measurements ∪ failed_options ∪ failed_quality.
      const flagged = deriveReworkEnabledKeys(lastFail);
      // Jabzour 1 ↔ Jabzour 2 and the accessory trio are hard-coupled — always
      // enable each group as a whole so a re-check never shows a partial group.
      coupleOptionGroups(flagged);
      return flagged;
    }
    // Alteration QC: only check what the shop flagged. Ratings stay always-on
    // so inspector still scores overall workmanship even when nothing was reported.
    if (isAlteration) {
      const flagged = new Set<string>();
      if (alterationFilter) {
        for (const k of alterationFilter.measurementKeys) {
          if (visibleMeasurementKeys.has(k)) flagged.add(k);
        }
        if (isAltOut && alterationFilter.optionKeys) {
          // Alt-out: verify exactly the changed style keys (sparse intake), not
          // whole visual sections — unchanged options in an affected section have
          // no reliable expected value to check against.
          for (const k of alterationFilter.optionKeys) flagged.add(k);
        } else {
          for (const o of QC_OPTIONS) {
            const sec = QC_OPTION_TO_SECTION[o.key];
            if (sec && alterationFilter.visibleSections.has(sec)) flagged.add(o.key);
          }
        }
        coupleOptionGroups(flagged);
      }
      for (const q of QC_QUALITY) flagged.add(q.key);
      return flagged;
    }
    // Full QC — initial pass on a brand-new garment.
    return new Set([
      ...QC_MEASUREMENTS.filter((m) => visibleMeasurementKeys.has(m.key)).map((m) => m.key),
      ...QC_OPTIONS.map((o) => o.key),
      ...QC_QUALITY.map((q) => q.key),
    ]);
  }, [lastFail, isAlteration, isAltOut, alterationFilter, visibleMeasurementKeys]);

  // In alteration mode, hide measurements not flagged by the shop. In all
  // other modes (full QC, QC-fail rework), keep the full template visible —
  // rework just disables non-flagged inputs as a re-check hint.
  // Measurements: scope only in customer-feedback alteration mode.
  // Options: scope in alteration AND QC-fail rework — both cases narrow to
  // the flagged groups (e.g. collar wrong → only collar group visible).
  const scopedHideMeasurements = isAlteration;
  const scopedHideOptions = isAlteration || isRework;
  const visibleGroups = useMemo(
    () => {
      const allow = (k: string) =>
        scopedHideMeasurements ? enabledKeys.has(k) : visibleMeasurementKeys.has(k);
      const filtered = QC_MEASUREMENT_GROUPS
        .map((g) => ({ ...g, keys: g.keys.filter(allow) }))
        .filter((g) => g.keys.length > 0);
      // Merge consecutive groups sharing the same title — the unnamed splits
      // were a 7-col table artifact; flex-wrap fills rows without them.
      const merged: { title: string; keys: string[] }[] = [];
      for (const g of filtered) {
        const last = merged[merged.length - 1];
        if (last && last.title === g.title) last.keys.push(...g.keys);
        else merged.push({ title: g.title, keys: [...g.keys] });
      }
      return merged;
    },
    [visibleMeasurementKeys, scopedHideMeasurements, enabledKeys],
  );

  const carryForward = lastFail ?? null;

  // ── Draft persistence ─────────────────────────────────────────────────────
  // Auto-save in-progress QC to localStorage so an interruption (refresh,
  // accidental nav, tab close) doesn't force re-entry. Key is stable per
  // garment+trip; the attempts count is stored *inside* the payload so a
  // newly-recorded fail invalidates the stale draft on next load. Stable key
  // avoids a race where the key changes mid-submit (after qc_attempts grows)
  // and useEffect writes the pre-submit state under the new key.
  const attemptsCount = tripEntry?.qc_attempts?.length ?? 0;
  const draftKey = `qc-draft:${garment.id}:t${currentTrip}`;
  const draft = useMemo(() => loadDraft(draftKey, attemptsCount), [draftKey, attemptsCount]);

  const [inspector, setInspector] = useState(draft?.inspector ?? plannedQC);
  const [overrideInspector, setOverrideInspector] = useState(false);

  const [measurements, setMeasurements] = useState<Record<string, string>>(() => {
    if (draft?.measurements) return { ...draft.measurements };
    const init: Record<string, string> = {};
    if (carryForward?.measurements) {
      for (const [k, v] of Object.entries(carryForward.measurements)) {
        if (v != null) init[k] = String(v);
      }
    }
    return init;
  });
  const [options, setOptions] = useState<Record<string, string | boolean | number | null>>(() => {
    if (draft?.options) return { ...draft.options };
    return { ...(carryForward?.options ?? {}) };
  });
  const [quality, setQuality] = useState<Record<string, number>>(() => {
    if (draft?.quality) return { ...draft.quality };
    return { ...(carryForward?.quality_ratings ?? {}) };
  });
  // Track which option fields the user has explicitly touched. Boolean toggles
  // can't be distinguished from "default false" via value alone, so we track
  // explicit interaction to avoid flashing red on untouched controls.
  const [touchedOptions, setTouchedOptions] = useState<Set<string>>(
    () => new Set(draft?.touchedOptions ?? Object.keys(carryForward?.options ?? {})),
  );

  useEffect(() => {
    saveDraft(draftKey, {
      attemptsCount,
      inspector,
      measurements,
      options,
      quality,
      touchedOptions: [...touchedOptions],
    });
  }, [draftKey, attemptsCount, inspector, measurements, options, quality, touchedOptions]);

  // Jabzour invariant: jabzour_2 only exists when jabzour_1 = JAB_SHAAB.
  // Runs on mount (sanitizes corrupt draft state like jabzour_1=JAB_BAIN_MURABBA
  // + jabzour_2=JAB_BAIN_MUSALLAS that's structurally impossible to pick) and
  // whenever jabzour_1 flips. Safer than the inline clear on the jabzour_1
  // picker, which depended on a stale closure of `values.jabzour_2`.
  useEffect(() => {
    if (options.jabzour_1 !== "JAB_SHAAB" && options.jabzour_2 != null) {
      setOptions((p) => ({ ...p, jabzour_2: null }));
    }
  }, [options.jabzour_1, options.jabzour_2]);

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
  // Keys the customer's measurement record actually has a value for. Marked
  // with * in the form so operators know which inputs verify against an
  // expected value vs. which are just observational. Optional measures are
  // excluded — they never gate submit, so the * would misread as "required".
  const expectedMeasurementKeys = useMemo(() => {
    const set = new Set<string>();
    for (const m of QC_MEASUREMENTS) {
      if (m.optional) continue;
      const v = expectedMeasurements[m.key];
      if (v == null || v === "") continue;
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) set.add(m.key);
    }
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measurement]);
  // Expected option values — same derivation the server submit uses, so the
  // on-screen verdict can't diverge from the recorded one (alt-out reads the
  // sparse alteration_styles; otherwise garment columns + jabzour normalization
  // + shoulder_slope from the measurement snapshot).
  const expectedOptions = deriveExpectedQcOptions(
    garment as unknown as Record<string, unknown>,
    expectedMeasurements,
  );

  // Option fields the garment record specifies. Marked with * in the form.
  // §2.11 toggles always count — an explicit Yes/No (or Up/Down/Standard) is
  // always a spec to verify, both directions. Text/number only when present.
  // Built inline since QC_OPTIONS is small.
  const expectedOptionKeys = new Set<string>();
  for (const o of QC_OPTIONS) {
    const v = expectedOptions[o.key];
    // shoulder_slope is a required explicit choice (like the §2.11 toggles) — the
    // inspector always verifies it, both directions.
    if (o.type === "boolean" || o.key === "collar_position" || o.key === "shoulder_slope") {
      expectedOptionKeys.add(o.key);
    } else if (o.type === "number") {
      if (v != null && Number.isFinite(Number(v))) expectedOptionKeys.add(o.key);
    } else if (v != null && v !== "") {
      expectedOptionKeys.add(o.key);
    }
  }

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
  // Optional measures (bottom hem, pen pkt, 2nd button) never gate submit;
  // sleeve hem stays required to enter (it's just observational at eval time
  // when the snapshot has no expected value on file).
  const missing: { key: string; label: string }[] = [];
  for (const m of QC_MEASUREMENTS) {
    if (!enabledKeys.has(m.key)) continue;
    if (m.optional) continue;
    const v = measurements[m.key];
    if (v == null || v === "" || !Number.isFinite(Number(v))) {
      missing.push({ key: m.key, label: m.label });
    }
  }
  for (const o of QC_OPTIONS) {
    if (!enabledKeys.has(o.key)) continue;
    // §2.11 toggles are required once enabled — the inspector must answer Yes/No
    // (or Up/Down/Standard); an unanswered control blocks submit. This is what
    // forces a deliberate choice instead of a silent "off".
    if (o.type === "boolean") {
      if (options[o.key] == null) missing.push({ key: o.key, label: o.label });
      continue;
    }
    if (o.key === "collar_position") {
      const v = options[o.key];
      if (v !== "up" && v !== "down" && v !== "standard") {
        missing.push({ key: o.key, label: o.label });
      }
      continue;
    }
    // shoulder_slope is a required explicit choice — must be answered before submit.
    if (o.key === "shoulder_slope") {
      const v = options[o.key];
      if (v == null || v === "") missing.push({ key: o.key, label: o.label });
      continue;
    }
    // jabzour_2 never gates completeness — record what's actually on the garment.
    // SHAAB-without-jabzour_2 is a valid (failing) observation when the worker
    // forgot the second style; evaluation flags the mismatch.
    if (o.key === "jabzour_2") continue;
    // If the spec expected null, operator can leave it empty — forcing a value
    // would cause a false mismatch (e.g. jabzour_1 wasn't requested at all).
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

  // Per-defect team attribution (§6): keyed by `${category}:${key}` → the chosen
  // stage; resolved to a worker/unit at confirm time. Manual and optional — it
  // never gates submit (an unattributed defect simply isn't blamed on anyone).
  const contributors = useMemo(() => buildQcContributors(garment), [garment]);
  const [attributions, setAttributions] = useState<Record<string, string>>({});
  const onAttribute = (category: QcDefectCategory, key: string, stage: string) =>
    setAttributions((p) => ({ ...p, [attrId(category, key)]: stage }));

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
        clearDraft(draftKey);
        toast.success(`${garment.garment_id} passed QC`);
        router.history.back();
      } catch (err: unknown) {
        toast.error(`QC submit failed: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    } else {
      // Pre-select stages from previous fail if rework, else empty. Attribution
      // starts blank each time the dialog opens.
      setReturnStages(new Set());
      setAttributions({});
      setFailDialogOpen(true);
    }
  };

  // Resolve the inspector's per-defect stage picks into stored attribution
  // records, scoped to the keys that actually failed this attempt.
  const buildDefectAttributions = (): QcDefectAttribution[] => {
    const out: QcDefectAttribution[] = [];
    const add = (category: QcDefectCategory, keys: string[]) => {
      for (const key of keys) {
        const stage = attributions[attrId(category, key)];
        if (!stage) continue;
        const c = contributors.find((x) => x.stage === stage);
        if (!c) continue;
        out.push({ category, key, stage: c.stage, scope: c.scope, responsible: c.name });
      }
    };
    add("measurement", evaluation.failed_measurements);
    add("option", evaluation.failed_options);
    add("quality", evaluation.failed_quality);
    return out;
  };

  const handleConfirmFail = async () => {
    if (returnStages.size === 0) return;
    try {
      const defectAttributions = buildDefectAttributions();
      await submitMut.mutateAsync({
        id: garment.id,
        inspector,
        inputs: mergedInputsForSave(carryForward, enabledKeys, numericInputs),
        enabledKeys,
        returnStages: [...returnStages],
        defectAttributions: defectAttributions.length > 0 ? defectAttributions : null,
      });
      const stageNames = QC_RETURN_STAGES
        .filter((s) => returnStages.has(s))
        .map((s) => PIECE_STAGE_LABELS[s as keyof typeof PIECE_STAGE_LABELS] ?? s)
        .join(" → ");
      clearDraft(draftKey);
      toast.warning(`${garment.garment_id} returned to ${stageNames}`);
      setFailDialogOpen(false);
      router.history.back();
    } catch (err: unknown) {
      toast.error(`QC submit failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  const toggleReturnStage = (s: PieceStage) =>
    setReturnStages((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  // A missing measurement snapshot only blocks QC for a regular garment (its
  // measurements can't be verified without one). An alt-out garment may have no
  // snapshot at all — an external, style-only alteration carries only the
  // sparse alteration_styles changes — and QC still proceeds on the flagged
  // options + the quality ratings (which are always enabled). Without this, such
  // a garment would strand at quality_check with no way to advance.
  if (!measurement && !isAltOut) {
    return (
      <div className="bg-card border rounded-xl p-4 shadow-sm">
        <Skeleton className="h-8 w-40 mb-3" />
        <p className="text-sm text-muted-foreground">
          Garment has no linked measurement snapshot. QC cannot proceed.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header — inspector + rework indicator */}
      <div className="bg-card border rounded-xl p-4 shadow-sm flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
            Quality Check
            {isRework && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[11px] font-medium">
                <AlertTriangle className="w-3 h-3" />
                Rework: re-checking {enabledKeys.size} field
                {enabledKeys.size === 1 ? "" : "s"}
              </span>
            )}
            {!isRework && isAlteration && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-orange-100 text-orange-800 px-2 py-0.5 text-[11px] font-medium">
                <AlertTriangle className="w-3 h-3" />
                Alteration: checking only flagged fields
              </span>
            )}
          </h3>
          {inspector && !overrideInspector ? (
            <button
              onClick={() => setOverrideInspector(true)}
              className="flex items-center gap-2 text-sm cursor-pointer hover:opacity-80"
            >
              <span className="text-xs uppercase tracking-wider text-emerald-600 font-medium">
                Inspector
              </span>
              <span className="font-medium text-emerald-900">{inspector}</span>
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

      {/* Step 1 — Measurements (skipped entirely when alteration has none flagged) */}
      {visibleGroups.length > 0 && (
        <SectionCard title="Step 1: Measurements" subtitle={`Tolerance ±${QC_TOLERANCE}"`}>
          {visibleGroups.map((group, i) => (
            <MeasurementGrid
              key={group.title || `group-${i}`}
              title={group.title}
              keys={group.keys}
              values={measurements}
              enabledKeys={enabledKeys}
              expectedKeys={expectedMeasurementKeys}
              // The entry form never highlights spec mismatches: by design QC
              // records what's actually on the piece, so we don't nudge the
              // inspector to edit a reading until it matches the order. The
              // real evaluation still runs for submit + the fail report.
              failedKeys={new Set<string>()}
              onChange={setMeasurement}
            />
          ))}
        </SectionCard>
      )}

      {/* Step 2 — Options (groups with no enabled fields are hidden in alteration + QC-rework modes) */}
      {(!scopedHideOptions || QC_OPTIONS.some((o) => enabledKeys.has(o.key))) && (
        <SectionCard title="Step 2: Options">
          <OptionGroups
            values={options}
            enabledKeys={enabledKeys}
            expectedKeys={expectedOptionKeys}
            // No live mismatch styling on entry — record what's there, don't
            // steer the inspector toward the spec. See measurements above.
            failedKeys={new Set<string>()}
            touchedKeys={touchedOptions}
            scopedHide={scopedHideOptions}
            onChange={setOption}
          />
        </SectionCard>
      )}

      {/* Step 3 — Quality */}
      <SectionCard title="Step 3: Quality" subtitle={`Score 1-5 (≥${QC_QUALITY_THRESHOLD} passes)`}>
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
              {missing.length} field{missing.length === 1 ? "" : "s"} pending, show
            </summary>
            <p className="mt-1 text-muted-foreground leading-relaxed">
              {missing.map((m) => m.label).join(", ")}
            </p>
          </details>
        )}
        <Button
          className="w-full h-12 text-base font-medium"
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
        <DialogContent className="sm:max-w-4xl p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-3 border-b border-border">
            <DialogTitle className="text-base font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[var(--status-bad)]" />
              Failed QC: return to production
            </DialogTitle>
            <p className="text-sm text-muted-foreground mt-0.5">
              {garment.garment_id} · review what needs fixing, then pick which stages to send the piece back to.
            </p>
          </DialogHeader>

          <div className="px-4 py-4 max-h-[55vh] overflow-y-auto">
            <FailReport
              evaluation={evaluation}
              expectedMeasurements={expectedMeasurements}
              expectedOptions={expectedOptions}
              inputs={numericInputs}
              contributors={contributors}
              attributions={attributions}
              onAttribute={onAttribute}
            />
          </div>

          <div className="px-4 py-3.5 border-t border-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-foreground">
                Return through stages
              </span>
              <span
                className={cn(
                  "text-sm tabular-nums",
                  returnStages.size === 0
                    ? "text-[var(--status-warn)] font-medium"
                    : "text-muted-foreground",
                )}
              >
                {returnStages.size === 0 ? "pick at least one" : `${returnStages.size} selected`}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {QC_RETURN_STAGES.map((s) => {
                const label = PIECE_STAGE_LABELS[s as keyof typeof PIECE_STAGE_LABELS] ?? s;
                return (
                  <StageChip
                    key={s}
                    label={label}
                    isSelected={returnStages.has(s)}
                    onClick={() => toggleReturnStage(s)}
                  />
                );
              })}
            </div>
          </div>

          <DialogFooter className="px-4 py-3 border-t border-border">
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
              Send back
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
        <h4 className="text-sm font-medium">{title}</h4>
        {subtitle && (
          <span className="text-xs text-muted-foreground">{subtitle}</span>
        )}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

// Flex-wrap card grid. Each measurement is a card (label / input / fraction)
// that grows to fill the row, so wide screens fill horizontally and narrow
// screens wrap. Replaces the prior fixed-column <table> layout.
function MeasurementGrid({
  title,
  keys,
  values,
  enabledKeys,
  expectedKeys,
  failedKeys,
  onChange,
}: {
  title: string;
  keys: string[];
  values: Record<string, string>;
  enabledKeys: Set<string>;
  /** Keys with a recorded expected value on the customer's measurement
   *  snapshot. Marked with * so operators see which inputs verify against
   *  an expected number vs. which are observational. */
  expectedKeys: Set<string>;
  failedKeys: Set<string>;
  onChange: (key: string, val: string) => void;
}) {
  return (
    <div className="bg-card rounded-xl border border-border shadow-sm p-3">
      {title && <h4 className="text-sm font-semibold pb-2 text-foreground">{title}</h4>}
      <div className="flex flex-wrap gap-2">
        {keys.map((key) => {
          const spec = QC_MEASUREMENTS.find((m) => m.key === key)!;
          const enabled = enabledKeys.has(key);
          const isExpected = expectedKeys.has(key);
          const measuredVal = values[key] ?? "";
          const measuredNum = measuredVal === "" ? null : Number(measuredVal);
          const hasValue = measuredVal !== "" && Number.isFinite(measuredNum);
          const isFailed = hasValue && failedKeys.has(key);
          return (
            <div
              key={key}
              className={cn(
                "flex flex-col rounded-md border border-border basis-32 max-w-44 grow shrink-0 p-1.5",
                isFailed && "ring-1 ring-red-400 border-red-300",
              )}
            >
              <div className="text-xs text-muted-foreground font-semibold text-center leading-tight bg-muted/40 rounded-sm px-1 py-1 mb-1">
                {spec.label}
                {isExpected && <span className="text-red-500 ml-0.5">*</span>}
              </div>
              <Input
                type="number"
                step="0.125"
                inputMode="decimal"
                disabled={!enabled}
                value={measuredVal}
                onChange={(e) => onChange(key, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const all = Array.from(
                      document.querySelectorAll<HTMLInputElement>(
                        'input[data-qc-measure="true"]:not(:disabled)',
                      ),
                    );
                    const idx = all.indexOf(e.currentTarget);
                    const next = idx >= 0 ? all[idx + 1] : null;
                    if (next) {
                      next.focus();
                      next.select();
                    } else {
                      e.currentTarget.blur();
                    }
                  }
                }}
                data-qc-measure="true"
                className={cn(
                  "h-10 w-full text-center text-lg font-medium tabular-nums bg-background border border-input px-1 focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary",
                  !enabled && "bg-muted/30 text-muted-foreground",
                )}
                placeholder="-"
              />
              <div className="h-5 flex items-center justify-center mt-1 text-[11px] text-muted-foreground/70">
                {measuredNum != null && Number.isFinite(measuredNum) ? (
                  <span className="inline-flex items-center gap-0.5">
                    <span>=</span>
                    <FractionPreview value={measuredNum} />
                  </span>
                ) : (
                  <span className="opacity-0">=</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
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
  enabledKeys,
  expectedKeys,
  failedKeys,
  touchedKeys,
  scopedHide,
  onChange,
}: {
  values: Record<string, string | boolean | number | null>;
  enabledKeys: Set<string>;
  /** Option keys the garment record specifies — drive the * marker. */
  expectedKeys: Set<string>;
  failedKeys: Set<string>;
  touchedKeys: Set<string>;
  /** When true, hide fields not in enabledKeys instead of rendering them disabled. */
  scopedHide?: boolean;
  onChange: (key: string, val: string | boolean | number | null) => void;
}) {
  const text = (k: string) =>
    values[k] == null || values[k] === "" ? null : String(values[k]);
  // Tri-state read for §2.11 toggles: undefined until the inspector answers
  // (never coerced to false), so the control shows a "not filled" state.
  const tri = (k: string): boolean | undefined =>
    values[k] === true ? true : values[k] === false ? false : undefined;
  const collarVal = (): CollarPosition | undefined => {
    const v = values.collar_position;
    return v === "up" || v === "down" || v === "standard" ? v : undefined;
  };
  const slopeVal = (): ShoulderSlopeValue | undefined => {
    const v = values.shoulder_slope;
    return typeof v === "string" ? (v as ShoulderSlopeValue) : undefined;
  };
  const off = (k: string) => !enabledKeys.has(k);
  const show = (k: string) => !scopedHide || enabledKeys.has(k);
  const showAny = (...keys: string[]) => keys.some(show);
  const req = (k: string) => expectedKeys.has(k);
  // A toggle/picker flags failed only once evaluation says so — and evaluation
  // never marks an UNANSWERED toggle, so an untouched control can't glow red
  // (the point-2 auto-flag bug). Image pickers stay gated behind touch so a
  // fresh page doesn't glow red on every untouched option.
  const failed = (k: string) => {
    if (!failedKeys.has(k)) return false;
    const spec = QC_OPTIONS.find((o) => o.key === k);
    if (spec?.type === "boolean" || k === "collar_position") return true;
    return touchedKeys.has(k);
  };

  return (
    <div className="space-y-3">
      {showAny("collar_type", "collar_button", "small_tabaggi", "collar_position", "collar_thickness") && (
        <OptionGroup title="Collar">
          {show("collar_type") && (
            <>
              <SubLabel failed={failed("collar_type")} required={req("collar_type")}>Type</SubLabel>
              <ImageOptionGrid
                options={collarTypes}
                value={text("collar_type")}
                onChange={(v) => onChange("collar_type", v)}
                allowClear
                disabled={off("collar_type")}
                failed={failed("collar_type")}
              />
            </>
          )}
          {show("collar_button") && (
            <>
              <SubLabel failed={failed("collar_button")} required={req("collar_button")}>Button</SubLabel>
              <ImageOptionGrid
                options={collarButtons}
                value={text("collar_button")}
                onChange={(v) => onChange("collar_button", v)}
                allowClear
                disabled={off("collar_button")}
                failed={failed("collar_button")}
              />
            </>
          )}
          {show("small_tabaggi") && (
            <div className="flex flex-wrap gap-2">
              <YesNoToggle
                value={tri("small_tabaggi")}
                onChange={(v) => onChange("small_tabaggi", v)}
                icon={smallTabaggiImage}
                label="Small Tabaggi"
                disabled={off("small_tabaggi")}
                failed={failed("small_tabaggi")}
              />
            </div>
          )}
          {show("collar_position") && (
            <>
              <SubLabel failed={failed("collar_position")} required={req("collar_position")}>Position</SubLabel>
              <CollarPositionPicker
                value={collarVal()}
                onChange={(v) => onChange("collar_position", v)}
                disabled={off("collar_position")}
                failed={failed("collar_position")}
              />
            </>
          )}
          {show("collar_thickness") && (
            <div className="flex items-center gap-2">
              <SubLabel className="mb-0" failed={failed("collar_thickness")} required={req("collar_thickness")}>Thickness</SubLabel>
              <ThicknessPicker
                value={text("collar_thickness")}
                onChange={(v) => onChange("collar_thickness", v)}
                disabled={off("collar_thickness")}
                failed={failed("collar_thickness")}
              />
            </div>
          )}
        </OptionGroup>
      )}

      {show("shoulder_slope") && (
        <OptionGroup title="Shoulder slope">
          <SubLabel failed={failed("shoulder_slope")} required={req("shoulder_slope")}>Slope</SubLabel>
          <ShoulderSlopeSelect
            value={slopeVal()}
            onChange={(v) => onChange("shoulder_slope", v)}
            disabled={off("shoulder_slope")}
            invalid={failed("shoulder_slope")}
          />
        </OptionGroup>
      )}

      {showAny("jabzour_1", "jabzour_2", "jabzour_thickness") && (
        <OptionGroup title="Jabzour">
          {show("jabzour_1") && (
            <>
              <SubLabel failed={failed("jabzour_1")} required={req("jabzour_1")}>Type 1</SubLabel>
              <ImageOptionGrid
                options={jabzourTypes}
                value={text("jabzour_1")}
                onChange={(v) => onChange("jabzour_1", v)}
                allowClear
                disabled={off("jabzour_1")}
                failed={failed("jabzour_1")}
              />
            </>
          )}
          {show("jabzour_2") && (text("jabzour_1") === "JAB_SHAAB" || text("jabzour_2") != null) && (
            <>
              <SubLabel failed={failed("jabzour_2")}>
                Type 2{" "}
                {text("jabzour_1") === "JAB_SHAAB" ? (
                  <span className="text-red-600">*</span>
                ) : (
                  <span className="text-amber-600">
                    (clear, only used when Type 1 is Zipper)
                  </span>
                )}
              </SubLabel>
              <ImageOptionGrid
                options={jabzourTypes.filter((j) => j.value !== "JAB_SHAAB")}
                value={text("jabzour_2")}
                onChange={(v) => onChange("jabzour_2", v)}
                allowClear
                disabled={off("jabzour_2")}
                failed={failed("jabzour_2")}
              />
            </>
          )}
          {show("jabzour_thickness") && (
            <div className="flex items-center gap-2">
              <SubLabel className="mb-0" failed={failed("jabzour_thickness")} required={req("jabzour_thickness")}>Thickness</SubLabel>
              <ThicknessPicker
                value={text("jabzour_thickness")}
                onChange={(v) => onChange("jabzour_thickness", v)}
                disabled={off("jabzour_thickness")}
                failed={failed("jabzour_thickness")}
              />
            </div>
          )}
        </OptionGroup>
      )}

      {showAny("front_pocket_type", "front_pocket_thickness", "wallet_pocket", "pen_holder", "mobile_pocket") && (
        <OptionGroup title="Front pocket">
          {show("front_pocket_type") && (
            <>
              <SubLabel failed={failed("front_pocket_type")} required={req("front_pocket_type")}>Type</SubLabel>
              <ImageOptionGrid
                options={topPocketTypes}
                value={text("front_pocket_type")}
                onChange={(v) => onChange("front_pocket_type", v)}
                allowClear
                disabled={off("front_pocket_type")}
                failed={failed("front_pocket_type")}
              />
            </>
          )}
          {show("front_pocket_thickness") && (
            <div className="flex items-center gap-2">
              <SubLabel className="mb-0" failed={failed("front_pocket_thickness")} required={req("front_pocket_thickness")}>Thickness</SubLabel>
              <ThicknessPicker
                value={text("front_pocket_thickness")}
                onChange={(v) => onChange("front_pocket_thickness", v)}
                disabled={off("front_pocket_thickness")}
                failed={failed("front_pocket_thickness")}
              />
            </div>
          )}
          {showAny("wallet_pocket", "pen_holder", "mobile_pocket") && (
            <>
              <SubLabel>Accessories</SubLabel>
              <div className="flex flex-wrap gap-2">
                {show("wallet_pocket") && (
                  <YesNoToggle
                    value={tri("wallet_pocket")}
                    onChange={(v) => onChange("wallet_pocket", v)}
                    icon={walletIcon}
                    label="Wallet"
                    disabled={off("wallet_pocket")}
                    failed={failed("wallet_pocket")}
                  />
                )}
                {show("pen_holder") && (
                  <YesNoToggle
                    value={tri("pen_holder")}
                    onChange={(v) => onChange("pen_holder", v)}
                    icon={penIcon}
                    label="Pen"
                    disabled={off("pen_holder")}
                    failed={failed("pen_holder")}
                  />
                )}
                {show("mobile_pocket") && (
                  <YesNoToggle
                    value={tri("mobile_pocket")}
                    onChange={(v) => onChange("mobile_pocket", v)}
                    icon={phoneIcon}
                    label="Mobile"
                    disabled={off("mobile_pocket")}
                    failed={failed("mobile_pocket")}
                  />
                )}
              </div>
            </>
          )}
        </OptionGroup>
      )}

      {showAny("cuffs_type", "cuffs_thickness") && (
        <OptionGroup title="Cuffs">
          {show("cuffs_type") && (
            <>
              <SubLabel failed={failed("cuffs_type")} required={req("cuffs_type")}>Type</SubLabel>
              <ImageOptionGrid
                options={cuffTypes}
                value={text("cuffs_type")}
                onChange={(v) => onChange("cuffs_type", v)}
                allowClear
                disabled={off("cuffs_type")}
                failed={failed("cuffs_type")}
              />
            </>
          )}
          {show("cuffs_thickness") && (
            <div className="flex items-center gap-2">
              <SubLabel className="mb-0" failed={failed("cuffs_thickness")} required={req("cuffs_thickness")}>Thickness</SubLabel>
              <ThicknessPicker
                value={text("cuffs_thickness")}
                onChange={(v) => onChange("cuffs_thickness", v)}
                disabled={off("cuffs_thickness")}
                failed={failed("cuffs_thickness")}
              />
            </div>
          )}
        </OptionGroup>
      )}

      {show("lines") && (
        <OptionGroup title="Lines">
          <LinesPicker
            value={typeof values.lines === "number" ? values.lines : null}
            onChange={(v) => onChange("lines", v)}
            disabled={off("lines")}
            failed={failed("lines")}
          />
        </OptionGroup>
      )}
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
      <h5 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
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
  required,
}: {
  children: React.ReactNode;
  className?: string;
  failed?: boolean;
  required?: boolean;
}) {
  return (
    <div
      className={cn(
        "text-[11px] font-medium mb-1",
        failed ? "text-red-600 font-medium" : "text-muted-foreground",
        className,
      )}
    >
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </div>
  );
}

function LinesPicker({
  value,
  onChange,
  disabled = false,
  failed = false,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  disabled?: boolean;
  failed?: boolean;
}) {
  const options: { value: number; label: string }[] = [
    { value: 1, label: "1" },
    { value: 2, label: "2" },
  ];
  return (
    <div
      className={cn(
        "inline-flex rounded-lg border bg-background p-0.5",
        disabled && "opacity-50",
        failed && "border-red-400",
      )}
    >
      {options.map((o) => {
        const selected = value === o.value;
        const showFail = selected && failed;
        return (
          <button
            key={o.label}
            type="button"
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
              showFail
                ? "bg-red-500 text-white shadow-sm"
                : selected
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground",
              !disabled && !selected && "hover:bg-muted",
              disabled && "cursor-not-allowed",
            )}
          >
            {o.label}
          </button>
        );
      })}
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

// Icon for each boolean accessory — used in the fail dialog so a wallet/pen
// mismatch reads as "wallet icon → empty" instead of just "Yes → No".
const BOOL_ICON_LOOKUP: Record<string, { icon: string; label: string }> = {
  wallet_pocket: { icon: walletIcon, label: "Wallet" },
  pen_holder: { icon: penIcon, label: "Pen" },
  mobile_pocket: { icon: phoneIcon, label: "Mobile" },
  small_tabaggi: { icon: smallTabaggiImage, label: "Small Tabaggi" },
};

function FailReport({
  evaluation,
  expectedMeasurements,
  expectedOptions,
  inputs,
  contributors,
  attributions,
  onAttribute,
}: {
  evaluation: ReturnType<typeof evaluateQc>;
  expectedMeasurements: Record<string, unknown>;
  expectedOptions: Record<string, unknown>;
  inputs: QcInputs;
  contributors: QcContributor[];
  attributions: Record<string, string>;
  onAttribute: (category: QcDefectCategory, key: string, stage: string) => void;
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
        <ReportSection title="Measurements to correct" hint={`±${QC_TOLERANCE}"`}>
          <FoundVsExpectedHeader withDiffSpacer />
          <div className="rounded-md border border-border bg-card divide-y divide-border overflow-hidden">
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
                  <span className="text-sm text-foreground flex-1 min-w-0 truncate">
                    {spec.label}
                  </span>
                  <div className="w-28 flex justify-center shrink-0">
                    <MeasurementValue value={got} highlight />
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-[color:var(--status-bad)]/60 shrink-0" />
                  <div className="w-28 flex justify-center shrink-0">
                    <MeasurementValue value={exp} muted />
                  </div>
                  <span className="text-sm tabular-nums text-[var(--status-bad)] w-[52px] text-right shrink-0">
                    {diff != null
                      ? `${diff > 0 ? "+" : ""}${diff.toFixed(3).replace(/\.?0+$/, "")}"`
                      : ""}
                  </span>
                  <CausedBySelect
                    contributors={contributors}
                    value={attributions[attrId("measurement", k)]}
                    onChange={(stage) => onAttribute("measurement", k, stage)}
                  />
                </div>
              );
            })}
          </div>
        </ReportSection>
      )}

      {o > 0 && (
        <ReportSection title="Options to redo">
          <FoundVsExpectedHeader />
          <div className="grid grid-cols-1 gap-2">
            {evaluation.failed_options.map((k) => {
              const spec = QC_OPTIONS.find((oo) => oo.key === k)!;
              return (
                <OptionFailRow
                  key={k}
                  spec={spec}
                  expected={expectedOptions[k]}
                  got={inputs.options[k]}
                  contributors={contributors}
                  attribution={attributions[attrId("option", k)]}
                  onAttribute={(stage) => onAttribute("option", k, stage)}
                />
              );
            })}
          </div>
        </ReportSection>
      )}

      {q > 0 && (
        <ReportSection
          title="Quality to improve"
          hint={`needs ≥ ${QC_QUALITY_THRESHOLD}/5`}
        >
          <div className="rounded-md border border-border bg-card divide-y divide-border overflow-hidden">
            {evaluation.failed_quality.map((k) => {
              const spec = QC_QUALITY.find((qq) => qq.key === k)!;
              const score = inputs.quality_ratings[k] ?? 0;
              return (
                <div
                  key={k}
                  className="flex items-center gap-3 px-3 py-2"
                >
                  <span className="text-sm text-foreground flex-1 min-w-0 truncate">
                    {spec.label}
                  </span>
                  <div className="inline-flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        className={cn(
                          "w-4 h-4",
                          n <= score
                            ? "fill-[var(--status-bad)] text-[var(--status-bad)]"
                            : "text-muted-foreground/40",
                        )}
                      />
                    ))}
                  </div>
                  <span className="text-sm tabular-nums text-[var(--status-bad)] min-w-[28px] text-right">
                    {score}/5
                  </span>
                  <CausedBySelect
                    contributors={contributors}
                    value={attributions[attrId("quality", k)]}
                    onChange={(stage) => onAttribute("quality", k, stage)}
                  />
                </div>
              );
            })}
          </div>
        </ReportSection>
      )}
    </div>
  );
}

/** "Caused by" attribution control on each defect row (§6). Lists this trip's
 *  cutting / sewing / finishing / ironing contributors so the inspector can
 *  blame the defect on the responsible worker or unit. Optional — leaving it
 *  blank records no attribution. */
function CausedBySelect({
  contributors,
  value,
  onChange,
}: {
  contributors: QcContributor[];
  value: string | undefined;
  onChange: (stage: string) => void;
}) {
  return (
    <div className="w-44 shrink-0">
      <Select value={value ?? ""} onValueChange={onChange}>
        <SelectTrigger
          className={cn(
            "h-8 w-full text-sm",
            !value && "border-dashed text-muted-foreground",
          )}
          aria-label="Caused by"
        >
          <SelectValue placeholder="Optional" />
        </SelectTrigger>
        <SelectContent>
          {contributors.map((c) => (
            <SelectItem key={c.stage} value={c.stage}>
              {c.label}
              {c.name ? ` · ${c.name}` : " · unassigned"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SummaryPill({ count, label }: { count: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-[var(--status-bad-bg)] text-[var(--status-bad)] px-2 py-0.5 text-sm">
      <span className="tabular-nums">{count}</span>
      <span className="text-muted-foreground">{label}</span>
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
        <h4 className="text-sm font-medium text-muted-foreground">{title}</h4>
        {hint && <span className="text-sm text-muted-foreground">{hint}</span>}
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
    return <span className="text-sm text-muted-foreground italic">-</span>;
  }
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center min-w-[64px] h-7 px-2 rounded-md text-sm font-mono tabular-nums border",
        muted && "bg-card border-border text-muted-foreground",
        highlight && "bg-[var(--status-bad-bg)] border-[color:var(--status-bad)]/30 text-[var(--status-bad)]",
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
  contributors,
  attribution,
  onAttribute,
}: {
  spec: QcOptionSpec;
  expected: unknown;
  got: unknown;
  contributors: QcContributor[];
  attribution: string | undefined;
  onAttribute: (stage: string) => void;
}) {
  const visual = OPTION_IMAGE_LOOKUP[spec.key];
  const boolIcon = spec.type === "boolean" ? BOOL_ICON_LOOKUP[spec.key] : undefined;
  const isSlope = spec.key === "shoulder_slope";
  // Thickness / collar_position / lines render via richer chips so the rework
  // dialog matches the colored badges shown elsewhere (DishdashaOverlay, feedback).
  const isRichChip =
    spec.key.endsWith("_thickness") ||
    spec.key === "collar_position" ||
    spec.key === "lines";

  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2">
      <span className="text-sm text-foreground flex-1 min-w-0 truncate">
        {spec.label}
      </span>
      <div className="w-28 flex justify-center shrink-0">
        {visual ? (
          <ImageOptionChip option={visual.find((b) => b.value === got)} highlight />
        ) : boolIcon ? (
          <BoolOptionChip on={Boolean(got)} icon={boolIcon} highlight />
        ) : isSlope ? (
          <ShoulderSlopeDisplay value={got as string | null} className="text-[var(--status-bad)]" />
        ) : isRichChip ? (
          <RichOptionChip spec={spec} value={got} highlight />
        ) : (
          <TextOptionChip label={formatOptionText(spec, got)} highlight />
        )}
      </div>
      <ArrowRight className="w-3.5 h-3.5 text-[color:var(--status-bad)]/60 shrink-0" />
      <div className="w-28 flex justify-center shrink-0">
        {visual ? (
          <ImageOptionChip option={visual.find((b) => b.value === expected)} muted />
        ) : boolIcon ? (
          <BoolOptionChip on={Boolean(expected)} icon={boolIcon} muted />
        ) : isSlope ? (
          <ShoulderSlopeDisplay value={expected as string | null} className="text-muted-foreground" />
        ) : isRichChip ? (
          <RichOptionChip spec={spec} value={expected} muted />
        ) : (
          <TextOptionChip label={formatOptionText(spec, expected)} muted />
        )}
      </div>
      <CausedBySelect contributors={contributors} value={attribution} onChange={onAttribute} />
    </div>
  );
}

function FoundVsExpectedHeader({ withDiffSpacer = false }: { withDiffSpacer?: boolean }) {
  // Column positions mirror the row layout below so headers line up to the pixel.
  return (
    <div className="flex items-center gap-3 px-3 pb-1.5 border border-transparent text-sm">
      <span className="flex-1" />
      <span className="w-28 text-center text-[var(--status-bad)] shrink-0">Found</span>
      <ArrowRight className="w-3.5 h-3.5 text-[color:var(--status-bad)]/60 shrink-0" />
      <span className="w-28 text-center text-muted-foreground shrink-0">Should be</span>
      {withDiffSpacer && <span className="w-[52px] shrink-0" aria-hidden />}
      <span className="w-44 text-center text-muted-foreground shrink-0">Caused by</span>
    </div>
  );
}

// Rich chip for thickness / collar_position / lines — color-coded so the
// rework instruction reads at a glance instead of as raw text.
function RichOptionChip({
  spec,
  value,
  muted,
  highlight,
}: {
  spec: QcOptionSpec;
  value: unknown;
  muted?: boolean;
  highlight?: boolean;
}) {
  const base =
    "inline-flex items-center justify-center min-w-[64px] h-7 px-2.5 rounded-md text-sm border whitespace-nowrap";
  const highlightTone = "bg-[var(--status-bad-bg)] border-[color:var(--status-bad)]/30 text-[var(--status-bad)]";

  if (spec.key.endsWith("_thickness")) {
    const raw = value == null || value === "" ? "" : String(value).toUpperCase();
    const label =
      value == null || value === "" ? "-" : formatOptionText(spec, value);
    // Identity tones: thickness has distinct kinds, kept on 700-shades per CLAUDE.md
    const tone = highlight
      ? highlightTone
      : raw === "SINGLE"
        ? "bg-card border-border text-blue-700"
        : raw === "DOUBLE"
          ? "bg-card border-border text-emerald-700"
          : raw === "TRIPLE"
            ? "bg-card border-border text-orange-700"
            : raw === "NO HASHWA"
              ? "bg-card border-border text-muted-foreground"
              : "bg-card border-border text-muted-foreground";
    return <span className={cn(base, tone)}>{label}</span>;
  }

  if (spec.key === "collar_position") {
    const v =
      value === "up" ? "up" : value === "down" ? "down" : "standard";
    const label =
      v === "up" ? "Collar Up" : v === "down" ? "Collar Down" : "Standard";
    const tone = highlight
      ? highlightTone
      : v === "up"
        ? "bg-card border-border text-amber-700"
        : v === "down"
          ? "bg-card border-border text-sky-700"
          : "bg-card border-border text-muted-foreground";
    return <span className={cn(base, tone)}>{label}</span>;
  }

  if (spec.key === "lines") {
    const n = Number(value);
    const label = n === 1 ? "Single" : n === 2 ? "Double" : "-";
    const tone = highlight
      ? highlightTone
      : muted
        ? "bg-card border-border text-muted-foreground"
        : "bg-card border-border text-foreground";
    return <span className={cn(base, tone)}>Line {label}</span>;
  }

  return (
    <span
      className={cn(
        base,
        highlight ? highlightTone : "bg-card border-border text-muted-foreground",
      )}
    >
      {formatOptionText(spec, value)}
    </span>
  );
}

function BoolOptionChip({
  on,
  icon,
  muted,
  highlight,
}: {
  on: boolean;
  icon: { icon: string; label: string };
  muted?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      title={on ? icon.label : `No ${icon.label}`}
      className={cn(
        "rounded-md p-1 transition-transform hover:scale-110 active:scale-110 border",
        muted && "bg-card border-border",
        highlight && "bg-[var(--status-bad-bg)] border-[color:var(--status-bad)]/30",
      )}
    >
      {on ? (
        <img
          src={icon.icon}
          alt={icon.label}
          className="h-9 w-9 object-contain"
        />
      ) : (
        <div className="relative h-9 w-9">
          <img
            src={icon.icon}
            alt={icon.label}
            className="h-9 w-9 object-contain opacity-25 grayscale"
          />
          <Ban
            strokeWidth={2.5}
            className={cn(
              "absolute inset-0 m-auto w-6 h-6",
              highlight ? "text-[var(--status-bad)]" : "text-muted-foreground",
            )}
          />
        </div>
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
      title={option?.displayText ?? "None"}
      className={cn(
        "rounded-md p-1 transition-transform hover:scale-110 active:scale-110 border",
        muted && "bg-card border-border",
        highlight && "bg-[var(--status-bad-bg)] border-[color:var(--status-bad)]/30",
      )}
    >
      {option?.image ? (
        <img
          src={option.image}
          alt={option.alt ?? option.displayText}
          className="h-9 w-9 object-contain"
        />
      ) : (
        <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center text-xs text-muted-foreground">
          None
        </div>
      )}
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
        "inline-flex items-center justify-center min-w-[60px] h-7 px-2.5 rounded-md text-sm border",
        muted && "bg-card border-border text-muted-foreground",
        highlight && "bg-[var(--status-bad-bg)] border-[color:var(--status-bad)]/30 text-[var(--status-bad)]",
      )}
    >
      {label}
    </span>
  );
}

function formatOptionText(spec: QcOptionSpec, val: unknown): string {
  if (spec.type === "boolean") return val ? "Yes" : "No";
  if (val == null || val === "") {
    if (spec.key === "collar_position") return "Standard";
    return "-";
  }
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

// ── Draft helpers ───────────────────────────────────────────────────────────
// Drafts auto-expire after 24h. Each load also sweeps stale entries so an
// abandoned shop doesn't accumulate localStorage bloat over time.

const DRAFT_PREFIX = "qc-draft:";
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

interface QcDraft {
  /** Number of QC attempts on the garment when this draft was saved. */
  attemptsCount: number;
  inspector: string;
  measurements: Record<string, string>;
  options: Record<string, string | boolean | number | null>;
  quality: Record<string, number>;
  touchedOptions: string[];
  savedAt: number;
}

/**
 * Loads draft. Returns null and clears the entry if:
 * - missing/expired (TTL)
 * - attemptsCount mismatch (a new fail/pass was recorded since save → carryForward
 *   shifted, draft is stale and would mis-prefill the form)
 */
function loadDraft(key: string, currentAttemptsCount: number): QcDraft | null {
  if (typeof localStorage === "undefined") return null;
  sweepStaleDrafts();
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as QcDraft;
    if (!parsed.savedAt || Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    if (parsed.attemptsCount !== currentAttemptsCount) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveDraft(key: string, data: Omit<QcDraft, "savedAt">) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify({ ...data, savedAt: Date.now() }));
  } catch {
    // Quota exceeded or disabled — silent failure, draft is best-effort.
  }
}

function clearDraft(key: string) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function sweepStaleDrafts() {
  if (typeof localStorage === "undefined") return;
  try {
    const now = Date.now();
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(DRAFT_PREFIX)) continue;
      try {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as { savedAt?: number };
        if (!parsed.savedAt || now - parsed.savedAt > DRAFT_TTL_MS) stale.push(k);
      } catch {
        stale.push(k);
      }
    }
    for (const k of stale) localStorage.removeItem(k);
  } catch {
    // ignore
  }
}

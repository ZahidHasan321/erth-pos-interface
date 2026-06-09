import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useResourcesWithUsers, useUpdateResource, useDeleteResource } from "@/hooks/useResources";
import { useUnits, useCreateUnit, useUpdateUnit, useDeleteUnit } from "@/hooks/useUnits";
import { useWorkshopWorkload } from "@/hooks/useWorkshopGarments";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@repo/ui/dialog";
import { Skeleton } from "@repo/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@repo/ui/tooltip";

import { PageHeader, StatusBanner } from "@/components/shared/PageShell";
import { cn, getLocalDateStr, toLocalDateStr } from "@/lib/utils";
import { getStageShape } from "@/lib/stage-shape";
import { toast } from "sonner";
import type { NewResource, Unit, ProductionStage } from "@repo/database";
import type { ResourceWithUser } from "@/api/resources";
import {
  Users, Plus, Trash2, Droplets, Scissors,
  Pencil, Link2,
  AlertTriangle, UserX, ChevronDown, FolderPlus,
  Info, Star,
} from "lucide-react";
import { IconNeedle, IconIroning1, IconRosette, IconSparkles } from "@tabler/icons-react";

export const Route = createFileRoute("/(main)/team")({
  component: TeamPage,
  head: () => ({ meta: [{ title: "Production Team" }] }),
});

const STAGES = [
  { key: "soaking",       label: "Soaking",       icon: Droplets,      color: "sky" },
  { key: "cutting",       label: "Cutting",       icon: Scissors,      color: "amber" },
  // TEMP DISABLED: post_cutting hidden from production flow
  // { key: "post_cutting",  label: "Post-Cut",      icon: IconStack2,    color: "orange" },
  { key: "sewing",        label: "Sewing",        icon: IconNeedle,    color: "purple" },
  { key: "finishing",     label: "Finishing",      icon: IconSparkles,  color: "emerald" },
  { key: "ironing",       label: "Ironing",       icon: IconIroning1,  color: "rose" },
  { key: "quality_check", label: "QC",             icon: IconRosette,   color: "indigo" },
] as const satisfies ReadonlyArray<{ key: ProductionStage; label: string; icon: React.ElementType; color: string }>;

type StageKey = (typeof STAGES)[number]["key"];

// Stage identity colors — used only on tab icon tints (allowed indicator-icon use).
const STAGE_CLASSES: Record<string, { iconColor: string }> = {
  soaking:       { iconColor: "text-sky-700" },
  cutting:       { iconColor: "text-amber-700" },
  // post_cutting:  { iconColor: "text-orange-700" }, // TEMP DISABLED
  sewing:        { iconColor: "text-purple-700" },
  finishing:     { iconColor: "text-emerald-700" },
  ironing:       { iconColor: "text-rose-700" },
  quality_check: { iconColor: "text-indigo-700" },
};

type WorkerEditForm = Partial<Omit<NewResource, "id" | "created_at" | "unit" | "user_id" | "responsibility">>;

// ── Delete Worker Dialog ────────────────────────────────────────────

function DeleteConfirmDialog({
  open, onOpenChange, workerName, onConfirm, isPending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workerName: string;
  onConfirm: () => void;
  isPending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-medium">
            <AlertTriangle className="w-4 h-4 text-[var(--status-bad)]" />
            Remove worker
          </DialogTitle>
          <DialogDescription className="text-sm pt-2">
            Remove <span className="font-medium text-foreground">{workerName}</span> from the production team?
          </DialogDescription>
        </DialogHeader>
        <StatusBanner tone="bad" icon={AlertTriangle}>
          Historical production data is preserved. Worker will no longer appear in assignment pickers.
        </StatusBanner>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete Unit Dialog ──────────────────────────────────────────────

function DeleteUnitDialog({
  open, onOpenChange, unit, workerCount, onConfirm, isPending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  unit: Unit | null;
  workerCount: number;
  onConfirm: () => void;
  isPending: boolean;
}) {
  const blocked = workerCount > 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-medium">
            <AlertTriangle className="w-4 h-4 text-[var(--status-bad)]" />
            Delete unit
          </DialogTitle>
          <DialogDescription className="text-sm pt-2">
            Delete unit <span className="font-medium text-foreground">{unit?.name}</span>?
          </DialogDescription>
        </DialogHeader>
        {blocked ? (
          <StatusBanner tone="warn" icon={AlertTriangle}>
            {workerCount} worker{workerCount === 1 ? "" : "s"} still assigned. Move or remove them first.
          </StatusBanner>
        ) : (
          <StatusBanner tone="bad">
            This cannot be undone.
          </StatusBanner>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={blocked || isPending}>
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Unit Form Dialog ────────────────────────────────────────────────

function UnitFormDialog({
  open, onOpenChange, mode, stage, name, notes, dailyTarget,
  setName, setNotes, setDailyTarget,
  onSubmit, isPending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: "add" | "edit";
  stage: StageKey;
  name: string;
  notes: string;
  dailyTarget: string;
  setName: (v: string) => void;
  setNotes: (v: string) => void;
  setDailyTarget: (v: string) => void;
  onSubmit: () => void;
  isPending: boolean;
}) {
  const stageLabel = STAGES.find((s) => s.key === stage)?.label ?? stage;
  // Sewing assigns to whole unit, so unit owns the daily target.
  // Other stages assign per worker; unit-level target isn't tracked in UI.
  const showDailyTarget = getStageShape(stage) === "unit";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base font-medium">
            {mode === "add" ? `New ${stageLabel.toLowerCase()} unit` : "Rename unit"}
          </DialogTitle>
          {mode === "add" && (
            <DialogDescription className="text-sm">
              A unit groups workers who share a queue.
              {showDailyTarget && " The daily target is shared across the whole unit."}
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Name <span className="text-[var(--status-bad)]">*</span></Label>
            <Input
              autoFocus
              placeholder={mode === "add" ? `e.g. ${stageLabel} 1` : ""}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) onSubmit(); }}
              className="h-10"
            />
          </div>
          {showDailyTarget && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Daily target</Label>
              <Input
                type="number"
                min={0}
                placeholder="Pieces per day"
                value={dailyTarget}
                onChange={(e) => setDailyTarget(e.target.value)}
                className="h-10"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Notes</Label>
            <Input
              placeholder="Optional"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-10"
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSubmit} disabled={!name.trim() || isPending}>
            {mode === "add" ? "Create" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Stage Tabs with Sliding Indicator ───────────────────────────────

function StageTabs({
  activeStage, onSelect, stageStats,
}: {
  activeStage: string;
  onSelect: (key: StageKey) => void;
  stageStats: Map<string, { count: number }>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  const updateIndicator = useCallback(() => {
    const el = tabRefs.current.get(activeStage);
    const container = containerRef.current;
    if (!el || !container) return;
    const cRect = container.getBoundingClientRect();
    const tRect = el.getBoundingClientRect();
    setIndicator({ left: tRect.left - cRect.left + container.scrollLeft, width: tRect.width });
  }, [activeStage]);

  useEffect(() => { updateIndicator(); }, [updateIndicator]);

  useEffect(() => {
    const obs = new ResizeObserver(updateIndicator);
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [updateIndicator]);

  return (
    <div ref={containerRef} className="relative flex gap-1 overflow-x-auto scrollbar-none border-b">
      {STAGES.map((stage) => {
        const stSc = STAGE_CLASSES[stage.key]!;
        const Icon = stage.icon;
        const stats = stageStats.get(stage.key) ?? { count: 0 };
        const isActive = activeStage === stage.key;
        return (
          <button
            key={stage.key}
            ref={(el) => { if (el) tabRefs.current.set(stage.key, el); }}
            onClick={() => onSelect(stage.key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors duration-200 shrink-0",
              isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className={cn("w-3.5 h-3.5", isActive ? stSc.iconColor : "")} />
            <span>{stage.label}</span>
            <span className={cn(
              "text-xs tabular-nums ml-0.5 bg-muted px-1.5 py-0.5 rounded-md transition-colors duration-200",
              isActive ? "text-foreground" : "text-muted-foreground",
            )}>
              {stats.count}
            </span>
          </button>
        );
      })}
      <div
        className="absolute bottom-0 h-0.5 bg-foreground rounded-full transition-all duration-300 ease-out"
        style={{ left: indicator.left, width: indicator.width }}
      />
    </div>
  );
}

// ── Worker Row ──────────────────────────────────────────────────────
// `showTarget` = render target/today/progress columns. False for soakers
// and sewers — their performance is group/unit scoped, not individual.

function WorkerRow({
  w, actual, otherStages, showTarget, onEdit, onDelete,
}: {
  w: ResourceWithUser;
  actual: number;
  otherStages: string[];
  showTarget: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const target = w.daily_target ?? 0;
  const eff = target > 0 ? Math.round((actual / target) * 100) : 0;

  if (!showTarget) {
    return (
      <div
        className="group hover:bg-muted/30 transition-colors cursor-pointer"
        onClick={onEdit}
      >
        {/* Desktop — name | type | rating | actions */}
        <div className="hidden md:grid grid-cols-[1fr_100px_80px_70px] gap-2 px-5 py-2.5 items-center">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground shrink-0">
              {w.resource_name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-base font-medium truncate">{w.resource_name}</p>
              {otherStages.length > 0 ? (
                <p className="text-xs text-muted-foreground truncate">
                  Also: {otherStages.join(", ")}
                </p>
              ) : w.user && (
                <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                  <Link2 className="w-2.5 h-2.5" />
                  {w.user.name}
                </p>
              )}
            </div>
          </div>

          {w.resource_type ? (
            <span className={cn(
              "text-xs font-medium px-2 py-0.5 rounded-md w-fit",
              w.resource_type === "Senior" ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
            )}>
              {w.resource_type}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">-</span>
          )}

          {w.rating != null ? (
            <span className="inline-flex items-center gap-1 text-sm tabular-nums">
              <Star className="w-3 h-3 fill-[var(--status-warn)] text-[var(--status-warn)]" />
              {w.rating}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">-</span>
          )}

          <div className="flex items-center justify-end gap-0.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors">
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="p-1.5 rounded-md hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Edit worker"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="p-1.5 rounded-md hover:text-destructive hover:bg-muted transition-colors"
              aria-label="Remove worker"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Mobile */}
        <div className="md:hidden px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground shrink-0">
                {w.resource_name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-base font-medium truncate">{w.resource_name}</p>
                {otherStages.length > 0 && (
                  <p className="text-xs text-muted-foreground truncate">
                    Also: {otherStages.join(", ")}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {w.resource_type && (
                <span className={cn(
                  "text-xs font-medium px-1.5 py-0.5 rounded-md",
                  w.resource_type === "Senior" ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
                )}>
                  {w.resource_type}
                </span>
              )}
              {w.rating != null && (
                <span className="inline-flex items-center gap-1 text-xs tabular-nums">
                  <Star className="w-3 h-3 fill-[var(--status-warn)] text-[var(--status-warn)]" />
                  {w.rating}
                </span>
              )}
              <div className="flex items-center gap-0.5 text-muted-foreground">
                <button
                  onClick={(e) => { e.stopPropagation(); onEdit(); }}
                  className="flex items-center justify-center size-11 rounded-md hover:text-foreground hover:bg-muted transition-colors"
                  aria-label="Edit worker"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  className="flex items-center justify-center size-11 rounded-md hover:text-destructive hover:bg-muted transition-colors"
                  aria-label="Remove worker"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // showTarget=true → full row w/ target/today/progress
  return (
    <div
      className="group hover:bg-muted/30 transition-colors cursor-pointer"
      onClick={onEdit}
    >
      {/* Desktop */}
      <div className="hidden md:grid grid-cols-[1fr_80px_80px_80px_100px_70px] gap-2 px-5 py-2.5 items-center">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground shrink-0">
            {w.resource_name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-base font-medium truncate">{w.resource_name}</p>
            {otherStages.length > 0 ? (
              <p className="text-xs text-muted-foreground truncate">
                Also: {otherStages.join(", ")}
              </p>
            ) : w.user && (
              <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                <Link2 className="w-2.5 h-2.5" />
                {w.user.name}
              </p>
            )}
          </div>
        </div>

        {w.resource_type ? (
          <span className={cn(
            "text-xs font-medium px-2 py-0.5 rounded-md w-fit",
            w.resource_type === "Senior" ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
          )}>
            {w.resource_type}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">-</span>
        )}

        <span className="text-sm tabular-nums text-muted-foreground">{target > 0 ? target : "-"}</span>
        <span className="text-base font-medium tabular-nums">{actual}</span>

        {target > 0 ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 bg-muted overflow-hidden rounded-sm">
              <div
                className="h-full transition-all duration-300"
                style={{
                  width: `${Math.min(eff, 100)}%`,
                  backgroundColor: eff >= 90 ? "var(--status-ok)" : eff >= 70 ? "var(--status-warn)" : "var(--status-bad)",
                }}
              />
            </div>
            <span
              className={cn(
                "text-sm font-medium tabular-nums w-9 text-right",
                eff >= 90 ? "text-[var(--status-ok)]" : eff >= 70 ? "text-[var(--status-warn)]" : "text-[var(--status-bad)]",
              )}
            >
              {eff}%
            </span>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">-</span>
        )}

        <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Edit worker"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
            aria-label="Remove worker"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Mobile */}
      <div className="md:hidden px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground shrink-0">
              {w.resource_name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-base font-medium truncate">{w.resource_name}</p>
              {otherStages.length > 0 && (
                <p className="text-xs text-muted-foreground truncate">
                  Also: {otherStages.join(", ")}
                </p>
              )}
              <div className="flex items-center gap-2 mt-0.5">
                {w.resource_type && (
                  <span className={cn(
                    "text-xs font-medium px-1.5 py-0.5 rounded-md",
                    w.resource_type === "Senior" ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
                  )}>
                    {w.resource_type}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right">
              <div className="text-base font-medium tabular-nums">{actual}{target > 0 ? `/${target}` : ""}</div>
              {target > 0 && (
                <span
                  className={cn(
                    "text-sm font-medium tabular-nums",
                    eff >= 90 ? "text-[var(--status-ok)]" : eff >= 70 ? "text-[var(--status-warn)]" : "text-[var(--status-bad)]",
                  )}
                >
                  {eff}%
                </span>
              )}
            </div>
            <div className="flex items-center gap-0.5 text-muted-foreground">
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                className="flex items-center justify-center size-11 rounded-md hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Edit worker"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="flex items-center justify-center size-11 rounded-md hover:text-destructive hover:bg-muted transition-colors"
                aria-label="Remove worker"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Unit Section ────────────────────────────────────────────────────
// `shape` controls how unit header KPI and worker rows render:
//   - "worker" stages: header shows count + sum of member targets; rows show
//     per-worker target/today/%.
//   - "unit" stages (sewing): header shows unit-level daily_target + collective
//     actual; rows omit target/%/today.

function UnitSection({
  unit, workers, todayCompletions, otherStagesByResourceId,
  shape,
  onEditUnit, onDeleteUnit, onAddWorker, onEditWorker, onDeleteWorker,
}: {
  unit: Unit | null; // null = Unassigned bucket
  workers: ResourceWithUser[];
  todayCompletions: Map<string, number>;
  otherStagesByResourceId: Map<string, string[]>;
  shape: "worker" | "unit";
  onEditUnit?: () => void;
  onDeleteUnit?: () => void;
  onAddWorker: () => void;
  onEditWorker: (w: ResourceWithUser) => void;
  onDeleteWorker: (w: ResourceWithUser) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const count = workers.length;
  const actualSum = workers.reduce((s, w) => s + (todayCompletions.get(w.resource_name) ?? 0), 0);
  const targetSum = shape === "unit"
    ? (unit?.daily_target ?? 0)
    : workers.reduce((s, w) => s + (w.daily_target ?? 0), 0);
  const eff = targetSum > 0 ? Math.round((actualSum / targetSum) * 100) : 0;

  const showWorkerTargets = shape === "worker";

  return (
    <div className="border border-border rounded-md overflow-hidden bg-card">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="p-1 rounded-md hover:bg-muted"
          aria-label={collapsed ? "Expand unit" : "Collapse unit"}
        >
          <ChevronDown className={cn("w-4 h-4 transition-transform", collapsed && "-rotate-90")} />
        </button>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <h3 className="text-sm font-medium truncate">
            {unit ? unit.name : <span className="text-muted-foreground">Unassigned</span>}
          </h3>
          <span className="text-xs tabular-nums text-muted-foreground bg-muted px-1.5 py-px rounded-md">
            {count}
          </span>
          {unit?.notes && (
            <span className="text-xs text-muted-foreground truncate hidden sm:inline">· {unit.notes}</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
          {targetSum > 0 ? (
            <span className={cn(
              "tabular-nums hidden sm:inline",
              shape === "unit" && (
                eff >= 90 ? "text-[var(--status-ok)]"
                  : eff >= 70 ? "text-[var(--status-warn)]"
                  : "text-[var(--status-bad)]"
              ),
            )}>
              {actualSum}/{targetSum} · {eff}%
            </span>
          ) : shape === "unit" && unit ? (
            <span className="tabular-nums hidden sm:inline">{actualSum} today · no target</span>
          ) : null}
          <div className="flex items-center gap-0.5">
            <button
              onClick={onAddWorker}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Add worker to unit"
              title="Add worker"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            {unit && onEditUnit && (
              <button
                onClick={onEditUnit}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Edit unit"
                title="Edit unit"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            {unit && onDeleteUnit && (
              <button
                onClick={onDeleteUnit}
                className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
                aria-label="Delete unit"
                title="Delete unit"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      {!collapsed && (
        count === 0 ? (
          <div className="px-5 py-6 text-center">
            <p className="text-sm text-muted-foreground mb-2">No workers in this unit</p>
            <Button variant="outline" size="sm" onClick={onAddWorker} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Add worker
            </Button>
          </div>
        ) : (
          <>
            {showWorkerTargets ? (
              <div className="hidden md:grid grid-cols-[1fr_80px_80px_80px_100px_70px] gap-2 px-5 py-2 bg-muted/20 border-b border-border">
                {["Worker", "Type", "Target", "Today", "Progress", ""].map((label, i) => (
                  <span key={i} className="text-sm font-medium text-muted-foreground">
                    {label}
                  </span>
                ))}
              </div>
            ) : (
              <div className="hidden md:grid grid-cols-[1fr_100px_80px_70px] gap-2 px-5 py-2 bg-muted/20 border-b border-border">
                {["Member", "Type", "Rating", ""].map((label, i) => (
                  <span key={i} className="text-sm font-medium text-muted-foreground">
                    {label}
                  </span>
                ))}
              </div>
            )}
            <div className="divide-y divide-border">
              {workers.map((w) => (
                <WorkerRow
                  key={w.id}
                  w={w}
                  actual={todayCompletions.get(w.resource_name) ?? 0}
                  otherStages={otherStagesByResourceId.get(w.id) ?? []}
                  showTarget={showWorkerTargets}
                  onEdit={() => onEditWorker(w)}
                  onDelete={() => onDeleteWorker(w)}
                />
              ))}
            </div>
          </>
        )
      )}
    </div>
  );
}

// ── Group Roster (soaking) ──────────────────────────────────────────
// One flat card. Soaking has no per-worker or per-unit assignment — any
// soaker handles any soak. Performance is the group total.

function GroupRoster({
  workers, todayCompletions, otherStagesByResourceId,
  onAddWorker, onEditWorker, onDeleteWorker,
}: {
  workers: ResourceWithUser[];
  todayCompletions: Map<string, number>;
  otherStagesByResourceId: Map<string, string[]>;
  onAddWorker: () => void;
  onEditWorker: (w: ResourceWithUser) => void;
  onDeleteWorker: (w: ResourceWithUser) => void;
}) {
  const groupActual = workers.reduce(
    (s, w) => s + (todayCompletions.get(w.resource_name) ?? 0),
    0,
  );

  return (
    <div className="space-y-4">
      <div className="border border-border rounded-md overflow-hidden bg-card">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <h3 className="text-sm font-medium">Soaking group</h3>
            <span className="text-xs tabular-nums text-muted-foreground bg-muted px-1.5 py-px rounded-md">
              {workers.length}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="About the soaking group"
                  className="inline-flex items-center justify-center rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[260px] text-sm leading-snug">
                Any soaker can pick up any garment. Output is tracked for the group, not per worker.
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
            <span className="tabular-nums hidden sm:inline">
              {groupActual} done today
            </span>
            <button
              onClick={onAddWorker}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Add worker"
              title="Add soaker"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {workers.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-muted-foreground mb-2">No soakers yet</p>
            <Button variant="outline" size="sm" onClick={onAddWorker} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Add soaker
            </Button>
          </div>
        ) : (
          <>
            <div className="hidden md:grid grid-cols-[1fr_100px_80px_70px] gap-2 px-5 py-2 bg-muted/20 border-b border-border">
              {["Member", "Type", "Rating", ""].map((label, i) => (
                <span key={i} className="text-sm font-medium text-muted-foreground">
                  {label}
                </span>
              ))}
            </div>
            <div className="divide-y divide-border">
              {workers.map((w) => (
                <WorkerRow
                  key={w.id}
                  w={w}
                  actual={todayCompletions.get(w.resource_name) ?? 0}
                  otherStages={otherStagesByResourceId.get(w.id) ?? []}
                  showTarget={false}
                  onEdit={() => onEditWorker(w)}
                  onDelete={() => onDeleteWorker(w)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Edit Worker Dialog ──────────────────────────────────────────────

function EditWorkerDialog({
  open, onOpenChange, worker, form, setForm, onSubmit, isPending, unitsForStage, onAskCreateUnit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  worker: ResourceWithUser | null;
  form: WorkerEditForm;
  setForm: React.Dispatch<React.SetStateAction<WorkerEditForm>>;
  onSubmit: () => void;
  isPending: boolean;
  unitsForStage: Unit[];
  onAskCreateUnit: () => void;
}) {
  if (!worker) return null;

  const stage = (worker.responsibility as ProductionStage | null) ?? null;
  const shape = stage ? getStageShape(stage) : "worker";
  // Per-worker target only meaningful for worker-scoped stages.
  // For sewing (unit) the unit owns the target; for soaking (group) no target.
  const showPerWorkerTarget = shape === "worker";
  // Unit picker hidden for group stages (soaking has no units).
  const showUnitPicker = shape !== "group";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-medium">
            <Pencil className="w-4 h-4 text-muted-foreground" />
            Edit worker
          </DialogTitle>
          <DialogDescription className="text-sm pt-1">
            Production settings for <span className="font-medium text-foreground">{worker.resource_name}</span>.
            Identity, role, and terminal are managed on the user page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Display name</Label>
            <Input
              value={form.resource_name ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, resource_name: e.target.value }))}
              placeholder="Name shown in scheduler"
            />
          </div>

          {showUnitPicker && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-muted-foreground">Unit</Label>
                <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={onAskCreateUnit}>
                  <FolderPlus className="w-3 h-3" />
                  New unit
                </Button>
              </div>
              <Select
                value={form.unit_id ?? "none"}
                onValueChange={(v) => setForm((p) => ({ ...p, unit_id: v === "none" ? null : v }))}
              >
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {unitsForStage.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {shape === "unit" && (
                <p className="text-xs text-muted-foreground">
                  Sewing assigns garments to a unit. Without one this worker can't pick up sewing work.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Level</Label>
              <Select
                value={form.resource_type ?? "none"}
                onValueChange={(v) => setForm((p) => ({ ...p, resource_type: v === "none" ? null : v }))}
              >
                <SelectTrigger><SelectValue placeholder="-" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-</SelectItem>
                  <SelectItem value="Senior">Senior</SelectItem>
                  <SelectItem value="Junior">Junior</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Rating (1-5)</Label>
              <Input
                type="number"
                min={1}
                max={5}
                value={form.rating ?? ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") {
                    setForm((p) => ({ ...p, rating: null }));
                    return;
                  }
                  const n = Math.max(1, Math.min(5, Math.round(Number(raw))));
                  setForm((p) => ({ ...p, rating: n }));
                }}
              />
            </div>
          </div>

          {showPerWorkerTarget ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Daily target</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.daily_target ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setForm((p) => ({ ...p, daily_target: raw === "" ? null : Number(raw) }));
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Overtime target</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.overtime_target ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setForm((p) => ({ ...p, overtime_target: raw === "" ? null : Number(raw) }));
                  }}
                />
              </div>
            </div>
          ) : (
            <StatusBanner tone="info" icon={Info}>
              {shape === "unit"
                ? "Daily target lives on the unit, not the worker."
                : "Soakers don't have an individual target."}
            </StatusBanner>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSubmit} disabled={!form.resource_name || isPending}>
            {isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

function TeamPage() {
  const { data: resources = [], isLoading } = useResourcesWithUsers();
  const { data: units = [], isLoading: unitsLoading } = useUnits();
  const { data: garments = [] } = useWorkshopWorkload();
  const updateMut = useUpdateResource();
  const deleteMut = useDeleteResource();
  const createUnitMut = useCreateUnit();
  const updateUnitMut = useUpdateUnit();
  const deleteUnitMut = useDeleteUnit();
  const navigate = useNavigate();

  const [activeStage, setActiveStage] = useState<StageKey>(STAGES[0].key);
  const activeShape = getStageShape(activeStage);

  const [workerDialogOpen, setWorkerDialogOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<ResourceWithUser | null>(null);
  const [form, setForm] = useState<WorkerEditForm>({});
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const [unitDialogOpen, setUnitDialogOpen] = useState(false);
  const [unitDialogMode, setUnitDialogMode] = useState<"add" | "edit">("add");
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [unitName, setUnitName] = useState("");
  const [unitNotes, setUnitNotes] = useState("");
  const [unitDailyTarget, setUnitDailyTarget] = useState("");
  const [deleteUnitTarget, setDeleteUnitTarget] = useState<Unit | null>(null);
  const [unitDialogStage, setUnitDialogStage] = useState<StageKey>(STAGES[0].key);

  const todayStr = getLocalDateStr();
  const todayCompletions = useMemo(() => {
    const map = new Map<string, number>();
    for (const g of garments) {
      if (!g.completion_time) continue;
      const cDay = toLocalDateStr(g.completion_time);
      if (cDay !== todayStr) continue;
      const history = g.worker_history as Record<string, string> | null;
      if (!history) continue;
      for (const workerName of Object.values(history)) {
        if (workerName) map.set(workerName, (map.get(workerName) ?? 0) + 1);
      }
    }
    return map;
  }, [garments, todayStr]);

  const stageStats = useMemo(() => {
    const map = new Map<string, { count: number }>();
    for (const s of STAGES) map.set(s.key, { count: 0 });
    for (const r of resources) {
      if (!r.responsibility) continue;
      const entry = map.get(r.responsibility);
      if (!entry) continue;
      entry.count += 1;
    }
    return map;
  }, [resources]);

  const unitsForActiveStage = useMemo(
    () => units.filter((u) => u.stage === activeStage).sort((a, b) => a.name.localeCompare(b.name)),
    [units, activeStage],
  );

  // Workers in active stage. For soaking, flat list (ignore unit_id). For
  // unit/worker stages, grouped by unit_id with null bucket = Unassigned.
  const activeStageWorkers = useMemo(
    () =>
      resources
        .filter((r) => r.responsibility === activeStage)
        .sort((a, b) => a.resource_name.localeCompare(b.resource_name)),
    [resources, activeStage],
  );

  const workersByUnit = useMemo(() => {
    const byUnit = new Map<string | null, ResourceWithUser[]>();
    for (const r of activeStageWorkers) {
      const key = r.unit_id ?? null;
      if (!byUnit.has(key)) byUnit.set(key, []);
      byUnit.get(key)!.push(r);
    }
    return byUnit;
  }, [activeStageWorkers]);

  const unassignedWorkers = workersByUnit.get(null) ?? [];

  const otherStagesByResourceId = useMemo(() => {
    const stagesByUser = new Map<string, ProductionStage[]>();
    for (const r of resources) {
      if (!r.user_id || !r.responsibility) continue;
      const arr = stagesByUser.get(r.user_id) ?? [];
      arr.push(r.responsibility as ProductionStage);
      stagesByUser.set(r.user_id, arr);
    }
    const map = new Map<string, string[]>();
    for (const r of resources) {
      if (!r.user_id) continue;
      const all = stagesByUser.get(r.user_id) ?? [];
      const others = all
        .filter((s) => s !== r.responsibility)
        .map((s) => STAGES.find((st) => st.key === s)?.label ?? s);
      map.set(r.id, others);
    }
    return map;
  }, [resources]);

  const workerCountByUnit = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of resources) {
      if (!r.unit_id) continue;
      map.set(r.unit_id, (map.get(r.unit_id) ?? 0) + 1);
    }
    return map;
  }, [resources]);

  const goToAddWorker = (stageKey: StageKey, unitId: string | null) => {
    navigate({
      to: "/users/new",
      search: { stage: stageKey, ...(unitId ? { unit_id: unitId } : {}) },
    });
  };

  const openEditWorker = (w: ResourceWithUser) => {
    setEditingWorker(w);
    setForm({
      resource_name: w.resource_name,
      unit_id: w.unit_id ?? null,
      resource_type: w.resource_type ?? undefined,
      daily_target: w.daily_target ?? undefined,
      overtime_target: w.overtime_target ?? undefined,
      rating: w.rating ?? undefined,
    });
    setWorkerDialogOpen(true);
  };

  const handleWorkerSubmit = async () => {
    if (!editingWorker) return;
    try {
      await updateMut.mutateAsync({ id: editingWorker.id, updates: form });
      setWorkerDialogOpen(false);
      setForm({});
      setEditingWorker(null);
    } catch (err) {
      toast.error(`Could not save worker: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDeleteWorkerConfirm = () => {
    if (!deleteTarget) return;
    deleteMut.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
      onError: (err) => {
        toast.error(`Could not remove worker: ${err instanceof Error ? err.message : String(err)}`);
        setDeleteTarget(null);
      },
    });
  };

  // ── Unit actions ──
  const openAddUnit = (stageKey: StageKey = activeStage) => {
    setUnitDialogMode("add");
    setEditingUnitId(null);
    setUnitDialogStage(stageKey);
    setUnitName("");
    setUnitNotes("");
    setUnitDailyTarget("");
    setUnitDialogOpen(true);
  };

  const openEditUnit = (u: Unit) => {
    setUnitDialogMode("edit");
    setEditingUnitId(u.id);
    setUnitDialogStage(u.stage as StageKey);
    setUnitName(u.name);
    setUnitNotes(u.notes ?? "");
    setUnitDailyTarget(u.daily_target != null ? String(u.daily_target) : "");
    setUnitDialogOpen(true);
  };

  const handleUnitSubmit = async () => {
    const name = unitName.trim();
    if (!name) return;
    const isUnitScoped = getStageShape(unitDialogStage) === "unit";
    const dailyTarget = isUnitScoped && unitDailyTarget.trim() !== ""
      ? Number(unitDailyTarget)
      : null;
    try {
      if (unitDialogMode === "add") {
        await createUnitMut.mutateAsync({
          stage: unitDialogStage,
          name,
          notes: unitNotes.trim() || undefined,
          ...(isUnitScoped ? { daily_target: dailyTarget } : {}),
        });
      } else if (editingUnitId) {
        await updateUnitMut.mutateAsync({
          id: editingUnitId,
          updates: {
            name,
            notes: unitNotes.trim() || null,
            ...(isUnitScoped ? { daily_target: dailyTarget } : {}),
          },
        });
      }
      setUnitDialogOpen(false);
    } catch (err) {
      toast.error(`${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDeleteUnitConfirm = () => {
    if (!deleteUnitTarget) return;
    deleteUnitMut.mutate(deleteUnitTarget.id, {
      onSuccess: () => setDeleteUnitTarget(null),
      onError: (err) => {
        toast.error(`${err instanceof Error ? err.message : String(err)}`);
        setDeleteUnitTarget(null);
      },
    });
  };

  const activeStageLabel = STAGES.find((s) => s.key === activeStage)?.label ?? activeStage;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <PageHeader
        icon={Users}
        title="Production Team"
        subtitle={`${resources.length} worker${resources.length !== 1 ? "s" : ""} across ${units.length} unit${units.length !== 1 ? "s" : ""}, ${STAGES.length} stages`}
      >
        <div className="flex items-center gap-2">
          {activeShape === "unit" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="About sewing units"
                  className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <Info className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[280px] text-sm leading-snug">
                Each garment is assigned to a unit. Any member can work on it. Daily target and output are tracked per unit.
              </TooltipContent>
            </Tooltip>
          )}
          {activeShape !== "group" && (
            <Button variant="outline" onClick={() => openAddUnit()} size="default" className="gap-2 shrink-0">
              <FolderPlus className="w-4 h-4" />
              New unit
            </Button>
          )}
          <Button onClick={() => goToAddWorker(activeStage, null)} size="default" className="gap-2 shrink-0">
            <Plus className="w-4 h-4" />
            Add worker
          </Button>
        </div>
      </PageHeader>

      <StageTabs activeStage={activeStage} onSelect={setActiveStage} stageStats={stageStats} />

      {isLoading || unitsLoading ? (
        <Skeleton className="h-64 rounded-md" />
      ) : activeShape === "group" ? (
        <GroupRoster
          workers={activeStageWorkers}
          todayCompletions={todayCompletions}
          otherStagesByResourceId={otherStagesByResourceId}
          onAddWorker={() => goToAddWorker(activeStage, null)}
          onEditWorker={openEditWorker}
          onDeleteWorker={(w) => setDeleteTarget({ id: w.id, name: w.resource_name })}
        />
      ) : unitsForActiveStage.length === 0 && unassignedWorkers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-border rounded-md bg-card">
          <UserX className="w-6 h-6 text-muted-foreground/50 mb-2" />
          <p className="text-sm font-medium">
            No {activeStageLabel.toLowerCase()} units yet
          </p>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            Create a unit (e.g. &ldquo;{activeStageLabel} 1&rdquo;) and add workers to it.
          </p>
          <Button variant="outline" size="sm" onClick={() => openAddUnit()} className="gap-2 mt-3">
            <FolderPlus className="w-3.5 h-3.5" />
            Create first unit
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {unitsForActiveStage.map((u) => (
            <UnitSection
              key={u.id}
              unit={u}
              workers={workersByUnit.get(u.id) ?? []}
              todayCompletions={todayCompletions}
              otherStagesByResourceId={otherStagesByResourceId}
              shape={activeShape}
              onEditUnit={() => openEditUnit(u)}
              onDeleteUnit={() => setDeleteUnitTarget(u)}
              onAddWorker={() => goToAddWorker(activeStage, u.id)}
              onEditWorker={openEditWorker}
              onDeleteWorker={(w) => setDeleteTarget({ id: w.id, name: w.resource_name })}
            />
          ))}
          {unassignedWorkers.length > 0 && (
            <UnitSection
              unit={null}
              workers={unassignedWorkers}
              todayCompletions={todayCompletions}
              otherStagesByResourceId={otherStagesByResourceId}
              shape={activeShape}
              onAddWorker={() => goToAddWorker(activeStage, null)}
              onEditWorker={openEditWorker}
              onDeleteWorker={(w) => setDeleteTarget({ id: w.id, name: w.resource_name })}
            />
          )}
        </div>
      )}

      <EditWorkerDialog
        open={workerDialogOpen}
        onOpenChange={(v) => {
          setWorkerDialogOpen(v);
          if (!v) { setEditingWorker(null); setForm({}); }
        }}
        worker={editingWorker}
        form={form}
        setForm={setForm}
        onSubmit={handleWorkerSubmit}
        isPending={updateMut.isPending}
        unitsForStage={
          editingWorker?.responsibility
            ? units.filter((u) => u.stage === editingWorker.responsibility).sort((a, b) => a.name.localeCompare(b.name))
            : []
        }
        onAskCreateUnit={() => {
          if (editingWorker?.responsibility) openAddUnit(editingWorker.responsibility as StageKey);
        }}
      />

      <UnitFormDialog
        open={unitDialogOpen}
        onOpenChange={setUnitDialogOpen}
        mode={unitDialogMode}
        stage={unitDialogStage}
        name={unitName}
        notes={unitNotes}
        dailyTarget={unitDailyTarget}
        setName={setUnitName}
        setNotes={setUnitNotes}
        setDailyTarget={setUnitDailyTarget}
        onSubmit={handleUnitSubmit}
        isPending={createUnitMut.isPending || updateUnitMut.isPending}
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        workerName={deleteTarget?.name ?? ""}
        onConfirm={handleDeleteWorkerConfirm}
        isPending={deleteMut.isPending}
      />

      <DeleteUnitDialog
        open={!!deleteUnitTarget}
        onOpenChange={(v) => { if (!v) setDeleteUnitTarget(null); }}
        unit={deleteUnitTarget}
        workerCount={deleteUnitTarget ? workerCountByUnit.get(deleteUnitTarget.id) ?? 0 : 0}
        onConfirm={handleDeleteUnitConfirm}
        isPending={deleteUnitMut.isPending}
      />
    </div>
  );
}

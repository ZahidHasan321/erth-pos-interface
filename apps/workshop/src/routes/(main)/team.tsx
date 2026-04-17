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

import { PageHeader } from "@/components/shared/PageShell";
import { cn, getLocalDateStr, toLocalDateStr } from "@/lib/utils";
import { toast } from "sonner";
import type { NewResource, Unit, ProductionStage } from "@repo/database";
import type { ResourceWithUser } from "@/api/resources";
import {
  Users, Plus, Trash2, Droplets, Scissors,
  Pencil, Link2,
  AlertTriangle, UserX, ChevronDown, FolderPlus,
} from "lucide-react";
import { IconNeedle, IconIroning1, IconRosette, IconStack2, IconSparkles } from "@tabler/icons-react";

export const Route = createFileRoute("/(main)/team")({
  component: TeamPage,
  head: () => ({ meta: [{ title: "Production Team" }] }),
});

const STAGES = [
  { key: "soaking",       label: "Soaking",       icon: Droplets,      color: "sky" },
  { key: "cutting",       label: "Cutting",       icon: Scissors,      color: "amber" },
  { key: "post_cutting",  label: "Post-Cut",      icon: IconStack2,    color: "orange" },
  { key: "sewing",        label: "Sewing",        icon: IconNeedle,    color: "purple" },
  { key: "finishing",     label: "Finishing",      icon: IconSparkles,  color: "emerald" },
  { key: "ironing",       label: "Ironing",       icon: IconIroning1,  color: "rose" },
  { key: "quality_check", label: "QC",             icon: IconRosette,   color: "indigo" },
] as const satisfies ReadonlyArray<{ key: ProductionStage; label: string; icon: React.ElementType; color: string }>;

type StageKey = (typeof STAGES)[number]["key"];

const STAGE_CLASSES: Record<string, { iconColor: string; stripe: string; dot: string }> = {
  soaking:       { iconColor: "text-sky-600",     stripe: "bg-sky-500",     dot: "bg-sky-500" },
  cutting:       { iconColor: "text-amber-600",   stripe: "bg-amber-500",   dot: "bg-amber-500" },
  post_cutting:  { iconColor: "text-orange-600",  stripe: "bg-orange-500",  dot: "bg-orange-500" },
  sewing:        { iconColor: "text-purple-600",  stripe: "bg-purple-500",  dot: "bg-purple-500" },
  finishing:     { iconColor: "text-emerald-600", stripe: "bg-emerald-500", dot: "bg-emerald-500" },
  ironing:       { iconColor: "text-rose-600",    stripe: "bg-rose-500",    dot: "bg-rose-500" },
  quality_check: { iconColor: "text-indigo-600",  stripe: "bg-indigo-500",  dot: "bg-indigo-500" },
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
          <DialogTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-wider">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            Remove Worker
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground pt-2">
            Remove <span className="font-semibold text-foreground">{workerName}</span> from the production team?
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-xs text-red-700 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>Historical production data is preserved. Worker will no longer appear in assignment pickers.</span>
        </div>
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
          <DialogTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-wider">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            Delete Unit
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground pt-2">
            Delete unit <span className="font-semibold text-foreground">{unit?.name}</span>?
          </DialogDescription>
        </DialogHeader>
        {blocked ? (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{workerCount} worker{workerCount === 1 ? "" : "s"} still assigned. Move or remove them first.</span>
          </div>
        ) : (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-xs text-red-700">
            This cannot be undone.
          </div>
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
  open, onOpenChange, mode, stage, name, notes, setName, setNotes, onSubmit, isPending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: "add" | "edit";
  stage: StageKey;
  name: string;
  notes: string;
  setName: (v: string) => void;
  setNotes: (v: string) => void;
  onSubmit: () => void;
  isPending: boolean;
}) {
  const stageLabel = STAGES.find((s) => s.key === stage)?.label ?? stage;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm font-black uppercase tracking-wider">
            {mode === "add" ? `New ${stageLabel} Unit` : "Rename Unit"}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {mode === "add"
              ? "Groupings under a stage. Workers get assigned to units."
              : "Renaming propagates to all workers in this unit."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">Name <span className="text-red-500">*</span></Label>
            <Input
              autoFocus
              placeholder={mode === "add" ? `e.g. ${stageLabel} 1` : ""}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) onSubmit(); }}
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">Notes</Label>
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
  stageStats: Map<string, { count: number; actual: number; target: number }>;
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
        const stats = stageStats.get(stage.key) ?? { count: 0, actual: 0, target: 0 };
        const isActive = activeStage === stage.key;
        return (
          <button
            key={stage.key}
            ref={(el) => { if (el) tabRefs.current.set(stage.key, el); }}
            onClick={() => onSelect(stage.key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors duration-200 shrink-0",
              isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className={cn("w-3.5 h-3.5", isActive ? stSc.iconColor : "")} />
            <span>{stage.label}</span>
            <span className={cn(
              "text-[10px] font-bold tabular-nums ml-0.5 bg-muted px-1.5 py-0.5 rounded-full transition-colors duration-200",
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

function WorkerRow({
  w, actual, onEdit, onDelete,
}: {
  w: ResourceWithUser;
  actual: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const target = w.daily_target ?? 0;
  const eff = target > 0 ? Math.round((actual / target) * 100) : 0;

  return (
    <div
      className="group hover:bg-muted/30 transition-colors cursor-pointer"
      onClick={onEdit}
    >
      {/* Desktop */}
      <div className="hidden md:grid grid-cols-[1fr_80px_80px_80px_100px_70px] gap-2 px-5 py-2.5 items-center">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-7 h-7 rounded-full bg-zinc-100 flex items-center justify-center text-[11px] font-bold text-zinc-500 shrink-0">
            {w.resource_name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{w.resource_name}</p>
            {w.user && (
              <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                <Link2 className="w-2.5 h-2.5" />
                {w.user.name}
              </p>
            )}
          </div>
        </div>

        {w.resource_type ? (
          <span className={cn(
            "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded w-fit",
            w.resource_type === "Senior" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600",
          )}>
            {w.resource_type}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}

        <span className="text-sm font-semibold tabular-nums">{target > 0 ? target : "—"}</span>
        <span className="text-sm font-bold tabular-nums">{actual}</span>

        {target > 0 ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  eff >= 90 ? "bg-emerald-500" : eff >= 70 ? "bg-amber-500" : "bg-red-500",
                )}
                style={{ width: `${Math.min(eff, 100)}%` }}
              />
            </div>
            <span className={cn(
              "text-[10px] font-bold tabular-nums w-8 text-right",
              eff >= 90 ? "text-emerald-600" : eff >= 70 ? "text-amber-600" : "text-red-600",
            )}>
              {eff}%
            </span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}

        <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Edit worker"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
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
            <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-xs font-bold text-zinc-500 shrink-0">
              {w.resource_name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{w.resource_name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {w.resource_type && (
                  <span className={cn(
                    "text-[9px] font-bold uppercase px-1 py-0.5 rounded",
                    w.resource_type === "Senior" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600",
                  )}>
                    {w.resource_type}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-sm font-bold tabular-nums">{actual}{target > 0 ? `/${target}` : ""}</div>
            {target > 0 && (
              <span className={cn(
                "text-[10px] font-bold tabular-nums",
                eff >= 90 ? "text-emerald-600" : eff >= 70 ? "text-amber-600" : "text-red-600",
              )}>
                {eff}%
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Unit Section ────────────────────────────────────────────────────

function UnitSection({
  unit, workers, todayCompletions, stageColor, onEditUnit, onDeleteUnit, onAddWorker, onEditWorker, onDeleteWorker,
}: {
  unit: Unit | null; // null = Unassigned bucket
  workers: ResourceWithUser[];
  todayCompletions: Map<string, number>;
  stageColor: string;
  onEditUnit?: () => void;
  onDeleteUnit?: () => void;
  onAddWorker: () => void;
  onEditWorker: (w: ResourceWithUser) => void;
  onDeleteWorker: (w: ResourceWithUser) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const count = workers.length;
  const actualSum = workers.reduce((s, w) => s + (todayCompletions.get(w.resource_name) ?? 0), 0);
  const targetSum = workers.reduce((s, w) => s + (w.daily_target ?? 0), 0);
  const eff = targetSum > 0 ? Math.round((actualSum / targetSum) * 100) : 0;

  return (
    <div className="border rounded-xl overflow-hidden bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/30 border-b">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="p-1 rounded hover:bg-muted"
          aria-label={collapsed ? "Expand unit" : "Collapse unit"}
        >
          <ChevronDown className={cn("w-4 h-4 transition-transform", collapsed && "-rotate-90")} />
        </button>
        <div className={cn("w-1 h-5 rounded-full", stageColor)} />
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <h3 className="text-sm font-bold truncate">
            {unit ? unit.name : <span className="text-muted-foreground italic">Unassigned</span>}
          </h3>
          <span className="text-[10px] font-bold tabular-nums bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground">
            {count}
          </span>
          {unit?.notes && (
            <span className="text-[11px] text-muted-foreground truncate hidden sm:inline">· {unit.notes}</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground shrink-0">
          {targetSum > 0 && (
            <span className="tabular-nums hidden sm:inline">
              {actualSum}/{targetSum} · {eff}%
            </span>
          )}
          <div className="flex items-center gap-0.5">
            <button
              onClick={onAddWorker}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Add worker to unit"
              title="Add worker"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            {unit && onEditUnit && (
              <button
                onClick={onEditUnit}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Rename unit"
                title="Rename unit"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            {unit && onDeleteUnit && (
              <button
                onClick={onDeleteUnit}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
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
            <p className="text-xs text-muted-foreground mb-2">No workers in this unit</p>
            <Button variant="outline" size="sm" onClick={onAddWorker} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Add worker
            </Button>
          </div>
        ) : (
          <>
            <div className="hidden md:grid grid-cols-[1fr_80px_80px_80px_100px_70px] gap-2 px-5 py-2 bg-muted/10 border-b">
              {["Worker", "Type", "Target", "Today", "Progress", ""].map((label) => (
                <span key={label} className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {label}
                </span>
              ))}
            </div>
            <div className="divide-y">
              {workers.map((w) => (
                <WorkerRow
                  key={w.id}
                  w={w}
                  actual={todayCompletions.get(w.resource_name) ?? 0}
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-wider">
            <Pencil className="w-4 h-4" />
            Edit Worker
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground pt-1">
            Production settings for <span className="font-semibold text-foreground">{worker.resource_name}</span>.
            Identity, role, and terminal are managed on the user page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Display Name</Label>
            <Input
              value={form.resource_name ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, resource_name: e.target.value }))}
              placeholder="Name shown in scheduler"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Unit</Label>
              <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[11px] gap-1" onClick={onAskCreateUnit}>
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
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Level</Label>
              <Select
                value={form.resource_type ?? "none"}
                onValueChange={(v) => setForm((p) => ({ ...p, resource_type: v === "none" ? null : v }))}
              >
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  <SelectItem value="Senior">Senior</SelectItem>
                  <SelectItem value="Junior">Junior</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Rating (1-5)</Label>
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Daily Target</Label>
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
              <Label className="text-xs font-medium">Overtime Target</Label>
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

  // Worker edit state — production-only fields (unit/target/rating).
  // Adding a worker now goes through /users/new (auto-creates resource).
  const [workerDialogOpen, setWorkerDialogOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<ResourceWithUser | null>(null);
  const [form, setForm] = useState<WorkerEditForm>({});
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // Unit form state
  const [unitDialogOpen, setUnitDialogOpen] = useState(false);
  const [unitDialogMode, setUnitDialogMode] = useState<"add" | "edit">("add");
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [unitName, setUnitName] = useState("");
  const [unitNotes, setUnitNotes] = useState("");
  const [deleteUnitTarget, setDeleteUnitTarget] = useState<Unit | null>(null);
  // Stage the unit dialog operates on — usually activeStage, but pinned to the
  // worker form's stage when opened from inside the worker dialog.
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
    const map = new Map<string, { count: number; actual: number; target: number }>();
    for (const s of STAGES) map.set(s.key, { count: 0, actual: 0, target: 0 });
    for (const r of resources) {
      if (!r.responsibility) continue;
      const entry = map.get(r.responsibility);
      if (!entry) continue;
      entry.count += 1;
      entry.target += r.daily_target ?? 0;
      entry.actual += todayCompletions.get(r.resource_name) ?? 0;
    }
    return map;
  }, [resources, todayCompletions]);

  // Units belonging to the active stage, sorted by name.
  const unitsForActiveStage = useMemo(
    () => units.filter((u) => u.stage === activeStage).sort((a, b) => a.name.localeCompare(b.name)),
    [units, activeStage],
  );

  // Group workers in the active stage by unit_id.
  const workersByUnit = useMemo(() => {
    const byUnit = new Map<string | null, ResourceWithUser[]>();
    for (const r of resources) {
      if (r.responsibility !== activeStage) continue;
      const key = r.unit_id ?? null;
      if (!byUnit.has(key)) byUnit.set(key, []);
      byUnit.get(key)!.push(r);
    }
    for (const arr of byUnit.values()) arr.sort((a, b) => a.resource_name.localeCompare(b.resource_name));
    return byUnit;
  }, [resources, activeStage]);

  const unassignedWorkers = workersByUnit.get(null) ?? [];

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
    setUnitDialogOpen(true);
  };

  const openEditUnit = (u: Unit) => {
    setUnitDialogMode("edit");
    setEditingUnitId(u.id);
    setUnitDialogStage(u.stage);
    setUnitName(u.name);
    setUnitNotes(u.notes ?? "");
    setUnitDialogOpen(true);
  };

  const handleUnitSubmit = async () => {
    const name = unitName.trim();
    if (!name) return;
    try {
      if (unitDialogMode === "add") {
        await createUnitMut.mutateAsync({
          stage: unitDialogStage,
          name,
          notes: unitNotes.trim() || undefined,
        });
      } else if (editingUnitId) {
        await updateUnitMut.mutateAsync({
          id: editingUnitId,
          updates: { name, notes: unitNotes.trim() || null },
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

  const stageColor = STAGE_CLASSES[activeStage]?.stripe ?? "bg-foreground";
  const activeStageLabel = STAGES.find((s) => s.key === activeStage)?.label ?? activeStage;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <PageHeader
        icon={Users}
        title="Production Team"
        subtitle={`${resources.length} worker${resources.length !== 1 ? "s" : ""} across ${units.length} unit${units.length !== 1 ? "s" : ""}, ${STAGES.length} stages`}
      >
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => openAddUnit()} size="default" className="gap-2 shrink-0">
            <FolderPlus className="w-4 h-4" />
            New Unit
          </Button>
          <Button onClick={() => goToAddWorker(activeStage, null)} size="default" className="shadow-sm gap-2 shrink-0">
            <Plus className="w-4 h-4" />
            Add Worker
          </Button>
        </div>
      </PageHeader>

      <StageTabs activeStage={activeStage} onSelect={setActiveStage} stageStats={stageStats} />

      {isLoading || unitsLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : unitsForActiveStage.length === 0 && unassignedWorkers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <UserX className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-base font-semibold mb-1">
            No {activeStageLabel.toLowerCase()} units yet
          </h3>
          <p className="text-sm text-muted-foreground max-w-xs mb-4">
            Create a unit (e.g. &ldquo;{activeStageLabel} 1&rdquo;) and add workers to it.
          </p>
          <Button variant="outline" onClick={() => openAddUnit()} className="gap-2">
            <FolderPlus className="w-4 h-4" />
            Create First Unit
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
              stageColor={stageColor}
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
              stageColor="bg-muted-foreground"
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
        setName={setUnitName}
        setNotes={setUnitNotes}
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

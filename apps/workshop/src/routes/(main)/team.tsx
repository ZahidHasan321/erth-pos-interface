import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useResourcesWithUsers, useCreateResource, useUpdateResource, useDeleteResource, useLinkResourceToUser } from "@/hooks/useResources";
import { useUsers } from "@/hooks/useUsers";
import { useWorkshopGarments } from "@/hooks/useWorkshopGarments";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@repo/ui/dialog";
import { Skeleton } from "@repo/ui/skeleton";

import { Separator } from "@repo/ui/separator";
import { PageHeader } from "@/components/shared/PageShell";
import { cn, getLocalDateStr, toLocalDateStr } from "@/lib/utils";
import { toast } from "sonner";
import type { NewResource } from "@repo/database";
import type { ResourceWithUser } from "@/api/resources";
import {
  Users, Plus, Trash2, Droplets, Scissors,
  Pencil,
  Link2, AlertTriangle, UserX,
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
] as const;

const STAGE_CLASSES: Record<string, { iconColor: string; bg: string; border: string; stripe: string; badge: string; tab: string; tabActive: string; progress: string; dot: string }> = {
  soaking:       { iconColor: "text-sky-600",     bg: "bg-muted/40",   border: "border-border",      stripe: "bg-sky-500",     badge: "bg-zinc-100 text-zinc-700",       tab: "hover:bg-muted hover:text-foreground",     tabActive: "bg-muted text-foreground border-border", progress: "bg-sky-500", dot: "bg-sky-500" },
  cutting:       { iconColor: "text-amber-600",   bg: "bg-muted/40",   border: "border-border",      stripe: "bg-amber-500",   badge: "bg-zinc-100 text-zinc-700",       tab: "hover:bg-muted hover:text-foreground",     tabActive: "bg-muted text-foreground border-border", progress: "bg-amber-500", dot: "bg-amber-500" },
  post_cutting:  { iconColor: "text-orange-600",  bg: "bg-muted/40",   border: "border-border",      stripe: "bg-orange-500",  badge: "bg-zinc-100 text-zinc-700",       tab: "hover:bg-muted hover:text-foreground",     tabActive: "bg-muted text-foreground border-border", progress: "bg-orange-500", dot: "bg-orange-500" },
  sewing:        { iconColor: "text-purple-600",  bg: "bg-muted/40",   border: "border-border",      stripe: "bg-purple-500",  badge: "bg-zinc-100 text-zinc-700",       tab: "hover:bg-muted hover:text-foreground",     tabActive: "bg-muted text-foreground border-border", progress: "bg-purple-500", dot: "bg-purple-500" },
  finishing:     { iconColor: "text-emerald-600", bg: "bg-muted/40",   border: "border-border",      stripe: "bg-emerald-500", badge: "bg-zinc-100 text-zinc-700",       tab: "hover:bg-muted hover:text-foreground",     tabActive: "bg-muted text-foreground border-border", progress: "bg-emerald-500", dot: "bg-emerald-500" },
  ironing:       { iconColor: "text-rose-600",    bg: "bg-muted/40",   border: "border-border",      stripe: "bg-rose-500",    badge: "bg-zinc-100 text-zinc-700",       tab: "hover:bg-muted hover:text-foreground",     tabActive: "bg-muted text-foreground border-border", progress: "bg-rose-500", dot: "bg-rose-500" },
  quality_check: { iconColor: "text-indigo-600",  bg: "bg-muted/40",   border: "border-border",      stripe: "bg-indigo-500",  badge: "bg-zinc-100 text-zinc-700",       tab: "hover:bg-muted hover:text-foreground",     tabActive: "bg-muted text-foreground border-border", progress: "bg-indigo-500", dot: "bg-indigo-500" },
};

type FormData = Partial<Omit<NewResource, "id" | "created_at">> & { link_user_id?: string };

// ── Delete Confirmation Dialog ──────────────────────────────────────

function DeleteConfirmDialog({
  open,
  onOpenChange,
  workerName,
  onConfirm,
  isPending,
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
            Are you sure you want to remove <span className="font-semibold text-foreground">{workerName}</span> from the production team?
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-xs text-red-700 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>This will remove the worker from all schedules and production assignments. Historical data will be preserved.</span>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isPending}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Worker Form Dialog ──────────────────────────────────────────────

function WorkerFormDialog({
  open, onOpenChange, mode, form, setForm, onSubmit, isPending, existingUnits, workshopUsers,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: "add" | "edit";
  form: FormData;
  setForm: React.Dispatch<React.SetStateAction<FormData>>;
  onSubmit: () => void;
  isPending: boolean;
  existingUnits: string[];
  workshopUsers: { id: string; name: string }[];
}) {
  const [newUnit, setNewUnit] = useState(false);

  const handleOpenChange = (v: boolean) => {
    if (!v) setNewUnit(false);
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-black uppercase tracking-wider">
            {mode === "add" ? "Add Worker" : "Edit Worker"}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {mode === "add" ? "Add a new worker to the production team." : "Update worker details and assignments."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">Name <span className="text-red-500">*</span></Label>
            <Input
              placeholder="Worker name"
              value={form.resource_name ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, resource_name: e.target.value }))}
              className="h-10"
            />
          </div>

          {/* Stage */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">Stage <span className="text-red-500">*</span></Label>
            <Select
              value={form.responsibility ?? ""}
              onValueChange={(v) => {
                setForm((p) => ({ ...p, responsibility: v, unit: "" }));
                setNewUnit(false);
              }}
            >
              <SelectTrigger className="h-10"><SelectValue placeholder="Select production stage" /></SelectTrigger>
              <SelectContent>
                {STAGES.map((s) => {
                  const SIcon = s.icon;
                  const stSc = STAGE_CLASSES[s.key];
                  return (
                    <SelectItem key={s.key} value={s.key}>
                      <span className="flex items-center gap-2.5">
                        <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", stSc?.dot)} />
                        <SIcon className={cn("w-3.5 h-3.5", stSc?.iconColor)} />
                        {s.label}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Unit & Type */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold">Unit</Label>
                {existingUnits.length > 0 && (
                  <button
                    type="button"
                    onClick={() => { setNewUnit(!newUnit); setForm((p) => ({ ...p, unit: "" })); }}
                    className="text-[10px] text-primary font-bold hover:underline"
                  >
                    {newUnit ? "Pick existing" : "+ New"}
                  </button>
                )}
              </div>
              {existingUnits.length > 0 && !newUnit ? (
                <Select value={form.unit ?? ""} onValueChange={(v) => setForm((p) => ({ ...p, unit: v }))}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Select unit" /></SelectTrigger>
                  <SelectContent>
                    {existingUnits.map((u) => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  placeholder="e.g. Sewing 1"
                  value={form.unit ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))}
                  className="h-10"
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Type</Label>
              <Select value={form.resource_type ?? ""} onValueChange={(v) => setForm((p) => ({ ...p, resource_type: v }))}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Senior">Senior</SelectItem>
                  <SelectItem value="Junior">Junior</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Targets & Rating */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Daily Target</Label>
              <Input
                type="number"
                inputMode="numeric"
                placeholder="e.g. 10"
                value={form.daily_target ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, daily_target: Number(e.target.value) || undefined }))}
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">OT Target</Label>
              <Input
                type="number"
                inputMode="numeric"
                placeholder="e.g. 5"
                value={form.overtime_target ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, overtime_target: Number(e.target.value) || undefined }))}
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Rating (1-5)</Label>
              <Input
                type="number"
                inputMode="numeric"
                min={1} max={5}
                placeholder="1-5"
                value={form.rating ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, rating: Number(e.target.value) || undefined }))}
                className="h-10"
              />
            </div>
          </div>

          {/* Link to user account */}
          {workshopUsers.length > 0 && (
            <>
              <Separator />
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Link to User Account</Label>
                <Select
                  value={form.link_user_id || "none"}
                  onValueChange={(v) => setForm((p) => ({ ...p, link_user_id: v === "none" ? "" : v }))}
                >
                  <SelectTrigger className="h-10"><SelectValue placeholder="No link" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      <span className="text-muted-foreground">No link</span>
                    </SelectItem>
                    {workshopUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        <span className="flex items-center gap-2">
                          <Link2 className="w-3 h-3 text-muted-foreground" />
                          {u.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
          <Button
            onClick={onSubmit}
            disabled={!form.resource_name || !form.responsibility || isPending}
          >
            {mode === "add" ? "Add Worker" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Stage Tabs with Sliding Indicator ───────────────────────────────

function StageTabs({
  activeStage,
  onSelect,
  stageStats,
}: {
  activeStage: string;
  onSelect: (key: (typeof STAGES)[number]["key"]) => void;
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
    setIndicator({
      left: tRect.left - cRect.left + container.scrollLeft,
      width: tRect.width,
    });
  }, [activeStage]);

  useEffect(() => {
    updateIndicator();
  }, [updateIndicator]);

  // Recalc on resize
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
      {/* Sliding indicator */}
      <div
        className="absolute bottom-0 h-0.5 bg-foreground rounded-full transition-all duration-300 ease-out"
        style={{ left: indicator.left, width: indicator.width }}
      />
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

function TeamPage() {
  const { data: resources = [], isLoading } = useResourcesWithUsers();
  const { data: users = [] } = useUsers();
  const { data: garments = [] } = useWorkshopGarments();
  const createMut = useCreateResource();
  const updateMut = useUpdateResource();
  const deleteMut = useDeleteResource();
  const linkMut = useLinkResourceToUser();

  const [activeStage, setActiveStage] = useState<(typeof STAGES)[number]["key"]>(STAGES[0].key);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>({});
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

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

  const workshopUsers = useMemo(() => {
    const linkedUserIds = new Set(resources.map((r) => r.user_id).filter(Boolean));
    return users
      .filter((u) => u.department === "workshop" && u.is_active !== false && !linkedUserIds.has(u.id))
      .map((u) => ({ id: u.id, name: u.name }));
  }, [users, resources]);

  // Workers per stage + today's progress per stage
  const stageStats = useMemo(() => {
    const map = new Map<string, { count: number; actual: number; target: number }>();
    for (const s of STAGES) {
      map.set(s.key, { count: 0, actual: 0, target: 0 });
    }
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

  // Current stage workers grouped by unit
  const stageWorkers = useMemo(() => resources.filter((r) => r.responsibility === activeStage), [resources, activeStage]);

  const currentStats = stageStats.get(activeStage) ?? { count: 0, actual: 0, target: 0 };
  const stageEfficiency = currentStats.target > 0 ? Math.round((currentStats.actual / currentStats.target) * 100) : 0;

  const existingUnits = form.responsibility
    ? [...new Set(resources.filter((r) => r.responsibility === form.responsibility).map((r) => r.unit).filter((u): u is string => !!u))]
    : [];

  const openAdd = (stageKey?: string) => {
    setDialogMode("add");
    setEditingId(null);
    setForm({ responsibility: stageKey ?? activeStage });
    setDialogOpen(true);
  };

  const openEdit = (w: ResourceWithUser) => {
    setDialogMode("edit");
    setEditingId(w.id);
    setForm({
      resource_name: w.resource_name,
      responsibility: w.responsibility ?? undefined,
      unit: w.unit ?? undefined,
      resource_type: w.resource_type ?? undefined,
      daily_target: w.daily_target ?? undefined,
      overtime_target: w.overtime_target ?? undefined,
      rating: w.rating ?? undefined,
      link_user_id: w.user_id ?? undefined,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.resource_name || !form.responsibility) return;
    const { link_user_id, ...resourceData } = form;
    try {
      if (dialogMode === "add") {
        const created = await createMut.mutateAsync(resourceData as Omit<NewResource, "id" | "created_at">);
        if (link_user_id) {
          await linkMut.mutateAsync({ resourceId: created.id, userId: link_user_id });
        }
        toast.success(`${form.resource_name} added`);
      } else if (editingId) {
        await updateMut.mutateAsync({ id: editingId, updates: resourceData });
        if (link_user_id) {
          await linkMut.mutateAsync({ resourceId: editingId, userId: link_user_id });
        }
        toast.success(`${form.resource_name} updated`);
      }
      setDialogOpen(false);
      setForm({});
      setEditingId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    deleteMut.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success(`${deleteTarget.name} removed`);
        setDeleteTarget(null);
      },
      onError: () => {
        toast.error("Failed to remove worker");
        setDeleteTarget(null);
      },
    });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <PageHeader
        icon={Users}
        title="Production Team"
        subtitle={`${resources.length} worker${resources.length !== 1 ? "s" : ""} across ${STAGES.length} stages`}
      >
        <Button onClick={() => openAdd()} size="default" className="shadow-sm gap-2 shrink-0">
          <Plus className="w-4 h-4" />
          Add Worker
        </Button>
      </PageHeader>

      {/* Stage Tabs */}
      <StageTabs
        activeStage={activeStage}
        onSelect={setActiveStage}
        stageStats={stageStats}
      />

      {/* Workers Table */}
      {isLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : stageWorkers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <UserX className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-base font-semibold mb-1">
            No workers in {STAGES.find((s) => s.key === activeStage)?.label.toLowerCase()}
          </h3>
          <p className="text-sm text-muted-foreground max-w-xs mb-4">
            Add workers to this stage to start tracking their daily production.
          </p>
          <Button variant="outline" onClick={() => openAdd()} className="gap-2">
            <Plus className="w-4 h-4" />
            Add First Worker
          </Button>
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden bg-card shadow-sm">
          {/* Table Header */}
          <div className="hidden md:grid grid-cols-[1fr_100px_80px_80px_80px_100px_70px] gap-2 px-5 py-3 bg-muted/30 border-b">
            {["Worker", "Unit", "Type", "Target", "Today", "Progress", ""].map((label) => (
              <span key={label} className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {label}
              </span>
            ))}
          </div>

          {/* Table Body */}
          <div className="divide-y">
            {stageWorkers.map((w) => {
              const actual = todayCompletions.get(w.resource_name) ?? 0;
              const target = w.daily_target ?? 0;
              const eff = target > 0 ? Math.round((actual / target) * 100) : 0;

              return (
                <div
                  key={w.id}
                  className="group hover:bg-muted/5 transition-colors cursor-pointer"
                  onClick={() => openEdit(w)}
                >
                  {/* Desktop Row */}
                  <div className="hidden md:grid grid-cols-[1fr_100px_80px_80px_80px_100px_70px] gap-2 px-5 py-3 items-center">
                    {/* Name */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-xs font-bold text-zinc-500 shrink-0">
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

                    {/* Unit */}
                    <span className="text-xs text-muted-foreground truncate">{w.unit ?? "\u2014"}</span>

                    {/* Type */}
                    {w.resource_type ? (
                      <span className={cn(
                        "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded w-fit",
                        w.resource_type === "Senior" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600",
                      )}>
                        {w.resource_type}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">\u2014</span>
                    )}

                    {/* Target */}
                    <span className="text-sm font-semibold tabular-nums">
                      {target > 0 ? target : "\u2014"}
                    </span>

                    {/* Today */}
                    <span className="text-sm font-bold tabular-nums">{actual}</span>

                    {/* Progress */}
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
                      <span className="text-xs text-muted-foreground">\u2014</span>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); openEdit(w); }}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: w.id, name: w.resource_name }); }}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Mobile Row */}
                  <div className="md:hidden px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-xs font-bold text-zinc-500 shrink-0">
                          {w.resource_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{w.resource_name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {w.unit && <span className="text-[11px] text-muted-foreground">{w.unit}</span>}
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
            })}
          </div>

          {/* Footer */}
          <div className="px-5 py-2.5 border-t bg-muted/30">
            <span className="text-[10px] text-muted-foreground">
              {stageWorkers.length} worker{stageWorkers.length !== 1 ? "s" : ""}
              {currentStats.target > 0 && ` · Today: ${currentStats.actual}/${currentStats.target} (${stageEfficiency}%)`}
            </span>
          </div>
        </div>
      )}

      {/* Form dialog */}
      <WorkerFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={dialogMode}
        form={form}
        setForm={setForm}
        onSubmit={handleSubmit}
        isPending={createMut.isPending || updateMut.isPending}
        existingUnits={existingUnits}
        workshopUsers={workshopUsers}
      />

      {/* Delete confirmation dialog */}
      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        workerName={deleteTarget?.name ?? ""}
        onConfirm={handleDeleteConfirm}
        isPending={deleteMut.isPending}
      />
    </div>
  );
}

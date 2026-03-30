import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useResourcesWithUsers, useCreateResource, useUpdateResource, useDeleteResource, useLinkResourceToUser } from "@/hooks/useResources";
import { useUsers } from "@/hooks/useUsers";
import { useWorkshopGarments } from "@/hooks/useWorkshopGarments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn, getLocalDateStr, toLocalDateStr } from "@/lib/utils";
import { toast } from "sonner";
import type { NewResource } from "@repo/database";
import type { ResourceWithUser } from "@/api/resources";
import {
  Users, Plus, Trash2, Droplets, Scissors, Package,
  Shirt, Sparkles, Flame, ShieldCheck, Star, Pencil, Target,
  Link2, Grid3X3, AlertTriangle, UserX,
} from "lucide-react";

export const Route = createFileRoute("/(main)/team")({
  component: TeamPage,
  head: () => ({ meta: [{ title: "Production Team" }] }),
});

const STAGES = [
  { key: "soaking",       label: "Soaking",       icon: Droplets,    color: "sky" },
  { key: "cutting",       label: "Cutting",       icon: Scissors,    color: "amber" },
  { key: "post_cutting",  label: "Post-Cut",      icon: Package,     color: "orange" },
  { key: "sewing",        label: "Sewing",        icon: Shirt,       color: "purple" },
  { key: "finishing",     label: "Finishing",      icon: Sparkles,    color: "emerald" },
  { key: "ironing",       label: "Ironing",       icon: Flame,       color: "rose" },
  { key: "quality_check", label: "QC",             icon: ShieldCheck, color: "indigo" },
] as const;

const STAGE_CLASSES: Record<string, { iconColor: string; bg: string; border: string; stripe: string; badge: string; tab: string; tabActive: string; progress: string; dot: string }> = {
  soaking:       { iconColor: "text-sky-600",     bg: "bg-sky-50",     border: "border-sky-200",     stripe: "bg-sky-500",     badge: "bg-sky-100 text-sky-700",         tab: "hover:bg-sky-50 hover:text-sky-700",       tabActive: "bg-sky-100 text-sky-800 border-sky-300", progress: "bg-sky-500", dot: "bg-sky-500" },
  cutting:       { iconColor: "text-amber-600",   bg: "bg-amber-50",   border: "border-amber-200",   stripe: "bg-amber-500",   badge: "bg-amber-100 text-amber-700",     tab: "hover:bg-amber-50 hover:text-amber-700",   tabActive: "bg-amber-100 text-amber-800 border-amber-300", progress: "bg-amber-500", dot: "bg-amber-500" },
  post_cutting:  { iconColor: "text-orange-600",  bg: "bg-orange-50",  border: "border-orange-200",  stripe: "bg-orange-500",  badge: "bg-orange-100 text-orange-700",   tab: "hover:bg-orange-50 hover:text-orange-700", tabActive: "bg-orange-100 text-orange-800 border-orange-300", progress: "bg-orange-500", dot: "bg-orange-500" },
  sewing:        { iconColor: "text-purple-600",  bg: "bg-purple-50",  border: "border-purple-200",  stripe: "bg-purple-500",  badge: "bg-purple-100 text-purple-700",   tab: "hover:bg-purple-50 hover:text-purple-700", tabActive: "bg-purple-100 text-purple-800 border-purple-300", progress: "bg-purple-500", dot: "bg-purple-500" },
  finishing:     { iconColor: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200", stripe: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700", tab: "hover:bg-emerald-50 hover:text-emerald-700", tabActive: "bg-emerald-100 text-emerald-800 border-emerald-300", progress: "bg-emerald-500", dot: "bg-emerald-500" },
  ironing:       { iconColor: "text-rose-600",    bg: "bg-rose-50",    border: "border-rose-200",    stripe: "bg-rose-500",    badge: "bg-rose-100 text-rose-700",       tab: "hover:bg-rose-50 hover:text-rose-700",     tabActive: "bg-rose-100 text-rose-800 border-rose-300", progress: "bg-rose-500", dot: "bg-rose-500" },
  quality_check: { iconColor: "text-indigo-600",  bg: "bg-indigo-50",  border: "border-indigo-200",  stripe: "bg-indigo-500",  badge: "bg-indigo-100 text-indigo-700",   tab: "hover:bg-indigo-50 hover:text-indigo-700", tabActive: "bg-indigo-100 text-indigo-800 border-indigo-300", progress: "bg-indigo-500", dot: "bg-indigo-500" },
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

          {/* Target & Rating */}
          <div className="grid grid-cols-2 gap-4">
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
                          <Link2 className="w-3 h-3 text-violet-500" />
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

// ── Circular Progress ───────────────────────────────────────────────

function CircularProgress({ value, size = 40, strokeWidth = 3.5, className }: { value: number; size?: number; strokeWidth?: number; className?: string }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(value, 100) / 100) * circumference;
  const color = value >= 90 ? "stroke-emerald-500" : value >= 70 ? "stroke-amber-500" : "stroke-red-500";
  const bgColor = value >= 90 ? "stroke-emerald-100" : value >= 70 ? "stroke-amber-100" : "stroke-red-100";

  return (
    <svg width={size} height={size} className={cn("shrink-0", className)}>
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none"
        className={bgColor}
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none"
        className={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

// ── Worker Card ─────────────────────────────────────────────────────

function WorkerCard({
  worker,
  actual,
  stageClasses,
  onEdit,
  onDelete,
}: {
  worker: ResourceWithUser;
  actual: number;
  stageClasses: (typeof STAGE_CLASSES)[string];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const target = worker.daily_target ?? 0;
  const eff = target > 0 ? Math.round((actual / target) * 100) : 0;

  return (
    <div
      onClick={onEdit}
      className="group relative rounded-xl border bg-card p-4 transition-all duration-150 hover:shadow-md hover:border-border/80 cursor-pointer"
    >
      {/* Top stripe */}
      <div className={cn("absolute top-0 left-4 right-4 h-0.5 rounded-b-full", stageClasses.stripe)} />

      {/* Header row: avatar, name, actions */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center text-sm font-black shrink-0 border-2",
            worker.resource_type === "Senior"
              ? "bg-amber-50 text-amber-700 border-amber-300"
              : "bg-muted/60 text-muted-foreground border-muted",
          )}>
            {worker.resource_name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold truncate">{worker.resource_name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {worker.unit && (
                <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                  <Grid3X3 className="w-3 h-3 text-muted-foreground/40" />
                  {worker.unit}
                </span>
              )}
              {worker.user && (
                <span className="text-[11px] text-violet-500 font-medium flex items-center gap-0.5">
                  <Link2 className="w-3 h-3" />
                  {worker.user.name}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Actions - visible on hover (desktop) or always (mobile) */}
        <div className="flex items-center gap-0.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="p-2 rounded-lg text-muted-foreground/40 hover:text-primary hover:bg-primary/10 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-2 rounded-lg text-muted-foreground/40 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Badges row */}
      <div className="flex items-center gap-1.5 mt-3 flex-wrap">
        {worker.resource_type && (
          <Badge
            variant="secondary"
            className={cn(
              "text-[10px] font-bold uppercase tracking-wide",
              worker.resource_type === "Senior" ? "bg-amber-100 text-amber-700 hover:bg-amber-100" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-100",
            )}
          >
            {worker.resource_type}
          </Badge>
        )}
        {worker.rating && (
          <div className="flex items-center gap-0.5 ml-auto">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={cn(
                  "w-3 h-3",
                  i < worker.rating! ? "fill-amber-400 text-amber-400" : "fill-muted text-muted",
                )}
              />
            ))}
          </div>
        )}
      </div>

      {/* Progress section */}
      {target > 0 ? (
        <div className="mt-3 pt-3 border-t border-dashed flex items-center gap-3">
          <CircularProgress value={eff} size={44} strokeWidth={4} />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-black tabular-nums">{actual}</span>
              <span className="text-muted-foreground/40 text-sm">/</span>
              <span className="text-sm text-muted-foreground/60 tabular-nums">{target}</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <div className="flex-1 h-1.5 bg-muted/50 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    eff >= 90 ? "bg-emerald-500" : eff >= 70 ? "bg-amber-500" : "bg-red-500",
                  )}
                  style={{ width: `${Math.min(eff, 100)}%` }}
                />
              </div>
              <span className={cn(
                "text-[10px] font-black tabular-nums shrink-0",
                eff >= 90 ? "text-emerald-600" : eff >= 70 ? "text-amber-600" : "text-red-600",
              )}>
                {eff}%
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-3 pt-3 border-t border-dashed">
          <span className="text-[11px] text-muted-foreground/40 italic flex items-center gap-1.5">
            <Target className="w-3 h-3" />
            No daily target set
          </span>
        </div>
      )}
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
  const sc = STAGE_CLASSES[activeStage]!;
  const stageWorkers = useMemo(() => resources.filter((r) => r.responsibility === activeStage), [resources, activeStage]);
  const unitGroups = useMemo(() => {
    const map = new Map<string, ResourceWithUser[]>();
    for (const r of stageWorkers) {
      const key = r.unit || "Unassigned";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [stageWorkers]);

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
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5" /> Production Team
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {resources.length} worker{resources.length !== 1 ? "s" : ""} across {STAGES.length} stages
          </p>
        </div>
        <Button onClick={() => openAdd()} className="shadow-sm h-10 px-4">
          <Plus className="w-4 h-4 mr-2" /> Add Worker
        </Button>
      </div>

      {/* Stage Tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
        {STAGES.map((stage) => {
          const stSc = STAGE_CLASSES[stage.key]!;
          const Icon = stage.icon;
          const stats = stageStats.get(stage.key) ?? { count: 0, actual: 0, target: 0 };
          const isActive = activeStage === stage.key;
          return (
            <button
              key={stage.key}
              onClick={() => setActiveStage(stage.key)}
              className={cn(
                "flex flex-col items-center gap-1 px-4 py-2.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all duration-150 shrink-0 relative min-w-[72px]",
                isActive
                  ? cn(stSc.bg, "border", stSc.tabActive)
                  : cn("border border-transparent text-muted-foreground", stSc.tab),
              )}
            >
              <div className="flex items-center gap-1.5">
                <Icon className={cn("w-4 h-4", isActive ? stSc.iconColor : "")} />
                <span>{stage.label}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className={cn(
                  "text-[10px] font-black tabular-nums",
                  isActive ? stSc.iconColor : "text-muted-foreground/50",
                )}>
                  {stats.target > 0 ? `${stats.actual}/${stats.target}` : stats.count}
                </span>
              </div>
              {/* Active indicator bar */}
              {isActive && (
                <div className={cn("absolute bottom-0 left-2 right-2 h-0.5 rounded-t-full", stSc.stripe)} />
              )}
            </button>
          );
        })}
      </div>

      {/* Stage Summary Bar */}
      {!isLoading && (
        <div className={cn("mt-3 rounded-xl border p-4", sc.bg, sc.border)}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={cn("w-2.5 h-8 rounded-full shrink-0", sc.stripe)} />
              <div>
                <span className="font-bold text-sm">{STAGES.find((s) => s.key === activeStage)?.label}</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground">
                    <Users className="w-3 h-3 inline mr-1" />
                    <span className="font-bold">{stageWorkers.length}</span> worker{stageWorkers.length !== 1 ? "s" : ""}
                  </span>
                  {unitGroups.filter(([u]) => u !== "Unassigned").length > 0 && (
                    <>
                      <span className="text-muted-foreground/30">|</span>
                      <span className="text-xs text-muted-foreground">
                        <Grid3X3 className="w-3 h-3 inline mr-1" />
                        <span className="font-bold">{unitGroups.filter(([u]) => u !== "Unassigned").length}</span> unit{unitGroups.filter(([u]) => u !== "Unassigned").length !== 1 ? "s" : ""}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Today's progress */}
            {currentStats.target > 0 && (
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <div className="text-xs text-muted-foreground font-medium">Today</div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-black tabular-nums">{currentStats.actual}</span>
                    <span className="text-muted-foreground/40">/</span>
                    <span className="text-sm text-muted-foreground/60 tabular-nums">{currentStats.target}</span>
                  </div>
                </div>
                <div className="w-20">
                  <div className="h-2 bg-white/60 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        stageEfficiency >= 90 ? "bg-emerald-500" : stageEfficiency >= 70 ? "bg-amber-500" : "bg-red-500",
                      )}
                      style={{ width: `${Math.min(stageEfficiency, 100)}%` }}
                    />
                  </div>
                  <span className={cn(
                    "text-[10px] font-black tabular-nums block text-right mt-0.5",
                    stageEfficiency >= 90 ? "text-emerald-600" : stageEfficiency >= 70 ? "text-amber-600" : "text-red-600",
                  )}>
                    {stageEfficiency}%
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Workers Content */}
      <div className="mt-4">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
          </div>
        ) : stageWorkers.length === 0 ? (
          /* Empty state */
          <div className="rounded-xl border-2 border-dashed border-muted-foreground/15 px-6 py-16 text-center">
            <div className="relative mx-auto w-20 h-20 mb-5">
              <div className={cn("absolute inset-0 rounded-2xl rotate-6 opacity-20", sc.bg)} />
              <div className={cn("absolute inset-0 rounded-2xl -rotate-3 opacity-30", sc.bg)} />
              <div className={cn("relative w-full h-full rounded-2xl flex items-center justify-center", sc.bg)}>
                <UserX className={cn("w-8 h-8", sc.iconColor)} />
              </div>
            </div>
            <p className="text-sm font-semibold text-foreground mb-1">
              No workers in {STAGES.find((s) => s.key === activeStage)?.label.toLowerCase()}
            </p>
            <p className="text-xs text-muted-foreground/60 mb-5 max-w-xs mx-auto">
              Add workers to this stage to start tracking their daily production and performance.
            </p>
            <Button variant="outline" onClick={() => openAdd()} className="h-10 px-5">
              <Plus className="w-4 h-4 mr-2" /> Add First Worker
            </Button>
          </div>
        ) : (
          /* Worker cards by unit */
          <div className="space-y-5">
            {unitGroups.map(([unit, workers]) => (
              <div key={unit}>
                {/* Unit header */}
                {(unitGroups.length > 1 || unit !== "Unassigned") && (
                  <div className="flex items-center gap-2 mb-3">
                    <Grid3X3 className="w-3.5 h-3.5 text-muted-foreground/40" />
                    <span className="font-bold text-xs uppercase tracking-wider text-muted-foreground">{unit}</span>
                    <span className="text-[10px] font-black tabular-nums text-muted-foreground/40 bg-muted px-1.5 py-0.5 rounded-full">
                      {workers.length}
                    </span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                )}

                {/* Cards grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {workers.map((w) => (
                    <WorkerCard
                      key={w.id}
                      worker={w}
                      actual={todayCompletions.get(w.resource_name) ?? 0}
                      stageClasses={sc}
                      onEdit={() => openEdit(w)}
                      onDelete={() => setDeleteTarget({ id: w.id, name: w.resource_name })}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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

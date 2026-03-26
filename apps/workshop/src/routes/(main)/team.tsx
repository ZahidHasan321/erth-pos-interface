import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useResourcesWithUsers, useCreateResource, useUpdateResource, useDeleteResource, useLinkResourceToUser } from "@/hooks/useResources";
import { useUsers } from "@/hooks/useUsers";
import { useWorkshopGarments } from "@/hooks/useWorkshopGarments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, getLocalDateStr } from "@/lib/utils";
import { toast } from "sonner";
import type { NewResource } from "@repo/database";
import type { ResourceWithUser } from "@/api/resources";
import {
  Users, Plus, Trash2, Droplets, Scissors, Package,
  Shirt, Sparkles, Flame, ShieldCheck, Star, Pencil, Target,
  Link2, Grid3X3,
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

const STAGE_CLASSES: Record<string, { iconColor: string; bg: string; border: string; stripe: string; badge: string; tab: string; tabActive: string }> = {
  soaking:       { iconColor: "text-sky-600",     bg: "bg-sky-50",     border: "border-sky-200",     stripe: "bg-sky-500",     badge: "bg-sky-100 text-sky-700",         tab: "hover:bg-sky-50 hover:text-sky-700",       tabActive: "bg-sky-100 text-sky-800 border-sky-300" },
  cutting:       { iconColor: "text-amber-600",   bg: "bg-amber-50",   border: "border-amber-200",   stripe: "bg-amber-500",   badge: "bg-amber-100 text-amber-700",     tab: "hover:bg-amber-50 hover:text-amber-700",   tabActive: "bg-amber-100 text-amber-800 border-amber-300" },
  post_cutting:  { iconColor: "text-orange-600",  bg: "bg-orange-50",  border: "border-orange-200",  stripe: "bg-orange-500",  badge: "bg-orange-100 text-orange-700",   tab: "hover:bg-orange-50 hover:text-orange-700", tabActive: "bg-orange-100 text-orange-800 border-orange-300" },
  sewing:        { iconColor: "text-purple-600",  bg: "bg-purple-50",  border: "border-purple-200",  stripe: "bg-purple-500",  badge: "bg-purple-100 text-purple-700",   tab: "hover:bg-purple-50 hover:text-purple-700", tabActive: "bg-purple-100 text-purple-800 border-purple-300" },
  finishing:     { iconColor: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200", stripe: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700", tab: "hover:bg-emerald-50 hover:text-emerald-700", tabActive: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  ironing:       { iconColor: "text-rose-600",    bg: "bg-rose-50",    border: "border-rose-200",    stripe: "bg-rose-500",    badge: "bg-rose-100 text-rose-700",       tab: "hover:bg-rose-50 hover:text-rose-700",     tabActive: "bg-rose-100 text-rose-800 border-rose-300" },
  quality_check: { iconColor: "text-indigo-600",  bg: "bg-indigo-50",  border: "border-indigo-200",  stripe: "bg-indigo-500",  badge: "bg-indigo-100 text-indigo-700",   tab: "hover:bg-indigo-50 hover:text-indigo-700", tabActive: "bg-indigo-100 text-indigo-800 border-indigo-300" },
};

type FormData = Partial<Omit<NewResource, "id" | "created_at">> & { link_user_id?: string };

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
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm font-black uppercase tracking-wider">
            {mode === "add" ? "Add Worker" : "Edit Worker"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">Name <span className="text-red-500">*</span></Label>
            <Input
              placeholder="Worker name"
              value={form.resource_name ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, resource_name: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">Stage <span className="text-red-500">*</span></Label>
            <Select
              value={form.responsibility ?? ""}
              onValueChange={(v) => {
                setForm((p) => ({ ...p, responsibility: v, unit: "" }));
                setNewUnit(false);
              }}
            >
              <SelectTrigger><SelectValue placeholder="Select production stage" /></SelectTrigger>
              <SelectContent>
                {STAGES.map((s) => {
                  const SIcon = s.icon;
                  return (
                    <SelectItem key={s.key} value={s.key}>
                      <span className="flex items-center gap-2">
                        <SIcon className={cn("w-3.5 h-3.5", STAGE_CLASSES[s.key]?.iconColor)} />
                        {s.label}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
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
                  <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
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
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Type</Label>
              <Select value={form.resource_type ?? ""} onValueChange={(v) => setForm((p) => ({ ...p, resource_type: v }))}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Senior">Senior</SelectItem>
                  <SelectItem value="Junior">Junior</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Daily Target</Label>
              <Input
                type="number"
                inputMode="numeric"
                placeholder="e.g. 10"
                value={form.daily_target ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, daily_target: Number(e.target.value) || undefined }))}
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
              />
            </div>
          </div>

          {/* Link to user account */}
          {workshopUsers.length > 0 && (
            <div className="space-y-1.5 pt-1 border-t">
              <Label className="text-xs font-bold">Link to User Account</Label>
              <Select
                value={form.link_user_id || "none"}
                onValueChange={(v) => setForm((p) => ({ ...p, link_user_id: v === "none" ? "" : v }))}
              >
                <SelectTrigger><SelectValue placeholder="No link" /></SelectTrigger>
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
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
          <Button
            onClick={onSubmit}
            disabled={!form.resource_name || !form.responsibility || isPending}
          >
            {mode === "add" ? "Add Worker" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

  const todayStr = getLocalDateStr();
  const todayCompletions = useMemo(() => {
    const map = new Map<string, number>();
    for (const g of garments) {
      if (!g.completion_time) continue;
      const cDate = g.completion_time instanceof Date ? g.completion_time : new Date(g.completion_time);
      const cDay = cDate.toISOString().slice(0, 10);
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

  // Workers per stage (for tab counts)
  const stageCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of resources) {
      if (r.responsibility) map.set(r.responsibility, (map.get(r.responsibility) ?? 0) + 1);
    }
    return map;
  }, [resources]);

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

  const stageCapacity = stageWorkers.reduce((s, w) => s + (w.daily_target ?? 0), 0);
  const stageActual = stageWorkers.reduce((s, w) => s + (todayCompletions.get(w.resource_name) ?? 0), 0);

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

  const handleDelete = (id: string, name: string) => {
    deleteMut.mutate(id);
    toast.success(`${name} removed`);
  };

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5" /> Production Team
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {resources.length} worker{resources.length !== 1 ? "s" : ""} across {STAGES.length} stages
          </p>
        </div>
        <Button onClick={() => openAdd()} className="shadow-sm">
          <Plus className="w-4 h-4 mr-2" /> Add Worker
        </Button>
      </div>

      {/* Stage Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-3 -mx-1 px-1 scrollbar-none">
        {STAGES.map((stage) => {
          const stSc = STAGE_CLASSES[stage.key]!;
          const Icon = stage.icon;
          const count = stageCounts.get(stage.key) ?? 0;
          const isActive = activeStage === stage.key;
          return (
            <button
              key={stage.key}
              onClick={() => setActiveStage(stage.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap border transition-all duration-150 shrink-0",
                isActive
                  ? stSc.tabActive
                  : cn("border-transparent text-muted-foreground", stSc.tab),
              )}
            >
              <Icon className={cn("w-3.5 h-3.5", isActive ? stSc.iconColor : "")} />
              {stage.label}
              <span className={cn(
                "text-[10px] font-black tabular-nums px-1.5 py-0.5 rounded-full min-w-[20px] text-center",
                isActive ? "bg-white/60" : "bg-muted/50",
              )}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Stage Summary Bar */}
      {!isLoading && (
        <div className={cn("flex items-center gap-3 px-4 py-2.5 rounded-t-lg border border-b-0", sc.bg, sc.border)}>
          <div className={cn("w-2 h-6 rounded-full shrink-0", sc.stripe)} />
          <span className="font-bold text-sm">{STAGES.find((s) => s.key === activeStage)?.label}</span>
          <span className={cn("text-xs font-black tabular-nums px-2 py-0.5 rounded-full bg-white/80", sc.iconColor)}>
            {stageWorkers.length} worker{stageWorkers.length !== 1 ? "s" : ""}
          </span>
          {unitGroups.length > 0 && (
            <span className="text-[10px] font-bold text-muted-foreground/60">
              {unitGroups.filter(([u]) => u !== "Unassigned").length} unit{unitGroups.filter(([u]) => u !== "Unassigned").length !== 1 ? "s" : ""}
            </span>
          )}
          {stageCapacity > 0 && (
            <span className="text-[10px] font-bold text-muted-foreground/60 tabular-nums ml-auto">
              {stageActual}/{stageCapacity} today
            </span>
          )}
        </div>
      )}

      {/* Workers Content */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : stageWorkers.length === 0 ? (
        <div className={cn("border rounded-b-lg px-4 py-10 text-center", sc.border)}>
          <p className="text-sm text-muted-foreground/50 italic mb-3">
            No workers in {STAGES.find((s) => s.key === activeStage)?.label.toLowerCase()}
          </p>
          <Button variant="outline" size="sm" onClick={() => openAdd()}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add first worker
          </Button>
        </div>
      ) : (
        <div className={cn("border rounded-b-lg overflow-hidden bg-card", sc.border)}>
          {unitGroups.map(([unit, workers], gi) => (
            <div key={unit}>
              {/* Unit header (only if there are actual units, skip if everyone is unassigned) */}
              {(unitGroups.length > 1 || unit !== "Unassigned") && (
                <div className={cn("flex items-center gap-2 px-4 py-2 bg-muted/40 border-b", gi > 0 && "border-t")}>
                  <Grid3X3 className="w-3.5 h-3.5 text-muted-foreground/40" />
                  <span className="font-bold text-xs">{unit}</span>
                  <span className="text-[10px] font-black tabular-nums text-muted-foreground/40 bg-muted px-1.5 py-0.5 rounded-full">
                    {workers.length}
                  </span>
                </div>
              )}

              {/* Desktop header */}
              <div className="hidden md:grid grid-cols-[1fr_100px_80px_100px_80px_72px] gap-2 px-4 py-1.5 border-b bg-muted/20 text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground/40">
                <span>Worker</span>
                <span>Unit</span>
                <span>Type</span>
                <span className="text-right">Today</span>
                <span className="text-right">Rating</span>
                <span />
              </div>

              {workers.map((w) => {
                const actual = todayCompletions.get(w.resource_name) ?? 0;
                const target = w.daily_target ?? 0;
                const eff = target > 0 ? Math.round((actual / target) * 100) : 0;
                return (
                  <div key={w.id} onClick={() => openEdit(w)} className="border-b last:border-b-0 hover:bg-muted/20 transition-colors cursor-pointer group">
                    {/* Desktop */}
                    <div className="hidden md:grid grid-cols-[1fr_100px_80px_100px_80px_72px] gap-2 px-4 py-2.5 items-center">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 border",
                          w.resource_type === "Senior" ? "bg-amber-50 text-amber-700 border-amber-300" : "bg-muted/50 text-muted-foreground border-transparent",
                        )}>
                          {w.resource_name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <span className="text-sm font-semibold truncate block">{w.resource_name}</span>
                          {w.user && (
                            <span className="text-[10px] text-violet-500 font-medium flex items-center gap-0.5">
                              <Link2 className="w-2.5 h-2.5" /> {w.user.name}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground font-medium truncate">{w.unit ?? "—"}</span>
                      <div>
                        {w.resource_type ? (
                          <span className={cn("text-[10px] font-bold uppercase px-1.5 py-0.5 rounded",
                            w.resource_type === "Senior" ? "bg-amber-100 text-amber-700" : "bg-zinc-100 text-zinc-600",
                          )}>
                            {w.resource_type}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/30">—</span>
                        )}
                      </div>
                      <div className="text-right">
                        {target > 0 ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="text-sm font-bold tabular-nums">{actual}</span>
                            <span className="text-muted-foreground/40 text-xs">/</span>
                            <span className="text-xs text-muted-foreground/60 tabular-nums">{target}</span>
                            <span className={cn(
                              "text-[10px] font-black tabular-nums px-1 py-0.5 rounded ml-1",
                              eff >= 90 ? "bg-emerald-100 text-emerald-700" : eff >= 70 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700",
                            )}>
                              {eff}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/30">—</span>
                        )}
                      </div>
                      <div className="flex items-center justify-end gap-0.5">
                        {w.rating ? (
                          <>
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            <span className="text-sm font-bold tabular-nums">{w.rating}</span>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground/30">—</span>
                        )}
                      </div>
                      <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => { e.stopPropagation(); openEdit(w); }} className="p-1.5 rounded-md text-muted-foreground/30 hover:text-primary hover:bg-primary/10 transition-colors">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(w.id, w.resource_name); }} disabled={deleteMut.isPending} className="p-1.5 rounded-md text-muted-foreground/30 hover:text-red-500 hover:bg-red-50 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Mobile */}
                    <div className="md:hidden px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 border",
                            w.resource_type === "Senior" ? "bg-amber-50 text-amber-700 border-amber-300" : "bg-muted/50 text-muted-foreground border-transparent",
                          )}>
                            {w.resource_name.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <span className="text-sm font-semibold truncate block">{w.resource_name}</span>
                            <span className="text-xs text-muted-foreground">{w.unit ?? "No unit"}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={(e) => { e.stopPropagation(); openEdit(w); }} className="p-1.5 rounded-md text-muted-foreground/30 hover:text-primary hover:bg-primary/10 transition-colors">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleDelete(w.id, w.resource_name); }} disabled={deleteMut.isPending} className="p-1.5 rounded-md text-muted-foreground/30 hover:text-red-500 hover:bg-red-50 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        {w.resource_type && (
                          <span className={cn("text-[10px] font-bold uppercase px-1.5 py-0.5 rounded",
                            w.resource_type === "Senior" ? "bg-amber-100 text-amber-700" : "bg-zinc-100 text-zinc-600",
                          )}>
                            {w.resource_type}
                          </span>
                        )}
                        {target > 0 && (
                          <span className="text-xs font-bold tabular-nums text-muted-foreground">
                            <Target className="w-3 h-3 inline mr-0.5" />{actual}/{target}
                          </span>
                        )}
                        {w.rating && (
                          <span className="flex items-center gap-0.5 text-xs">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            <span className="font-bold tabular-nums">{w.rating}</span>
                          </span>
                        )}
                        {w.user && (
                          <span className="text-[10px] text-violet-500 font-medium flex items-center gap-0.5 ml-auto">
                            <Link2 className="w-2.5 h-2.5" /> Linked
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

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
    </div>
  );
}

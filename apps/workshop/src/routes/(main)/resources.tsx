import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useResources, useCreateResource, useUpdateResource, useDeleteResource } from "@/hooks/useResources";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Users, Plus, Trash2, Droplets, Scissors, Package,
  Shirt, Sparkles, Flame, ShieldCheck, Star, Pencil, Target, AlertTriangle,
  ChevronDown,
} from "lucide-react";
import type { NewResource, Resource } from "@repo/database";

export const Route = createFileRoute("/(main)/resources")({
  component: ResourcesPage,
  head: () => ({ meta: [{ title: "Resources" }] }),
});

const STAGES = [
  { key: "soaking",       label: "Soaking",       icon: Droplets,    iconColor: "text-sky-600",     bg: "bg-sky-50",     border: "border-sky-200",     stripe: "bg-sky-500" },
  { key: "cutting",       label: "Cutting",       icon: Scissors,    iconColor: "text-amber-600",   bg: "bg-amber-50",   border: "border-amber-200",   stripe: "bg-amber-500" },
  { key: "post_cutting",  label: "Post-Cutting",  icon: Package,     iconColor: "text-orange-600",  bg: "bg-orange-50",  border: "border-orange-200",  stripe: "bg-orange-500" },
  { key: "sewing",        label: "Sewing",        icon: Shirt,       iconColor: "text-purple-600",  bg: "bg-purple-50",  border: "border-purple-200",  stripe: "bg-purple-500" },
  { key: "finishing",     label: "Finishing",      icon: Sparkles,    iconColor: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200", stripe: "bg-emerald-500" },
  { key: "ironing",       label: "Ironing",       icon: Flame,       iconColor: "text-rose-600",    bg: "bg-rose-50",    border: "border-rose-200",    stripe: "bg-rose-500" },
  { key: "quality_check", label: "Quality Check",  icon: ShieldCheck, iconColor: "text-indigo-600",  bg: "bg-indigo-50",  border: "border-indigo-200",  stripe: "bg-indigo-500" },
] as const;

type FormData = Partial<Omit<NewResource, 'id' | 'created_at'>>;

// ── Worker Form Dialog ──────────────────────────────────────────────────────

function WorkerFormDialog({
  open,
  onOpenChange,
  mode,
  form,
  setForm,
  onSubmit,
  isPending,
  existingUnits,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: "add" | "edit";
  form: FormData;
  setForm: React.Dispatch<React.SetStateAction<FormData>>;
  onSubmit: () => void;
  isPending: boolean;
  existingUnits: string[];
}) {
  const [newUnit, setNewUnit] = useState(false);

  const handleOpenChange = (v: boolean) => {
    if (!v) setNewUnit(false);
    onOpenChange(v);
  };

  const handleResponsibilityChange = (v: string) => {
    setForm((p) => ({ ...p, responsibility: v, unit: "" }));
    setNewUnit(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Add Worker" : "Edit Worker"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Name <span className="text-red-500">*</span></Label>
            <Input
              placeholder="Worker name"
              value={form.resource_name ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, resource_name: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Stage <span className="text-red-500">*</span></Label>
            <Select
              value={form.responsibility ?? ""}
              onValueChange={handleResponsibilityChange}
            >
              <SelectTrigger><SelectValue placeholder="Select production stage" /></SelectTrigger>
              <SelectContent>
                {STAGES.map((s) => {
                  const SIcon = s.icon;
                  return (
                    <SelectItem key={s.key} value={s.key}>
                      <span className="flex items-center gap-2">
                        <SIcon className={cn("w-3.5 h-3.5", s.iconColor)} />
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
                <Label>Unit</Label>
                {existingUnits.length > 0 && (
                  <button
                    type="button"
                    onClick={() => { setNewUnit(!newUnit); setForm((p) => ({ ...p, unit: "" })); }}
                    className="text-xs text-primary font-semibold hover:underline"
                  >
                    {newUnit ? "Pick existing" : "+ New unit"}
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
              <Label>Type</Label>
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
              <Label>Daily Target</Label>
              <Input
                type="number"
                placeholder="e.g. 10"
                value={form.daily_target ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, daily_target: Number(e.target.value) || undefined }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Rating (1-5)</Label>
              <Input
                type="number"
                min={1}
                max={5}
                placeholder="1-5"
                value={form.rating ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, rating: Number(e.target.value) || undefined }))}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
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

// ── Stage Groups (collapsible table sections) ───────────────────────────────

function StageGroups({
  resources,
  onEdit,
  onAdd,
  onDelete,
  deleting,
}: {
  resources: Resource[];
  onEdit: (w: Resource) => void;
  onAdd: (stageKey?: string) => void;
  onDelete: (id: string, name: string) => void;
  deleting: boolean;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });

  return (
    <div className="space-y-3">
      {STAGES.map((stage) => {
        const workers = resources.filter((r) => r.responsibility === stage.key);
        const Icon = stage.icon;
        const isCollapsed = collapsed.has(stage.key);

        return (
          <div key={stage.key} className={cn("border overflow-hidden shadow-sm", stage.border)}>
            {/* Group header — always visible, clickable to toggle */}
            <button
              onClick={() => toggle(stage.key)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
                stage.bg,
              )}
            >
              <div className={cn("w-2 self-stretch rounded-full shrink-0 -my-3 -ml-4", stage.stripe)} />
              <Icon className={cn("w-5 h-5 shrink-0", stage.iconColor)} />
              <span className="font-bold text-sm">{stage.label}</span>
              <span className={cn(
                "text-xs font-black tabular-nums px-2 py-0.5 rounded-full",
                stage.iconColor,
                workers.length === 0 ? "bg-white/50" : "bg-white/80",
              )}>
                {workers.length}
              </span>
              <div className="ml-auto flex items-center gap-2 shrink-0">
                <span
                  role="button"
                  onClick={(e) => { e.stopPropagation(); onAdd(stage.key); }}
                  className={cn(
                    "inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg transition-colors",
                    stage.iconColor, "hover:bg-white/60",
                  )}
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </span>
                <ChevronDown className={cn(
                  "w-4 h-4 text-foreground/30 transition-transform",
                  isCollapsed && "-rotate-90",
                )} />
              </div>
            </button>

            {/* Table rows — collapsible */}
            {!isCollapsed && (
              <div className="bg-white">
                {workers.length === 0 ? (
                  <div className="px-4 py-5 text-xs text-muted-foreground/40 text-center italic">
                    No workers assigned to {stage.label.toLowerCase()}
                  </div>
                ) : (
                  <>
                    {/* Column headers */}
                    <div className="grid grid-cols-[1fr_100px_80px_80px_80px_72px] gap-2 px-4 py-2 border-b bg-muted/30 text-[11px] font-black uppercase tracking-widest text-muted-foreground/60">
                      <span>Worker</span>
                      <span>Unit</span>
                      <span>Type</span>
                      <span className="text-right">Target</span>
                      <span className="text-right">Rating</span>
                      <span />
                    </div>
                    {workers.map((w) => (
                      <div
                        key={w.id}
                        className="grid grid-cols-[1fr_100px_80px_80px_80px_72px] gap-2 px-4 py-2.5 border-b last:border-b-0 hover:bg-muted/20 transition-colors cursor-pointer items-center"
                        onClick={() => onEdit(w)}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={cn(
                            "w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 border",
                            w.resource_type === "Senior"
                              ? "bg-amber-50 text-amber-700 border-amber-300"
                              : "bg-muted/50 text-muted-foreground border-transparent",
                          )}>
                            {w.resource_name.charAt(0)}
                          </div>
                          <span className="text-sm font-semibold truncate">{w.resource_name}</span>
                        </div>

                        <span className="text-xs text-muted-foreground font-medium truncate">
                          {w.unit ?? "—"}
                        </span>

                        <div>
                          {w.resource_type ? (
                            <span className={cn(
                              "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded",
                              w.resource_type === "Senior" ? "bg-amber-100 text-amber-700" : "bg-zinc-100 text-zinc-600",
                            )}>
                              {w.resource_type}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground/30">—</span>
                          )}
                        </div>

                        <span className="text-sm font-bold tabular-nums text-right">
                          {w.daily_target ? (
                            <>{w.daily_target}<span className="text-muted-foreground/40 font-normal">/d</span></>
                          ) : (
                            <span className="text-muted-foreground/30">—</span>
                          )}
                        </span>

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

                        <div className="flex items-center justify-end gap-0.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); onEdit(w); }}
                            className="p-1.5 rounded-md text-muted-foreground/30 hover:text-primary hover:bg-primary/10 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); onDelete(w.id, w.resource_name); }}
                            disabled={deleting}
                            className="p-1.5 rounded-md text-muted-foreground/30 hover:text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

function ResourcesPage() {
  const { data: resources = [], isLoading } = useResources();
  const createMut = useCreateResource();
  const updateMut = useUpdateResource();
  const deleteMut = useDeleteResource();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"add" | "edit">("add");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>({});

  const openAdd = (stageKey?: string) => {
    setDialogMode("add");
    setEditingId(null);
    setForm(stageKey ? { responsibility: stageKey } : {});
    setDialogOpen(true);
  };

  const openEdit = (worker: Resource) => {
    setDialogMode("edit");
    setEditingId(worker.id);
    setForm({
      resource_name: worker.resource_name,
      responsibility: worker.responsibility ?? undefined,
      unit: worker.unit ?? undefined,
      resource_type: worker.resource_type ?? undefined,
      daily_target: worker.daily_target ?? undefined,
      rating: worker.rating ?? undefined,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.resource_name || !form.responsibility) return;
    if (dialogMode === "add") {
      await createMut.mutateAsync(form as Omit<NewResource, 'id' | 'created_at'>);
      toast.success(`${form.resource_name} added`);
    } else if (editingId) {
      await updateMut.mutateAsync({ id: editingId, updates: form });
      toast.success(`${form.resource_name} updated`);
    }
    setDialogOpen(false);
    setForm({});
    setEditingId(null);
  };

  const handleDelete = (id: string, name: string) => {
    deleteMut.mutate(id);
    toast.success(`${name} removed`);
  };

  const existingUnits = form.responsibility
    ? [...new Set(
        resources
          .filter((r) => r.responsibility === form.responsibility)
          .map((r) => r.unit)
          .filter((u): u is string => !!u),
      )]
    : [];

  const stats = useMemo(() => {
    const totalCapacity = resources.reduce((s, r) => s + (r.daily_target ?? 0), 0);
    const seniorCount = resources.filter((r) => r.resource_type === "Senior").length;
    const emptyStages = STAGES.filter(
      (s) => !resources.some((r) => r.responsibility === s.key),
    );
    return { totalCapacity, seniorCount, emptyStages };
  }, [resources]);

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight flex items-center gap-2.5">
            <Users className="w-6 h-6" /> Workshop Team
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {resources.length} worker{resources.length !== 1 ? "s" : ""} across {STAGES.length} stages
          </p>
        </div>
        <Button className="shadow-sm" onClick={() => openAdd()}>
          <Plus className="w-4 h-4 mr-2" /> Add Worker
        </Button>
      </div>

      {/* Summary strip */}
      <div className="flex items-center gap-4 flex-wrap mb-6 px-4 py-3 bg-white border rounded-xl shadow-sm">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-emerald-600" />
          <span className="text-sm font-bold tabular-nums">{stats.totalCapacity}</span>
          <span className="text-xs text-muted-foreground">daily capacity</span>
        </div>
        <div className="w-px h-5 bg-border" />
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-bold">{stats.seniorCount}</span>
          <span className="text-xs text-muted-foreground">seniors</span>
        </div>
        {stats.emptyStages.length > 0 && (
          <>
            <div className="w-px h-5 bg-border" />
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span className="text-xs text-red-600 font-semibold">
                {stats.emptyStages.map((s) => s.label).join(", ")} unstaffed
              </span>
            </div>
          </>
        )}
      </div>

      {/* Stage groups */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : (
        <StageGroups
          resources={resources}
          onEdit={openEdit}
          onAdd={openAdd}
          onDelete={(id, name) => handleDelete(id, name)}
          deleting={deleteMut.isPending}
        />
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
      />
    </div>
  );
}

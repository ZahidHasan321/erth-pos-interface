import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useResources, useCreateResource, useDeleteResource } from "@/hooks/useResources";
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
  Shirt, Sparkles, Flame, ShieldCheck, Star,
} from "lucide-react";
import type { NewResource, Resource } from "@repo/database";

export const Route = createFileRoute("/(main)/resources")({
  component: ResourcesPage,
  head: () => ({ meta: [{ title: "Resources" }] }),
});

const STAGES = [
  { key: "soaking",       label: "Soaking",       icon: Droplets,    bg: "bg-blue-50",    border: "border-blue-200",    iconColor: "text-blue-600",    headerBg: "bg-blue-100" },
  { key: "cutting",       label: "Cutting",       icon: Scissors,    bg: "bg-amber-50",   border: "border-amber-200",   iconColor: "text-amber-600",   headerBg: "bg-amber-100" },
  { key: "post_cutting",  label: "Post-Cutting",  icon: Package,     bg: "bg-orange-50",  border: "border-orange-200",  iconColor: "text-orange-600",  headerBg: "bg-orange-100" },
  { key: "sewing",        label: "Sewing",        icon: Shirt,       bg: "bg-purple-50",  border: "border-purple-200",  iconColor: "text-purple-600",  headerBg: "bg-purple-100" },
  { key: "finishing",     label: "Finishing",      icon: Sparkles,    bg: "bg-emerald-50", border: "border-emerald-200", iconColor: "text-emerald-600", headerBg: "bg-emerald-100" },
  { key: "ironing",       label: "Ironing",        icon: Flame,       bg: "bg-red-50",     border: "border-red-200",     iconColor: "text-red-600",     headerBg: "bg-red-100" },
  { key: "quality_check", label: "Quality Check",  icon: ShieldCheck, bg: "bg-indigo-50",  border: "border-indigo-200",  iconColor: "text-indigo-600",  headerBg: "bg-indigo-100" },
] as const;

// ── Worker Row ──────────────────────────────────────────────────────────────

function WorkerRow({ worker, onDelete, deleting }: { worker: Resource; onDelete: () => void; deleting: boolean }) {
  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-white/80 hover:shadow-sm transition-colors group">
      <div className="w-8 h-8 rounded-full bg-white border flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
        {worker.resource_name.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">{worker.resource_name}</p>
        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
          {worker.resource_type && (
            <span className={cn(
              "px-1.5 py-0.5 rounded-full font-semibold uppercase",
              worker.resource_type === "Senior" ? "bg-amber-100 text-amber-700" : "bg-zinc-100 text-zinc-600",
            )}>
              {worker.resource_type}
            </span>
          )}
          {worker.unit && <span className="font-mono">{worker.unit}</span>}
          {worker.daily_target && (
            <span>{worker.daily_target}/day</span>
          )}
          {worker.rating && (
            <span className="flex items-center gap-0.5">
              <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
              {worker.rating}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={onDelete}
        disabled={deleting}
        className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── Stage Card ──────────────────────────────────────────────────────────────

function StageCard({
  stage,
  workers,
  onDelete,
  deleting,
}: {
  stage: typeof STAGES[number];
  workers: Resource[];
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  const Icon = stage.icon;

  // Group workers by unit within this stage
  const units = new Map<string, Resource[]>();
  for (const w of workers) {
    const u = w.unit ?? "Unassigned";
    if (!units.has(u)) units.set(u, []);
    units.get(u)!.push(w);
  }
  const hasMultipleUnits = units.size > 1;

  return (
    <div className={cn("border rounded-xl overflow-hidden shadow-sm", stage.border)}>
      {/* Header */}
      <div className={cn("px-4 py-2.5 flex items-center gap-2.5", stage.headerBg)}>
        <Icon className={cn("w-5 h-5", stage.iconColor)} />
        <span className="font-bold text-sm">{stage.label}</span>
        <span className={cn("ml-auto text-xs font-bold px-2 py-0.5 rounded-full", stage.bg, stage.iconColor)}>
          {workers.length}
        </span>
      </div>

      {/* Workers */}
      <div className={cn("px-2 py-1.5", stage.bg)}>
        {workers.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No workers assigned</p>
        ) : hasMultipleUnits ? (
          // Show grouped by unit
          Array.from(units.entries()).map(([unitName, unitWorkers]) => (
            <div key={unitName} className="mb-1 last:mb-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-3 pt-2 pb-1">
                {unitName}
              </p>
              {unitWorkers.map((w) => (
                <WorkerRow key={w.id} worker={w} onDelete={() => onDelete(w.id)} deleting={deleting} />
              ))}
            </div>
          ))
        ) : (
          // Single unit, just list workers
          workers.map((w) => (
            <WorkerRow key={w.id} worker={w} onDelete={() => onDelete(w.id)} deleting={deleting} />
          ))
        )}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

function ResourcesPage() {
  const { data: resources = [], isLoading } = useResources();
  const createMut = useCreateResource();
  const deleteMut = useDeleteResource();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<Partial<Omit<NewResource, 'id' | 'created_at'>>>({});

  const handleCreate = async () => {
    if (!form.resource_name || !form.responsibility) return;
    await createMut.mutateAsync(form as Omit<NewResource, 'id' | 'created_at'>);
    toast.success(`${form.resource_name} added`);
    setAddOpen(false);
    setForm({});
  };

  const handleDelete = (id: string, name: string) => {
    deleteMut.mutate(id);
    toast.success(`${name} removed`);
  };

  // Get existing units for the selected responsibility (for unit dropdown suggestions)
  const existingUnits = form.responsibility
    ? [...new Set(resources.filter((r) => r.responsibility === form.responsibility).map((r) => r.unit).filter(Boolean))]
    : [];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6" /> Workshop Team
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {resources.length} worker{resources.length !== 1 ? "s" : ""} across {STAGES.length} production stages
          </p>
        </div>
        <Button className="shadow-sm" onClick={() => setAddOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Add Worker
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {STAGES.map((stage) => {
            const workers = resources.filter((r) => r.responsibility === stage.key);
            return (
              <StageCard
                key={stage.key}
                stage={stage}
                workers={workers}
                onDelete={(id) => {
                  const w = workers.find((r) => r.id === id);
                  if (w) handleDelete(id, w.resource_name);
                }}
                deleting={deleteMut.isPending}
              />
            );
          })}
        </div>
      )}

      {/* Add Worker Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Worker</DialogTitle></DialogHeader>
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
                onValueChange={(v) => setForm((p) => ({ ...p, responsibility: v, unit: "" }))}
              >
                <SelectTrigger><SelectValue placeholder="Select production stage" /></SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => {
                    const Icon = s.icon;
                    return (
                      <SelectItem key={s.key} value={s.key}>
                        <span className="flex items-center gap-2">
                          <Icon className={cn("w-3.5 h-3.5", s.iconColor)} />
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
                <Label>Unit</Label>
                {existingUnits.length > 0 ? (
                  <Select value={form.unit ?? ""} onValueChange={(v) => setForm((p) => ({ ...p, unit: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                    <SelectContent>
                      {existingUnits.map((u) => (
                        <SelectItem key={u} value={u!}>{u}</SelectItem>
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
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!form.resource_name || !form.responsibility || createMut.isPending}>
              Add Worker
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

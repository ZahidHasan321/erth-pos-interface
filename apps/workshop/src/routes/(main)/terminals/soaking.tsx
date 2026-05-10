import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Droplets, Search, CalendarDays, Check, Loader2, Play, Timer, History } from "lucide-react";
import { useSoakingQueue } from "@/hooks/useWorkshopGarments";
import { useMarkSoakComplete, useStartSoakingBatch } from "@/hooks/useGarmentMutations";
import {
  PageHeader,
  EmptyState,
  LoadingSkeleton,
  GarmentTypeBadge,
} from "@/components/shared/PageShell";
import { BatchActionBar } from "@/components/shared/BatchActionBar";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Checkbox } from "@repo/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableContainer,
} from "@repo/ui/table";
import { BrandBadge } from "@/components/shared/StageBadge";
import { TIMEZONE } from "@/lib/utils";
import { toast } from "sonner";
import type { WorkshopGarment } from "@repo/database";

/**
 * Soak terminal — parallel track, not a piece_stage.
 * Two manual batch actions:
 *   - Start Soak: stamps soaking_started_at on selected pending garments.
 *   - Mark Done: stamps soaking_completed_at on selected in-progress garments.
 * Pipeline state (piece_stage / location / in_production) is untouched.
 */
function SoakTerminal() {
  const { data: garments = [], isLoading } = useSoakingQueue();
  const startMut = useStartSoakingBatch();
  const doneMut = useMarkSoakComplete();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return garments;
    return garments.filter(
      (g) =>
        (g.customer_name ?? "").toLowerCase().includes(q) ||
        String(g.order_id).includes(q) ||
        (g.invoice_number != null && String(g.invoice_number).includes(q)) ||
        (g.customer_mobile ?? "").replace(/\s+/g, "").includes(q.replace(/\s+/g, "")) ||
        (g.garment_id ?? "").toLowerCase().includes(q) ||
        (g.fabric_name ?? "").toLowerCase().includes(q),
    );
  }, [garments, search]);

  const pending = useMemo(
    () => filtered.filter((g) => g.soaking_started_at == null),
    [filtered],
  );
  const inProgress = useMemo(
    () => filtered.filter((g) => g.soaking_started_at != null),
    [filtered],
  );

  const toggle = (id: string) =>
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const setSection = (rows: WorkshopGarment[], on: boolean) =>
    setSel((prev) => {
      const next = new Set(prev);
      for (const g of rows) {
        if (on) next.add(g.id);
        else next.delete(g.id);
      }
      return next;
    });

  const selPendingIds = useMemo(
    () => pending.filter((g) => sel.has(g.id)).map((g) => g.id),
    [pending, sel],
  );
  const selStartedIds = useMemo(
    () => inProgress.filter((g) => sel.has(g.id)).map((g) => g.id),
    [inProgress, sel],
  );

  const handleStart = () => {
    if (selPendingIds.length === 0) return;
    const ids = selPendingIds;
    startMut.mutate(ids, {
      onSuccess: () => setSel((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      }),
      onError: (err) => toast.error(`Failed to start soak: ${err?.message ?? "Unknown error"}`),
    });
  };

  const handleDone = () => {
    if (selStartedIds.length === 0) return;
    const ids = selStartedIds;
    doneMut.mutate(ids, {
      onSuccess: () => setSel((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      }),
      onError: (err) => toast.error(`Failed to mark done: ${err?.message ?? "Unknown error"}`),
    });
  };

  const total = garments.length;

  return (
    <div className="p-4 sm:p-6 max-w-4xl xl:max-w-7xl mx-auto pb-10 space-y-8">
      <PageHeader
        icon={Droplets}
        title="Soaking"
        subtitle={`${total} garment${total !== 1 ? "s" : ""} needing soak`}
      >
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate({ to: "/terminals/$stage/history", params: { stage: "soaking" } })}
          >
            <History className="w-3.5 h-3.5 mr-1" />
            History
          </Button>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground bg-card border px-2.5 py-1 rounded-md">
            <CalendarDays className="w-3.5 h-3.5" aria-hidden="true" />
            {new Date().toLocaleDateString("default", {
              timeZone: TIMEZONE,
              weekday: "short",
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </div>
        </div>
      </PageHeader>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Garment, customer, order, fabric…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <LoadingSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Droplets} message="No garments need soaking right now" />
      ) : (
        <div className="space-y-8">
          <SoakSection
            title="Pending"
            subtitle="Not yet in the bath. Select and hit Start Soak to stamp a shared start time."
            garments={pending}
            sel={sel}
            onToggle={toggle}
            onToggleAll={(on) => setSection(pending, on)}
            mode="pending"
          />
          <SoakSection
            title="In progress"
            subtitle="Soak started. Select and hit Mark Done when the bath is finished."
            garments={inProgress}
            sel={sel}
            onToggle={toggle}
            onToggleAll={(on) => setSection(inProgress, on)}
            mode="started"
          />
        </div>
      )}

      <BatchActionBar count={sel.size} onClear={() => setSel(new Set())}>
        <Button
          size="sm"
          className="bg-blue-600 hover:bg-blue-700"
          onClick={handleStart}
          disabled={selPendingIds.length === 0 || startMut.isPending}
        >
          {startMut.isPending ? (
            <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5 mr-1" />
          )}
          Start Soak ({selPendingIds.length})
        </Button>
        <Button
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700"
          onClick={handleDone}
          disabled={selStartedIds.length === 0 || doneMut.isPending}
        >
          {doneMut.isPending ? (
            <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
          ) : (
            <Check className="w-3.5 h-3.5 mr-1" />
          )}
          Mark Done ({selStartedIds.length})
        </Button>
      </BatchActionBar>
    </div>
  );
}

function SoakSection({
  title,
  subtitle,
  garments,
  sel,
  onToggle,
  onToggleAll,
  mode,
}: {
  title: string;
  subtitle: string;
  garments: WorkshopGarment[];
  sel: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (on: boolean) => void;
  mode: "pending" | "started";
}) {
  const allSelected = garments.length > 0 && garments.every((g) => sel.has(g.id));
  const someSelected = garments.some((g) => sel.has(g.id));

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">
            {title}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ({garments.length})
            </span>
          </h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      {garments.length === 0 ? (
        <div className="text-sm text-muted-foreground italic px-1">None.</div>
      ) : (
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 border-b-2 border-border/60 hover:bg-muted/40">
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={(v) => onToggleAll(v === true)}
                    aria-label={`Select all ${title.toLowerCase()}`}
                  />
                </TableHead>
                <TableHead className="w-[140px]">Garment</TableHead>
                <TableHead className="w-[80px]">Type</TableHead>
                <TableHead className="w-[110px]">Order / Invoice</TableHead>
                <TableHead className="w-[170px]">Customer</TableHead>
                <TableHead className="w-[160px]">Fabric</TableHead>
                <TableHead className="w-[80px]">Brand</TableHead>
                {mode === "started" && (
                  <TableHead className="w-[140px]">Started</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {garments.map((g) => (
                <TableRow
                  key={g.id}
                  data-state={sel.has(g.id) ? "selected" : undefined}
                >
                  <TableCell className="px-3 py-3">
                    <Checkbox
                      checked={sel.has(g.id)}
                      onCheckedChange={() => onToggle(g.id)}
                      aria-label={`Select ${g.garment_id ?? g.id}`}
                    />
                  </TableCell>
                  <TableCell className="px-3 py-3">
                    <div className="flex flex-col gap-1">
                      <span className="font-mono text-sm font-bold">
                        {g.garment_id ?? g.id.slice(0, 8)}
                      </span>
                      {g.soaking_hours != null && (
                        <span className="inline-flex items-center gap-0.5 text-xs font-bold text-white bg-blue-600 px-2 py-0.5 rounded-full w-fit">
                          <Droplets className="w-3 h-3" /> Soak {g.soaking_hours}h
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="px-3 py-3">
                    <GarmentTypeBadge type={g.garment_type ?? "final"} />
                  </TableCell>
                  <TableCell className="px-3 py-3 font-mono">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-bold">#{g.order_id}</span>
                      {g.invoice_number && (
                        <span className="text-xs text-muted-foreground">
                          INV-{g.invoice_number}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="px-3 py-3 text-sm">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-semibold">{g.customer_name ?? "—"}</span>
                      {g.customer_mobile && (
                        <span className="text-xs font-mono text-muted-foreground">
                          {g.customer_mobile}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="px-3 py-3 text-sm">
                    {g.fabric_name ? (
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="font-medium truncate">{g.fabric_name}</span>
                        {g.fabric_color && (
                          <span className="text-xs text-muted-foreground truncate">
                            {g.fabric_color}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Outside</span>
                    )}
                  </TableCell>
                  <TableCell className="px-3 py-3">
                    <BrandBadge brand={g.order_brand} />
                  </TableCell>
                  {mode === "started" && (
                    <TableCell className="px-3 py-3">
                      <StartedBadge startedAt={g.soaking_started_at} hours={g.soaking_hours} />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </section>
  );
}

function StartedBadge({
  startedAt,
  hours,
}: {
  startedAt: string | Date | null | undefined;
  hours: number | null | undefined;
}) {
  if (!startedAt) return <span className="text-xs text-muted-foreground">—</span>;
  const startedMs = new Date(startedAt).getTime();
  const elapsedMs = Date.now() - startedMs;
  const elapsedHrs = elapsedMs / (1000 * 60 * 60);
  const targetHrs = hours ?? null;
  const reached = targetHrs != null && elapsedHrs >= targetHrs;

  const fmt = (h: number) =>
    h < 1 ? `${Math.max(0, Math.round(h * 60))}m` : `${h.toFixed(h < 10 ? 1 : 0)}h`;

  return (
    <div className="flex flex-col gap-0.5 text-xs">
      <span
        className={`inline-flex items-center gap-1 font-semibold ${
          reached ? "text-emerald-700" : "text-blue-700"
        }`}
      >
        <Timer className="w-3 h-3" />
        {fmt(elapsedHrs)} elapsed
      </span>
      {targetHrs != null && (
        <span className="text-muted-foreground">
          {reached ? "ready" : `target ${targetHrs}h`}
        </span>
      )}
    </div>
  );
}

export const Route = createFileRoute("/(main)/terminals/soaking")({
  component: SoakTerminal,
  head: () => ({ meta: [{ title: "Soaking Terminal" }] }),
});

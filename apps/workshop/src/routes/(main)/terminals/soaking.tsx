import { useEffect, useMemo, useState } from "react";
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
  const [actingId, setActingId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

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
  const inProgress = useMemo(() => {
    const rows = filtered.filter((g) => g.soaking_started_at != null);
    // Overdue first, then ready, then still soaking. Within each: longest-elapsed first.
    return [...rows].sort((a, b) => {
      const ra = readinessRank(a, now);
      const rb = readinessRank(b, now);
      if (ra !== rb) return ra - rb;
      const ea = now - new Date(a.soaking_started_at as any).getTime();
      const eb = now - new Date(b.soaking_started_at as any).getTime();
      return eb - ea;
    });
  }, [filtered, now]);

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

  const handleRowStart = (id: string) => {
    setActingId(id);
    startMut.mutate([id], {
      onError: (err) => toast.error(`Failed to start soak: ${err?.message ?? "Unknown error"}`),
      onSettled: () => setActingId((cur) => (cur === id ? null : cur)),
    });
  };

  const handleRowDone = (id: string) => {
    setActingId(id);
    doneMut.mutate([id], {
      onError: (err) => toast.error(`Failed to mark done: ${err?.message ?? "Unknown error"}`),
      onSettled: () => setActingId((cur) => (cur === id ? null : cur)),
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
            title="In progress"
            subtitle="Soak started. Hit Done on a row, or select several and use Mark Done."
            garments={inProgress}
            sel={sel}
            onToggle={toggle}
            onToggleAll={(on) => setSection(inProgress, on)}
            mode="started"
            now={now}
            onRowAction={handleRowDone}
            actingId={actingId}
          />
          <SoakSection
            title="Pending"
            subtitle="Not yet in the bath. Hit Start on a row, or select several to start together."
            garments={pending}
            sel={sel}
            onToggle={toggle}
            onToggleAll={(on) => setSection(pending, on)}
            mode="pending"
            onRowAction={handleRowStart}
            actingId={actingId}
          />
        </div>
      )}

      <BatchActionBar count={sel.size} onClear={() => setSel(new Set())}>
        <Button
          size="sm"
          variant="secondary"
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
  now,
  onRowAction,
  actingId,
}: {
  title: string;
  subtitle: string;
  garments: WorkshopGarment[];
  sel: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (on: boolean) => void;
  mode: "pending" | "started";
  now?: number;
  onRowAction: (id: string) => void;
  actingId: string | null;
}) {
  const allSelected = garments.length > 0 && garments.every((g) => sel.has(g.id));
  const someSelected = garments.some((g) => sel.has(g.id));

  if (garments.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-dashed border-border bg-card text-sm">
        <Droplets className="w-4 h-4 text-muted-foreground/60 shrink-0" />
        <span className="font-medium text-muted-foreground">{title}</span>
        <span className="text-muted-foreground/70 text-xs ml-auto">Empty</span>
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h2 className="text-base font-medium">
            {title}{" "}
            <span className="text-sm text-muted-foreground">
              ({garments.length})
            </span>
          </h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>

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
                <TableHead className="w-[100px] text-right">Actions</TableHead>
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
                      <span className="font-mono text-base">
                        {g.garment_id ?? g.id.slice(0, 8)}
                      </span>
                      {g.soaking_hours != null && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--status-info)] bg-[var(--status-info-bg)] px-2 py-0.5 rounded-md w-fit">
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
                      <span className="text-base">#{g.order_id}</span>
                      {g.invoice_number && (
                        <span className="text-xs text-muted-foreground">
                          INV-{g.invoice_number}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="px-3 py-3 text-sm">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-base">{g.customer_name ?? "—"}</span>
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
                      <StartedBadge
                        startedAt={g.soaking_started_at}
                        hours={g.soaking_hours}
                        now={now ?? Date.now()}
                      />
                    </TableCell>
                  )}
                  <TableCell className="px-3 py-3 text-right">
                    <Button
                      size="sm"
                      variant={mode === "pending" ? "outline" : "default"}
                      onClick={() => onRowAction(g.id)}
                      disabled={actingId === g.id}
                    >
                      {actingId === g.id ? (
                        <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                      ) : mode === "pending" ? (
                        <Play className="w-3.5 h-3.5 mr-1" />
                      ) : (
                        <Check className="w-3.5 h-3.5 mr-1" />
                      )}
                      {mode === "pending" ? "Start" : "Done"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
    </section>
  );
}

// Lower rank = higher priority in the In-progress list.
// 0 overdue (past target by >0.5h) · 1 ready (at/past target) · 2 still soaking · 3 no target
function readinessRank(g: WorkshopGarment, now: number): number {
  if (!g.soaking_started_at) return 3;
  if (g.soaking_hours == null) return 3;
  const elapsedHrs = (now - new Date(g.soaking_started_at as any).getTime()) / 3_600_000;
  if (elapsedHrs >= g.soaking_hours + 0.5) return 0;
  if (elapsedHrs >= g.soaking_hours) return 1;
  return 2;
}

function fmtHrs(h: number) {
  const a = Math.abs(h);
  if (a < 1) return `${Math.max(0, Math.round(a * 60))}m`;
  const hrs = Math.floor(a);
  const mins = Math.round((a - hrs) * 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

function StartedBadge({
  startedAt,
  hours,
  now,
}: {
  startedAt: string | Date | null | undefined;
  hours: number | null | undefined;
  now: number;
}) {
  if (!startedAt) return <span className="text-xs text-muted-foreground">—</span>;
  const startedMs = new Date(startedAt).getTime();
  const elapsedHrs = (now - startedMs) / 3_600_000;
  const targetHrs = hours ?? null;
  const overBy = targetHrs != null ? elapsedHrs - targetHrs : null;
  const overdue = overBy != null && overBy >= 0.5;
  const ready = overBy != null && overBy >= 0 && !overdue;

  const color = overdue
    ? "text-[var(--status-bad)]"
    : ready
      ? "text-[var(--status-ok)]"
      : "text-[var(--status-info)]";

  return (
    <div className="flex flex-col gap-0.5 text-xs tabular-nums">
      <span className={`inline-flex items-center gap-1 font-medium ${color}`}>
        <Timer className="w-3 h-3" />
        {fmtHrs(elapsedHrs)} elapsed
      </span>
      {targetHrs != null && (
        <span className={overdue ? "font-medium text-[var(--status-bad)]" : "text-muted-foreground"}>
          {overdue ? `+${fmtHrs(overBy!)} over` : ready ? "ready" : `target ${targetHrs}h`}
        </span>
      )}
    </div>
  );
}

export const Route = createFileRoute("/(main)/terminals/soaking")({
  component: SoakTerminal,
  head: () => ({ meta: [{ title: "Soaking Terminal" }] }),
});

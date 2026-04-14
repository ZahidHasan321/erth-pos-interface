import { useMemo, useState } from "react";
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useWorkshopGarments } from "@/hooks/useWorkshopGarments";
import { PageHeader, EmptyState, GarmentTypeBadge } from "@/components/shared/PageShell";
import { BrandBadge, ExpressBadge } from "@/components/shared/StageBadge";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { DatePicker } from "@repo/ui/date-picker";
import { Skeleton } from "@repo/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableContainer } from "@repo/ui/table";
import { PIECE_STAGE_LABELS } from "@/lib/constants";
import { getLocalDateStr, parseUtcTimestamp, toLocalDateStr, cn, clickableProps } from "@/lib/utils";
import type { WorkshopGarment, StageTimings, StageTimingEntry, TripHistoryEntry, QcAttempt } from "@repo/database";
import { ArrowLeft, History, Check, X, Clock, ChevronLeft, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/(main)/terminals/$stage/history")({
  component: TerminalHistoryPage,
  head: ({ params }) => ({
    meta: [{ title: `${PIECE_STAGE_LABELS[params.stage as keyof typeof PIECE_STAGE_LABELS] ?? params.stage} — History` }],
  }),
});

// ── row shape ────────────────────────────────────────────────────────────────

interface HistoryRow {
  key: string;
  garment: WorkshopGarment;
  completedAt: string;       // ISO
  worker: string | null;
  result?: "pass" | "fail";  // QC only
  failReason?: string | null;
  returnStage?: string | null;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function extractStageRows(g: WorkshopGarment, stage: string, dateStr: string): HistoryRow[] {
  const timings = (g.stage_timings as StageTimings | null) ?? null;
  const list: StageTimingEntry[] = timings?.[stage] ?? [];
  return list
    .filter((e) => e.completed_at != null)
    .filter((e) => toLocalDateStr(parseUtcTimestamp(e.completed_at as string)) === dateStr)
    .map((e, i) => ({
      key: `${g.id}-${stage}-${i}`,
      garment: g,
      completedAt: e.completed_at as string,
      worker: e.worker ?? null,
    }));
}

function extractQcRows(g: WorkshopGarment, dateStr: string): HistoryRow[] {
  const history = (g.trip_history as TripHistoryEntry[] | null) ?? [];
  const rows: HistoryRow[] = [];
  for (const trip of history) {
    const attempts = trip.qc_attempts ?? [];
    attempts.forEach((a: QcAttempt, i) => {
      if (a.date !== dateStr) return;
      rows.push({
        key: `${g.id}-qc-${trip.trip}-${i}`,
        garment: g,
        completedAt: a.date,
        worker: a.inspector || null,
        result: a.result,
        failReason: a.fail_reason,
        returnStage: a.return_stage,
      });
    });
  }
  return rows;
}

function formatTime(iso: string): string {
  try {
    const d = parseUtcTimestamp(iso);
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch {
    return "—";
  }
}

function shiftDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y!, (m ?? 1) - 1, d ?? 1);
  date.setDate(date.getDate() + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function formatDateLong(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y!, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

// ── skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow({ isQc }: { isQc: boolean }) {
  return (
    <TableRow>
      <TableCell className="px-3 py-3"><Skeleton className="h-4 w-12" /></TableCell>
      <TableCell className="px-3 py-3"><Skeleton className="h-4 w-16" /></TableCell>
      <TableCell className="px-3 py-3"><Skeleton className="h-5 w-14 rounded-full" /></TableCell>
      <TableCell className="px-3 py-3"><Skeleton className="h-4 w-20" /></TableCell>
      <TableCell className="px-3 py-3"><Skeleton className="h-4 w-32" /></TableCell>
      <TableCell className="px-3 py-3"><Skeleton className="h-4 w-28" /></TableCell>
      <TableCell className="px-3 py-3"><Skeleton className="h-4 w-28" /></TableCell>
      <TableCell className="px-3 py-3"><Skeleton className="h-5 w-12 rounded-full" /></TableCell>
      <TableCell className="px-3 py-3"><Skeleton className="h-4 w-20" /></TableCell>
      {isQc && <TableCell className="px-3 py-3"><Skeleton className="h-5 w-16 rounded-full" /></TableCell>}
    </TableRow>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────

function TerminalHistoryPage() {
  const { stage } = useParams({ from: "/(main)/terminals/$stage/history" });
  const navigate = useNavigate();
  const { data: garments = [], isLoading } = useWorkshopGarments();
  const [dateStr, setDateStr] = useState(() => getLocalDateStr());
  const [search, setSearch] = useState("");

  const isQc = stage === "quality_check";
  const stageLabel = PIECE_STAGE_LABELS[stage as keyof typeof PIECE_STAGE_LABELS] ?? stage;

  const searchFilter = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return (g: WorkshopGarment) =>
      (g.customer_name ?? "").toLowerCase().includes(q) ||
      String(g.order_id).includes(q) ||
      (g.invoice_number != null && String(g.invoice_number).includes(q)) ||
      (g.customer_mobile ?? "").replace(/\s+/g, "").includes(q.replace(/\s+/g, "")) ||
      (g.garment_id ?? "").toLowerCase().includes(q) ||
      (g.fabric_name ?? "").toLowerCase().includes(q) ||
      (g.style_name ?? "").toLowerCase().includes(q);
  }, [search]);

  const rows = useMemo(() => {
    const all: HistoryRow[] = [];
    for (const g of garments) {
      if (searchFilter && !searchFilter(g)) continue;
      const entries = isQc ? extractQcRows(g, dateStr) : extractStageRows(g, stage, dateStr);
      all.push(...entries);
    }
    return all.sort((a, b) => (b.completedAt.localeCompare(a.completedAt)));
  }, [garments, stage, dateStr, isQc, searchFilter]);

  const passCount = isQc ? rows.filter((r) => r.result === "pass").length : 0;
  const failCount = isQc ? rows.filter((r) => r.result === "fail").length : 0;

  const handleRowClick = (g: WorkshopGarment) => {
    navigate({ to: "/terminals/garment/$garmentId", params: { garmentId: g.id } });
  };

  const today = getLocalDateStr();
  const isFuture = dateStr >= today;

  return (
    <div className="p-4 sm:p-6 max-w-4xl xl:max-w-7xl mx-auto pb-10 space-y-6">
      <button
        onClick={() => window.history.back()}
        className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back
      </button>

      <PageHeader
        icon={History}
        title={`${stageLabel} — History`}
        subtitle={`${rows.length} completion${rows.length !== 1 ? "s" : ""} on ${formatDateLong(dateStr)}`}
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Date</label>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => setDateStr((d) => shiftDateStr(d, -1))}
              aria-label="Previous day"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="w-56">
              <DatePicker
                value={dateStr}
                onChange={(d) => {
                  if (!d) return;
                  const yy = d.getFullYear();
                  const mm = String(d.getMonth() + 1).padStart(2, "0");
                  const dd = String(d.getDate()).padStart(2, "0");
                  setDateStr(`${yy}-${mm}-${dd}`);
                }}
                calendarProps={{ disabled: { after: new Date() } as any }}
                displayFormat="PPP"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => setDateStr((d) => shiftDateStr(d, 1))}
              disabled={isFuture}
              aria-label="Next day"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 ml-1"
              onClick={() => setDateStr(today)}
              disabled={dateStr === today}
            >
              Today
            </Button>
          </div>
        </div>
        <div className="flex-1 min-w-[220px] space-y-1">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Search</label>
          <Input
            placeholder="Garment, customer, order, fabric, style…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isQc && !isLoading && rows.length > 0 && (
        <div className="grid grid-cols-3 gap-2.5">
          <div className="bg-blue-50/80 border border-blue-200/60 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-blue-700 tabular-nums">{rows.length}</p>
            <p className="text-xs font-bold uppercase tracking-wider text-blue-600/70">Total</p>
          </div>
          <div className="bg-green-50/80 border border-green-200/60 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-green-700 tabular-nums">{passCount}</p>
            <p className="text-xs font-bold uppercase tracking-wider text-green-600/70">Passed</p>
          </div>
          <div className="bg-red-50/80 border border-red-200/60 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-red-700 tabular-nums">{failCount}</p>
            <p className="text-xs font-bold uppercase tracking-wider text-red-600/70">Failed</p>
          </div>
        </div>
      )}

      {isLoading ? (
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 border-b-2 border-border/60 hover:bg-muted/40">
                <TableHead className="w-[90px]">Time</TableHead>
                <TableHead className="w-[120px]">Garment</TableHead>
                <TableHead className="w-[80px]">Type</TableHead>
                <TableHead className="w-[110px]">Order / Invoice</TableHead>
                <TableHead className="w-[170px]">Customer</TableHead>
                <TableHead className="w-[160px]">Fabric</TableHead>
                <TableHead className="w-[160px]">Style</TableHead>
                <TableHead className="w-[80px]">Brand</TableHead>
                <TableHead className="w-[140px]">Worker</TableHead>
                {isQc && <TableHead className="w-[110px]">Result</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 6 }, (_, i) => (
                <SkeletonRow key={i} isQc={isQc} />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : rows.length === 0 ? (
        <EmptyState icon={Clock} message={`No garments completed at ${stageLabel} on ${formatDateLong(dateStr)}`} />
      ) : (
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 border-b-2 border-border/60 hover:bg-muted/40">
                <TableHead className="w-[90px]">Time</TableHead>
                <TableHead className="w-[120px]">Garment</TableHead>
                <TableHead className="w-[80px]">Type</TableHead>
                <TableHead className="w-[110px]">Order / Invoice</TableHead>
                <TableHead className="w-[170px]">Customer</TableHead>
                <TableHead className="w-[160px]">Fabric</TableHead>
                <TableHead className="w-[160px]">Style</TableHead>
                <TableHead className="w-[80px]">Brand</TableHead>
                <TableHead className="w-[140px]">Worker</TableHead>
                {isQc && <TableHead className="w-[110px]">Result</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const g = r.garment;
                return (
                  <TableRow
                    key={r.key}
                    {...clickableProps(() => handleRowClick(g))}
                    onClick={() => handleRowClick(g)}
                    className="cursor-pointer hover:bg-muted/40"
                  >
                    <TableCell className="px-3 py-3 font-mono text-xs tabular-nums text-muted-foreground">
                      {formatTime(r.completedAt)}
                    </TableCell>
                    <TableCell className="px-3 py-3">
                      <div className="flex flex-col gap-1">
                        <span className="font-mono text-sm font-bold">
                          {g.garment_id ?? g.id.slice(0, 8)}
                        </span>
                        {g.express && <ExpressBadge />}
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-3">
                      <GarmentTypeBadge type={g.garment_type ?? "final"} />
                    </TableCell>
                    <TableCell className="px-3 py-3 font-mono">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-bold">#{g.order_id}</span>
                        {g.invoice_number && (
                          <span className="text-xs text-muted-foreground">INV-{g.invoice_number}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-3 text-sm">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold">{g.customer_name ?? "—"}</span>
                        {g.customer_mobile && (
                          <span className="text-xs font-mono text-muted-foreground">{g.customer_mobile}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-3 text-sm">
                      {g.fabric_name ? (
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="font-medium truncate">{g.fabric_name}</span>
                          {g.fabric_color && (
                            <span className="text-xs text-muted-foreground truncate">{g.fabric_color}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Outside</span>
                      )}
                    </TableCell>
                    <TableCell className="px-3 py-3 text-sm">
                      <span className="truncate block max-w-[160px]">{g.style_name ?? g.style ?? "—"}</span>
                    </TableCell>
                    <TableCell className="px-3 py-3">
                      <BrandBadge brand={g.order_brand} />
                    </TableCell>
                    <TableCell className="px-3 py-3 text-sm">
                      {r.worker ?? <span className="text-xs text-muted-foreground italic">—</span>}
                    </TableCell>
                    {isQc && (
                      <TableCell className="px-3 py-3">
                        {r.result === "pass" ? (
                          <Badge className="bg-emerald-600 text-white border-0">
                            <Check className="w-3 h-3 mr-1" /> Pass
                          </Badge>
                        ) : r.result === "fail" ? (
                          <Badge
                            className={cn("bg-red-600 text-white border-0")}
                            title={r.failReason ?? undefined}
                          >
                            <X className="w-3 h-3 mr-1" /> Fail
                          </Badge>
                        ) : null}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </div>
  );
}

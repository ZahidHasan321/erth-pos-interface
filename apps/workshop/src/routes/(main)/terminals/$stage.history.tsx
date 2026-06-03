import { useMemo, useState } from "react";
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useHistoryGarments } from "@/hooks/useWorkshopGarments";
import { PageHeader, EmptyState, GarmentTypeBadge, StatsCard } from "@/components/shared/PageShell";
import { BrandBadge, ExpressBadge } from "@/components/shared/StageBadge";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { SearchInput } from "@/components/shared/SearchInput";
import { matchesGarmentSearch } from "@/lib/garment-search";
import { DatePicker } from "@repo/ui/date-picker";
import { Skeleton } from "@repo/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableContainer } from "@/components/shared/table";
import { PIECE_STAGE_LABELS } from "@/lib/constants";
import { getLocalDateStr, parseUtcTimestamp, toLocalDateStr, clickableProps, TIMEZONE, getKuwaitDayRange } from "@/lib/utils";
import type { WorkshopGarment, StageTimings, StageTimingEntry, TripHistoryEntry, QcAttempt } from "@repo/database";
import { getQcReturnStages } from "@repo/database";
import { ArrowLeft, History, Check, X, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import type { Matcher } from "react-day-picker";

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
  startedAt: string | null;  // ISO
  completedAt: string;       // ISO
  worker: string | null;
  result?: "pass" | "fail";  // QC only
  failReason?: string | null;
  returnStages?: string[];
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
      startedAt: e.started_at ?? null,
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
        startedAt: null,
        completedAt: a.date,
        worker: a.inspector || null,
        result: a.result,
        failReason: a.fail_reason,
        returnStages: getQcReturnStages(a),
      });
    });
  }
  return rows;
}

function extractSoakingRows(g: WorkshopGarment, dateStr: string): HistoryRow[] {
  const completed = g.soaking_completed_at;
  if (!completed) return [];
  const completedIso = typeof completed === "string" ? completed : new Date(completed).toISOString();
  if (toLocalDateStr(parseUtcTimestamp(completedIso)) !== dateStr) return [];
  const started = g.soaking_started_at;
  const startedIso =
    started == null ? null : typeof started === "string" ? started : new Date(started).toISOString();
  return [
    {
      key: `${g.id}-soaking`,
      garment: g,
      startedAt: startedIso,
      completedAt: completedIso,
      worker: null,
    },
  ];
}

function formatTime(iso: string): string {
  try {
    const d = parseUtcTimestamp(iso);
    return d.toLocaleTimeString(undefined, { timeZone: TIMEZONE, hour: "numeric", minute: "2-digit" });
  } catch {
    return "—";
  }
}

function shiftDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d) + days * 86_400_000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function formatDateLong(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00+03:00");
  return date.toLocaleDateString(undefined, { timeZone: TIMEZONE, weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

// ── skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow({ isQc, showStarted, showWorker }: { isQc: boolean; showStarted: boolean; showWorker: boolean }) {
  return (
    <TableRow>
      {showStarted && <TableCell className="px-3 py-3"><Skeleton className="h-4 w-12" /></TableCell>}
      <TableCell className="px-3 py-3"><Skeleton className="h-4 w-12" /></TableCell>
      <TableCell className="px-3 py-3"><Skeleton className="h-4 w-16" /></TableCell>
      <TableCell className="px-3 py-3"><Skeleton className="h-5 w-14 rounded-full" /></TableCell>
      <TableCell className="px-3 py-3"><Skeleton className="h-4 w-20" /></TableCell>
      <TableCell className="px-3 py-3"><Skeleton className="h-4 w-32" /></TableCell>
      <TableCell className="px-3 py-3"><Skeleton className="h-4 w-28" /></TableCell>
      <TableCell className="px-3 py-3"><Skeleton className="h-4 w-28" /></TableCell>
      <TableCell className="px-3 py-3"><Skeleton className="h-5 w-12 rounded-full" /></TableCell>
      {showWorker && <TableCell className="px-3 py-3"><Skeleton className="h-4 w-20" /></TableCell>}
      {isQc && <TableCell className="px-3 py-3"><Skeleton className="h-5 w-16 rounded-full" /></TableCell>}
    </TableRow>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────

function TerminalHistoryPage() {
  const { stage } = useParams({ from: "/(main)/terminals/$stage/history" });
  const navigate = useNavigate();
  const [dateStr, setDateStr] = useState(() => getLocalDateStr());
  const dayRange = useMemo(() => getKuwaitDayRange(dateStr), [dateStr]);
  const { data: garments = [], isLoading } = useHistoryGarments(stage, dateStr, dayRange);
  const [search, setSearch] = useState("");

  const isQc = stage === "quality_check";
  const isSoaking = stage === "soaking";
  const showStarted = !isQc;
  const showWorker = !isSoaking;
  const stageLabel = PIECE_STAGE_LABELS[stage as keyof typeof PIECE_STAGE_LABELS] ?? stage;

  const searchFilter = useMemo(() => {
    const q = search.trim();
    if (!q) return null;
    return (g: WorkshopGarment) => matchesGarmentSearch(g, q, { includeFabricStyle: true });
  }, [search]);

  const rows = useMemo(() => {
    const all: HistoryRow[] = [];
    for (const g of garments) {
      if (searchFilter && !searchFilter(g)) continue;
      const entries = isQc
        ? extractQcRows(g, dateStr)
        : isSoaking
          ? extractSoakingRows(g, dateStr)
          : extractStageRows(g, stage, dateStr);
      all.push(...entries);
    }
    return all.sort((a, b) => (b.completedAt.localeCompare(a.completedAt)));
  }, [garments, stage, dateStr, isQc, isSoaking, searchFilter]);

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
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
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
          <label className="text-sm font-medium text-muted-foreground">Date</label>
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
                calendarProps={{ disabled: { after: new Date() } as Matcher }}
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
          <label className="text-sm font-medium text-muted-foreground">Search</label>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Garment, customer, order, fabric, style…"
          />
        </div>
      </div>

      {isQc && !isLoading && rows.length > 0 && (
        <div className="grid grid-cols-3 gap-2.5">
          <StatsCard icon={History} value={rows.length} label="Total" color="blue" />
          <StatsCard icon={Check} value={passCount} label="Passed" color="green" />
          <StatsCard icon={X} value={failCount} label="Failed" color="red" />
        </div>
      )}

      {isLoading ? (
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 border-b-2 border-border/60 hover:bg-muted/40">
                {showStarted && <TableHead className="w-[90px]">Started</TableHead>}
                <TableHead className="w-[90px]">{isSoaking ? "Completed" : "Time"}</TableHead>
                <TableHead className="w-[120px]">Garment</TableHead>
                <TableHead className="w-[80px]">Type</TableHead>
                <TableHead className="w-[110px]">Order / Invoice</TableHead>
                <TableHead className="w-[170px]">Customer</TableHead>
                <TableHead className="w-[160px]">Fabric</TableHead>
                <TableHead className="w-[160px]">Style</TableHead>
                <TableHead className="w-[80px]">Brand</TableHead>
                {showWorker && <TableHead className="w-[140px]">Worker</TableHead>}
                {isQc && <TableHead className="w-[110px]">Result</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 6 }, (_, i) => (
                <SkeletonRow key={i} isQc={isQc} showStarted={showStarted} showWorker={showWorker} />
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
                {showStarted && <TableHead className="w-[90px]">Started</TableHead>}
                <TableHead className="w-[90px]">{isSoaking ? "Completed" : "Time"}</TableHead>
                <TableHead className="w-[120px]">Garment</TableHead>
                <TableHead className="w-[80px]">Type</TableHead>
                <TableHead className="w-[110px]">Order / Invoice</TableHead>
                <TableHead className="w-[170px]">Customer</TableHead>
                <TableHead className="w-[160px]">Fabric</TableHead>
                <TableHead className="w-[160px]">Style</TableHead>
                <TableHead className="w-[80px]">Brand</TableHead>
                {showWorker && <TableHead className="w-[140px]">Worker</TableHead>}
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
                    {showStarted && (
                      <TableCell className="px-3 py-3 font-mono text-xs tabular-nums text-muted-foreground">
                        {r.startedAt ? formatTime(r.startedAt) : "—"}
                      </TableCell>
                    )}
                    <TableCell className="px-3 py-3 font-mono text-xs tabular-nums text-muted-foreground">
                      {formatTime(r.completedAt)}
                    </TableCell>
                    <TableCell className="px-3 py-3">
                      <div className="flex flex-col gap-1">
                        <span className="font-mono text-base">
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
                        <span className="text-base">#{g.order_id}</span>
                        {g.invoice_number && (
                          <span className="text-xs text-muted-foreground">INV-{g.invoice_number}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-3 text-sm">
                      <div className="flex flex-col gap-0.5 max-w-[180px]">
                        <span className="text-base tracking-tight truncate" title={g.customer_name ?? undefined}>{g.customer_name ?? "—"}</span>
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
                    {showWorker && (
                      <TableCell className="px-3 py-3 text-sm">
                        {r.worker ?? <span className="text-xs text-muted-foreground italic">—</span>}
                      </TableCell>
                    )}
                    {isQc && (
                      <TableCell className="px-3 py-3">
                        {r.result === "pass" ? (
                          <Badge
                            variant="outline"
                            className="border-transparent bg-[var(--status-ok-bg)] text-[var(--status-ok)] text-xs font-medium"
                          >
                            <Check className="w-3 h-3 mr-1" /> Pass
                          </Badge>
                        ) : r.result === "fail" ? (
                          <Badge
                            variant="outline"
                            className="border-transparent bg-[var(--status-bad-bg)] text-[var(--status-bad)] text-xs font-medium"
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

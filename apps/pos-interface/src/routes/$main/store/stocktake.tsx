import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Check, CheckCircle2, ChevronRight, ClipboardCheck, History, Loader2, ShieldAlert } from "lucide-react";

import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Card, CardContent } from "@repo/ui/card";
import { Skeleton } from "@repo/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/tabs";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui/table";

import { cn, parseUtcTimestamp, TIMEZONE } from "@/lib/utils";
import { useAuth } from "@/context/auth";
import { isAdmin, isManager } from "@/lib/rbac";
import { formatQty } from "@/lib/inventory";
import { getFabrics } from "@/api/fabrics";
import { getShelf } from "@/api/shelf";
import { getAccessories } from "@/api/accessories";
import {
  getStocktakeStatus,
  startStocktake,
  saveStocktakeCounts,
  validateStocktake,
  getStocktakeCounts,
  getStocktakeHistory,
  type StocktakeCountInput,
} from "@/api/stocktake";
import type { StockItemType } from "@repo/database";

export const Route = createFileRoute("/$main/store/stocktake")({
  component: StocktakePage,
  head: () => ({ meta: [{ title: "Stocktake | Inventory" }] }),
});

const SIDE = "shop" as const;

type Line = { itemType: StockItemType; itemId: number; name: string; system: number };
type Entry = { counted: string; reason: string };

function StocktakePage() {
  const { main } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const canValidate = isManager(user) || isAdmin(user);

  const statusQ = useQuery({ queryKey: ["stocktake_status", SIDE], queryFn: () => getStocktakeStatus(SIDE), staleTime: 30_000 });
  const sessionId = statusQ.data?.open_session_id ?? null;

  const fabricsQ = useQuery({ queryKey: ["fabrics", { archived: false }], queryFn: () => getFabrics(false), staleTime: 60_000 });
  const shelfQ = useQuery({ queryKey: ["shelf", { archived: false }], queryFn: () => getShelf(false), staleTime: 60_000 });
  const accQ = useQuery({ queryKey: ["accessories", { archived: false }], queryFn: () => getAccessories(false), staleTime: 60_000 });

  const lines: Line[] = useMemo(() => {
    const out: Line[] = [];
    for (const f of fabricsQ.data ?? []) if (!f.is_archived) out.push({ itemType: "fabric", itemId: f.id, name: f.name, system: Number(f.shop_stock ?? 0) });
    for (const s of shelfQ.data ?? []) if (!s.is_archived) out.push({ itemType: "shelf", itemId: s.id, name: s.type ?? `Shelf #${s.id}`, system: Number(s.shop_stock ?? 0) });
    for (const a of accQ.data ?? []) if (!a.is_archived) out.push({ itemType: "accessory", itemId: a.id, name: a.name, system: Number(a.shop_stock ?? 0) });
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [fabricsQ.data, shelfQ.data, accQ.data]);

  const countsQ = useQuery({ queryKey: ["stocktake_counts", sessionId], queryFn: () => getStocktakeCounts(sessionId!), enabled: sessionId != null, staleTime: 10_000 });
  const historyQ = useQuery({ queryKey: ["stocktake_history", SIDE, 3], queryFn: () => getStocktakeHistory(SIDE, 3), staleTime: 60_000 });

  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [seededFor, setSeededFor] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "uncounted" | "variances">("all");

  // Seed local entries from any saved counts when the open session's counts load.
  useEffect(() => {
    if (sessionId != null && countsQ.data && seededFor !== sessionId) {
      const seed: Record<string, Entry> = {};
      for (const c of countsQ.data) seed[`${c.item_type}:${c.item_id}`] = { counted: c.counted_qty == null ? "" : String(c.counted_qty), reason: c.reason ?? "" };
      setEntries(seed);
      setSeededFor(sessionId);
    }
    if (sessionId == null && seededFor != null) {
      setEntries({});
      setSeededFor(null);
    }
  }, [sessionId, countsQ.data, seededFor]);

  function setEntry(key: string, patch: Partial<Entry>) {
    setEntries((e) => {
      const prev = e[key] ?? { counted: "", reason: "" };
      return { ...e, [key]: { ...prev, ...patch } };
    });
  }

  // One-tap "this matches the system" — fill the count with the system qty (no
  // keyboard) and clear any reason (a matching line has no variance). Tapping a
  // matched row again clears it back to uncounted.
  function toggleMatch(l: Line) {
    const key = `${l.itemType}:${l.itemId}`;
    const e = entries[key];
    const matched = e != null && e.counted.trim() !== "" && Number(e.counted) === l.system;
    setEntry(key, matched ? { counted: "", reason: "" } : { counted: String(l.system), reason: "" });
  }

  // Bulk: fill every still-uncounted line with its system qty. Never overwrites
  // a count already entered (a deliberate variance stays as typed).
  function matchAllUncounted() {
    setEntries((prev) => {
      const next = { ...prev };
      for (const l of lines) {
        const key = `${l.itemType}:${l.itemId}`;
        if ((next[key]?.counted.trim() ?? "") === "") next[key] = { counted: String(l.system), reason: "" };
      }
      return next;
    });
  }

  function buildCounts(): StocktakeCountInput[] {
    const out: StocktakeCountInput[] = [];
    for (const l of lines) {
      const e = entries[`${l.itemType}:${l.itemId}`];
      if (!e || e.counted.trim() === "") continue;
      const counted = Number(e.counted);
      if (!Number.isFinite(counted)) continue;
      out.push({ item_type: l.itemType, item_id: l.itemId, counted_qty: counted, reason: e.reason.trim() || null });
    }
    return out;
  }

  const invalidateAfterValidate = () => {
    qc.invalidateQueries({ queryKey: ["stocktake_status", SIDE] });
    qc.invalidateQueries({ queryKey: ["stocktake_history", SIDE] });
    qc.invalidateQueries({ queryKey: ["stocktake_counts"] });
    qc.invalidateQueries({ queryKey: ["fabrics"] });
    qc.invalidateQueries({ queryKey: ["shelf"] });
    qc.invalidateQueries({ queryKey: ["accessories"] });
    qc.invalidateQueries({ queryKey: ["stock_movements"] });
  };

  const startMut = useMutation({
    mutationFn: () => startStocktake(SIDE, user?.id ?? null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stocktake_status", SIDE] });
      toast.success("Stocktake started");
    },
    onError: (err: unknown) => toast.error(`Could not start stocktake: ${err instanceof Error ? err.message : String(err)}`),
  });

  const saveMut = useMutation({
    mutationFn: () => saveStocktakeCounts(sessionId!, buildCounts(), user?.id ?? null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stocktake_counts", sessionId] });
      toast.success("Counts saved");
    },
    onError: (err: unknown) => toast.error(`Could not save counts: ${err instanceof Error ? err.message : String(err)}`),
  });

  const validateMut = useMutation({
    mutationFn: async () => {
      await saveStocktakeCounts(sessionId!, buildCounts(), user?.id ?? null);
      return validateStocktake(sessionId!, user?.id ?? null);
    },
    onSuccess: (res) => {
      invalidateAfterValidate();
      toast.success(`Stocktake validated, ${res.adjustments_applied} adjustment${res.adjustments_applied !== 1 ? "s" : ""} applied`);
    },
    onError: (err: unknown) => toast.error(`Could not validate: ${err instanceof Error ? err.message : String(err)}`),
  });

  // A counted line with a non-zero variance must carry a reason before validate.
  function missingReason(): Line | null {
    for (const l of lines) {
      const e = entries[`${l.itemType}:${l.itemId}`];
      if (!e || e.counted.trim() === "") continue;
      const counted = Number(e.counted);
      if (Number.isFinite(counted) && counted !== l.system && !e.reason.trim()) return l;
    }
    return null;
  }

  function handleValidate() {
    const m = missingReason();
    if (m) {
      toast.error(`${m.name} has a variance, add a reason first`);
      return;
    }
    validateMut.mutate();
  }

  // Per-line state used both for the filter and for row rendering.
  function lineState(l: Line) {
    const e = entries[`${l.itemType}:${l.itemId}`] ?? { counted: "", reason: "" };
    const hasCount = e.counted.trim() !== "";
    const counted = Number(e.counted);
    const variance = hasCount && Number.isFinite(counted) ? +(counted - l.system).toFixed(2) : null;
    return { e, hasCount, counted, variance };
  }

  const countedCount = useMemo(
    () => lines.filter((l) => lineState(l).hasCount).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, entries],
  );
  const varianceCount = useMemo(
    () => lines.filter((l) => { const v = lineState(l).variance; return v != null && v !== 0; }).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, entries],
  );
  const progressPct = lines.length ? Math.round((countedCount / lines.length) * 100) : 0;

  const visibleLines = useMemo(() => {
    if (filter === "all") return lines;
    if (filter === "uncounted") return lines.filter((l) => !lineState(l).hasCount);
    return lines.filter((l) => { const v = lineState(l).variance; return v != null && v !== 0; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, entries, filter]);

  const itemsLoading = fabricsQ.isLoading || shelfQ.isLoading || accQ.isLoading;

  return (
    <div className="p-4 sm:p-6 max-w-[1100px] mx-auto pb-12 space-y-6">
      <div className="flex items-start gap-3 flex-wrap">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to="/$main/store/inventory" params={{ main }}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Inventory
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-muted-foreground" /> Stocktake
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Monthly physical count of the shop's own stock. A manager validates to apply variances.
          </p>
        </div>
      </div>

      {statusQ.data && (
        <p className="text-xs text-muted-foreground">
          {statusQ.data.last_validated_at
            ? `Last validated ${parseUtcTimestamp(statusQ.data.last_validated_at).toLocaleDateString("en-GB", { timeZone: TIMEZONE })}`
            : "No stocktake on record yet."}
          {statusQ.data.overdue && (
            <span className="text-red-700 font-medium"> · {statusQ.data.days_overdue} day{statusQ.data.days_overdue !== 1 ? "s" : ""} overdue</span>
          )}
        </p>
      )}

      {sessionId == null ? (
        <Card className="shadow-none rounded-xl border">
          <CardContent className="py-10 text-center space-y-4">
            <ClipboardCheck className="h-10 w-10 mx-auto text-muted-foreground/50" />
            <div>
              <p className="font-medium text-sm">No stocktake in progress</p>
              <p className="text-sm text-muted-foreground mt-1">Start one to enter physical counts for every item.</p>
            </div>
            <Button onClick={() => startMut.mutate()} disabled={startMut.isPending}>
              {startMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Start stocktake
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {/* Progress + actions */}
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div className="min-w-[200px] flex-1 max-w-sm">
              <div className="flex items-baseline justify-between text-sm mb-1.5">
                <span className="text-muted-foreground">
                  <span className="font-medium text-foreground tabular-nums">{countedCount}</span> of <span className="tabular-nums">{lines.length}</span> counted
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">{progressPct}%</span>
              </div>
              <div
                className="h-1.5 rounded-full bg-muted overflow-hidden"
                role="progressbar"
                aria-valuenow={countedCount}
                aria-valuemin={0}
                aria-valuemax={lines.length}
                aria-label="Items counted"
              >
                <div className="h-full bg-primary transition-[width] motion-reduce:transition-none" style={{ width: `${progressPct}%` }} />
              </div>
              {varianceCount > 0 && (
                <p className="text-xs text-amber-700 mt-1.5 tabular-nums" aria-live="polite">
                  {varianceCount} variance{varianceCount !== 1 ? "s" : ""} to review
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => saveMut.mutate()} disabled={saveMut.isPending || validateMut.isPending}>
                {saveMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                Save progress
              </Button>
              {canValidate ? (
                <Button size="sm" onClick={handleValidate} disabled={validateMut.isPending || saveMut.isPending}>
                  {validateMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                  <CheckCircle2 className="h-4 w-4 mr-1.5" /> Validate &amp; apply
                </Button>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title="Only a manager can apply variances as adjustments">
                  <ShieldAlert className="h-3.5 w-3.5 shrink-0" /> A manager validates &amp; applies
                </span>
              )}
            </div>
          </div>

          {/* View filter + bulk match */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
              <TabsList className="h-auto">
                <TabsTrigger value="all">All <span className="ml-1.5 tabular-nums text-muted-foreground">{lines.length}</span></TabsTrigger>
                <TabsTrigger value="uncounted">Uncounted <span className="ml-1.5 tabular-nums text-muted-foreground">{lines.length - countedCount}</span></TabsTrigger>
                <TabsTrigger value="variances">Variances <span className="ml-1.5 tabular-nums text-muted-foreground">{varianceCount}</span></TabsTrigger>
              </TabsList>
            </Tabs>
            {countedCount < lines.length && (
              <Button variant="outline" size="sm" onClick={matchAllUncounted}>
                <Check className="h-4 w-4 mr-1.5" /> Match all uncounted <span className="ml-1 tabular-nums text-muted-foreground">{lines.length - countedCount}</span>
              </Button>
            )}
          </div>

          {itemsLoading ? (
            <Skeleton className="h-64 rounded-xl" />
          ) : (
            <div className="overflow-auto overscroll-contain max-h-[65vh] rounded-xl border bg-card">
              <table className="w-full caption-bottom text-sm">
                <TableHeader className="sticky top-0 z-10 bg-muted">
                  <TableRow>
                    <TableHead className="w-[44px]"><span className="sr-only">Matches system</span></TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right w-[110px]">System</TableHead>
                    <TableHead className="w-[130px]">Counted</TableHead>
                    <TableHead className="text-right w-[100px]">Variance</TableHead>
                    <TableHead className="w-[240px]">Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleLines.map((l) => {
                    const key = `${l.itemType}:${l.itemId}`;
                    const { e, hasCount, variance } = lineState(l);
                    const needsReason = variance != null && variance !== 0;
                    const matched = hasCount && variance === 0;
                    return (
                      <TableRow key={key}>
                        <TableCell className="pr-0">
                          <button
                            type="button"
                            onClick={() => toggleMatch(l)}
                            aria-pressed={matched}
                            aria-label={matched ? `${l.name} matches system, tap to clear` : `Mark ${l.name} as matching system (${formatQty(l.itemType, l.system)})`}
                            className={cn(
                              "grid place-items-center h-8 w-8 rounded-md border transition-colors motion-reduce:transition-none touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              matched
                                ? "border-green-600 text-green-700 bg-green-50"
                                : "border-input text-muted-foreground hover:bg-muted",
                            )}
                          >
                            <Check className="h-4 w-4" />
                          </button>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-medium">{l.name}</span>
                          <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">{l.itemType}</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                          {formatQty(l.itemType, l.system)}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            inputMode="decimal"
                            value={e.counted}
                            onChange={(ev) => setEntry(key, { counted: ev.target.value })}
                            className="h-8 text-right tabular-nums"
                            placeholder="-"
                            aria-label={`Counted quantity for ${l.name}`}
                          />
                        </TableCell>
                        <TableCell className={cn("text-right tabular-nums text-sm font-medium", variance == null || variance === 0 ? "text-muted-foreground" : variance > 0 ? "text-green-700" : "text-red-700")}>
                          {variance == null ? "-" : `${variance > 0 ? "+" : ""}${formatQty(l.itemType, variance)}`}
                        </TableCell>
                        <TableCell>
                          <Input
                            value={e.reason}
                            onChange={(ev) => setEntry(key, { reason: ev.target.value })}
                            className={cn("h-8", needsReason && !e.reason.trim() && "border-red-300 focus-visible:ring-red-400")}
                            placeholder={needsReason ? "Reason required" : "-"}
                            disabled={!needsReason}
                            aria-label={`Variance reason for ${l.name}`}
                            aria-required={needsReason}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {visibleLines.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                        {lines.length === 0
                          ? "No active stock to count."
                          : filter === "uncounted"
                            ? "Every item has a count. Nothing left to count."
                            : "No variances. Counts match the system."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* History */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <History className="h-4 w-4 text-muted-foreground" /> Past stocktakes
          </h2>
          {historyQ.data && historyQ.data.length > 0 && (
            <Button variant="ghost" size="sm" asChild className="-mr-2">
              <Link to="/$main/store/stocktake/history" params={{ main }}>View all</Link>
            </Button>
          )}
        </div>
        {historyQ.data && historyQ.data.length > 0 ? (
          <ul className="rounded-xl border divide-y">
            {historyQ.data.map((h) => (
              <li key={h.id}>
                <Link
                  to="/$main/store/stocktake/history/$sessionId"
                  params={{ main, sessionId: String(h.id) }}
                  className="flex items-center justify-between px-4 py-2 text-sm hover:bg-muted/50 transition-colors motion-reduce:transition-none"
                >
                  <span>{h.validated_at ? parseUtcTimestamp(h.validated_at).toLocaleDateString(undefined, { timeZone: TIMEZONE, day: "numeric", month: "short", year: "numeric" }) : "-"}</span>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">Validated <ChevronRight className="h-3.5 w-3.5" /></span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No past stocktakes yet.</p>
        )}
      </div>
    </div>
  );
}

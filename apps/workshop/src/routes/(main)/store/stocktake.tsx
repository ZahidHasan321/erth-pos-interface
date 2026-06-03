import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Check, CheckCircle2, ChevronRight, ClipboardCheck, History, Loader2, ShieldAlert } from "lucide-react";

import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Skeleton } from "@repo/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/tabs";
import { TableContainer, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shared/table";

import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth";
import { isAdmin, isManager } from "@/lib/rbac";
import { formatQty } from "@/lib/inventory";
import { getFabrics } from "@/api/fabrics";
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
import { PageHeader, SectionCard, EmptyState } from "@/components/shared/PageShell";
import type { StockItemType } from "@repo/database";

export const Route = createFileRoute("/(main)/store/stocktake")({
  component: StocktakePage,
  head: () => ({ meta: [{ title: "Stocktake" }] }),
});

const SIDE = "workshop" as const;

type Line = { itemType: StockItemType; itemId: number; name: string; system: number };
type Entry = { counted: string; reason: string };
type CountFilter = "all" | "uncounted" | "variances";

function StocktakePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const canValidate = isManager(user) || isAdmin(user);

  const statusQ = useQuery({ queryKey: ["stocktake_status", SIDE], queryFn: () => getStocktakeStatus(SIDE), staleTime: 30_000 });
  const sessionId = statusQ.data?.open_session_id ?? null;

  const fabricsQ = useQuery({ queryKey: ["fabrics"], queryFn: () => getFabrics(), staleTime: 60_000 });
  const accQ = useQuery({ queryKey: ["accessories"], queryFn: () => getAccessories(), staleTime: 60_000 });

  const lines: Line[] = useMemo(() => {
    const out: Line[] = [];
    for (const a of accQ.data ?? []) if (!a.is_archived) out.push({ itemType: "accessory", itemId: a.id, name: a.name, system: Number(a.workshop_stock ?? 0) });
    for (const f of fabricsQ.data ?? []) if (!f.is_archived) out.push({ itemType: "fabric", itemId: f.id, name: f.name, system: Number(f.workshop_stock ?? 0) });
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [fabricsQ.data, accQ.data]);

  const countsQ = useQuery({ queryKey: ["stocktake_counts", sessionId], queryFn: () => getStocktakeCounts(sessionId!), enabled: sessionId != null, staleTime: 10_000 });
  const historyQ = useQuery({ queryKey: ["stocktake_history", SIDE, 3], queryFn: () => getStocktakeHistory(SIDE, 3), staleTime: 60_000 });

  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [seededFor, setSeededFor] = useState<number | null>(null);

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
      qc.invalidateQueries({ queryKey: ["stocktake_status", SIDE] });
      qc.invalidateQueries({ queryKey: ["stocktake_history", SIDE] });
      qc.invalidateQueries({ queryKey: ["stocktake_counts"] });
      qc.invalidateQueries({ queryKey: ["fabrics"] });
      qc.invalidateQueries({ queryKey: ["accessories"] });
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
      toast.success(`Stocktake validated — ${res.adjustments_applied} adjustment${res.adjustments_applied !== 1 ? "s" : ""} applied`);
    },
    onError: (err: unknown) => toast.error(`Could not validate: ${err instanceof Error ? err.message : String(err)}`),
  });

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
      toast.error(`${m.name} has a variance — add a reason first`);
      return;
    }
    validateMut.mutate();
  }

  const countedCount = useMemo(
    () => lines.filter((l) => (entries[`${l.itemType}:${l.itemId}`]?.counted.trim() ?? "") !== "").length,
    [lines, entries],
  );

  const varianceCount = useMemo(
    () => lines.filter((l) => {
      const e = entries[`${l.itemType}:${l.itemId}`];
      if (!e || e.counted.trim() === "") return false;
      const c = Number(e.counted);
      return Number.isFinite(c) && c !== l.system;
    }).length,
    [lines, entries],
  );

  const [filter, setFilter] = useState<CountFilter>("all");
  const visibleLines = useMemo(() => {
    if (filter === "all") return lines;
    return lines.filter((l) => {
      const e = entries[`${l.itemType}:${l.itemId}`];
      const has = (e?.counted.trim() ?? "") !== "";
      if (filter === "uncounted") return !has;
      const c = Number(e?.counted);
      return has && Number.isFinite(c) && c !== l.system;
    });
  }, [lines, entries, filter]);

  const progressPct = lines.length === 0 ? 0 : Math.round((countedCount / lines.length) * 100);

  const itemsLoading = fabricsQ.isLoading || accQ.isLoading;

  return (
    <div className="px-4 sm:px-6 py-5 max-w-[1100px] mx-auto pb-12 space-y-5">
      <div className="mb-1">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to="/store/inventory">
            <ArrowLeft className="h-4 w-4 mr-1.5" aria-hidden="true" /> Inventory
          </Link>
        </Button>
      </div>

      <PageHeader icon={ClipboardCheck} title="Stocktake" subtitle="Monthly physical count of the workshop's own stock. A manager validates to apply variances." />

      {statusQ.data && (
        <p className="text-xs text-muted-foreground">
          {statusQ.data.last_validated_at
            ? `Last validated ${new Date(statusQ.data.last_validated_at).toLocaleDateString()}`
            : "No stocktake on record yet."}
          {statusQ.data.overdue && (
            <span className="text-[var(--status-bad)] font-medium"> · {statusQ.data.days_overdue} day{statusQ.data.days_overdue !== 1 ? "s" : ""} overdue</span>
          )}
        </p>
      )}

      {sessionId == null ? (
        <SectionCard>
          <div className="py-8">
            <EmptyState icon={ClipboardCheck} message="No stocktake in progress. Start one to enter physical counts for every item." />
            <div className="flex justify-center mt-4">
              <Button onClick={() => startMut.mutate()} disabled={startMut.isPending}>
                {startMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                Start stocktake
              </Button>
            </div>
          </div>
        </SectionCard>
      ) : (
        <div className="space-y-3">
          {/* Progress + actions */}
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div className="min-w-[220px] flex-1 max-w-sm">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-muted-foreground">
                  <span className="font-medium text-foreground tabular-nums">{countedCount}</span> of <span className="tabular-nums">{lines.length}</span> counted
                </span>
                {varianceCount > 0 && (
                  <span className="text-[var(--status-warn)] tabular-nums">{varianceCount} variance{varianceCount !== 1 ? "s" : ""}</span>
                )}
              </div>
              <div
                className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden"
                role="progressbar"
                aria-valuenow={progressPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Stocktake progress"
              >
                <div className="h-full rounded-full bg-[var(--status-ok)] transition-[width]" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => saveMut.mutate()} disabled={saveMut.isPending || validateMut.isPending}>
                {saveMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" aria-hidden="true" />}
                Save progress
              </Button>
              {canValidate ? (
                <Button size="sm" onClick={handleValidate} disabled={validateMut.isPending || saveMut.isPending}>
                  {validateMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" aria-hidden="true" />}
                  <CheckCircle2 className="h-4 w-4 mr-1.5" aria-hidden="true" /> Validate &amp; apply
                </Button>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title="Saved counts are applied to stock only after a manager validates them.">
                  <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> A manager validates &amp; applies
                </span>
              )}
            </div>
          </div>

          {/* Filter + bulk match */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Tabs value={filter} onValueChange={(v) => setFilter(v as CountFilter)}>
              <TabsList className="h-auto gap-0.5">
                <TabsTrigger value="all">All <span className="ml-1 tabular-nums text-muted-foreground">{lines.length}</span></TabsTrigger>
                <TabsTrigger value="uncounted">Uncounted <span className="ml-1 tabular-nums text-muted-foreground">{lines.length - countedCount}</span></TabsTrigger>
                <TabsTrigger value="variances">Variances <span className="ml-1 tabular-nums text-muted-foreground">{varianceCount}</span></TabsTrigger>
              </TabsList>
            </Tabs>
            {countedCount < lines.length && (
              <Button variant="outline" size="sm" onClick={matchAllUncounted}>
                <Check className="h-4 w-4 mr-1.5" aria-hidden="true" /> Match all uncounted <span className="ml-1 tabular-nums text-muted-foreground">{lines.length - countedCount}</span>
              </Button>
            )}
          </div>

          {itemsLoading ? (
            <Skeleton className="h-64 rounded-md" />
          ) : visibleLines.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              message={filter === "uncounted" ? "Every item has been counted." : filter === "variances" ? "No variances — counts match the system." : "No items to count."}
            />
          ) : (
            <TableContainer className="rounded-md shadow-none max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10">
                  <TableRow className="bg-muted">
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
                    const e = entries[key] ?? { counted: "", reason: "" };
                    const hasCount = e.counted.trim() !== "";
                    const counted = Number(e.counted);
                    const variance = hasCount && Number.isFinite(counted) ? +(counted - l.system).toFixed(2) : null;
                    const needsReason = variance != null && variance !== 0;
                    const matched = hasCount && variance === 0;
                    return (
                      <TableRow key={key}>
                        <TableCell className="pr-0">
                          <button
                            type="button"
                            onClick={() => toggleMatch(l)}
                            aria-pressed={matched}
                            aria-label={matched ? `${l.name} matches system — tap to clear` : `Mark ${l.name} as matching system (${formatQty(l.itemType, l.system)})`}
                            className={cn(
                              "grid place-items-center h-8 w-8 rounded-md border transition-colors motion-reduce:transition-none touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              matched
                                ? "border-[var(--status-ok)] text-[var(--status-ok)] bg-[var(--status-ok)]/10"
                                : "border-border text-muted-foreground hover:bg-muted",
                            )}
                          >
                            <Check className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{l.name}</span>
                          <span className="ml-2 text-xs text-muted-foreground capitalize">{l.itemType}</span>
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
                            placeholder="—"
                            aria-label={`Counted quantity for ${l.name}`}
                          />
                        </TableCell>
                        <TableCell className={cn("text-right tabular-nums text-sm font-medium", variance == null || variance === 0 ? "text-muted-foreground" : variance > 0 ? "text-[var(--status-ok)]" : "text-[var(--status-bad)]")}>
                          {variance == null ? "—" : `${variance > 0 ? "+" : ""}${formatQty(l.itemType, variance)}`}
                        </TableCell>
                        <TableCell>
                          <Input
                            value={e.reason}
                            onChange={(ev) => setEntry(key, { reason: ev.target.value })}
                            className={cn("h-8", needsReason && !e.reason.trim() && "border-[var(--status-bad)] focus-visible:ring-[var(--status-bad)]")}
                            placeholder={needsReason ? "Reason required" : "—"}
                            disabled={!needsReason}
                            aria-required={needsReason}
                            aria-label={`Variance reason for ${l.name}`}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 className="text-sm font-medium flex items-center gap-1.5">
            <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> Past stocktakes
          </h2>
          {historyQ.data && historyQ.data.length > 0 && (
            <Button variant="ghost" size="sm" asChild className="-mr-2">
              <Link to="/store/stocktake/history">View all</Link>
            </Button>
          )}
        </div>
        {historyQ.data && historyQ.data.length > 0 ? (
          <ul className="rounded-md border border-border divide-y divide-border">
            {historyQ.data.map((h) => (
              <li key={h.id}>
                <Link
                  to="/store/stocktake/history/$sessionId"
                  params={{ sessionId: String(h.id) }}
                  className="flex items-center justify-between px-4 py-2 text-sm hover:bg-muted/50 transition-colors motion-reduce:transition-none"
                >
                  <span>{h.validated_at ? new Date(h.validated_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—"}</span>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">Validated <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /></span>
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

import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { History, Search, X, ArrowUpDown, ArrowUp, ArrowDown, AlertCircle, RefreshCw } from "lucide-react";

import { Button } from "@repo/ui/button";
import { Card, CardContent } from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { Skeleton } from "@repo/ui/skeleton";
import { SlidingPillSwitcher } from "@repo/ui/sliding-pill-switcher";
import { DatePicker } from "@repo/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui/table";

import { PageHeader, EmptyState as PageEmptyState } from "@/components/shared/PageShell";
import { Pagination, usePagination } from "@/components/shared/Pagination";
import { useTransferRequests } from "@/hooks/useTransfers";
import { TransferStatusBadge, ItemTypeBadge } from "@/components/store/transfer-status-badge";
import { TransferDetailDialog } from "@/components/store/transfer-detail-dialog";
import { TRANSFER_STATUS_LABELS, TRANSFER_DIRECTION_LABELS } from "@/components/store/transfer-constants";
import { parseUtcTimestamp } from "@/lib/utils";
import type { TransferRequestWithItems } from "@/api/transfers";

const ALL_STATUSES = ["requested", "approved", "rejected", "dispatched", "received", "partially_received"] as const;
type StatusKey = (typeof ALL_STATUSES)[number];

type SortKey = "date_desc" | "date_asc" | "id_desc" | "id_asc";

interface HistorySearch {
  dir?: "shop_to_workshop" | "workshop_to_shop";
  type?: "fabric" | "shelf" | "accessory";
  status?: string; // comma-separated
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
  q?: string;
  sort?: SortKey;
}

function getToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getWeekStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 1) % 7)); // Saturday
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getMonthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function defaultFromDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function defaultToDate(): string {
  return getToday();
}

function detectPreset(from: string, to: string): "today" | "week" | "month" | null {
  const today = getToday();
  if (to !== today) return null;
  if (from === today) return "today";
  if (from === getWeekStart()) return "week";
  if (from === getMonthStart()) return "month";
  return null;
}

function toDateStr(d: Date | null): string | undefined {
  if (!d) return undefined;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseDateStr(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

export const Route = createFileRoute("/(main)/store/transfer-history")({
  component: TransferHistoryPage,
  validateSearch: (search: Record<string, unknown>): HistorySearch => ({
    dir: search.dir === "shop_to_workshop" || search.dir === "workshop_to_shop" ? search.dir : undefined,
    type:
      search.type === "fabric" || search.type === "shelf" || search.type === "accessory"
        ? search.type
        : undefined,
    status: typeof search.status === "string" ? search.status : undefined,
    from: typeof search.from === "string" ? search.from : undefined,
    to: typeof search.to === "string" ? search.to : undefined,
    q: typeof search.q === "string" ? search.q : undefined,
    sort:
      search.sort === "date_asc" || search.sort === "id_asc" || search.sort === "id_desc"
        ? search.sort
        : search.sort === "date_desc"
          ? "date_desc"
          : undefined,
  }),
  head: () => ({ meta: [{ title: "Transfer History" }] }),
});

function getItemName(item: TransferRequestWithItems["items"][0]): string {
  if (item.fabric) return item.fabric.name;
  if (item.shelf_item) return item.shelf_item.type;
  if (item.accessory) return item.accessory.name;
  return "";
}

function itemsSummary(t: TransferRequestWithItems): string {
  if (t.items.length === 0) return "—";
  const first = getItemName(t.items[0]!);
  if (t.items.length === 1) return first;
  return `${first} +${t.items.length - 1} more`;
}

function totalQty(t: TransferRequestWithItems): number {
  return t.items.reduce((sum, i) => sum + Number(i.requested_qty || 0), 0);
}

function lastUpdatedAt(t: TransferRequestWithItems): Date | null {
  const candidates = [t.received_at, t.dispatched_at, t.approved_at, t.created_at].filter(Boolean) as (Date | string)[];
  if (candidates.length === 0) return null;
  const v = candidates[0]!;
  return v instanceof Date ? v : parseUtcTimestamp(v as string);
}

function formatShortDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : parseUtcTimestamp(value);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
}

function TransferHistoryPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const from = search.from ?? defaultFromDate();
  const to = search.to ?? defaultToDate();
  const sort: SortKey = search.sort ?? "date_desc";
  const preset = detectPreset(from, to);

  // `status` in the URL is opt-in: absent = All (no filter). A non-empty set
  // means the user has explicitly narrowed to those statuses.
  const selectedStatuses: Set<StatusKey> = useMemo(() => {
    if (!search.status) return new Set();
    const set = new Set<StatusKey>();
    for (const s of search.status.split(",")) {
      if ((ALL_STATUSES as readonly string[]).includes(s)) set.add(s as StatusKey);
    }
    return set;
  }, [search.status]);
  const isAllStatuses = selectedStatuses.size === 0;

  // Build date bounds (inclusive): from 00:00 to end-of-day 23:59:59.999
  const startIso = useMemo(() => new Date(`${from}T00:00:00.000Z`).toISOString(), [from]);
  const endIso = useMemo(() => {
    const d = new Date(`${to}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCMilliseconds(d.getUTCMilliseconds() - 1);
    return d.toISOString();
  }, [to]);

  const { data: allRequests = [], isLoading, isError, refetch } = useTransferRequests({
    direction: search.dir,
    item_type: search.type,
    startDate: startIso,
    endDate: endIso,
  });

  // Client-side filtering for status (multi-select) + search text
  const filtered = useMemo(() => {
    const q = (search.q ?? "").trim().toLowerCase();
    return allRequests.filter((r) => {
      if (!isAllStatuses && !selectedStatuses.has(r.status as StatusKey)) return false;
      if (q) {
        if (String(r.id).includes(q)) return true;
        if (r.requested_by_user?.name?.toLowerCase().includes(q)) return true;
        if (r.items.some((i) => getItemName(i).toLowerCase().includes(q))) return true;
        return false;
      }
      return true;
    });
  }, [allRequests, selectedStatuses, search.q]);

  // Sorting
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      if (sort === "id_desc") return b.id - a.id;
      if (sort === "id_asc") return a.id - b.id;
      const ad = a.created_at ? new Date(a.created_at as unknown as string).getTime() : 0;
      const bd = b.created_at ? new Date(b.created_at as unknown as string).getTime() : 0;
      return sort === "date_asc" ? ad - bd : bd - ad;
    });
    return arr;
  }, [filtered, sort]);

  const { page, setPage, totalPages, paged, totalItems, pageSize } = usePagination(sorted, 25);

  const [selected, setSelected] = useState<TransferRequestWithItems | null>(null);

  const update = (patch: Partial<HistorySearch>) => {
    navigate({ search: (prev) => ({ ...prev, ...patch }) as HistorySearch });
    setPage(1);
  };

  const toggleStatus = (s: StatusKey) => {
    const current = new Set(selectedStatuses);
    if (current.has(s)) current.delete(s);
    else current.add(s);
    update({ status: current.size === 0 ? undefined : Array.from(current).join(",") });
  };
  const selectAllStatuses = () => update({ status: undefined });

  const clearFilters = () => {
    navigate({ search: {} as HistorySearch });
    setPage(1);
  };

  const filtersActive =
    !!search.dir ||
    !!search.type ||
    !!search.status ||
    !!search.q ||
    !!search.from ||
    !!search.to ||
    !!search.sort;

  const toggleSort = (col: "date" | "id") => {
    if (col === "date") {
      update({ sort: sort === "date_desc" ? "date_asc" : "date_desc" });
    } else {
      update({ sort: sort === "id_desc" ? "id_asc" : "id_desc" });
    }
  };

  const sortIcon = (col: "date" | "id") => {
    if (col === "date") {
      if (sort === "date_desc") return <ArrowDown className="inline h-3 w-3 ml-1" />;
      if (sort === "date_asc") return <ArrowUp className="inline h-3 w-3 ml-1" />;
      return <ArrowUpDown className="inline h-3 w-3 ml-1 opacity-40" />;
    }
    if (sort === "id_desc") return <ArrowDown className="inline h-3 w-3 ml-1" />;
    if (sort === "id_asc") return <ArrowUp className="inline h-3 w-3 ml-1" />;
    return <ArrowUpDown className="inline h-3 w-3 ml-1 opacity-40" />;
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto pb-10">
      <PageHeader icon={History} title="Transfer History" subtitle="All past and in-flight store transfers with full audit trail" />

      {/* Filter bar */}
      <div className="border rounded-md bg-card mb-4">
        <div className="p-3 flex flex-wrap items-end gap-3">
          {/* Direction */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Direction</label>
            <SlidingPillSwitcher
              size="sm"
              value={search.dir ?? "all"}
              onChange={(v) =>
                update({ dir: v === "all" ? undefined : (v as HistorySearch["dir"]) })
              }
              options={[
                { value: "all", label: "All" },
                { value: "shop_to_workshop", label: "Shop → Workshop" },
                { value: "workshop_to_shop", label: "Workshop → Shop" },
              ]}
            />
          </div>

          {/* Item type */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Type</label>
            <Select
              value={search.type ?? "all"}
              onValueChange={(v) =>
                update({ type: v === "all" ? undefined : (v as HistorySearch["type"]) })
              }
            >
              <SelectTrigger className="w-[140px] bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="fabric">Fabric</SelectItem>
                <SelectItem value="shelf">Shelf</SelectItem>
                <SelectItem value="accessory">Accessory</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Date presets */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Quick</label>
            <div className="flex gap-1">
              {([["today", "Today", getToday()], ["week", "This Week", getWeekStart()], ["month", "This Month", getMonthStart()]] as const).map(([key, label, fromDate]) => (
                <button
                  key={key}
                  onClick={() => update({ from: fromDate, to: getToday() })}
                  className={`text-[11px] px-2.5 py-1 rounded border transition-colors font-medium ${
                    preset === key
                      ? "bg-foreground text-background border-foreground"
                      : "bg-background text-muted-foreground border-border hover:bg-muted"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <span className="h-5 w-px bg-border hidden sm:block self-end mb-1" aria-hidden />

          {/* Date range */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">From</label>
            <DatePicker
              value={parseDateStr(from)}
              onChange={(d) => update({ from: toDateStr(d) })}
              placeholder="From"
              displayFormat="dd MMM yyyy"
              className="w-[170px]"
              calendarProps={{ disabled: { after: parseDateStr(to) } }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">To</label>
            <DatePicker
              value={parseDateStr(to)}
              onChange={(d) => update({ to: toDateStr(d) })}
              placeholder="To"
              displayFormat="dd MMM yyyy"
              className="w-[170px]"
              calendarProps={{ disabled: { before: parseDateStr(from) } }}
            />
          </div>

          {/* Search */}
          <div className="flex flex-col gap-1 flex-1 min-w-[220px]">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search.q ?? ""}
                onChange={(e) => update({ q: e.target.value || undefined })}
                placeholder="ID, item, or user…"
                className="pl-9"
              />
            </div>
          </div>

          {filtersActive && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9">
              <X className="h-4 w-4 mr-1" /> Clear
            </Button>
          )}
        </div>

        {/* Status chips */}
        <div className="px-3 pb-3 flex flex-wrap items-center gap-1.5 border-t pt-2.5">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mr-1">Status:</span>
          <button
            onClick={selectAllStatuses}
            className={`text-[11px] px-2.5 py-0.5 rounded border transition-colors font-medium ${
              isAllStatuses
                ? "bg-foreground text-background border-foreground"
                : "bg-background text-muted-foreground border-border hover:bg-muted"
            }`}
          >
            All
          </button>
          <span className="h-4 w-px bg-border mx-0.5" aria-hidden />
          {ALL_STATUSES.map((s) => {
            const active = !isAllStatuses && selectedStatuses.has(s);
            return (
              <button
                key={s}
                onClick={() => toggleStatus(s)}
                className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                  active
                    ? "bg-foreground text-background border-foreground"
                    : "bg-background text-muted-foreground border-border hover:bg-muted"
                }`}
              >
                {TRANSFER_STATUS_LABELS[s] ?? s}
              </button>
            );
          })}
        </div>
      </div>

      {/* Results */}
      {isLoading ? (
        <HistoryTableSkeleton />
      ) : isError ? (
        <Card className="shadow-none rounded-xl border border-destructive/20">
          <CardContent className="py-10 text-center">
            <AlertCircle className="h-10 w-10 mx-auto mb-3 text-destructive/60" />
            <p className="font-medium text-sm">Failed to load transfer history</p>
            <p className="text-xs text-muted-foreground mt-1">Something went wrong. Please try again.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-4">
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : sorted.length === 0 ? (
        <PageEmptyState icon={History} message={filtersActive ? "No transfers match your filters" : "No transfers in the selected period"} />
      ) : (
        <>
          <div className="border rounded-md overflow-x-auto bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="h-9 cursor-pointer select-none w-[70px]" onClick={() => toggleSort("id")}>
                    ID{sortIcon("id")}
                  </TableHead>
                  <TableHead className="h-9 cursor-pointer select-none w-[110px]" onClick={() => toggleSort("date")}>
                    Date{sortIcon("date")}
                  </TableHead>
                  <TableHead className="h-9 w-[150px]">Direction</TableHead>
                  <TableHead className="h-9 w-[90px]">Type</TableHead>
                  <TableHead className="h-9">Items</TableHead>
                  <TableHead className="h-9 text-right w-[70px]">Qty</TableHead>
                  <TableHead className="h-9 w-[140px]">Status</TableHead>
                  <TableHead className="h-9 w-[130px]">Requested by</TableHead>
                  <TableHead className="h-9 w-[100px]">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((r) => (
                  <TableRow
                    key={r.id}
                    onClick={() => setSelected(r)}
                    className="cursor-pointer hover:bg-muted/40"
                  >
                    <TableCell className="py-2 font-mono text-xs">#{r.id}</TableCell>
                    <TableCell className="py-2 text-xs tabular-nums">{formatShortDate(r.created_at)}</TableCell>
                    <TableCell className="py-2 text-xs">
                      {TRANSFER_DIRECTION_LABELS[r.direction] ?? r.direction}
                    </TableCell>
                    <TableCell className="py-2">
                      <ItemTypeBadge itemType={r.item_type} />
                    </TableCell>
                    <TableCell className="py-2 text-xs max-w-[260px] truncate" title={itemsSummary(r)}>
                      {itemsSummary(r)}
                    </TableCell>
                    <TableCell className="py-2 text-right text-xs tabular-nums">{totalQty(r)}</TableCell>
                    <TableCell className="py-2">
                      <TransferStatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="py-2 text-xs truncate max-w-[130px]" title={r.requested_by_user?.name ?? ""}>
                      {r.requested_by_user?.name ?? "—"}
                    </TableCell>
                    <TableCell className="py-2 text-xs tabular-nums text-muted-foreground">
                      {formatShortDate(lastUpdatedAt(r))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            totalItems={totalItems}
            pageSize={pageSize}
          />
        </>
      )}

      <TransferDetailDialog transfer={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function HistoryTableSkeleton() {
  return (
    <div className="border rounded-md overflow-hidden bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="h-9 w-[70px]">ID</TableHead>
            <TableHead className="h-9 w-[110px]">Date</TableHead>
            <TableHead className="h-9 w-[150px]">Direction</TableHead>
            <TableHead className="h-9 w-[90px]">Type</TableHead>
            <TableHead className="h-9">Items</TableHead>
            <TableHead className="h-9 text-right w-[70px]">Qty</TableHead>
            <TableHead className="h-9 w-[140px]">Status</TableHead>
            <TableHead className="h-9 w-[130px]">Requested by</TableHead>
            <TableHead className="h-9 w-[100px]">Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 8 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell className="py-2.5"><Skeleton className="h-4 w-10" /></TableCell>
              <TableCell className="py-2.5"><Skeleton className="h-4 w-16" /></TableCell>
              <TableCell className="py-2.5"><Skeleton className="h-4 w-24" /></TableCell>
              <TableCell className="py-2.5"><Skeleton className="h-5 w-14 rounded-full" /></TableCell>
              <TableCell className="py-2.5"><Skeleton className="h-4 w-32" /></TableCell>
              <TableCell className="py-2.5 text-right"><Skeleton className="h-4 w-8 ml-auto" /></TableCell>
              <TableCell className="py-2.5"><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
              <TableCell className="py-2.5"><Skeleton className="h-4 w-20" /></TableCell>
              <TableCell className="py-2.5"><Skeleton className="h-4 w-16" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

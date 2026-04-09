import { useMemo, useState } from "react";
import {
  History,
  Search,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

import { Button } from "@repo/ui/button";
import { Card, CardContent } from "@repo/ui/card";
import { Input } from "@repo/ui/input";
import { Skeleton } from "@repo/ui/skeleton";
import { SlidingPillSwitcher } from "@repo/ui/sliding-pill-switcher";
import { DatePicker } from "@repo/ui/date-picker";
import { Pagination, usePagination } from "@repo/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/table";

import { useTransferRequests } from "@/hooks/useTransfers";
import { TransferStatusBadge, ItemTypeBadge } from "./transfer-status-badge";
import { TransferDetailDialog } from "./transfer-detail-dialog";
import {
  TRANSFER_STATUS_LABELS,
  TRANSFER_DIRECTION_LABELS,
} from "./transfer-constants";
import { parseUtcTimestamp } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { TransferRequestWithItems } from "@/api/transfers";

const ALL_STATUSES = [
  "requested",
  "approved",
  "rejected",
  "dispatched",
  "received",
  "partially_received",
] as const;
type StatusKey = (typeof ALL_STATUSES)[number];

export type SortKey = "date_desc" | "date_asc" | "id_desc" | "id_asc";

export interface HistorySearch {
  dir?: "shop_to_workshop" | "workshop_to_shop";
  type?: "fabric" | "shelf" | "accessory";
  status?: string;
  from?: string;
  to?: string;
  q?: string;
  sort?: SortKey;
}

/** Kuwait is UTC+3, no DST. All date logic is pinned to this offset. */
const KW_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Current date in Kuwait as YYYY-MM-DD */
function kwToday(): string {
  const kwNow = new Date(Date.now() + KW_OFFSET_MS);
  return kwNow.toISOString().slice(0, 10);
}

/** Sunday of the current week in Kuwait (Sun–Sat week) */
function kwWeekStart(): string {
  const kwNow = new Date(Date.now() + KW_OFFSET_MS);
  kwNow.setUTCDate(kwNow.getUTCDate() - kwNow.getUTCDay());
  return kwNow.toISOString().slice(0, 10);
}

/** First of the current month in Kuwait */
function kwMonthStart(): string {
  const kwNow = new Date(Date.now() + KW_OFFSET_MS);
  return `${kwNow.getUTCFullYear()}-${String(kwNow.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** Start of day in UTC for a Kuwait date: dateStr midnight KW = (dateStr - 1) 21:00 UTC */
function kwStartIso(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCHours(d.getUTCHours() - 3);
  return d.toISOString();
}

/** End of day in UTC for a Kuwait date: dateStr 23:59:59.999 KW = dateStr 20:59:59.999 UTC */
function kwEndIso(dateStr: string): string {
  const d = new Date(`${dateStr}T23:59:59.999Z`);
  d.setUTCHours(d.getUTCHours() - 3);
  return d.toISOString();
}

function defaultFromDate(): string {
  const d = new Date(Date.now() + KW_OFFSET_MS);
  d.setUTCDate(d.getUTCDate() - 30);
  return d.toISOString().slice(0, 10);
}

function defaultToDate(): string {
  return kwToday();
}

type DatePreset = "today" | "week" | "month" | null;

function detectPreset(from: string, to: string): DatePreset {
  const t = kwToday();
  if (to !== t) return null;
  if (from === t) return "today";
  if (from === kwWeekStart()) return "week";
  if (from === kwMonthStart()) return "month";
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

function totalApprovedQty(t: TransferRequestWithItems): number | null {
  if (!t.items.some((i) => i.approved_qty != null)) return null;
  return t.items.reduce((sum, i) => sum + Number(i.approved_qty ?? 0), 0);
}

function lastUpdatedAt(t: TransferRequestWithItems): Date | null {
  const candidates = [
    t.received_at,
    t.dispatched_at,
    t.approved_at,
    t.created_at,
  ].filter(Boolean) as (Date | string)[];
  if (candidates.length === 0) return null;
  const v = candidates[0]!;
  return v instanceof Date ? v : parseUtcTimestamp(v as string);
}

function formatShortDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : parseUtcTimestamp(value);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

interface Props {
  search: HistorySearch;
  onSearchChange: (patch: Partial<HistorySearch>) => void;
  onClear: () => void;
}

export default function TransferHistoryPage({ search, onSearchChange, onClear }: Props) {
  const from = search.from ?? defaultFromDate();
  const to = search.to ?? defaultToDate();
  const sort: SortKey = search.sort ?? "date_desc";

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

  const startIso = useMemo(() => kwStartIso(from), [from]);
  const endIso = useMemo(() => kwEndIso(to), [to]);

  const { data: allRequests = [], isLoading, isError, refetch } = useTransferRequests({
    direction: search.dir,
    item_type: search.type,
    startDate: startIso,
    endDate: endIso,
  });

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

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      if (sort === "id_desc") return b.id - a.id;
      if (sort === "id_asc") return a.id - b.id;
      const ad = a.created_at
        ? new Date(a.created_at as unknown as string).getTime()
        : 0;
      const bd = b.created_at
        ? new Date(b.created_at as unknown as string).getTime()
        : 0;
      return sort === "date_asc" ? ad - bd : bd - ad;
    });
    return arr;
  }, [filtered, sort]);

  const { page, setPage, totalPages, paged, totalItems, pageSize } = usePagination(sorted, 25);

  const [selected, setSelected] = useState<TransferRequestWithItems | null>(null);

  const update = (patch: Partial<HistorySearch>) => {
    onSearchChange(patch);
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
    onClear();
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
    if (col === "date")
      update({ sort: sort === "date_desc" ? "date_asc" : "date_desc" });
    else update({ sort: sort === "id_desc" ? "id_asc" : "id_desc" });
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
      {/* Header */}
      <div className="mb-5 flex items-start gap-3">
        <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center shrink-0">
          <History className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Transfer History</h1>
          <p className="text-sm text-muted-foreground">
            All past and in-flight store transfers with full audit trail
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="border rounded-md bg-card mb-4 divide-y">
        {/* Row 1: Date presets + custom range + search */}
        <div className="p-3 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              Date Range
            </label>
            <div className="flex items-center gap-1">
              {([
                ["today", "Today"],
                ["week", "This Week"],
                ["month", "This Month"],
              ] as [DatePreset, string][]).map(([key, label]) => {
                const active = detectPreset(from, to) === key;
                return (
                  <button
                    key={key}
                    onClick={() => {
                      const t = kwToday();
                      const f = key === "today" ? t : key === "week" ? kwWeekStart() : kwMonthStart();
                      update({ from: f, to: t });
                    }}
                    className={cn(
                      "text-[11px] px-2.5 py-1.5 rounded-md border transition-colors font-medium",
                      active
                        ? "bg-foreground text-background border-foreground"
                        : "bg-background text-muted-foreground border-border hover:bg-muted",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-end gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                From
              </label>
              <DatePicker
                value={parseDateStr(from)}
                onChange={(d) => update({ from: toDateStr(d) })}
                placeholder="From"
                displayFormat="dd MMM yyyy"
                className="w-[150px]"
                calendarProps={{ disabled: { after: parseDateStr(to) } }}
              />
            </div>
            <span className="text-muted-foreground text-xs pb-2">–</span>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                To
              </label>
              <DatePicker
                value={parseDateStr(to)}
                onChange={(d) => update({ to: toDateStr(d) })}
                placeholder="To"
                displayFormat="dd MMM yyyy"
                className="w-[150px]"
                calendarProps={{ disabled: { before: parseDateStr(from) } }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              Search
            </label>
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
        </div>

        {/* Row 2: Direction, Type, Status + Clear */}
        <div className="p-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              Direction
            </span>
            <SlidingPillSwitcher
              size="sm"
              value={search.dir ?? "all"}
              onChange={(v) =>
                update({ dir: v === "all" ? undefined : (v as HistorySearch["dir"]) })
              }
              options={[
                { value: "all", label: "All" },
                { value: "workshop_to_shop", label: "Workshop → Shop" },
                { value: "shop_to_workshop", label: "Shop → Workshop" },
              ]}
            />
          </div>

          <span className="h-5 w-px bg-border hidden sm:block" aria-hidden />

          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              Type
            </span>
            <Select
              value={search.type ?? "all"}
              onValueChange={(v) =>
                update({ type: v === "all" ? undefined : (v as HistorySearch["type"]) })
              }
            >
              <SelectTrigger className="w-[130px] h-8 bg-white text-xs">
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

          <span className="h-5 w-px bg-border hidden sm:block" aria-hidden />

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mr-0.5">
              Status
            </span>
            <button
              onClick={selectAllStatuses}
              className={cn(
                "text-[11px] px-2.5 py-0.5 rounded border transition-colors font-medium",
                isAllStatuses
                  ? "bg-foreground text-background border-foreground"
                  : "bg-background text-muted-foreground border-border hover:bg-muted",
              )}
            >
              All
            </button>
            {ALL_STATUSES.map((s) => {
              const active = !isAllStatuses && selectedStatuses.has(s);
              return (
                <button
                  key={s}
                  onClick={() => toggleStatus(s)}
                  className={cn(
                    "text-[11px] px-2 py-0.5 rounded border transition-colors",
                    active
                      ? "bg-foreground text-background border-foreground"
                      : "bg-background text-muted-foreground border-border hover:bg-muted",
                  )}
                >
                  {TRANSFER_STATUS_LABELS[s] ?? s}
                </button>
              );
            })}
          </div>

          {filtersActive && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 ml-auto">
              <X className="h-3.5 w-3.5 mr-1" /> Clear
            </Button>
          )}
        </div>
      </div>

      {/* Results */}
      {isError ? (
        <Card className="shadow-none rounded-xl border border-destructive/20">
          <CardContent className="py-10 text-center">
            <AlertCircle className="h-10 w-10 mx-auto mb-3 text-destructive/60" />
            <p className="font-medium text-sm">Failed to load transfer history</p>
            <p className="text-xs text-muted-foreground mt-1">
              Something went wrong. Please try again.
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-4">
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : isLoading ? (
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
                  <TableCell className="py-2.5"><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell className="py-2.5"><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell className="py-2.5"><Skeleton className="h-5 w-14 rounded-full" /></TableCell>
                  <TableCell className="py-2.5"><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell className="py-2.5"><Skeleton className="h-4 w-8 ml-auto" /></TableCell>
                  <TableCell className="py-2.5"><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                  <TableCell className="py-2.5"><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell className="py-2.5"><Skeleton className="h-4 w-16" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : sorted.length === 0 ? (
        <div className="border rounded-md bg-card py-16 text-center">
          <History className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            {filtersActive
              ? "No transfers match your filters"
              : "No transfers in the selected period"}
          </p>
        </div>
      ) : (
        <>
          <div className="border rounded-md overflow-x-auto bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead
                    className="h-9 cursor-pointer select-none w-[70px]"
                    onClick={() => toggleSort("id")}
                  >
                    ID{sortIcon("id")}
                  </TableHead>
                  <TableHead
                    className="h-9 cursor-pointer select-none w-[110px]"
                    onClick={() => toggleSort("date")}
                  >
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
                    <TableCell className="py-2 text-xs tabular-nums">
                      {formatShortDate(r.created_at)}
                    </TableCell>
                    <TableCell className="py-2 text-xs">
                      {TRANSFER_DIRECTION_LABELS[r.direction] ?? r.direction}
                    </TableCell>
                    <TableCell className="py-2">
                      <ItemTypeBadge itemType={r.item_type} />
                    </TableCell>
                    <TableCell
                      className="py-2 text-xs max-w-[260px] truncate"
                      title={itemsSummary(r)}
                    >
                      {itemsSummary(r)}
                    </TableCell>
                    <TableCell className="py-2 text-right text-xs tabular-nums">
                      {(() => {
                        const req = totalQty(r);
                        const appr = totalApprovedQty(r);
                        if (appr == null || appr === req) return req;
                        return (
                          <span className="text-amber-600" title={`${appr} of ${req} approved`}>
                            {appr}/{req}
                          </span>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="py-2">
                      <TransferStatusBadge status={r.status} />
                    </TableCell>
                    <TableCell
                      className="py-2 text-xs truncate max-w-[130px]"
                      title={r.requested_by_user?.name ?? ""}
                    >
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
          {/* Fallback summary when only one page */}
          {totalPages <= 1 && (
            <p className="pt-4 text-xs text-muted-foreground">{totalItems} results</p>
          )}
        </>
      )}

      <TransferDetailDialog transfer={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

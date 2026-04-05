import { useMemo, useState } from "react";
import {
  History,
  Search,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";

import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
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

function defaultFromDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function defaultToDate(): string {
  return new Date().toISOString().slice(0, 10);
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

  const startIso = useMemo(
    () => new Date(`${from}T00:00:00.000Z`).toISOString(),
    [from],
  );
  const endIso = useMemo(() => {
    const d = new Date(`${to}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCMilliseconds(d.getUTCMilliseconds() - 1);
    return d.toISOString();
  }, [to]);

  const { data: allRequests = [], isLoading } = useTransferRequests({
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

  // Pagination
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(1);
  const totalItems = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

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

  const start = (safePage - 1) * PAGE_SIZE + 1;
  const end = Math.min(safePage * PAGE_SIZE, totalItems);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto pb-10">
      {/* Header */}
      <div className="mb-5 flex items-start gap-3">
        <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center shrink-0">
          <History className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Transfer History</h1>
          <p className="text-sm text-muted-foreground">
            All past and in-flight store transfers with full audit trail
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="border rounded-md bg-card mb-4">
        <div className="p-3 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              Direction
            </label>
            <div className="inline-flex rounded-md border overflow-hidden text-xs">
              <button
                onClick={() => update({ dir: undefined })}
                className={cn(
                  "px-2.5 h-8",
                  !search.dir
                    ? "bg-primary text-primary-foreground"
                    : "bg-background hover:bg-muted",
                )}
              >
                All
              </button>
              <button
                onClick={() => update({ dir: "workshop_to_shop" })}
                className={cn(
                  "px-2.5 h-8 border-l",
                  search.dir === "workshop_to_shop"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background hover:bg-muted",
                )}
              >
                Workshop → Shop
              </button>
              <button
                onClick={() => update({ dir: "shop_to_workshop" })}
                className={cn(
                  "px-2.5 h-8 border-l",
                  search.dir === "shop_to_workshop"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background hover:bg-muted",
                )}
              >
                Shop → Workshop
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              Type
            </label>
            <select
              value={search.type ?? ""}
              onChange={(e) =>
                update({ type: (e.target.value || undefined) as HistorySearch["type"] })
              }
              className="h-8 text-xs rounded-md border bg-background px-2"
            >
              <option value="">All types</option>
              <option value="fabric">Fabric</option>
              <option value="shelf">Shelf</option>
              <option value="accessory">Accessory</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              From
            </label>
            <Input
              type="date"
              value={from}
              max={to}
              onChange={(e) => update({ from: e.target.value || undefined })}
              className="h-8 text-xs w-[140px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              To
            </label>
            <Input
              type="date"
              value={to}
              min={from}
              onChange={(e) => update({ to: e.target.value || undefined })}
              className="h-8 text-xs w-[140px]"
            />
          </div>

          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              Search
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search.q ?? ""}
                onChange={(e) => update({ q: e.target.value || undefined })}
                placeholder="ID, item, or user…"
                className="h-8 text-xs pl-8"
              />
            </div>
          </div>

          {filtersActive && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs">
              <X className="h-3.5 w-3.5 mr-1" /> Clear
            </Button>
          )}
        </div>

        <div className="px-3 pb-3 flex flex-wrap items-center gap-1.5 border-t pt-2.5">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mr-1">
            Status:
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
          <span className="h-4 w-px bg-border mx-0.5" aria-hidden />
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
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading transfers…
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
                      {totalQty(r)}
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

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-xs text-muted-foreground">
                {start}–{end} of {totalItems}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage(safePage - 1)}
                  disabled={safePage <= 1}
                  className="h-8 w-8 p-0"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-xs px-2 tabular-nums">
                  {safePage} / {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage(safePage + 1)}
                  disabled={safePage >= totalPages}
                  className="h-8 w-8 p-0"
                  aria-label="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <TransferDetailDialog transfer={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

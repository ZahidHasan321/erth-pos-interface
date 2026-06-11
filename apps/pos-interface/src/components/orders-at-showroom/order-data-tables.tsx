import {
  type ColumnDef,
  type ExpandedState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  type OnChangeFn,
  type RowSelectionState,
  useReactTable,
} from "@tanstack/react-table";
import * as React from "react";

import { Button } from "@repo/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/table";
import { ChevronLeft, ChevronRight, ChevronDown, ClipboardCheck, Settings2, Truck } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn, clickableProps, getKuwaitMidnight, TIMEZONE } from "@/lib/utils";
import { isAlteration as isAlterationTrip, getAlterationNumber } from "@repo/database";

import type { OrderRow } from "./types";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/select";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: TIMEZONE,
});

function fmtDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return dateFormatter.format(parsed);
}

function daysOverdue(deliveryDate?: string | null): number {
  if (!deliveryDate) return 0;
  const delivery = getKuwaitMidnight(new Date(deliveryDate));
  const today = getKuwaitMidnight();
  const diff = Math.ceil((today.getTime() - delivery.getTime()) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

function statusBadge(row: OrderRow): { label: string; className: string } {
  switch (row.showroomStatus.label) {
    case "alteration_in":
      return { label: "Alteration (In)", className: "bg-blue-100 text-blue-700 border-blue-200" };
    case "alteration_out":
      return { label: "Alteration (Out)", className: "bg-purple-100 text-purple-700 border-purple-200" };
    case "brova_trial":
      return { label: "Brova Trial", className: "bg-amber-100 text-amber-700 border-amber-200" };
    case "needs_action":
      return { label: "Needs Action", className: "bg-red-100 text-red-700 border-red-200" };
    case "ready_for_pickup":
      return { label: "Ready for Pickup", className: "bg-emerald-100 text-emerald-700 border-emerald-200" };
    default:
      return { label: row.fatouraStage || "-", className: "bg-muted text-muted-foreground border-border" };
  }
}

// Expanded garments grid — shared between desktop table expansion and mobile list.
function GarmentList({ row }: { row: OrderRow }) {
  return (
    <>
      <h4 className="text-xs font-bold mb-2 text-foreground flex items-center gap-2">
        Garments
        <span className="bg-muted px-1.5 py-0.5 rounded-full text-xs font-black">{row.garmentsCount}</span>
      </h4>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
        {row.garments
          .filter((g) => {
            if (row.showroomStatus.label === "ready_for_pickup") return true;
            return g.locationKey === "shop";
          })
          .map((garment) => {
            const tripNum = garment.garment.trip_number ?? 1;
            const garmentType = garment.garment.garment_type as string | null;
            const isAlterationReturn = isAlterationTrip(tripNum);
            const alterationNum = getAlterationNumber(tripNum);
            const isAlterationGarment = garmentType === "alteration";
            const showAsAlteration = isAlterationReturn || isAlterationGarment;
            const badgeLabel = isAlterationReturn
              ? `Alt #${alterationNum}`
              : isAlterationGarment
                ? "Alteration"
                : garment.isBrova
                  ? "Brova"
                  : "Final";
            return (
              <div
                key={garment.garmentRecordId}
                className="p-2 bg-background rounded-lg border border-border/60 text-sm shadow-sm"
              >
                <div className="flex justify-between items-center mb-1.5">
                  <span className="font-mono font-medium text-xs text-muted-foreground">{garment.garmentId}</span>
                  <div className="flex items-center gap-1">
                    {isAlterationReturn && (
                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                        className="h-9 w-9 p-0 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                      >
                        <Link
                          to="/$main/orders/order-management/feedback/$orderId"
                          params={{ orderId: String(row.order.id) }}
                          search={{ garmentId: garment.garmentRecordId }}
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Alteration feedback"
                        >
                          <ClipboardCheck className="h-3 w-3" aria-hidden="true" />
                        </Link>
                      </Button>
                    )}
                    <span
                      className={cn(
                        "inline-flex items-center rounded border px-1 py-0 text-xs font-bold",
                        showAsAlteration
                          ? "bg-blue-50 text-blue-700 border-blue-200"
                          : garment.isBrova
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200",
                      )}
                    >
                      {badgeLabel}
                    </span>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-xs uppercase font-bold">Stage</span>
                    <span className="font-bold text-xs bg-muted px-1.5 py-0.5 rounded">{garment.pieceStage}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-xs uppercase font-bold">Location</span>
                    <span
                      className={cn(
                        "font-bold text-xs px-1.5 py-0.5 rounded",
                        garment.locationKey === "shop" ? "bg-emerald-50 text-emerald-700" : "bg-primary/5 text-primary",
                      )}
                    >
                      {garment.locationLabel}
                    </span>
                  </div>
                  <div className="pt-1 mt-1 border-t border-border/40">
                    <span className="font-bold text-xs text-primary leading-tight">{garment.style || "Standard Kuwaiti Style"}</span>
                  </div>
                </div>
              </div>
            );
          })}
      </div>
    </>
  );
}

function MobileOrderRow({
  row,
  isExpanded,
  isSelected,
  onToggle,
  onSelect,
}: {
  row: OrderRow;
  isExpanded: boolean;
  isSelected: boolean;
  onToggle: () => void;
  onSelect: () => void;
}) {
  const linkedOrderId = row.order.linked_order_id;
  const overdue = daysOverdue(row.deliveryDate);
  const balance = row.balance || 0;
  const status = statusBadge(row);
  // Alteration-out is received + handed over at the cashier, not fed back — its
  // action opens the read-only alteration view instead of the feedback form.
  const isAlterationOut = row.showroomStatus.label === "alteration_out";
  const showFeedback = row.showroomStatus.hasPhysicalItems && !isAlterationOut;
  const showAlterationView = isAlterationOut;
  const showDispatch = row.showroomStatus.label === "needs_action";
  const garments = row.order.garments || [];
  const atShop = garments.filter(
    (g) => g.location === "shop" && g.piece_stage !== "completed",
  ).length;

  return (
    <li
      className={cn(
        "border-b border-border/40 transition-colors",
        linkedOrderId && "border-l-2 border-l-blue-300/70 bg-blue-50/30",
        isSelected && "border-l-2 border-l-primary bg-primary/10",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className="w-full text-left px-3 py-2.5 flex flex-col gap-1 active:bg-muted/30"
      >
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm tracking-tighter">#{row.orderId}</span>
          {row.fatoura && (
            <span className="text-xs font-bold text-muted-foreground/70 uppercase tracking-widest">
              INV {row.fatoura}
            </span>
          )}
          {linkedOrderId && (
            <span className="text-xs text-blue-500 font-bold">↔#{linkedOrderId}</span>
          )}
          <span
            className={cn(
              "ml-auto inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-bold uppercase tracking-tight whitespace-nowrap",
              status.className,
            )}
          >
            {status.label}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "h-4 w-4 text-muted-foreground/60 transition-transform shrink-0",
              isExpanded && "rotate-180 text-primary",
            )}
          />
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="font-bold uppercase tracking-tight truncate">
            {row.customerNickName || row.customerName}
          </span>
          <span className="font-mono text-muted-foreground">{row.mobileNumber}</span>
        </div>

        <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 text-xs tabular-nums">
          <span className="font-bold">
            <span className="text-muted-foreground/70 uppercase mr-1">at shop</span>
            {atShop}/{row.garmentsCount}
          </span>
          <span
            className={cn(
              "font-bold",
              balance > 0 ? "text-rose-600" : "text-emerald-600",
            )}
          >
            {balance > 0 ? `Bal KD ${balance.toFixed(2)}` : "Paid"}
          </span>
          {row.deliveryDate && (
            <span
              className={cn(
                "font-bold",
                overdue > 0 ? "text-rose-600" : "text-muted-foreground",
              )}
            >
              <span className="text-muted-foreground/70 uppercase mr-1">del</span>
              {fmtDate(row.deliveryDate)}
              {overdue > 0 && <span className="ml-1">+{overdue}d</span>}
            </span>
          )}
          {row.homeDelivery && (
            <span className="inline-flex items-center gap-0.5 text-blue-600 font-bold">
              <Truck className="size-3" aria-hidden="true" /> Home
            </span>
          )}
        </div>
      </button>

      <div className="flex items-center gap-2 px-3 pb-3">
        <Button
          variant="outline"
          aria-label="Order options"
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          className="flex-1 h-11 text-xs font-bold uppercase tracking-wider bg-card hover:bg-primary/5 hover:text-primary hover:border-primary/30"
        >
          <Settings2 className="h-4 w-4 mr-1.5" aria-hidden="true" />
          Manage
        </Button>
        {showFeedback && (
          <Button
            variant="outline"
            asChild
            className={cn(
              "flex-1 h-11 text-xs font-bold uppercase tracking-wider bg-card",
              row.showroomStatus.label === "brova_trial"
                ? "text-amber-700 border-amber-200 hover:bg-amber-50"
                : row.showroomStatus.label === "ready_for_pickup"
                  ? "text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                  : "text-primary border-primary/20 hover:bg-primary/5",
            )}
          >
            <Link
              to="/$main/orders/order-management/feedback/$orderId"
              params={{ orderId: String(row.order.id) }}
              onClick={(e) => e.stopPropagation()}
              aria-label="Feedback"
            >
              <ClipboardCheck className="h-4 w-4 mr-1.5" aria-hidden="true" />
              Feedback
            </Link>
          </Button>
        )}
        {showAlterationView && (
          <Button
            variant="outline"
            asChild
            className="flex-1 h-11 text-xs font-bold uppercase tracking-wider bg-card text-purple-700 border-purple-200 hover:bg-purple-50"
          >
            <Link
              to="/$main/orders/new-alteration-order"
              search={{ orderId: row.order.id }}
              onClick={(e) => e.stopPropagation()}
              aria-label="View alteration order"
            >
              <ClipboardCheck className="h-4 w-4 mr-1.5" aria-hidden="true" />
              View
            </Link>
          </Button>
        )}
        {showDispatch && (
          <Button
            variant="outline"
            asChild
            className="flex-1 h-11 text-xs font-bold uppercase tracking-wider bg-card text-red-700 border-red-200 hover:bg-red-50"
          >
            <Link
              to="/$main/orders/order-management/dispatch"
              onClick={(e) => e.stopPropagation()}
              aria-label="Send back to workshop"
            >
              <Truck className="h-4 w-4 mr-1.5" aria-hidden="true" />
              Send Back
            </Link>
          </Button>
        )}
      </div>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="px-3 pb-3 bg-muted/10 border-t border-border/40">
            <div className="pt-2">
              <GarmentList row={row} />
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

type OrderDataTableProps = {
  columns: ColumnDef<OrderRow, unknown>[];
  data: OrderRow[];
  rowSelection: RowSelectionState;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
  selectedOrderId?: number;
  onSelectForManagement?: (row: OrderRow) => void;
  // Server-driven pagination
  pageIndex: number;                       // 0-indexed
  pageSize: number;
  totalCount: number;
  onPageIndexChange: (pageIndex: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  isFetching?: boolean;
};

export function OrderDataTable({
  columns,
  data,
  rowSelection,
  onRowSelectionChange,
  selectedOrderId,
  onSelectForManagement,
  pageIndex,
  pageSize,
  totalCount,
  onPageIndexChange,
  onPageSizeChange,
  isFetching,
}: OrderDataTableProps) {
  const [expanded, setExpanded] = React.useState<ExpandedState>({});

  // Group linked orders together so primary is followed by its children.
  // Filtering/sorting/pagination are all server-driven now, so this is the
  // only client-side reshaping that remains.
  const processedData = React.useMemo(() => {
    if (!data || !Array.isArray(data)) return [];

    const grouped: OrderRow[] = [];
    const added = new Set<string>();
    const childrenByParent = new Map<string, OrderRow[]>();

    data.forEach((row) => {
      const parentId = row.order.linked_order_id;
      if (parentId) {
        const key = String(parentId);
        if (!childrenByParent.has(key)) childrenByParent.set(key, []);
        childrenByParent.get(key)!.push(row);
      }
    });

    data.forEach((row) => {
      if (added.has(row.orderId)) return;
      if (row.order.linked_order_id) return; // added under its primary
      grouped.push(row);
      added.add(row.orderId);
      const children = childrenByParent.get(row.orderId) || [];
      children.forEach((child) => {
        if (!added.has(child.orderId)) {
          grouped.push(child);
          added.add(child.orderId);
        }
      });
    });

    // Orphaned children (primary not in current page)
    data.forEach((row) => {
      if (!added.has(row.orderId)) grouped.push(row);
    });

    return grouped;
  }, [data]);

  const pageCount = Math.max(1, Math.ceil(totalCount / Math.max(pageSize, 1)));

  const table = useReactTable({
    data: processedData,
    columns,
    state: {
      rowSelection,
      expanded,
      pagination: {
        pageIndex,
        pageSize,
      },
    },
    pageCount,
    manualPagination: true,
    manualFiltering: true,
    manualSorting: true,
    enableRowSelection: true,
    enableExpanding: true,
    onRowSelectionChange,
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    enableSorting: false,
  });

  const canPrev = pageIndex > 0;
  const canNext = pageIndex + 1 < pageCount;

  return (
    <div className="space-y-4">
      <ul className="lg:hidden rounded-xl border border-border bg-card overflow-hidden divide-y divide-border/40">
        {table.getRowModel().rows?.length ? (
          table.getRowModel().rows.map((row) => (
            <MobileOrderRow
              key={row.id}
              row={row.original}
              isExpanded={row.getIsExpanded()}
              isSelected={!!selectedOrderId && row.original.order.id === selectedOrderId}
              onToggle={() => row.toggleExpanded()}
              onSelect={() => onSelectForManagement?.(row.original)}
            />
          ))
        ) : (
          <li className="px-4 py-12 text-center text-sm text-muted-foreground">
            No orders found matching filters.
          </li>
        )}
      </ul>

      <div className="hidden lg:block rounded-xl border border-border shadow-sm overflow-x-auto bg-card py-0 gap-0">
        <Table className="min-w-[850px] table-fixed">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-muted/40 border-b-2 border-border/60">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="font-semibold text-foreground h-8 text-xs uppercase tracking-wider px-2"
                    style={header.column.columnDef.size ? { width: header.column.columnDef.size } : undefined}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <React.Fragment key={row.id}>
                  {/* Main Order Row */}
                  <TableRow
                    data-state={row.getIsSelected() && "selected"}
                    aria-expanded={row.getIsExpanded()}
                    className={cn(
                        "hover:bg-muted/30 border-b border-border/40 cursor-pointer transition-colors",
                        row.original.order.linked_order_id && "border-l-4 border-l-blue-300/70 bg-blue-50/30",
                        selectedOrderId && row.original.order.id === selectedOrderId && "bg-primary/10 border-l-4 border-l-primary"
                    )}
                    onClick={() => row.toggleExpanded()}
                    {...clickableProps(() => row.toggleExpanded())}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="py-2.5 px-2.5">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>

                  {/* Expanded Garments Rows — always rendered, height animated via grid-rows trick */}
                  <TableRow className="border-0 hover:bg-transparent">
                    <TableCell
                      colSpan={columns.length}
                      className={cn(
                        "p-0 transition-colors",
                        row.getIsExpanded()
                          ? "bg-muted/10 border-b border-border/40 shadow-inner"
                          : "border-0",
                      )}
                    >
                      <div
                        className={cn(
                          "grid transition-[grid-template-rows] duration-300 ease-out",
                          row.getIsExpanded() ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                        )}
                      >
                        <div className="overflow-hidden">
                          <div className="p-3 sm:pl-10">
                            <GarmentList row={row.original} />
                          </div>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  <div className="flex flex-col items-center justify-center text-muted-foreground">
                    <p>No orders found matching filters.</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-4 border-t border-border/40">
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Rows per page</span>
            <Select
              value={pageSize.toString()}
              onValueChange={(v) => {
                onPageSizeChange(Number(v));
                onPageIndexChange(0);
              }}
            >
              <SelectTrigger className="h-9 w-20 bg-card border-border/60">
                <SelectValue placeholder={pageSize.toString()} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="text-sm text-muted-foreground">
            {totalCount > 0 && (
              <>
                Showing <span className="font-bold text-foreground">{table.getRowModel().rows.length}</span> out of{" "}
                <span className="font-bold text-foreground">{totalCount}</span> orders
                {isFetching && <span className="ml-2 text-xs opacity-60">(updating…)</span>}
              </>
            )}
          </div>

          <div className="text-xs text-muted-foreground sm:border-l border-border/60 sm:pl-4">
            {Object.keys(rowSelection).length} row(s) selected
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground tabular-nums">
            Page {pageIndex + 1} of {pageCount}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              aria-label="Previous page"
              onClick={() => onPageIndexChange(Math.max(0, pageIndex - 1))}
              disabled={!canPrev}
              className="h-10 w-10 p-0"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-label="Next page"
              onClick={() => onPageIndexChange(pageIndex + 1)}
              disabled={!canNext}
              className="h-10 w-10 p-0"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

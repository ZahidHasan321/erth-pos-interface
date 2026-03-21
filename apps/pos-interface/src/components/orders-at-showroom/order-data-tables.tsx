import {
  type ColumnDef,
  type ColumnFiltersState,
  type ExpandedState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type OnChangeFn,
  type RowSelectionState,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronLeft, ChevronRight, ClipboardCheck } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn, clickableProps } from "@/lib/utils";

import type { OrderRow } from "./types";
import type { FilterState } from "./order-filters";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type OrderDataTableProps = {
  columns: ColumnDef<OrderRow, unknown>[];
  data: OrderRow[];
  rowSelection: RowSelectionState;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
  filters: FilterState;
  selectedOrderId?: number;
};

export function OrderDataTable({
  columns,
  data,
  rowSelection,
  onRowSelectionChange,
  filters,
  selectedOrderId,
}: OrderDataTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [expanded, setExpanded] = React.useState<ExpandedState>({});
  const [pageSize, setPageSize] = React.useState(20);
  const [pageIndex, setPageIndex] = React.useState(0);

  // Reset to first page when filters change
  React.useEffect(() => {
    setPageIndex(0);
  }, [filters]);

  // --- FILTERING & SORTING LOGIC ---
  const processedData = React.useMemo(() => {
    if (!data || !Array.isArray(data)) {
      return [];
    }

    // Pre-compute filter values once (avoid re-creating per row)
    const searchIdLower = filters.searchId ? filters.searchId.toLowerCase() : "";
    const customerLower = filters.customer ? filters.customer.toLowerCase() : "";
    const startTime = filters.deliveryDateStart ? new Date(filters.deliveryDateStart).getTime() : 0;
    const endTime = filters.deliveryDateEnd ? new Date(filters.deliveryDateEnd).getTime() + 86400000 : 0;

    // 1. Filter
    const result = data.filter((row) => {
      try {
        const order = row.order;

        // ID / Invoice Search (Combined)
        if (searchIdLower) {
          const orderIdMatch = (row.orderId || "").toLowerCase().includes(searchIdLower);
          const fatouraMatch = String(row.fatoura || "").includes(searchIdLower);
          if (!orderIdMatch && !fatouraMatch) return false;
        }

        // Customer / Mobile Search
        if (customerLower) {
          const nameMatch = (row.customerName || "").toLowerCase().includes(customerLower);
          const nickMatch = (row.customerNickName || "").toLowerCase().includes(customerLower);
          const mobileMatch = (row.mobileNumber || "").includes(customerLower);
          if (!nameMatch && !nickMatch && !mobileMatch) return false;
        }

        // Stage
        if (filters.stage && filters.stage !== "all") {
          if (row.showroomStatus.label !== filters.stage) return false;
        }

        // Date Range (Delivery Date)
        if (startTime || endTime) {
          if (!row.deliveryDate) return false;
          const deliveryTime = new Date(row.deliveryDate).getTime();

          if (startTime && deliveryTime < startTime) return false;
          if (endTime && deliveryTime > endTime) return false;
        }

        // Reminder Status Logic (Multi-select AND logic)
        if (filters.reminderStatuses && filters.reminderStatuses.length > 0) {
          for (const status of filters.reminderStatuses) {
            let matchesCurrentStatus = false;

            switch (status) {
              case "r1_done":
                if (order.r1_date) matchesCurrentStatus = true;
                break;
              case "r1_pending":
                if (!order.r1_date) matchesCurrentStatus = true;
                break;
              
              case "r2_done":
                if (order.r2_date) matchesCurrentStatus = true;
                break;
              case "r2_pending":
                if (!order.r2_date) matchesCurrentStatus = true;
                break;

              case "r3_done":
                if (order.r3_date) matchesCurrentStatus = true;
                break;
              case "r3_pending":
                if (!order.r3_date) matchesCurrentStatus = true;
                break;

              case "call_done":
                if (order.call_status || order.call_reminder_date) matchesCurrentStatus = true;
                break;
              case "escalated":
                if (order.escalation_date) matchesCurrentStatus = true;
                break;
            }

            // AND Logic: If this specific filter fails, the whole row is excluded.
            if (!matchesCurrentStatus) return false;
          }
        }

        return true;
      } catch (error) {
        console.error("Filter error:", error);
        return true;
      }
    });

    // 2. Sort
    result.sort((a, b) => {
      switch (filters.sortBy) {
        case "deliveryDate_asc":
          return (new Date(a.deliveryDate || "2099-01-01").getTime()) - (new Date(b.deliveryDate || "2099-01-01").getTime());
        
        case "deliveryDate_desc":
          return (new Date(b.deliveryDate || "1970-01-01").getTime()) - (new Date(a.deliveryDate || "1970-01-01").getTime());
        
        case "balance_desc":
          return (b.balance || 0) - (a.balance || 0);
        
        case "created_desc":
        default:
           return Number(b.orderRecordId || 0) - Number(a.orderRecordId || 0);
      }
    });

    // Group linked orders together: primary followed by its children
    const grouped: OrderRow[] = [];
    const added = new Set<string>();
    const childrenByParent = new Map<string, OrderRow[]>();

    result.forEach(row => {
      const parentId = (row.order as any).linked_order_id;
      if (parentId) {
        const key = String(parentId);
        if (!childrenByParent.has(key)) childrenByParent.set(key, []);
        childrenByParent.get(key)!.push(row);
      }
    });

    result.forEach(row => {
      if (added.has(row.orderId)) return;
      if ((row.order as any).linked_order_id) return; // will be added under its primary
      grouped.push(row);
      added.add(row.orderId);
      const children = childrenByParent.get(row.orderId) || [];
      children.forEach(child => {
        if (!added.has(child.orderId)) {
          grouped.push(child);
          added.add(child.orderId);
        }
      });
    });

    // Orphaned children (primary not in current set)
    result.forEach(row => {
      if (!added.has(row.orderId)) grouped.push(row);
    });

    return grouped;
  }, [data, filters]);

  const table = useReactTable({
    data: processedData,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      expanded,
      pagination: {
        pageIndex,
        pageSize,
      }
    },
    onPaginationChange: (updater) => {
      const next = typeof updater === 'function'
        ? updater({ pageIndex, pageSize })
        : updater;
      setPageIndex(next.pageIndex);
      setPageSize(next.pageSize);
    },
    enableRowSelection: true,
    enableExpanding: true,
    onRowSelectionChange,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    enableSorting: false, 
  });

  const totalFilteredCount = table.getFilteredRowModel().rows.length;

  return (
    <div className="space-y-4">
      {/* Table */}
      <div className="rounded-xl border border-border shadow-sm overflow-x-auto bg-card py-0 gap-0">
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
                        (row.original.order as any).linked_order_id && "border-l-4 border-l-blue-300/70 bg-blue-50/30",
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

                  {/* Expanded Garments Rows */}
                  {row.getIsExpanded() && (
                    <TableRow>
                      <TableCell colSpan={columns.length} className="bg-muted/10 p-0 border-b border-border/40 shadow-inner">
                        <div className="p-3 sm:pl-10">
                          <h4 className="text-xs font-bold mb-2 text-foreground flex items-center gap-2">
                            Garments
                            <span className="bg-muted px-1.5 py-0.5 rounded-full text-xs font-black">{row.original.garmentsCount}</span>
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                            {row.original.garments
                              .filter((g: any) => {
                                if (row.original.showroomStatus.label === "ready_for_pickup") return true;
                                return g.locationKey === 'shop';
                              })
                              .map((garment) => {
                                const tripNum = (garment.garment as any).trip_number || 1;
                                const isAlteration = garment.isBrova && tripNum >= 3;
                                const alterationNum = tripNum - 2;
                                return (
                                  <div
                                    key={garment.garmentRecordId}
                                    className="p-2 bg-background rounded-lg border border-border/60 text-sm shadow-sm"
                                  >
                                    <div className="flex justify-between items-center mb-1.5">
                                      <span className="font-mono font-medium text-xs text-muted-foreground">{garment.garmentId}</span>
                                      <div className="flex items-center gap-1">
                                        {isAlteration && (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            asChild
                                            className="h-9 w-9 p-0 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                                          >
                                            <Link
                                              to="/$main/orders/order-management/feedback/$orderId"
                                              params={{ orderId: String(row.original.order.id) }}
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
                                            isAlteration
                                              ? "bg-blue-50 text-blue-700 border-blue-200"
                                              : garment.isBrova
                                                ? "bg-amber-50 text-amber-700 border-amber-200"
                                                : "bg-emerald-50 text-emerald-700 border-emerald-200"
                                          )}
                                        >
                                          {isAlteration ? `Alt #${alterationNum}` : garment.isBrova ? "Brova" : "Final"}
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
                                        <span className={cn(
                                          "font-bold text-xs px-1.5 py-0.5 rounded",
                                          garment.locationKey === 'shop' ? "bg-emerald-50 text-emerald-700" : "bg-primary/5 text-primary"
                                        )}>
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
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
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
            <Select value={pageSize.toString()} onValueChange={(v) => {
                setPageSize(Number(v));
                setPageIndex(0);
            }}>
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
            {totalFilteredCount > 0 && (
                <>
                    Showing <span className="font-bold text-foreground">{table.getRowModel().rows.length}</span> out of{" "}
                    <span className="font-bold text-foreground">{totalFilteredCount}</span> orders
                </>
            )}
          </div>

          <div className="text-xs text-muted-foreground sm:border-l border-border/60 sm:pl-4">
            {table.getFilteredSelectedRowModel().rows.length} row(s) selected
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground tabular-nums">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              aria-label="Previous page"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="h-10 w-10 p-0"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-label="Next page"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
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

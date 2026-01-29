"use client";

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
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

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
};

const dateFormatter = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });

function formatDate(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return dateFormatter.format(parsed);
}

export function OrderDataTable({
  columns,
  data,
  rowSelection,
  onRowSelectionChange,
  filters,
}: OrderDataTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [expanded, setExpanded] = React.useState<ExpandedState>({});
  const [pageSize, setPageSize] = React.useState(20);

  // --- FILTERING & SORTING LOGIC ---
  const processedData = React.useMemo(() => {
    if (!data || !Array.isArray(data)) {
      return [];
    }

    // 1. Filter
    let result = data.filter((row) => {
      try {
        const order = row.order;

        // ID / Invoice Search (Combined)
        if (filters.searchId) {
          const searchLower = filters.searchId.toLowerCase();
          const orderIdMatch = (row.orderId || "").toLowerCase().includes(searchLower);
          const fatouraMatch = String(row.fatoura || "").includes(searchLower);
          if (!orderIdMatch && !fatouraMatch) return false;
        }

        // Customer / Mobile Search
        if (filters.customer) {
          const searchLower = filters.customer.toLowerCase();
          const nameMatch = (row.customerName || "").toLowerCase().includes(searchLower);
          const nickMatch = (row.customerNickName || "").toLowerCase().includes(searchLower);
          const mobileMatch = (row.mobileNumber || "").includes(searchLower);
          if (!nameMatch && !nickMatch && !mobileMatch) return false;
        }

        // Stage (FatouraStage)
        if (filters.stage && filters.stage !== "all" && row.fatouraStage !== filters.stage) return false;

        // Financial: Has Balance (Balance > 0)
        if (filters.hasBalance) {
          if ((row.balance || 0) <= 0) return false;
        }

        // Date Range (Delivery Date)
        if (filters.deliveryDateStart || filters.deliveryDateEnd) {
          if (!row.deliveryDate) return false;
          const deliveryTime = new Date(row.deliveryDate).getTime();
          
          if (filters.deliveryDateStart) {
            const startTime = new Date(filters.deliveryDateStart).getTime();
            if (deliveryTime < startTime) return false;
          }
          if (filters.deliveryDateEnd) {
            const endTime = new Date(filters.deliveryDateEnd).getTime();
            // Add 1 day to end date to make it inclusive
            if (deliveryTime > endTime + 86400000) return false;
          }
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
           return (b.orderRecordId || "").localeCompare(a.orderRecordId || "");
      }
    });

    return result;
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
        pageIndex: 0,
        pageSize: pageSize,
      }
    },
    initialState: {
      pagination: {
        pageSize: pageSize,
      }
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
      <div className="rounded-xl border border-border shadow-sm overflow-hidden bg-card py-0 gap-0">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-muted/40 border-b-2 border-border/60">
                {headerGroup.headers.map((header, index) => (
                  <TableHead
                    key={header.id}
                    className={`font-semibold text-foreground h-10 ${
                      index !== headerGroup.headers.length - 1 ? "border-r border-border/40" : ""
                    }`}
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
                    className="hover:bg-muted/30 border-b border-border/40"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="py-2">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>

                  {/* Expanded Garments Rows */}
                  {row.getIsExpanded() && (
                    <TableRow>
                      <TableCell colSpan={columns.length} className="bg-muted/10 p-0 border-b border-border/40 shadow-inner">
                        <div className="p-4 pl-12">
                          <h4 className="text-sm font-semibold mb-3 text-foreground flex items-center gap-2">
                            Garments 
                            <span className="bg-muted px-2 py-0.5 rounded-full text-xs">{row.original.garmentsCount}</span>
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {row.original.garments.map((garment) => (
                              <div
                                key={garment.garmentRecordId}
                                className="p-3 bg-background rounded-lg border border-border/60 text-sm shadow-sm"
                              >
                                <div className="flex justify-between items-start mb-2">
                                  <span className="font-mono font-medium text-xs text-muted-foreground">{garment.garmentId}</span>
                                  <span
                                    className={cn(
                                      "inline-flex items-center rounded-md border px-1.5 py-0 text-[10px] font-medium",
                                      garment.isBrova
                                        ? "bg-blue-50 text-blue-700 border-blue-200"
                                        : "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    )}
                                  >
                                    {garment.isBrova ? "Brova" : "Final"}
                                  </span>
                                </div>
                                <div className="space-y-1.5">
                                  <div className="flex justify-between items-center">
                                    <span className="text-muted-foreground text-xs uppercase font-bold tracking-wider">Stage</span>
                                    <span className="font-bold text-xs bg-muted px-2 py-0.5 rounded-md">{garment.pieceStage}</span>
                                  </div>
                                  <div className="flex flex-col gap-1 mt-2 pt-2 border-t border-border/40">
                                    <span className="text-muted-foreground text-[10px] uppercase font-black tracking-widest">Garment Configuration</span>
                                    <span className="font-bold text-xs text-primary leading-relaxed">{garment.style || "Standard Kuwaiti Style"}</span>
                                  </div>
                                  <div className="flex justify-between items-center mt-2 pt-2 border-t border-border/40">
                                    <span className="text-muted-foreground text-xs uppercase font-bold tracking-wider">Delivery</span>
                                    <span className="font-bold text-xs">{formatDate(garment.deliveryDate)}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
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
      <div className="flex items-center justify-between pt-4 border-t border-border/40">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Rows per page</span>
            <Select value={pageSize.toString()} onValueChange={(v) => {
                const newSize = Number(v);
                setPageSize(newSize);
                table.setPageSize(newSize);
            }}>
                <SelectTrigger className="h-8 w-20 bg-card border-border/60">
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

          <div className="text-xs text-muted-foreground border-l border-border/60 pl-6">
            {table.getFilteredSelectedRowModel().rows.length} row(s) selected
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { getOrdersList } from "@/api/orders";
import { transformToOrderRows } from "@/hooks/useShowroomOrders";
import { OrderDataTable } from "@/components/orders-at-showroom/order-data-tables";
import type { OrderRow } from "@/components/orders-at-showroom/types";
import type { ColumnDef } from "@tanstack/react-table";
import type { RowSelectionState } from "@tanstack/react-table";
import { FullScreenLoader } from "@/components/global/full-screen-loader";
import { History, SearchX, ChevronRight, ChevronDown, Eye, Receipt, Package } from "lucide-react";
import type { FilterState } from "@/components/orders-at-showroom/order-filters";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";

interface CustomerOrderHistoryProps {
  customerId: number;
}

const dateFormatter = new Intl.DateTimeFormat("en-IN", { 
  day: "numeric", 
  month: "short",
  year: "numeric"
});

function formatDate(value?: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return dateFormatter.format(parsed);
}

const historyColumns: ColumnDef<OrderRow>[] = [
  {
    id: "expander",
    header: "",
    cell: ({ row }) => {
      // Don't show expander for Sales Orders as they don't have garments to show in the expanded view
      if (row.original.orderType === "SALES") return null;
      
      return (
        <button
          onClick={() => row.toggleExpanded()}
          className="p-1 hover:bg-muted rounded transition-colors"
        >
          {row.getIsExpanded() ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
      );
    },
  },
  {
    accessorKey: "orderId",
    header: "Order ID",
    cell: ({ row }) => <span className="font-mono text-xs font-bold">{row.original.orderId}</span>,
  },
  {
    accessorKey: "orderType",
    header: "Type",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        {row.original.orderType === "WORK" ? (
          <Package className="size-3.5 text-blue-500" />
        ) : (
          <Receipt className="size-3.5 text-amber-500" />
        )}
        <span className="text-xs font-medium">
          {row.original.orderType === "WORK" ? "Work Order" : "Sales Order"}
        </span>
      </div>
    ),
  },
  {
    accessorKey: "orderDate",
    header: "Date",
    cell: ({ row }) => <span className="text-xs">{formatDate(row.original.orderDate ?? undefined)}</span>,
  },
  {
    accessorKey: "orderStatus",
    header: "Status",
    cell: ({ row }) => {
      const status = row.original.orderStatus;
      const colorMap: Record<string, string> = {
        Pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
        Completed: "bg-green-100 text-green-700 border-green-200",
        Cancelled: "bg-red-100 text-red-700 border-red-200",
      };
      const color = colorMap[status] || "bg-gray-100 text-gray-700 border-gray-200";

      return (
        <span
          className={cn(
            "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium uppercase tracking-wide",
            color
          )}
        >
          {status}
        </span>
      );
    },
  },
  {
    accessorKey: "fatoura",
    header: "Invoice #",
    cell: ({ row }) => {
      const isWorkOrder = row.original.orderType === "WORK";
      return (
        <span className="font-mono text-xs text-muted-foreground">
          {isWorkOrder ? (row.original.fatoura || "—") : "—"}
        </span>
      );
    },
  },
  {
    accessorKey: "totalAmount",
    header: "Total",
    cell: ({ row }) => <span className="text-xs font-semibold">{row.original.totalAmount.toFixed(3)}</span>,
  },
  {
    id: "paid",
    header: "Paid",
    cell: ({ row }) => {
      const paid = row.original.order.paid || (row.original.totalAmount - (row.original.balance || 0));
      return <span className="text-xs text-muted-foreground">{Number(paid).toFixed(3)}</span>;
    },
  },
  {
    accessorKey: "balance",
    header: "Balance",
    cell: ({ row }) => {
      const balance = row.original.balance || 0;
      return (
        <span className={cn("text-xs font-bold", balance > 0 ? "text-destructive" : "text-emerald-600")}>
          {balance.toFixed(3)}
        </span>
      );
    },
  },
  {
    id: "open",
    header: "",
    cell: ({ row }) => {
      const order = row.original;
      const to = order.orderType === "SALES" ? "/$main/orders/new-sales-order" : "/$main/orders/new-work-order";
      return (
        <Link 
          to={to} 
          search={{ orderId: Number(order.orderId) }}
          className="p-2 hover:bg-primary/10 rounded-full transition-colors flex items-center justify-center text-primary"
          title="View Order"
        >
          <Eye className="h-4 w-4" />
        </Link>
      );
    },
  },
];

const defaultFilters: FilterState = {
  searchId: "",
  customer: "",
  stage: "all",
  reminderStatuses: [],
  deliveryDateStart: "",
  deliveryDateEnd: "",
  hasBalance: false,
  sortBy: "created_desc",
};

export function CustomerOrderHistory({ customerId }: CustomerOrderHistoryProps) {
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  const { data: orders, isLoading } = useQuery({
    queryKey: ["customer-orders", customerId],
    queryFn: async () => {
      const response = await getOrdersList({ customer_id: customerId });
      if (response.status === "success" && response.data) {
        return transformToOrderRows(response.data);
      }
      return [];
    },
    enabled: !!customerId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <FullScreenLoader title="Loading Order History" subtitle="Fetching customer records..." />
      </div>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-dashed border-border p-12 text-center space-y-4">
        <div className="bg-muted w-16 h-16 rounded-full flex items-center justify-center mx-auto">
          <SearchX className="size-8 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">No Orders Found</h3>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            This customer doesn't have any previous orders in the system yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 px-1">
        <div className="p-2 rounded-lg bg-primary/10 text-primary">
          <History className="size-5" />
        </div>
        <div className="space-y-0.5">
          <h2 className="text-xl font-bold tracking-tight">Order History</h2>
          <p className="text-sm text-muted-foreground">
            Complete history of {orders.length} order{orders.length !== 1 ? 's' : ''} for this customer
          </p>
        </div>
      </div>

      <OrderDataTable
        columns={historyColumns}
        data={orders}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        filters={defaultFilters}
      />
    </div>
  );
}

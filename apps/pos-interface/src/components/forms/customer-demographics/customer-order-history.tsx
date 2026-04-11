import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { transformRow } from "@/hooks/useShowroomOrders";
import { OrderDataTable } from "../../orders-at-showroom/order-data-tables";
import { orderColumns } from "../../orders-at-showroom/order-columns";
import type { RowSelectionState } from "@tanstack/react-table";
import { TableSkeleton } from "../../orders-at-showroom/table-skeleton";
import type { OrderRow } from "../../orders-at-showroom/types";

interface CustomerOrderHistoryProps {
  customerId: number;
}

const PAGE_SIZE = 20;

/**
 * Merge raw Supabase `orders + work_orders + customer + garments` rows into
 * the shape transformRow expects. The showroom hook normally relies on the
 * RPC to do this merge server-side, but customer history fetches directly
 * (not through the RPC), so we have to replicate it here.
 */
function flattenCustomerOrder(raw: any) {
  const wo = Array.isArray(raw.workOrder) ? raw.workOrder[0] : raw.workOrder;
  return {
    ...raw,
    ...(wo ?? {}),
    id: raw.id, // keep orders.id after the spread so wo.order_id doesn't clobber it
    customer: Array.isArray(raw.customer) ? raw.customer[0] : raw.customer,
    garments: raw.garments ?? [],
  };
}

export function CustomerOrderHistory({ customerId }: CustomerOrderHistoryProps) {
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [pageIndex, setPageIndex] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(PAGE_SIZE);

  const { data: orders, isLoading } = useQuery({
    queryKey: ["customer-orders", customerId],
    queryFn: async (): Promise<OrderRow[]> => {
      const { data, error } = await db
        .from("orders")
        .select(`
          *,
          workOrder:work_orders!order_id(*),
          customer:customers(*),
          garments:garments(*, fabric:fabrics(*))
        `)
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []).map((row: any) => transformRow(flattenCustomerOrder(row)));
    },
  });

  if (isLoading) return <TableSkeleton />;

  const rows = orders ?? [];
  const pageStart = pageIndex * pageSize;
  const pageRows = rows.slice(pageStart, pageStart + pageSize);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-black uppercase tracking-tight">Order History</h3>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest opacity-60">
          {rows.length} Total Orders
        </p>
      </div>

      <OrderDataTable
        columns={orderColumns(() => {})}
        data={pageRows}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        pageIndex={pageIndex}
        pageSize={pageSize}
        totalCount={rows.length}
        onPageIndexChange={setPageIndex}
        onPageSizeChange={setPageSize}
      />
    </div>
  );
}

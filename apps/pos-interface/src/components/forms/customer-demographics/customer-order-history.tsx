import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { transformToOrderRows } from "@/hooks/useShowroomOrders";
import { OrderDataTable } from "../../orders-at-showroom/order-data-tables";
import { orderColumns } from "../../orders-at-showroom/order-columns";
import type { RowSelectionState } from "@tanstack/react-table";
import { TableSkeleton } from "../../orders-at-showroom/table-skeleton";
import type { FilterState } from "../../orders-at-showroom/order-filters";

interface CustomerOrderHistoryProps {
  customerId: number;
}

const INITIAL_FILTERS: FilterState = {
  searchId: "",
  customer: "",
  stage: "all",
  reminderStatuses: [],
  deliveryDateStart: "",
  deliveryDateEnd: "",
  sortBy: "created_desc",
};

export function CustomerOrderHistory({ customerId }: CustomerOrderHistoryProps) {
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  const { data: orders, isLoading } = useQuery({
    queryKey: ["customer-orders", customerId],
    queryFn: async () => {
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
      return transformToOrderRows(data || []);
    },
  });

  if (isLoading) return <TableSkeleton />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-black uppercase tracking-tight">Order History</h3>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest opacity-60">
          {orders?.length || 0} Total Orders
        </p>
      </div>

      <OrderDataTable
        columns={orderColumns(() => {})}
        data={orders || []}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        filters={INITIAL_FILTERS}
      />
    </div>
  );
}

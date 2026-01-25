import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { RowSelectionState } from "@tanstack/react-table";

import { orderColumns } from "@/components/orders-at-showroom/order-columns";
import { GarmentTableErrorBoundary } from "@/components/orders-at-showroom/GarmentTableErrorBoundary";
import { useShowroomOrders } from "@/hooks/useShowroomOrders";
import { OrderDataTable } from "@/components/orders-at-showroom/order-data-tables";
import { OrderFilters, type FilterState } from "@/components/orders-at-showroom/order-filters";
import { TableSkeleton } from "@/components/orders-at-showroom/table-skeleton";

export const Route = createFileRoute("/$main/orders/orders-at-showroom")({
  component: RouteComponent,
  head: () => ({
    meta: [
      {
        title: "Orders at Showroom",
      },
    ],
  }),
});

function RouteComponent() {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  
  // Initial Filter State
  const [filters, setFilters] = useState<FilterState>({
    orderId: "",
    fatoura: "",
    mobile: "",
    customer: "",
    stage: "all",
    reminderStatuses: [],
    deliveryDateStart: "",
    deliveryDateEnd: "",
    hasBalance: false,
    sortBy: "created_desc", 
  });
  
  const [filteredCount, setFilteredCount] = useState(0);

  // Fetch orders at showroom
  const { data: orders = [], isLoading, isError, error } = useShowroomOrders();

  const handleFilterChange = (key: keyof FilterState, value: any) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({
      orderId: "",
      fatoura: "",
      mobile: "",
      customer: "",
      stage: "all",
      reminderStatuses: [],
      deliveryDateStart: "",
      deliveryDateEnd: "",
      hasBalance: false,
      sortBy: "created_desc",
    });
  };

  return (
    <div className="space-y-6 mx-4 lg:mx-10 my-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground">
          Orders at Showroom
        </h1>
        <p className="text-sm text-muted-foreground">
          Orders awaiting approval, final pieces, alterations, and cancelled orders
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {/* Filters Section */}
        <div className="w-full">
          <OrderFilters 
            filters={filters}
            onFilterChange={handleFilterChange}
            onClearFilters={clearFilters}
            totalOrders={orders.length}
            filteredCount={filteredCount}
          />
        </div>

        {/* Loading State */}
        {isLoading && <TableSkeleton />}

        {/* Error State */}
        {isError && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-6 text-center">
            <p className="text-destructive font-medium">
              Failed to load orders at showroom
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              {error instanceof Error ? error.message : "Unknown error occurred"}
            </p>
          </div>
        )}

        {/* Data Table */}
        {!isLoading && !isError && (
          <GarmentTableErrorBoundary>
            <OrderDataTable
              columns={orderColumns}
              data={orders}
              rowSelection={rowSelection}
              onRowSelectionChange={setRowSelection}
              filters={filters}
              onFilteredDataChange={setFilteredCount}
            />
          </GarmentTableErrorBoundary>
        )}
      </div>
    </div>
  );
}
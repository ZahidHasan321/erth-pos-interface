import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { RowSelectionState } from "@tanstack/react-table";
import { 
  Store, 
  Scissors, 
  CheckCircle, 
  RefreshCw, 
  Package
} from "lucide-react";

import { orderColumns } from "@/components/orders-at-showroom/order-columns";
import { GarmentTableErrorBoundary } from "@/components/orders-at-showroom/GarmentTableErrorBoundary";
import { useShowroomOrders } from "@/hooks/useShowroomOrders";
import { OrderDataTable } from "@/components/orders-at-showroom/order-data-tables";
import { OrderFilters, type FilterState } from "@/components/orders-at-showroom/order-filters";
import { TableSkeleton } from "@/components/orders-at-showroom/table-skeleton";
import { cn } from "@/lib/utils";

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
    searchId: "",
    customer: "",
    stage: "all",
    reminderStatuses: [],
    deliveryDateStart: "",
    deliveryDateEnd: "",
        hasBalance: false,
        sortBy: "created_desc", 
      });
      
      // Fetch orders at showroom
      const { data: orders = [], isLoading, isError, error } = useShowroomOrders();
    
      // Statistics Calculation
      const { stats } = useMemo(() => {
        // 1. Apply Filters (Matching OrderDataTable logic)
        const filtered = orders.filter((row) => {
          const order = row.order;
    
          // ID / Invoice Search
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
    
          // Stage
          if (filters.stage && filters.stage !== "all" && row.fatouraStage !== filters.stage) return false;
    
          // Financial: Has Balance
          if (filters.hasBalance) {
            if ((row.balance || 0) <= 0) return false;
          }
    
          // Date Range
          if (filters.deliveryDateStart || filters.deliveryDateEnd) {
            if (!row.deliveryDate) return false;
            const deliveryTime = new Date(row.deliveryDate).getTime();
            
            if (filters.deliveryDateStart) {
              const startTime = new Date(filters.deliveryDateStart).getTime();
              if (deliveryTime < startTime) return false;
            }
            if (filters.deliveryDateEnd) {
              const endTime = new Date(filters.deliveryDateEnd).getTime();
              if (deliveryTime > endTime + 86400000) return false;
            }
          }
    
          // Reminder Status Logic
          if (filters.reminderStatuses && filters.reminderStatuses.length > 0) {
            for (const status of filters.reminderStatuses) {
              let matchesCurrentStatus = false;
              switch (status) {
                case "r1_done": if (order.r1_date) matchesCurrentStatus = true; break;
                case "r1_pending": if (!order.r1_date) matchesCurrentStatus = true; break;
                case "r2_done": if (order.r2_date) matchesCurrentStatus = true; break;
                case "r2_pending": if (!order.r2_date) matchesCurrentStatus = true; break;
                case "r3_done": if (order.r3_date) matchesCurrentStatus = true; break;
                case "r3_pending": if (!order.r3_date) matchesCurrentStatus = true; break;
                case "call_done": if (order.call_status || order.call_reminder_date) matchesCurrentStatus = true; break;
                case "escalated": if (order.escalation_date) matchesCurrentStatus = true; break;
              }
              if (!matchesCurrentStatus) return false;
            }
          }
    
          return true;
        });
    
        // 2. Calculate Stats from Filtered Data
        return {
          stats: {
            total: filtered.length,
            brova: filtered.filter(o => 
              o.order.production_stage === 'brova_at_shop' || 
              o.order.production_stage === 'brova_and_final_at_shop'
            ).length,
            final: filtered.filter(o => 
              o.order.production_stage === 'final_at_shop' || 
              o.order.production_stage === 'brova_and_final_at_shop'
            ).length,
            alterationIn: filtered.filter(o => o.order.production_stage === 'brova_alteration').length,
            alterationOut: 0,
          }
        };
      }, [orders, filters]);
    
      const handleFilterChange = (key: keyof FilterState, value: any) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
      };
    
      const clearFilters = () => {
        setFilters({
          searchId: "",
          customer: "",
          stage: "all",
          reminderStatuses: [],
          deliveryDateStart: "",
          deliveryDateEnd: "",
          hasBalance: false,
          sortBy: "created_desc",
        });
      };
    
      const CompactStat = ({
        label,
        value,
        icon: Icon,
        color,
        className
      }: {
        label: string;
        value: number;
        icon: any;
        color: string;
        className?: string;
      }) => (
        <div className={cn(
          "flex items-center gap-2.5 bg-card/50 backdrop-blur-sm border border-border/60 rounded-xl p-2 pr-4 min-w-[140px] transition-all hover:shadow-md hover:border-primary/20 group",
          className
        )}>
           <div className={cn(
             "p-2 rounded-lg transition-colors",
             color.replace('bg-', 'text-'),
             "bg-muted/50 group-hover:bg-primary/10 group-hover:text-primary"
           )}>
              <Icon className="w-4 h-4" />
           </div>
           <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground leading-none mb-1">{label}</p>
              <p className="text-xl font-black leading-none tracking-tighter">{value}</p>
           </div>
        </div>
      );
    
      return (
        <div className="space-y-6 mx-4 lg:mx-8 my-8 max-w-[1600px] 2xl:mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border pb-6">
            <div className="space-y-1">
              <h1 className="text-3xl font-black text-foreground tracking-tight uppercase">
                Showroom <span className="text-primary">Inventory</span>
              </h1>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest opacity-70">
                Real-time tracking of orders currently at the store
              </p>
            </div>
          </div>
    
          <div className="flex flex-col xl:flex-row gap-4 items-start">
            {/* Filters Section - Full width minus stats */}
            <div className="flex-1 w-full">
              <OrderFilters 
                filters={filters}
                onFilterChange={handleFilterChange}
                onClearFilters={clearFilters}
              />
            </div>
    
            {/* Compact Statistics Grid - 2 columns side by side with filters */}
            <div className="w-full xl:w-auto grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-2 gap-2">
              <CompactStat 
                label="Total Orders" 
                value={stats.total} 
                icon={Store} 
                color="text-slate-600"
              />
              <CompactStat 
                label="Brova (Wait)" 
                value={stats.brova} 
                icon={Scissors} 
                color="text-amber-500"
              />
              <CompactStat 
                label="Final (Ready)" 
                value={stats.final} 
                icon={CheckCircle} 
                color="text-emerald-500"
              />
              <CompactStat 
                label="Alt (Internal)" 
                value={stats.alterationIn} 
                icon={RefreshCw} 
                color="text-blue-500"
              />
              <CompactStat 
                label="Alt (External)" 
                value={stats.alterationOut} 
                icon={Package} 
                color="text-purple-500"
              />
            </div>
          </div>
    
          <div className="flex flex-col gap-6">
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
                />
              </GarmentTableErrorBoundary>
            )}
          </div>
        </div>
      );
    }
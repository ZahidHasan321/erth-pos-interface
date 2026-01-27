import { Search, X, Filter, Calendar, CreditCard, Bell, ArrowUpDown, User, ListFilter, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ProductionStageLabels } from "@/lib/constants";


export type FilterState = {
  // Search
  orderId: string;
  fatoura?: string; // Added fatoura
  mobile: string;
  customer: string;
  
  // Status & Workflow
  stage: string;
  reminderStatuses: string[]; // Changed to array for multi-select
  
  // Dates
  deliveryDateStart: string;
  deliveryDateEnd: string;
  
  // Financial
  hasBalance: boolean;
  
  // Sorting
  sortBy: "deliveryDate_asc" | "deliveryDate_desc" | "balance_desc" | "created_desc";
};

type OrderFiltersProps = {
  filters: FilterState;
  onFilterChange: (key: keyof FilterState, value: any) => void;
  onClearFilters: () => void;
  totalOrders: number;
  filteredCount: number;
  className?: string;
};

const REMINDER_OPTIONS = [
  { value: "r1_pending", label: "R1 Pending" },
  { value: "r1_done", label: "R1 Completed" },
  { value: "r2_pending", label: "R2 Pending" },
  { value: "r2_done", label: "R2 Completed" },
  { value: "r3_pending", label: "R3 Pending" },
  { value: "r3_done", label: "R3 Completed" },
  { value: "call_done", label: "Call Made" },
  { value: "escalated", label: "Escalated" },
];

export function OrderFilters({
  filters,
  onFilterChange,
  onClearFilters,
  totalOrders,
  filteredCount,
  className,
}: OrderFiltersProps) {
  
  const hasActiveFilters =
    filters.orderId || 
    filters.fatoura ||
    filters.mobile || 
    filters.customer || 
    filters.stage !== "all" ||
    filters.reminderStatuses.length > 0 ||
    filters.deliveryDateStart ||
    filters.deliveryDateEnd ||
    filters.hasBalance;

  const toggleReminder = (value: string) => {
    const current = filters.reminderStatuses;
    if (current.includes(value)) {
      onFilterChange("reminderStatuses", current.filter((i) => i !== value));
    } else {
      onFilterChange("reminderStatuses", [...current, value]);
    }
  };

  return (
    <div className={`flex flex-col gap-6 bg-card rounded-xl border border-border p-6 shadow-sm ${className}`}>
      
      {/* --- HEADER --- */}
      <div className="flex items-center justify-between pb-2 border-b border-border/40">
        <h3 className="font-semibold text-foreground flex items-center gap-2 text-lg">
           <ListFilter className="h-5 w-5 text-primary" /> 
           Filters & Sorting
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearFilters}
          className="h-8 text-xs hover:bg-destructive/10 hover:text-destructive transition-opacity"
          style={{
            opacity: hasActiveFilters ? 1 : 0,
            pointerEvents: hasActiveFilters ? "auto" : "none",
          }}
        >
          <X className="h-3 w-3 mr-1" />
          Clear all
        </Button>
      </div>

      {/* --- SECTION 1: SEARCH & CONTROLS --- */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-primary/80">
          <Search className="h-4 w-4" />
          <Label className="text-xs font-bold uppercase tracking-wider">Search</Label>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {/* Order ID */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Order ID</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Ex: A-1001"
                value={filters.orderId}
                onChange={(e) => onFilterChange("orderId", e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
          </div>
          
           {/* Fatoura Search */}
           <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Fatoura</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Ex: 12345"
                value={filters.fatoura || ""}
                onChange={(e) => onFilterChange("fatoura", e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
          </div>

          {/* Customer */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Customer / Mobile</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Name or Phone"
                value={filters.customer}
                onChange={(e) => {
                  onFilterChange("customer", e.target.value);
                  if (/^\d+$/.test(e.target.value)) onFilterChange("mobile", e.target.value);
                  else onFilterChange("mobile", "");
                }}
                className="pl-9 h-9 text-sm"
              />
            </div>
          </div>

          {/* Sort By */}
          <div className="space-y-1.5 sm:col-span-2 md:col-span-1">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              Sort Order
            </Label>
            <Select 
              value={filters.sortBy} 
              onValueChange={(value) => onFilterChange("sortBy", value)}
            >
              <SelectTrigger className="h-9 text-sm">
                <div className="flex items-center gap-2">
                  <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created_desc">Newest Created</SelectItem>
                <SelectItem value="deliveryDate_asc">Delivery: Earliest First</SelectItem>
                <SelectItem value="deliveryDate_desc">Delivery: Latest First</SelectItem>
                <SelectItem value="balance_desc">Highest Payment Remaining</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="h-px bg-border/60" />

      {/* --- SECTION 2: FILTERS (Categorized) --- */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-primary/80">
          <Filter className="h-4 w-4" />
          <Label className="text-xs font-bold uppercase tracking-wider">Refine By</Label>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Category A: Workflow (Status + Reminders) */}
          <div className="lg:col-span-5 space-y-3">
             <Label className="text-xs font-semibold text-foreground/80 flex items-center gap-1.5 bg-muted/30 p-1.5 rounded w-fit px-3">
                <Bell className="h-3.5 w-3.5" /> Workflow Status
             </Label>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                   <Label className="text-xs text-muted-foreground">Order Stage</Label>
                   <Select 
                      value={filters.stage} 
                      onValueChange={(value) => onFilterChange("stage", value)}
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="All Stages" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Stages</SelectItem>
                        {Object.values(ProductionStageLabels)
                          .filter(stage => 
                            stage.toLowerCase().includes("brova") || 
                            stage.toLowerCase().includes("alteration")
                          )
                          .map((stage) => (
                          <SelectItem key={stage} value={stage}>
                            {stage}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                </div>
                
                {/* Multi-Select Reminder Filter */}
                <div className="space-y-1.5">
                   <Label className="text-xs text-muted-foreground">Reminder Stage</Label>
                   <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="h-9 w-full justify-between text-sm font-normal px-3"
                      >
                        {filters.reminderStatuses.length === 0 ? (
                          <span className="text-muted-foreground">All Orders</span>
                        ) : (
                          <span className="flex items-center gap-1 truncate">
                             <Badge variant="secondary" className="h-5 px-1 rounded-sm text-[10px] pointer-events-none">
                               {filters.reminderStatuses.length}
                             </Badge>
                             <span className="truncate">Selected</span>
                          </span>
                        )}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[200px] p-2" align="start">
                      <div className="space-y-1">
                        {REMINDER_OPTIONS.map((option) => (
                          <div
                            key={option.value}
                            className="flex items-center space-x-2 rounded-sm p-2 hover:bg-accent cursor-pointer"
                            onClick={() => toggleReminder(option.value)}
                          >
                            <Checkbox 
                              id={`reminder-${option.value}`}
                              checked={filters.reminderStatuses.includes(option.value)}
                              className="pointer-events-none"
                            />
                            <Label 
                              htmlFor={`reminder-${option.value}`} 
                              className="text-sm cursor-pointer flex-1 pointer-events-none"
                            >
                              {option.label}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
             </div>
          </div>

          {/* Category B: Timeline (Date Range) */}
          <div className="lg:col-span-4 space-y-3">
            <Label className="text-xs font-semibold text-foreground/80 flex items-center gap-1.5 bg-muted/30 p-1.5 rounded w-fit px-3">
                <Calendar className="h-3.5 w-3.5" /> Delivery Timeline
             </Label>
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
              <div className="space-y-1.5 w-full sm:flex-1">
                <Label className="text-xs text-muted-foreground">From</Label>
                <Input 
                  type="date" 
                  className="h-9 text-sm"
                  value={filters.deliveryDateStart}
                  onChange={(e) => onFilterChange("deliveryDateStart", e.target.value)}
                />
              </div>
              <div className="space-y-1.5 w-full sm:flex-1">
                <Label className="text-xs text-muted-foreground">To</Label>
                <Input 
                  type="date" 
                  className="h-9 text-sm"
                  value={filters.deliveryDateEnd}
                  onChange={(e) => onFilterChange("deliveryDateEnd", e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Category C: Financial */}
          <div className="lg:col-span-3 space-y-3">
             <Label className="text-xs font-semibold text-foreground/80 flex items-center gap-1.5 bg-muted/30 p-1.5 rounded w-fit px-3">
                <CreditCard className="h-3.5 w-3.5" /> Financial
             </Label>
             <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Payment Status</Label>
                <div className="flex items-center h-9 border rounded-md px-3 bg-card hover:bg-muted/20 transition-colors w-full">
                  <Checkbox 
                    id="has-balance" 
                    checked={filters.hasBalance}
                    onCheckedChange={(checked) => onFilterChange("hasBalance", checked as boolean)}
                  />
                  <Label 
                    htmlFor="has-balance" 
                    className="text-sm font-medium ml-2 cursor-pointer flex-1"
                  >
                    Unpaid Only
                  </Label>
                </div>
             </div>
          </div>

        </div>
      </div>

      {/* --- FOOTER --- */}
      <div className="pt-2 flex justify-end">
        <span className="text-xs text-muted-foreground bg-muted/30 px-3 py-1 rounded-full">
          Showing <span className="font-medium text-foreground">{filteredCount}</span> of{" "}
          <span className="font-medium text-foreground">{totalOrders}</span> orders
        </span>
      </div>
    </div>
  );
}
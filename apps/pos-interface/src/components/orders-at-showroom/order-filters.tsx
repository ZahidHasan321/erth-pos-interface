import { useState } from "react";
import { 
  Search, 
  X, 
  Calendar, 
  CreditCard, 
  Bell, 
  ArrowUpDown, 
  User, 
  ChevronsUpDown,
  ChevronDown,
  Settings2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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
import { cn } from "@/lib/utils";


export type FilterState = {
  // Search
  searchId: string; // Combined Order ID / Fatoura
  customer: string; // Combined Name / Mobile
  
  // Status & Workflow
  stage: string;
  reminderStatuses: string[]; 
  
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
  className,
}: OrderFiltersProps) {
  const [isAdvancedExpanded, setIsAdvancedExpanded] = useState(false);

  const hasActiveFilters =
    filters.searchId || 
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
    <div className={cn("bg-card rounded-xl border-2 border-border/80 p-4 shadow-sm", className)}>
      
      {/* --- QUICK SEARCH SECTION (Always Visible) --- */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-3">
        {/* Order ID / Fatoura */}
        <div className="space-y-1.5">
          <Label className="text-xs font-black uppercase tracking-widest text-foreground/70 ml-1">ID / Invoice</Label>
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors pointer-events-none" />
            <Input
              placeholder="Search ID or Invoice..."
              value={filters.searchId}
              onChange={(e) => onFilterChange("searchId", e.target.value)}
              className="pl-9 h-10 text-sm border-2 border-border hover:border-primary/40 focus-visible:ring-ring/50 focus-visible:border-ring bg-background font-medium transition-all"
            />
          </div>
        </div>

        {/* Customer */}
        <div className="space-y-1.5">
          <Label className="text-xs font-black uppercase tracking-widest text-foreground/70 ml-1">Customer / Mobile</Label>
          <div className="relative group">
            <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors pointer-events-none" />
            <Input
              placeholder="Name or Phone..."
              value={filters.customer}
              onChange={(e) => onFilterChange("customer", e.target.value)}
              className="pl-9 h-10 text-sm border-2 border-border hover:border-primary/40 focus-visible:ring-ring/50 focus-visible:border-ring bg-background font-medium transition-all"
            />
          </div>
        </div>

        {/* Sort By */}
        <div className="space-y-1.5">
          <Label className="text-xs font-black uppercase tracking-widest text-foreground/70 ml-1">Sort Orders</Label>
          <Select 
            value={filters.sortBy} 
            onValueChange={(value) => onFilterChange("sortBy", value)}
          >
            <SelectTrigger className="h-10 text-sm border-2 border-border hover:border-primary/40 focus:ring-ring/50 focus:border-ring bg-background font-bold transition-all">
              <div className="flex items-center gap-2">
                <ArrowUpDown className="h-4 w-4 text-primary" />
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="created_desc" className="font-medium">Newest Created</SelectItem>
              <SelectItem value="deliveryDate_asc" className="font-medium">Delivery: Earliest First</SelectItem>
              <SelectItem value="deliveryDate_desc" className="font-medium">Delivery: Latest First</SelectItem>
              <SelectItem value="balance_desc" className="font-medium">Highest Payment Remaining</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* --- ACTIONS ROW --- */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className={cn(
              "h-8 px-2 text-xs font-bold text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all duration-200",
              !hasActiveFilters && "opacity-0 pointer-events-none"
            )}
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Reset All
          </Button>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant={isAdvancedExpanded ? "secondary" : "outline"}
            size="sm"
            onClick={() => setIsAdvancedExpanded(!isAdvancedExpanded)}
            className={cn(
              "h-8 px-3 gap-1.5 text-xs font-bold border-2 transition-all",
              isAdvancedExpanded ? "bg-secondary text-secondary-foreground border-secondary" : "border-border hover:border-primary/50"
            )}
          >
            <Settings2 className="h-4 w-4" />
            Advanced
            <motion.div
              animate={{ rotate: isAdvancedExpanded ? 180 : 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              <ChevronDown className="h-4 w-4" />
            </motion.div>
          </Button>
        </div>
      </div>

      {/* --- ADVANCED FILTERS SECTION (Collapsible) --- */}
      <AnimatePresence initial={false}>
        {isAdvancedExpanded && (
          <motion.div
            key="advanced-filters"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="pt-3 mt-2 border-t-2 border-border/40">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 bg-muted/15 rounded-xl p-3 border border-border/30">
                
                {/* Workflow Status Group */}
                <div className="md:col-span-7 space-y-2.5 md:pr-3 md:border-r border-border/40">
                  <div className="flex items-center gap-1.5 border-b border-primary/10 pb-1">
                    <Bell className="h-3.5 w-3.5 text-primary" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-primary">Workflow</span>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <div className="sm:col-span-8 space-y-1">
                      <Label className="text-[10px] font-bold text-muted-foreground uppercase ml-0.5">Stage</Label>
                      <Select 
                        value={filters.stage} 
                        onValueChange={(value) => onFilterChange("stage", value)}
                      >
                        <SelectTrigger className="h-8 text-xs border-2 border-border bg-background font-bold focus:ring-ring/40 focus:border-ring transition-all hover:border-primary/30">
                          <SelectValue placeholder="Stage" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all" className="font-medium text-xs">All Showroom Stages</SelectItem>
                          {[
                            "brova_at_shop",
                            "final_at_shop",
                            "brova_alteration",
                            "brova_and_final_at_shop"
                          ].map((stageKey) => (
                            <SelectItem key={stageKey} value={stageKey} className="font-medium text-xs">
                              {ProductionStageLabels[stageKey as keyof typeof ProductionStageLabels] || stageKey}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="sm:col-span-4 space-y-1">
                      <Label className="text-[10px] font-bold text-muted-foreground uppercase ml-0.5">Reminder</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            className="h-8 w-full justify-between text-xs font-bold border-2 border-border bg-background hover:border-primary/30 px-2 transition-all"
                          >
                            {filters.reminderStatuses.length === 0 ? (
                              <span className="text-muted-foreground">All</span>
                            ) : (
                              <span className="flex items-center gap-1 truncate">
                                <Badge variant="default" className="h-4 px-1 rounded-sm text-[10px] font-black">
                                  {filters.reminderStatuses.length}
                                </Badge>
                                <span className="truncate">Selected</span>
                              </span>
                            )}
                            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[170px] p-1" align="start">
                          <div className="space-y-0.5">
                            {REMINDER_OPTIONS.map((option) => (
                              <div
                                key={option.value}
                                className="flex items-center space-x-2 rounded-md p-1.5 hover:bg-primary/10 cursor-pointer"
                                onClick={() => toggleReminder(option.value)}
                              >
                                <Checkbox 
                                  id={`reminder-${option.value}`}
                                  checked={filters.reminderStatuses.includes(option.value)}
                                  className="h-3.5 w-3.5 border-2 pointer-events-none"
                                />
                                <Label 
                                  className="text-xs font-bold cursor-pointer flex-1 pointer-events-none"
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

                {/* Timeline Group */}
                <div className="md:col-span-3 space-y-2.5 md:px-3 md:border-r border-border/40">
                  <div className="flex items-center gap-1.5 border-b border-primary/10 pb-1">
                    <Calendar className="h-3.5 w-3.5 text-primary" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-primary">Timeline</span>
                  </div>
                  
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-12 items-center gap-2">
                      <Label className="col-span-3 text-[10px] font-bold text-muted-foreground uppercase">From</Label>
                      <Input 
                        type="date" 
                        className="col-span-9 h-8 text-xs border-2 border-border bg-background font-bold focus-visible:ring-ring/40 focus-visible:border-ring transition-all hover:border-primary/30 px-2"
                        value={filters.deliveryDateStart}
                        onChange={(e) => onFilterChange("deliveryDateStart", e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-12 items-center gap-2">
                      <Label className="col-span-3 text-[10px] font-bold text-muted-foreground uppercase">To</Label>
                      <Input 
                        type="date" 
                        className="col-span-9 h-8 text-xs border-2 border-border bg-background font-bold focus-visible:ring-ring/40 focus-visible:border-ring transition-all hover:border-primary/30 px-2"
                        value={filters.deliveryDateEnd}
                        onChange={(e) => onFilterChange("deliveryDateEnd", e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Financial Group */}
                <div className="md:col-span-2 space-y-2.5 md:pl-3">
                  <div className="flex items-center gap-1.5 border-b border-primary/10 pb-1">
                    <CreditCard className="h-3.5 w-3.5 text-primary" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-primary">Financial</span>
                  </div>
                  
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-muted-foreground uppercase ml-0.5">Balance</Label>
                    <div 
                      className={cn(
                        "flex items-center h-8 border-2 rounded-md px-2 bg-background transition-all w-full cursor-pointer",
                        filters.hasBalance ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                      )}
                      onClick={() => onFilterChange("hasBalance", !filters.hasBalance)}
                    >
                      <Checkbox 
                        id="has-balance" 
                        checked={filters.hasBalance}
                        className="h-3.5 w-3.5 border-2 pointer-events-none"
                      />
                      <Label 
                        className="text-xs font-black ml-2 cursor-pointer flex-1 truncate pointer-events-none"
                      >
                        Unpaid
                      </Label>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
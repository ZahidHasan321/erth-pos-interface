import {
  Search,
  ArrowUpDown,
  User,
  ChevronsUpDown,
  X,
  Settings2,
} from "lucide-react";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { DatePicker } from "@repo/ui/date-picker";
import { Checkbox } from "@repo/ui/checkbox";
import { Badge } from "@repo/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/ui/popover";
import { cn, getLocalDateStr } from "@/lib/utils";

export type FilterState = {
  searchId: string;
  customer: string;
  stage: string;
  reminderStatuses: string[];
  deliveryDateStart: string;
  deliveryDateEnd: string;
  sortBy: "deliveryDate_asc" | "deliveryDate_desc" | "balance_desc" | "created_desc";
};

type OrderFiltersProps = {
  filters: FilterState;
  onFilterChange: (key: keyof FilterState, value: any) => void;
  onClearFilters: () => void;
  className?: string;
};

const REMINDER_GROUPS = [
  {
    label: "Reminders",
    items: [
      { value: "r1_pending", label: "R1 Pending", color: "text-muted-foreground" },
      { value: "r1_done", label: "R1 Completed", color: "text-emerald-600" },
      { value: "r2_pending", label: "R2 Pending", color: "text-muted-foreground" },
      { value: "r2_done", label: "R2 Completed", color: "text-emerald-600" },
      { value: "r3_pending", label: "R3 Pending", color: "text-muted-foreground" },
      { value: "r3_done", label: "R3 Completed", color: "text-emerald-600" },
    ],
  },
  {
    label: "Follow-up",
    items: [
      { value: "call_done", label: "Call Made", color: "text-blue-600" },
      { value: "escalated", label: "Escalated", color: "text-rose-600" },
    ],
  },
];

export function OrderFilters({
  filters,
  onFilterChange,
  onClearFilters,
  className,
}: OrderFiltersProps) {
  const toggleReminder = (value: string) => {
    const current = filters.reminderStatuses;
    if (current.includes(value)) {
      onFilterChange("reminderStatuses", current.filter((i) => i !== value));
    } else {
      onFilterChange("reminderStatuses", [...current, value]);
    }
  };

  return (
    <div className={cn("bg-card rounded-2xl border-2 border-border/60 p-4 shadow-sm flex flex-col gap-4", className)}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings2 className="size-3.5 text-primary/60" aria-hidden="true" />
          <span className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Search & Filter</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearFilters}
          className="h-9 px-3 text-xs font-black uppercase tracking-tighter text-muted-foreground hover:text-rose-600 hover:bg-rose-50 transition-all"
        >
          <X className="size-3.5 mr-1" />
          Reset
        </Button>
      </div>

      {/* Row 1: Search */}
      <div className="flex flex-wrap gap-3">
        <div className="space-y-1 min-w-[120px] flex-1">
          <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-0.5">Order ID / Invoice</Label>
          <div className="relative group">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground/40 group-focus-within:text-primary transition-colors" aria-hidden="true" />
            <Input
              name="order-search"
              autoComplete="off"
              placeholder="Search…"
              value={filters.searchId}
              onChange={(e) => onFilterChange("searchId", e.target.value)}
              className="pl-8 h-9 text-xs border-2 border-border/60 rounded-lg bg-muted/5 font-bold transition-all focus-visible:ring-primary/20"
            />
          </div>
        </div>

        <div className="space-y-1 min-w-[160px] flex-[2]">
          <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-0.5">Customer Name / Mobile</Label>
          <div className="relative group">
            <User className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground/40 group-focus-within:text-primary transition-colors" aria-hidden="true" />
            <Input
              name="customer-search"
              autoComplete="off"
              placeholder="Search…"
              value={filters.customer}
              onChange={(e) => onFilterChange("customer", e.target.value)}
              className="pl-8 h-9 text-xs border-2 border-border/60 rounded-lg bg-muted/5 font-bold transition-all focus-visible:ring-primary/20"
            />
          </div>
        </div>
      </div>

      {/* Row 2: Filters + Sort */}
      <div className="flex flex-wrap gap-3 pt-3 border-t border-border/40">
        <div className="space-y-1 min-w-[140px] flex-1">
          <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-0.5">Workflow Status</Label>
          <Select value={filters.stage} onValueChange={(value) => onFilterChange("stage", value)}>
            <SelectTrigger className="h-9 text-xs border-2 border-border/60 rounded-lg bg-background font-bold focus:ring-primary/20">
              <SelectValue placeholder="All Stages" />
            </SelectTrigger>
            <SelectContent className="rounded-xl shadow-md">
              <SelectItem value="all">All Showroom Orders</SelectItem>
              <SelectItem value="brova_trial">Brova Trial</SelectItem>
              <SelectItem value="needs_action">Needs Action</SelectItem>
              <SelectItem value="awaiting_finals">Awaiting Finals</SelectItem>
              <SelectItem value="partial_ready">Partial Ready</SelectItem>
              <SelectItem value="ready_for_pickup">Ready for Pickup</SelectItem>
              <SelectItem value="alteration_in">Alteration (In)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1 min-w-[140px] flex-1">
          <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-0.5">Follow-up Status</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="h-9 w-full justify-between text-xs font-bold border-2 border-border/60 rounded-lg bg-background px-3 transition-all hover:border-primary/30"
              >
                {filters.reminderStatuses.length === 0 ? (
                  <span className="text-muted-foreground opacity-60">None Selected</span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <Badge variant="default" className="h-4 px-1 rounded-sm text-xs font-black">{filters.reminderStatuses.length}</Badge>
                    <span className="truncate">Active</span>
                  </span>
                )}
                <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-40" aria-hidden="true" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0 rounded-xl shadow-md border-2 border-border/40" align="start">
              {REMINDER_GROUPS.map((group) => (
                <div key={group.label}>
                  <div className="px-3 pt-2.5 pb-1">
                    <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">{group.label}</span>
                  </div>
                  {group.items.map((option) => (
                    <label
                      key={option.value}
                      className="flex items-center space-x-2.5 rounded-lg px-3 py-2.5 hover:bg-primary/5 cursor-pointer transition-colors touch-manipulation active:bg-primary/10"
                      onClick={() => toggleReminder(option.value)}
                    >
                      <Checkbox checked={filters.reminderStatuses.includes(option.value)} className="h-4 w-4 rounded border-2" aria-label={option.label} />
                      <span className={cn("text-xs font-bold cursor-pointer flex-1", option.color)}>{option.label}</span>
                    </label>
                  ))}
                </div>
              ))}
              {filters.reminderStatuses.length > 0 && (
                <div className="border-t border-border/40 px-3 py-2">
                  <button
                    onClick={() => onFilterChange("reminderStatuses", [])}
                    className="text-xs font-bold text-muted-foreground hover:text-rose-600 transition-colors cursor-pointer py-1 touch-manipulation"
                  >
                    Clear selection
                  </button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-1 min-w-[130px] flex-1">
          <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-0.5">Sorting</Label>
          <Select value={filters.sortBy} onValueChange={(value) => onFilterChange("sortBy", value)}>
            <SelectTrigger className="h-9 text-xs border-2 border-border/60 rounded-lg bg-background font-bold focus:ring-primary/20">
              <div className="flex items-center gap-1.5">
                <ArrowUpDown className="size-3 text-primary/60" aria-hidden="true" />
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent className="rounded-xl shadow-md">
              <SelectItem value="created_desc">Newest First</SelectItem>
              <SelectItem value="deliveryDate_asc">Earliest Delivery</SelectItem>
              <SelectItem value="deliveryDate_desc">Latest Delivery</SelectItem>
              <SelectItem value="balance_desc">Highest Balance</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 3: Date Range */}
      <div className="flex flex-wrap gap-3 pt-3 border-t border-border/40">
        <div className="space-y-1">
          <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-0.5">Delivery Date Range</Label>
          <div className="flex items-center gap-2">
            <div className="w-[130px]">
              <DatePicker
                value={filters.deliveryDateStart ? new Date(filters.deliveryDateStart) : null}
                onChange={(d) => onFilterChange("deliveryDateStart", d ? getLocalDateStr(d) : "")}
                placeholder="From"
                clearable
                className="h-9 text-xs border-2 border-border/60 rounded-lg bg-background font-bold"
              />
            </div>
            <span className="text-muted-foreground/30 font-black text-xs uppercase tracking-tighter shrink-0">to</span>
            <div className="w-[130px]">
              <DatePicker
                value={filters.deliveryDateEnd ? new Date(filters.deliveryDateEnd) : null}
                onChange={(d) => onFilterChange("deliveryDateEnd", d ? getLocalDateStr(d) : "")}
                placeholder="To"
                clearable
                className="h-9 text-xs border-2 border-border/60 rounded-lg bg-background font-bold"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

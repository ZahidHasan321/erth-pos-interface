import { useState, useMemo, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { RowSelectionState } from "@tanstack/react-table";
import {
  Store,
  CheckCircle,
  RefreshCw,
  Package,
  User,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Phone,
  MessageSquare,
  Loader2,
  Save,
  ClipboardCheck
} from "lucide-react";

import { orderColumns } from "@/components/orders-at-showroom/order-columns";
import { GarmentTableErrorBoundary } from "@/components/orders-at-showroom/GarmentTableErrorBoundary";
import { useShowroomOrders } from "@/hooks/useShowroomOrders";
import { OrderDataTable } from "@/components/orders-at-showroom/order-data-tables";
import { OrderFilters, type FilterState } from "@/components/orders-at-showroom/order-filters";
import { TableSkeleton } from "@/components/orders-at-showroom/table-skeleton";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useOrderMutations } from "@/hooks/useOrderMutations";
import type { OrderRow } from "@/components/orders-at-showroom/types";

export const Route = createFileRoute("/$main/orders/orders-at-showroom")({
  component: RouteComponent,
  head: () => ({
    meta: [{ title: "Showroom Inventory" }],
  }),
});

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
    "flex items-center gap-2 bg-card border-2 border-border/60 rounded-xl p-2 pr-3 transition-all hover:border-primary/20 shadow-sm",
    className
  )}>
     <div className={cn("p-1.5 rounded-lg bg-muted/50", color.replace('bg-', 'text-'))}>
        <Icon className="w-3.5 h-3.5" />
     </div>
     <div className="min-w-0 flex-1">
        <p className="text-xs font-black uppercase tracking-tight text-muted-foreground leading-none mb-1 truncate">{label}</p>
        <p className="text-lg font-black leading-none tracking-tighter">{value}</p>
     </div>
  </div>
);

const dateFormatter = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });
function fmtDate(v?: string | null) {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : dateFormatter.format(d);
}

function ReminderDialog({
    type,
    date,
    notes,
    isDone,
    onSave,
    isPending
}: {
    type: string;
    date?: string | null;
    notes?: string | null;
    isDone: boolean;
    onSave: (date: string, notes: string) => Promise<void>;
    isPending: boolean;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [editDate, setEditDate] = useState<Date | null>(null);
    const [editNotes, setEditNotes] = useState("");

    const handleOpen = (open: boolean) => {
        if (open) {
            setEditDate(date ? new Date(date) : new Date());
            setEditNotes(notes || "");
        }
        setIsOpen(open);
    };

    const handleSave = async () => {
        if (!editDate) return;
        await onSave(editDate.toISOString().split("T")[0], editNotes);
        setIsOpen(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleOpen}>
            <DialogTrigger asChild>
                <button className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer",
                    isDone
                        ? "bg-primary/10 text-primary ring-1 ring-primary/30"
                        : "bg-muted/50 text-muted-foreground ring-1 ring-border hover:ring-primary/30 hover:text-foreground"
                )}>
                    <span className={cn(
                        "size-2 rounded-full shrink-0",
                        isDone ? "bg-primary" : "bg-muted-foreground/40"
                    )} />
                    <span className="font-black">{type}</span>
                    {isDone && fmtDate(date) && (
                        <span className="text-xs opacity-70">{fmtDate(date)}</span>
                    )}
                    {isDone && notes && <MessageSquare className="size-3 opacity-50 shrink-0" />}
                </button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{isDone ? "Update" : "Add"} {type} Reminder</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label>Date</Label>
                        <DatePicker value={editDate} onChange={(d) => setEditDate(d)} />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor={`${type}-notes`}>Notes</Label>
                        <Textarea id={`${type}-notes`} placeholder={`Enter ${type} notes...`} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={3} />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                    <Button onClick={handleSave} disabled={isPending}>
                        {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                        Save
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function CallLogDialog({
    date,
    status,
    notes,
    onSave,
    isPending
}: {
    date?: string | null;
    status?: string | null;
    notes?: string | null;
    onSave: (date: string, status: string, notes: string) => Promise<void>;
    isPending: boolean;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [editDate, setEditDate] = useState<Date | null>(null);
    const [editStatus, setEditStatus] = useState("");
    const [editNotes, setEditNotes] = useState("");

    const hasData = !!date || !!status;

    const handleOpen = (open: boolean) => {
        if (open) {
            setEditDate(date ? new Date(date) : new Date());
            setEditStatus(status || "");
            setEditNotes(notes || "");
        }
        setIsOpen(open);
    };

    const handleSave = async () => {
        if (!editDate) return;
        await onSave(editDate.toISOString().split("T")[0], editStatus, editNotes);
        setIsOpen(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleOpen}>
            <DialogTrigger asChild>
                <button className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer",
                    hasData
                        ? "bg-blue-500/10 text-blue-700 ring-1 ring-blue-500/30"
                        : "bg-muted/50 text-muted-foreground ring-1 ring-border hover:ring-primary/30 hover:text-foreground"
                )}>
                    <Phone className="size-3.5 shrink-0" />
                    <span className="font-black truncate">{hasData ? (status || "Called") : "Log Call"}</span>
                    {hasData && notes && <MessageSquare className="size-3 opacity-50 shrink-0" />}
                </button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{hasData ? "Update" : "Log"} Call</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label>Date</Label>
                        <DatePicker value={editDate} onChange={(d) => setEditDate(d)} />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="call-status">Status</Label>
                        <Select value={editStatus} onValueChange={setEditStatus}>
                            <SelectTrigger id="call-status">
                                <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Connected">Connected</SelectItem>
                                <SelectItem value="Busy">Busy</SelectItem>
                                <SelectItem value="No Answer">No Answer</SelectItem>
                                <SelectItem value="Switched Off">Switched Off</SelectItem>
                                <SelectItem value="Call Later">Call Later</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="call-notes">Notes</Label>
                        <Textarea id="call-notes" placeholder="Enter call notes..." value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={3} />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                    <Button onClick={handleSave} disabled={isPending}>
                        {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                        Save
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function EscalationDialog({
    date,
    notes,
    onSave,
    isPending
}: {
    date?: string | null;
    notes?: string | null;
    onSave: (date: string, notes: string) => Promise<void>;
    isPending: boolean;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [editDate, setEditDate] = useState<Date | null>(null);
    const [editNotes, setEditNotes] = useState("");

    const hasData = !!date;

    const handleOpen = (open: boolean) => {
        if (open) {
            setEditDate(date ? new Date(date) : new Date());
            setEditNotes(notes || "");
        }
        setIsOpen(open);
    };

    const handleSave = async () => {
        if (!editDate) return;
        await onSave(editDate.toISOString().split("T")[0], editNotes);
        setIsOpen(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleOpen}>
            <DialogTrigger asChild>
                <button className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer",
                    hasData
                        ? "bg-rose-500/10 text-rose-700 ring-1 ring-rose-500/30"
                        : "bg-muted/50 text-muted-foreground ring-1 ring-border hover:ring-primary/30 hover:text-rose-600"
                )}>
                    <AlertTriangle className="size-3.5 shrink-0" />
                    <span className="font-black">Escalate</span>
                    {hasData && fmtDate(date) && (
                        <span className="text-xs opacity-70">{fmtDate(date)}</span>
                    )}
                </button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{hasData ? "Update" : "Add"} Escalation</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label>Date</Label>
                        <DatePicker value={editDate} onChange={(d) => setEditDate(d)} />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="esc-notes">Notes</Label>
                        <Textarea id="esc-notes" placeholder="Enter escalation notes..." value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={3} />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                    <Button onClick={handleSave} disabled={isPending}>
                        {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                        Save
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function OrderManagementConsole({
    selected,
    onClose,
}: {
    selected: OrderRow | null;
    onClose: () => void;
}) {
    const { updateOrder } = useOrderMutations();

    if (!selected) {
        return (
            <Card className="flex-1 min-h-[180px] border-2 border-dashed border-border/60 rounded-2xl bg-muted/5 flex items-center justify-center">
                <div className="text-center space-y-2 opacity-40">
                    <div className="size-10 bg-muted rounded-full flex items-center justify-center mx-auto mb-2">
                        <User className="size-5" />
                    </div>
                    <p className="text-xs font-black uppercase tracking-[0.2em]">Select an order to manage</p>
                </div>
            </Card>
        );
    }

    const order = selected.order;
    const isReady = selected.showroomStatus.label === "ready_for_pickup";

    const handleUpdate = async (fields: any) => {
        try {
            await updateOrder.mutateAsync({
                orderId: order.id,
                fields
            });
            toast.success(`Order updated`);
        } catch (err) {
            toast.error(`Failed to update order`);
        }
    };

    return (
        <Card className="flex-1 border-2 border-primary/20 rounded-2xl bg-card shadow-md overflow-hidden flex flex-col transition-all">
            {/* Header */}
            <div className="bg-primary/5 px-4 py-2 border-b border-primary/10 flex justify-between items-center">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-black uppercase tracking-tighter">Order #{order.id}</span>
                    <Badge variant="outline" className="text-xs font-black uppercase h-4 px-1.5 shrink-0">{selected.customerName}</Badge>
                </div>
                <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0 ml-1"><XIcon className="size-3" /></button>
            </div>

            <div className="p-3 flex flex-col gap-2 flex-1">
                {/* Row 1: Reminders */}
                <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Reminders</span>
                <div className="flex flex-wrap gap-2 -mt-1">
                    {(['R1', 'R2', 'R3'] as const).map(type => {
                        const prefix = type.toLowerCase();
                        const dateKey = `${prefix}_date` as keyof typeof order;
                        const notesKey = `${prefix}_notes` as keyof typeof order;
                        const isDone = !!order[dateKey];
                        return (
                            <ReminderDialog
                                key={type}
                                type={type}
                                date={order[dateKey] as string | null}
                                notes={order[notesKey] as string | null}
                                isDone={isDone}
                                isPending={updateOrder.isPending}
                                onSave={async (date, notes) => {
                                    await handleUpdate({
                                        [`${prefix}_date`]: date,
                                        [`${prefix}_notes`]: notes,
                                    });
                                }}
                            />
                        );
                    })}
                </div>

                {/* Row 2: Call & Escalation */}
                <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Follow-ups</span>
                <div className="flex flex-wrap gap-2 -mt-1">
                    <CallLogDialog
                        date={order.call_reminder_date as string | null}
                        status={order.call_status as string | null}
                        notes={order.call_notes as string | null}
                        isPending={updateOrder.isPending}
                        onSave={async (date, status, notes) => {
                            await handleUpdate({
                                call_reminder_date: date,
                                call_status: status,
                                call_notes: notes,
                            });
                        }}
                    />
                    <EscalationDialog
                        date={order.escalation_date as string | null}
                        notes={order.escalation_notes as string | null}
                        isPending={updateOrder.isPending}
                        onSave={async (date, notes) => {
                            await handleUpdate({
                                escalation_date: date,
                                escalation_notes: notes,
                            });
                        }}
                    />
                </div>

                {/* Row 3: Actions */}
                <div className="flex gap-2 mt-auto">
                    <Button
                        asChild
                        size="sm"
                        className="flex-1 h-9 font-black uppercase tracking-wider text-xs rounded-lg shadow-sm"
                    >
                        <Link to="/$main/orders/order-management/feedback/$orderId" params={{ orderId: String(order.id) }}>
                            <ClipboardCheck className="size-3.5 mr-1.5" />
                            Feedback
                        </Link>
                    </Button>

                    <Button
                        size="sm"
                        disabled={!isReady}
                        variant={isReady ? "default" : "secondary"}
                        className={cn(
                            "flex-1 h-9 font-black uppercase tracking-wider text-xs rounded-lg shadow-sm",
                            isReady && "bg-primary hover:bg-primary/90 text-primary-foreground"
                        )}
                    >
                        <CheckCircle2 className="size-3.5 mr-1.5" />
                        {isReady ? "Complete & Deliver" : "Not Ready"}
                    </Button>
                </div>
            </div>
        </Card>
    );
}

const XIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
);

function RouteComponent() {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [selectedOrder, setSelectedOrder] = useState<OrderRow | null>(null);
  
  // Initial Filter State
  const [filters, setFilters] = useState<FilterState>({
    searchId: "",
    customer: "",
    stage: "all",
    reminderStatuses: [],
    deliveryDateStart: "",
    deliveryDateEnd: "",
    sortBy: "created_desc", 
  });
      
  const { data: orders = [], isLoading, isError, error } = useShowroomOrders();

  // Keep selectedOrder in sync with fresh query data
  useEffect(() => {
    if (selectedOrder && orders.length > 0) {
      const fresh = orders.find(o => o.orderId === selectedOrder.orderId);
      if (fresh) {
        setSelectedOrder(fresh);
      } else {
        setSelectedOrder(null);
      }
    }
  }, [orders]);

  const { stats } = useMemo(() => {
    const filtered = orders.filter((row) => {
      if (filters.searchId) {
        const searchLower = filters.searchId.toLowerCase();
        if (!(row.orderId || "").toLowerCase().includes(searchLower) && !String(row.fatoura || "").includes(searchLower)) return false;
      }
      if (filters.customer) {
        const searchLower = filters.customer.toLowerCase();
        if (!(row.customerName || "").toLowerCase().includes(searchLower) && !(row.customerNickName || "").toLowerCase().includes(searchLower) && !(row.mobileNumber || "").includes(searchLower)) return false;
      }
      if (filters.stage !== "all" && row.showroomStatus.label !== filters.stage) return false;
      if (filters.deliveryDateStart || filters.deliveryDateEnd) {
        if (!row.deliveryDate) return false;
        const time = new Date(row.deliveryDate).getTime();
        if (filters.deliveryDateStart && time < new Date(filters.deliveryDateStart).getTime()) return false;
        if (filters.deliveryDateEnd && time > new Date(filters.deliveryDateEnd).getTime() + 86400000) return false;
      }
      if (filters.reminderStatuses?.length > 0) {
        for (const status of filters.reminderStatuses) {
          const o = row.order;
          let match = false;
          switch (status) {
            case "r1_done": if (o.r1_date) match = true; break;
            case "r1_pending": if (!o.r1_date) match = true; break;
            case "r2_done": if (o.r2_date) match = true; break;
            case "r2_pending": if (!o.r2_date) match = true; break;
            case "r3_done": if (o.r3_date) match = true; break;
            case "r3_pending": if (!o.r3_date) match = true; break;
            case "call_done": if (o.call_status || o.call_reminder_date) match = true; break;
            case "escalated": if (o.escalation_date) match = true; break;
          }
          if (!match) return false;
        }
      }
      return true;
    });

    return {
      stats: {
        total: filtered.length,
        ready: filtered.filter(o => o.showroomStatus.label === "ready_for_pickup").length,
        brovaTrial: filtered.filter(o => o.showroomStatus.label === "brova_trial").length,
        needsAction: filtered.filter(o => o.showroomStatus.label === "needs_action").length,
        partialReady: filtered.filter(o => o.showroomStatus.label === "partial_ready").length,
        alterationIn: filtered.filter(o => o.showroomStatus.label === "alteration_in").length,
      }
    };
  }, [orders, filters]);
          
  return (
    <div className="p-4 md:p-5 max-w-[1600px] mx-auto space-y-3 animate-in fade-in zoom-in-95 duration-300">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-foreground tracking-tight">
            Orders at <span className="text-primary">Showroom</span>
          </h1>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest opacity-70">
            Operational Management & Inventory Tracking
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-3 items-stretch">
        {/* Filters */}
        <div className="md:col-span-1 lg:col-span-6 flex">
          <OrderFilters
            className="w-full"
            filters={filters}
            onFilterChange={(k, v) => setFilters(prev => ({ ...prev, [k]: v }))}
            onClearFilters={() => setFilters({ searchId: "", customer: "", stage: "all", reminderStatuses: [], deliveryDateStart: "", deliveryDateEnd: "", sortBy: "created_desc" })}
          />
        </div>

        {/* Management Card */}
        <div className="md:col-span-1 lg:col-span-4 flex">
          <OrderManagementConsole
            selected={selectedOrder}
            onClose={() => setSelectedOrder(null)}
          />
        </div>

        {/* Stats */}
        <div className="md:col-span-2 lg:col-span-2 grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-1 gap-2">
          <CompactStat label="Total" value={stats.total} icon={Store} color="bg-slate-500" />
          <CompactStat label="Trial" value={stats.brovaTrial + stats.alterationIn} icon={RefreshCw} color="bg-amber-500" />
          <CompactStat label="Action" value={stats.needsAction} icon={AlertCircle} color="bg-red-500" />
          <CompactStat label="Partial" value={stats.partialReady} icon={Package} color="bg-violet-500" />
          <CompactStat label="Ready" value={stats.ready} icon={CheckCircle} color="bg-primary" />
        </div>
      </div>

      <div className="space-y-3">
        {isLoading ? <TableSkeleton /> : isError ? (
          <Card className="border-destructive/20 bg-destructive/10 p-6 text-center rounded-[2rem]">
            <AlertTriangle className="size-10 text-destructive mx-auto mb-4 opacity-50" />
            <p className="text-destructive font-black uppercase tracking-widest">Connection Error</p>
            <p className="text-xs text-muted-foreground mt-2">{error instanceof Error ? error.message : "Failed to load data"}</p>
          </Card>
        ) : (
          <GarmentTableErrorBoundary>
            <OrderDataTable
              columns={orderColumns(setSelectedOrder)}
              data={orders}
              rowSelection={rowSelection}
              onRowSelectionChange={setRowSelection}
              filters={filters}
              selectedOrderId={selectedOrder?.order?.id}
            />
          </GarmentTableErrorBoundary>
        )}
      </div>
    </div>
  );
}

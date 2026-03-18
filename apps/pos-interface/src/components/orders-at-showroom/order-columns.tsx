import { type ColumnDef } from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { ChevronRight, Phone, AlertTriangle, MessageSquare, Truck, ClipboardCheck, Link as LinkIcon } from "lucide-react";
import type { OrderRow } from "./types";
import { Button } from "@/components/ui/button";
import { Settings2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
});

function formatDate(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return dateFormatter.format(parsed);
}

function getDaysOverdue(deliveryDate?: string | null): number {
  if (!deliveryDate) return 0;
  const delivery = new Date(deliveryDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  delivery.setHours(0, 0, 0, 0);
  const diff = Math.ceil((today.getTime() - delivery.getTime()) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : 0;
}

export const orderColumns = (onSelect: (row: OrderRow) => void): ColumnDef<OrderRow>[] => [
  {
    id: "select_action",
    header: "",
    size: 32,
    cell: ({ row }) => (
      <Button
        variant="ghost"
        size="sm"
        aria-label="Order options"
        onClick={(e) => {
          e.stopPropagation();
          onSelect(row.original);
        }}
        className="h-7 w-7 p-0 hover:bg-primary/10 hover:text-primary transition-colors"
      >
        <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
    ),
  },
  {
    accessorKey: "orderId",
    header: "Order",
    size: 65,
    cell: ({ row }) => {
      const linkedOrderId = (row.original.order as any).linked_order_id;
      return (
        <div className="flex flex-col">
          <div className="flex items-center gap-1">
            <span className="font-bold text-sm tracking-tighter">#{row.original.orderId}</span>
            {linkedOrderId && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-default text-blue-400 hover:text-blue-600 transition-colors">
                      <LinkIcon className="size-3" aria-hidden="true" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs font-bold">
                    Linked to Order #{linkedOrderId}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <span className="font-bold text-xs text-muted-foreground uppercase tracking-widest leading-none">
            {row.original.fatoura ? `INV ${row.original.fatoura}` : "—"}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: "customerName",
    header: "Customer",
    size: 115,
    cell: ({ row }) => {
      const nickName = row.original.customerNickName;
      const name = row.original.customerName;
      return (
        <div className="flex flex-col">
          <span className="font-bold text-xs uppercase tracking-tight truncate max-w-[130px]">
            {nickName || name}
          </span>
          {nickName && name !== nickName && (
            <span className="text-xs text-muted-foreground/60 truncate max-w-[130px]">{name}</span>
          )}
          <span className="text-xs font-mono text-muted-foreground">{row.original.mobileNumber}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "fatouraStage",
    header: "Status",
    size: 105,
    cell: ({ row }) => {
      const { showroomStatus, fatouraStage } = row.original;
      let label = fatouraStage || "—";
      let colorClass = "bg-muted text-muted-foreground";

      switch (showroomStatus.label) {
        case "alteration_in":
          label = "Alteration (In)";
          colorClass = "bg-blue-100 text-blue-700 border-blue-200";
          break;
        case "brova_trial":
          label = "Brova Trial";
          colorClass = "bg-amber-100 text-amber-700 border-amber-200";
          break;
        case "needs_action":
          label = "Needs Action";
          colorClass = "bg-red-100 text-red-700 border-red-200";
          break;
        case "awaiting_finals":
          label = "Awaiting Finals";
          colorClass = "bg-violet-100 text-violet-700 border-violet-200";
          break;
        case "partial_ready":
          label = "Partial Ready";
          colorClass = "bg-orange-100 text-orange-700 border-orange-200";
          break;
        case "ready_for_pickup":
          label = "Ready for Pickup";
          colorClass = "bg-emerald-100 text-emerald-700 border-emerald-200";
          break;
      }

      return (
        <span
          className={cn(
            "inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-bold uppercase tracking-tight whitespace-nowrap shadow-sm",
            colorClass
          )}
        >
          {label}
        </span>
      );
    },
  },
  {
    id: "dates",
    header: "Dates",
    size: 85,
    cell: ({ row }) => {
      const overdueDays = getDaysOverdue(row.original.deliveryDate);
      return (
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1">
            <span className="text-xs font-bold text-muted-foreground/60 uppercase">Order</span>
            <span className="text-xs font-bold tracking-tight">{formatDate(row.original.orderDate)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs font-bold text-muted-foreground/60 uppercase">Delivery</span>
            <span className={cn(
              "text-xs font-bold tracking-tight",
              overdueDays > 0 ? "text-rose-600" : "text-primary"
            )}>
              {formatDate(row.original.deliveryDate)}
            </span>
            {overdueDays > 0 && (
              <span className="text-xs font-bold text-rose-500 bg-rose-50 px-1 rounded">
                +{overdueDays}d
              </span>
            )}
          </div>
          {row.original.homeDelivery && (
            <div className="flex items-center gap-0.5 text-xs text-blue-600 font-bold">
              <Truck className="size-2.5" aria-hidden="true" />
              <span>Home</span>
            </div>
          )}
        </div>
      );
    },
  },
  {
    id: "garments_summary",
    header: "Garments",
    size: 90,
    cell: ({ row }) => {
      const garments = (row.original.order as any).garments || [];
      const total = garments.length;
      if (total === 0) return <span className="text-xs text-muted-foreground">—</span>;

      const atShop = garments.filter((g: any) => g.location === "shop" && g.piece_stage !== "completed").length;
      const brovas = garments.filter((g: any) => g.garment_type === "brova");
      const finals = garments.filter((g: any) => g.garment_type === "final");
      const brovasAtShop = brovas.filter((g: any) => g.location === "shop" && g.piece_stage !== "completed").length;
      const finalsAtShop = finals.filter((g: any) => g.location === "shop" && g.piece_stage !== "completed").length;

      return (
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center justify-center size-5 rounded text-xs font-bold border",
                atShop === total
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-primary/5 text-primary border-primary/10"
              )}
            >
              {atShop}/{total}
            </span>
            <span className="text-xs font-bold uppercase text-muted-foreground/60">at shop</span>
          </div>
          <div className="flex gap-2 pl-0.5">
            {brovas.length > 0 && (
              <span
                className={cn(
                  "text-xs font-bold uppercase",
                  brovasAtShop > 0 ? "text-amber-600" : "text-muted-foreground/30"
                )}
              >
                {brovasAtShop}B
              </span>
            )}
            {finals.length > 0 && (
              <span
                className={cn(
                  "text-xs font-bold uppercase",
                  finalsAtShop > 0 ? "text-emerald-600" : "text-muted-foreground/30"
                )}
              >
                {finalsAtShop}F
              </span>
            )}
          </div>
        </div>
      );
    },
  },
  {
    id: "reminders",
    header: "Follow-up",
    size: 100,
    cell: ({ row }) => {
      const order = row.original.order;
      const r1 = !!order.r1_date;
      const r2 = !!order.r2_date;
      const r3 = !!order.r3_date;
      const hasCall = !!order.call_reminder_date || !!order.call_status;
      const hasEsc = !!order.escalation_date;

      return (
        <TooltipProvider delayDuration={200}>
          <div className="flex flex-col gap-1">
            {/* R1 R2 R3 row */}
            <div className="flex items-center gap-1">
              {(["R1", "R2", "R3"] as const).map((label) => {
                const done = label === "R1" ? r1 : label === "R2" ? r2 : r3;
                const dateKey = `${label.toLowerCase()}_date` as keyof typeof order;
                const notesKey = `${label.toLowerCase()}_notes` as keyof typeof order;
                const dateVal = order[dateKey] as string | null | undefined;
                const notesVal = order[notesKey] as string | null | undefined;
                return (
                  <Tooltip key={label}>
                    <TooltipTrigger asChild>
                      <span
                        className={cn(
                          "inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-xs font-bold uppercase cursor-default",
                          done
                            ? "bg-emerald-500/15 text-emerald-700"
                            : "bg-muted/60 text-muted-foreground/40"
                        )}
                      >
                        <span className={cn("size-1 rounded-full", done ? "bg-emerald-500" : "bg-muted-foreground/30")} />
                        {label}
                        {done && notesVal && <MessageSquare className="size-2 opacity-60" aria-hidden="true" />}
                      </span>
                    </TooltipTrigger>
                    {done && (
                      <TooltipContent side="top" className="max-w-[180px] text-xs">
                        <p className="font-bold">{label}: {formatDate(dateVal)}</p>
                        {notesVal && <p className="text-muted-foreground mt-0.5 break-words">{notesVal}</p>}
                      </TooltipContent>
                    )}
                  </Tooltip>
                );
              })}
            </div>
            {/* Call + Escalation row */}
            <div className="flex items-center gap-1">
              {hasCall && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-xs font-bold bg-blue-500/10 text-blue-700 cursor-default">
                      <Phone className="size-2.5" aria-hidden="true" />
                      <span className="truncate max-w-[55px]">{(order.call_status as string) || "Called"}</span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[180px] text-xs">
                    <p className="font-bold">Call: {formatDate(order.call_reminder_date instanceof Date ? order.call_reminder_date.toISOString() : (order.call_reminder_date as string | null | undefined) ?? "")}</p>
                    <p>Status: {(order.call_status as string) || "—"}</p>
                    {order.call_notes && <p className="text-muted-foreground mt-0.5 break-words">{order.call_notes as string}</p>}
                  </TooltipContent>
                </Tooltip>
              )}
              {hasEsc && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-xs font-bold bg-rose-500/10 text-rose-700 cursor-default">
                      <AlertTriangle className="size-2.5" aria-hidden="true" />
                      Esc
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[180px] text-xs">
                    <p className="font-bold">Escalated: {formatDate(order.escalation_date instanceof Date ? order.escalation_date.toISOString() : (order.escalation_date as string | null | undefined) ?? "")}</p>
                    {order.escalation_notes && <p className="text-muted-foreground mt-0.5 break-words">{order.escalation_notes as string}</p>}
                  </TooltipContent>
                </Tooltip>
              )}
              {!hasCall && !hasEsc && (
                <span className="text-xs text-muted-foreground/30 font-bold">No follow-ups</span>
              )}
            </div>
          </div>
        </TooltipProvider>
      );
    },
  },
  {
    id: "financials",
    header: "Payment",
    size: 85,
    cell: ({ row }) => {
      const total = row.original.totalAmount;
      const advance = row.original.advance || 0;
      const balance = row.original.balance || 0;
      return (
        <div className="flex flex-col gap-0.5 tabular-nums">
          <span className="text-xs font-bold tracking-tighter">
            KD {total.toFixed(2)}
          </span>
          <div className="flex items-center gap-1">
            {advance > 0 && (
              <span className="text-xs font-bold text-muted-foreground">
                Adv: {advance.toFixed(1)}
              </span>
            )}
          </div>
          <span
            className={cn(
              "text-xs font-bold tracking-tight",
              balance > 0 ? "text-rose-600" : "text-emerald-600"
            )}
          >
            {balance > 0 ? `Bal: KD ${balance.toFixed(2)}` : "PAID"}
          </span>
        </div>
      );
    },
  },
  {
    id: "actions",
    header: "Actions",
    size: 65,
    cell: ({ row }) => {
      const status = row.original.showroomStatus.label;
      const hasShopItems = row.original.showroomStatus.hasPhysicalItems;
      const showFeedback = hasShopItems;
      const showDispatch = status === "needs_action";

      if (!showFeedback && !showDispatch) return null;

      return (
        <TooltipProvider delayDuration={200}>
          <div className="flex items-center gap-1">
            {showFeedback && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    asChild
                    className={cn(
                      "h-7 w-7 p-0 transition-colors",
                      status === "brova_trial"
                        ? "hover:bg-amber-100 hover:text-amber-700 text-amber-600"
                        : status === "ready_for_pickup"
                          ? "hover:bg-emerald-100 hover:text-emerald-700 text-emerald-600"
                          : "hover:bg-primary/10 hover:text-primary text-primary/60"
                    )}
                  >
                    <Link
                      to="/$main/orders/order-management/feedback/$orderId"
                      params={{ orderId: String(row.original.order.id) }}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={status === "brova_trial" ? "Brova feedback" : status === "alteration_in" ? "Alteration feedback" : "Final feedback"}
                    >
                      <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs font-bold">
                  {status === "brova_trial"
                    ? "Brova Feedback"
                    : status === "alteration_in"
                      ? "Alteration Feedback"
                      : "Final Feedback"}
                </TooltipContent>
              </Tooltip>
            )}
            {showDispatch && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    asChild
                    className="h-7 w-7 p-0 transition-colors hover:bg-red-100 hover:text-red-700 text-red-600"
                  >
                    <Link
                      to="/$main/orders/order-management/dispatch"
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Send back to workshop"
                    >
                      <Truck className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs font-bold">
                  Send Back to Workshop
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </TooltipProvider>
      );
    },
  },
  {
    id: "expander_arrow",
    header: "",
    size: 24,
    cell: ({ row }) => (
      <div className="flex items-center justify-center">
        <ChevronRight
          aria-hidden="true"
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground/40 transition-transform duration-300",
            row.getIsExpanded() && "rotate-90 text-primary"
          )}
        />
      </div>
    ),
  },
];

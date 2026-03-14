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
    size: 40,
    cell: ({ row }) => (
      <Button
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          onSelect(row.original);
        }}
        className="h-7 w-7 p-0 hover:bg-primary/10 hover:text-primary transition-colors"
      >
        <Settings2 className="h-3.5 w-3.5" />
      </Button>
    ),
  },
  {
    accessorKey: "orderId",
    header: "Order",
    size: 80,
    cell: ({ row }) => {
      const linkedOrderId = (row.original.order as any).linked_order_id;
      return (
        <div className="flex flex-col">
          <div className="flex items-center gap-1">
            <span className="font-black text-sm tracking-tighter">#{row.original.orderId}</span>
            {linkedOrderId && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-default text-blue-400 hover:text-blue-600 transition-colors">
                      <LinkIcon className="size-3" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs font-bold">
                    Linked to Order #{linkedOrderId}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <span className="font-bold text-[10px] text-muted-foreground uppercase tracking-widest leading-none">
            {row.original.fatoura ? `INV ${row.original.fatoura}` : "—"}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: "customerName",
    header: "Customer",
    size: 140,
    cell: ({ row }) => {
      const nickName = row.original.customerNickName;
      const name = row.original.customerName;
      return (
        <div className="flex flex-col">
          <span className="font-black text-xs uppercase tracking-tight truncate max-w-[130px]">
            {nickName || name}
          </span>
          {nickName && name !== nickName && (
            <span className="text-[10px] text-muted-foreground/60 truncate max-w-[130px]">{name}</span>
          )}
          <span className="text-[11px] font-mono text-muted-foreground">{row.original.mobileNumber}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "fatouraStage",
    header: "Status",
    size: 130,
    cell: ({ row }) => {
      const { showroomStatus, fatouraStage, maxTripNumber } = row.original;
      let label = fatouraStage || "—";
      let colorClass = "bg-muted text-muted-foreground";

      if (showroomStatus.isAlterationIn) {
        const count = (maxTripNumber || 1) - 2;
        const ordinal = count === 1 ? "1st" : count === 2 ? "2nd" : count === 3 ? "3rd" : `${count}th`;
        label = `${ordinal} Alteration (In)`;
        colorClass = "bg-blue-100 text-blue-700 border-blue-200";
      } else if (showroomStatus.isBrovaTrial) {
        label = "Brova Trial";
        colorClass = "bg-amber-100 text-amber-700 border-amber-200";
      } else if (showroomStatus.isPickupWaitingFinals) {
        label = "Brova Accepted · Waiting Finals";
        colorClass = "bg-violet-100 text-violet-700 border-violet-200";
      } else if (showroomStatus.isReadyForPickup) {
        label = "Ready for Pickup";
        colorClass = "bg-emerald-100 text-emerald-700 border-emerald-200";
      }

      return (
        <span
          className={cn(
            "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-black uppercase tracking-tight whitespace-nowrap shadow-sm",
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
    size: 100,
    cell: ({ row }) => {
      const overdueDays = getDaysOverdue(row.original.deliveryDate);
      return (
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-bold text-muted-foreground/60 uppercase">Order</span>
            <span className="text-xs font-bold tracking-tight">{formatDate(row.original.orderDate)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-bold text-muted-foreground/60 uppercase">Delivery</span>
            <span className={cn(
              "text-xs font-black tracking-tight",
              overdueDays > 0 ? "text-rose-600" : "text-primary"
            )}>
              {formatDate(row.original.deliveryDate)}
            </span>
            {overdueDays > 0 && (
              <span className="text-[10px] font-black text-rose-500 bg-rose-50 px-1 rounded">
                +{overdueDays}d
              </span>
            )}
          </div>
          {row.original.homeDelivery && (
            <div className="flex items-center gap-0.5 text-[10px] text-blue-600 font-bold">
              <Truck className="size-2.5" />
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
    size: 110,
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
                "inline-flex items-center justify-center size-5 rounded text-[11px] font-black border",
                atShop === total
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-primary/5 text-primary border-primary/10"
              )}
            >
              {atShop}/{total}
            </span>
            <span className="text-[10px] font-bold uppercase text-muted-foreground/60">at shop</span>
          </div>
          <div className="flex gap-2 pl-0.5">
            {brovas.length > 0 && (
              <span
                className={cn(
                  "text-[10px] font-bold uppercase",
                  brovasAtShop > 0 ? "text-amber-600" : "text-muted-foreground/30"
                )}
              >
                {brovasAtShop}B
              </span>
            )}
            {finals.length > 0 && (
              <span
                className={cn(
                  "text-[10px] font-bold uppercase",
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
    size: 120,
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
                          "inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-black uppercase cursor-default",
                          done
                            ? "bg-emerald-500/15 text-emerald-700"
                            : "bg-muted/60 text-muted-foreground/40"
                        )}
                      >
                        <span className={cn("size-1 rounded-full", done ? "bg-emerald-500" : "bg-muted-foreground/30")} />
                        {label}
                        {done && notesVal && <MessageSquare className="size-2 opacity-60" />}
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
                    <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-bold bg-blue-500/10 text-blue-700 cursor-default">
                      <Phone className="size-2.5" />
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
                    <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-bold bg-rose-500/10 text-rose-700 cursor-default">
                      <AlertTriangle className="size-2.5" />
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
                <span className="text-[10px] text-muted-foreground/30 font-bold">No follow-ups</span>
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
    size: 100,
    cell: ({ row }) => {
      const total = row.original.totalAmount;
      const advance = row.original.advance || 0;
      const balance = row.original.balance || 0;
      return (
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-black tracking-tighter">
            KD {total.toFixed(2)}
          </span>
          <div className="flex items-center gap-1">
            {advance > 0 && (
              <span className="text-[10px] font-bold text-muted-foreground">
                Adv: {advance.toFixed(1)}
              </span>
            )}
          </div>
          <span
            className={cn(
              "text-[11px] font-black tracking-tight",
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
    id: "feedback_action",
    header: "",
    size: 50,
    cell: ({ row }) => {
      const hasShopItems = row.original.showroomStatus.hasPhysicalItems;
      if (!hasShopItems) return null;
      return (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                asChild
                className={cn(
                  "h-7 w-7 p-0 transition-colors",
                  row.original.showroomStatus.isBrovaTrial
                    ? "hover:bg-amber-100 hover:text-amber-700 text-amber-600"
                    : row.original.showroomStatus.isReadyForPickup
                      ? "hover:bg-emerald-100 hover:text-emerald-700 text-emerald-600"
                      : "hover:bg-primary/10 hover:text-primary text-primary/60"
                )}
              >
                <Link
                  to="/$main/orders/order-management/feedback/$orderId"
                  params={{ orderId: String(row.original.order.id) }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <ClipboardCheck className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs font-bold">
              {row.original.showroomStatus.isBrovaTrial
                ? "Brova Feedback"
                : row.original.showroomStatus.isAlterationIn
                  ? "Alteration Feedback"
                  : "Final Feedback"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    },
  },
  {
    id: "expander_arrow",
    header: "",
    size: 30,
    cell: ({ row }) => (
      <div className="flex items-center justify-center">
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground/40 transition-transform duration-300",
            row.getIsExpanded() && "rotate-90 text-primary"
          )}
        />
      </div>
    ),
  },
];

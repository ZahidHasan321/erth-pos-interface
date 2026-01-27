import { type ColumnDef } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { ChevronRight, ChevronDown, Eye } from "lucide-react";
import type { OrderRow } from "./types";
import { CallCell, ReminderCell } from "./order-reminder-cells";
import { Link } from "@tanstack/react-router";


const dateFormatter = new Intl.DateTimeFormat("en-IN", { 
  day: "numeric", 
  month: "short" 
});

function formatDate(value?: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return dateFormatter.format(parsed);
}

export const orderColumns: ColumnDef<OrderRow>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        className="translate-y-0.5"
        checked={
          table.getIsAllPageRowsSelected()
            ? true
            : table.getIsSomePageRowsSelected()
              ? "indeterminate"
              : false
        }
        onCheckedChange={(value) =>
          table.toggleAllPageRowsSelected(Boolean(value))
        }
        aria-label="Select all orders"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        className="translate-y-0.5"
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
        aria-label={`Select order ${row.original.orderId}`}
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    id: "expander",
    header: "",
    cell: ({ row }) => (
      <button
        onClick={() => row.toggleExpanded()}
        className="p-1 hover:bg-muted rounded transition-colors"
      >
        {row.getIsExpanded() ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </button>
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "orderId",
    header: "Order ID",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.orderId}</span>
    ),
  },
  {
    accessorKey: "customerName",
    header: "Customer",
    cell: ({ row }) => {
      const nickName = row.original.customerNickName;
      const name = row.original.customerName;
      return (
        <div className="flex flex-col">
          <span className="font-medium text-xs sm:text-sm truncate max-w-[120px]">{nickName || name}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "mobileNumber",
    header: "Mobile",
    cell: ({ row }) => (
      <span className="text-xs font-mono">{row.original.mobileNumber}</span>
    ),
  },
  {
    accessorKey: "orderStatus",
    header: "Status",
    cell: ({ row }) => {
      const status = row.original.orderStatus;
      const colorMap = {
        Pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
        Completed: "bg-green-100 text-green-700 border-green-200",
        Cancelled: "bg-red-100 text-red-700 border-red-200",
      };
      const color = colorMap[status];

      return (
        <span
          className={cn(
            "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
            color
          )}
        >
          {status}
        </span>
      );
    },
  },
  {
    accessorKey: "fatouraStage",
    header: "Order Stage",
    cell: ({ row }) => (
      <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-gray-500/10 whitespace-nowrap">
        {row.original.order.fields.FatouraStages || "—"}
      </span>
    ),
  },
  {
    accessorKey: "fatoura",
    header: "Fatoura",
    cell: ({ row }) => (
      <span className="font-mono text-xs text-muted-foreground">{row.original.fatoura || "—"}</span>
    ),
  },
  {
    accessorKey: "deliveryDate",
    header: "Delivery",
    cell: ({ row }) => (
      <span className="text-xs whitespace-nowrap">{formatDate(row.original.deliveryDate)}</span>
    ),
  },
  // --- FINANCIALS ---
  {
    accessorKey: "totalAmount",
    header: "Total",
    cell: ({ row }) => (
      <span className="text-xs">
        {row.original.totalAmount.toFixed(2)}
      </span>
    ),
  },
  {
    id: "paid",
    header: "Paid",
    cell: ({ row }) => {
      const paid = row.original.order.fields.Paid || (row.original.totalAmount - (row.original.balance || 0));
      return (
        <span className="text-xs text-muted-foreground">
          {paid.toFixed(2)}
        </span>
      );
    },
  },
  {
    accessorKey: "balance",
    header: "Payment Remaining",
    cell: ({ row }) => {
      const balance = row.original.balance || 0;
      return (
        <span className={cn("text-xs font-semibold", balance > 0 ? "text-red-600" : "text-green-600")}>
          {balance.toFixed(2)}
        </span>
      );
    },
  },
  // --- INTERACTIVE REMINDERS ---
  {
    id: "R1",
    header: "R1",
    cell: ({ row }) => (
      <ReminderCell 
        orderId={row.original.order.id}
        type="R1"
        date={row.original.order.fields.R1Date}
        note={row.original.order.fields.R1Notes}
        colorClass="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
      />
    ),
  },
  {
    id: "R2",
    header: "R2",
    cell: ({ row }) => (
      <ReminderCell 
        orderId={row.original.order.id}
        type="R2"
        date={row.original.order.fields.R2Date}
        note={row.original.order.fields.R2Notes}
        colorClass="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
      />
    ),
  },
  {
    id: "R3",
    header: "R3",
    cell: ({ row }) => (
      <ReminderCell 
        orderId={row.original.order.id}
        type="R3"
        date={row.original.order.fields.R3Date}
        note={row.original.order.fields.R3Notes}
        colorClass="text-purple-600 hover:text-purple-700 hover:bg-purple-50"
      />
    ),
  },
  {
    id: "Call",
    header: "Call",
    cell: ({ row }) => (
      <CallCell 
        orderId={row.original.order.id}
        date={row.original.order.fields.CallReminderDate}
        status={row.original.order.fields.CallStatus}
        note={row.original.order.fields.CallNotes}
      />
    ),
  },
  {
    id: "Escalation",
    header: "Escalated",
    cell: ({ row }) => (
      <ReminderCell 
        orderId={row.original.order.id}
        type="Escalation"
        date={row.original.order.fields.EscalationDate}
        note={row.original.order.fields.EscalationNotes}
        colorClass="text-destructive hover:text-destructive hover:bg-destructive/10"
      />
    ),
  },
  {
    id: "open",
    header: "",
    cell: ({ row }) => {
      const order = row.original;
      const routeMap = {
        WORK: "/$main/orders/new-work-order",
        SALES: "/$main/orders/new-sales-order",
      };
      const to = routeMap[order.orderType as keyof typeof routeMap] || "/$main/orders/new-work-order";
      
      return (
        <Link 
          to={to} 
          search={{ orderId: Number(order.orderId) }}
          className="p-2 hover:bg-muted rounded-full transition-colors flex items-center justify-center"
          title="Open Order"
        >
          <Eye className="h-4 w-4 text-primary" />
        </Link>
      );
    },
  },
];
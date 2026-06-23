import * as React from "react";
import { cn, getLocalDateStr, TIMEZONE } from "@/lib/utils";
import { Badge } from "@repo/ui/badge";
import { Input } from "@repo/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/select";
import { getEmployeeColor, APPOINTMENT_STATUS_LABELS } from "@/lib/constants";
import { formatTime24to12 } from "./time-picker";
import type { AppointmentWithRelations } from "@/api/appointments";
import type { Appointment } from "@repo/database";
import { Search } from "lucide-react";

interface AllBrandsListProps {
  appointments: AppointmentWithRelations[];
  isLoading?: boolean;
  onStatusChange: (id: string, status: Appointment["status"]) => void;
  isUpdating?: boolean;
}

const STATUS_OPTIONS = Object.entries(APPOINTMENT_STATUS_LABELS) as [
  Appointment["status"],
  string,
][];

function statusBadgeVariant(status: string) {
  switch (status) {
    case "scheduled": return "default";
    case "completed": return "secondary";
    case "cancelled": return "outline";
    case "no_show": return "destructive";
    default: return "default";
  }
}

export function AllBrandsList({
  appointments,
  isLoading,
  onStatusChange,
  isUpdating,
}: AllBrandsListProps) {
  const [search, setSearch] = React.useState("");

  const todayStr = getLocalDateStr();

  const filtered = React.useMemo(() => {
    const sorted = [...appointments].sort((a, b) =>
      a.appointment_date.localeCompare(b.appointment_date) ||
      a.start_time.localeCompare(b.start_time),
    );

    if (!search.trim()) return sorted;

    const q = search.toLowerCase().trim();
    return sorted.filter(
      (a) =>
        a.customer_name.toLowerCase().includes(q) ||
        a.customer_phone.includes(q) ||
        (a.brand ?? "").toLowerCase().includes(q) ||
        (a.notes ?? "").toLowerCase().includes(q),
    );
  }, [appointments, search]);

  return (
    <div className="flex flex-col h-full border rounded-lg bg-muted overflow-hidden relative">
      {isLoading && (
        <div className="absolute top-0 left-0 right-0 z-50 h-0.5 bg-muted overflow-hidden">
          <div className="h-full bg-primary animate-[loading_1.5s_ease-in-out_infinite] w-1/3" />
        </div>
      )}

      {/* Search bar */}
      <div className="px-3 py-2.5 border-b bg-muted/30 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone, brand, or notes..."
            className="pl-8 h-8 text-sm bg-background"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <p className="text-sm">
              {search ? "No matching appointments" : "No appointments this month"}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted border-b text-xs text-muted-foreground uppercase tracking-widest">
                <th className="text-left font-semibold px-3 py-2.5">Date</th>
                <th className="text-left font-semibold px-3 py-2.5">Time</th>
                <th className="text-left font-semibold px-3 py-2.5">Customer</th>
                <th className="text-left font-semibold px-3 py-2.5 hidden sm:table-cell">Phone</th>
                <th className="text-left font-semibold px-3 py-2.5">Brand</th>
                <th className="text-left font-semibold px-3 py-2.5 hidden md:table-cell">Notes</th>
                <th className="text-left font-semibold px-3 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((apt) => {
                const color = getEmployeeColor(apt.assigned_to);
                const date = new Date(apt.appointment_date + "T12:00:00+03:00");
                const isPast = apt.appointment_date < todayStr;
                const isOverdue = isPast && apt.status === "scheduled";

                return (
                  <tr
                    key={apt.id}
                    className={cn(
                      "bg-background transition-colors",
                      apt.status === "cancelled" && "opacity-50",
                      apt.status === "completed" && "opacity-60",
                    )}
                  >
                    <td className="px-3 py-2.5 whitespace-nowrap font-bold">
                      {date.toLocaleDateString("en-GB", { timeZone: TIMEZONE, weekday: "short", day: "numeric", month: "short" })}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-bold">
                      {formatTime24to12(apt.start_time)} – {formatTime24to12(apt.end_time)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className={cn("w-2 h-2 rounded-full shrink-0", color.dot)} />
                        <span
                          className={cn(
                            "font-bold truncate max-w-[160px]",
                            apt.status === "cancelled" && "line-through",
                          )}
                        >
                          {apt.customer_name}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 hidden sm:table-cell font-bold whitespace-nowrap">
                      {apt.customer_phone}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant="outline" className="text-[11px] font-bold uppercase px-1.5 py-0">
                        {apt.brand}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 hidden md:table-cell font-medium text-muted-foreground truncate max-w-[220px]">
                      {apt.notes || "-"}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Select
                          value={apt.status}
                          onValueChange={(v) => onStatusChange(apt.id, v as Appointment["status"])}
                          disabled={isUpdating}
                        >
                          <SelectTrigger className="h-7 w-[140px] text-xs bg-background">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map(([value, label]) => (
                              <SelectItem key={value} value={value} className="text-xs">
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {isOverdue && (
                          <Badge
                            variant={statusBadgeVariant(apt.status)}
                            className="text-[11px] font-bold px-1.5 py-0 bg-amber-100 text-amber-800 border-amber-200"
                          >
                            Overdue
                          </Badge>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer summary */}
      <div className="px-4 py-2 border-t bg-muted/30 shrink-0 flex items-center justify-between text-xs font-semibold text-muted-foreground">
        <span>{filtered.length} appointment{filtered.length !== 1 ? "s" : ""}</span>
        <div className="flex items-center gap-3">
          <span>{filtered.filter((a) => a.status === "scheduled").length} scheduled</span>
          <span>{filtered.filter((a) => a.status === "completed").length} completed</span>
        </div>
      </div>
    </div>
  );
}

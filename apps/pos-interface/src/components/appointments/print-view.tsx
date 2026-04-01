import { useRef } from "react";
import { format } from "date-fns";
import { formatTime24to12 } from "./time-picker";
import type { AppointmentWithRelations } from "@/api/appointments";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/constants";

type PrintViewProps =
  | { mode: "day"; appointments: AppointmentWithRelations[]; currentDate: Date }
  | { mode: "month"; appointments: AppointmentWithRelations[]; currentMonth: Date };

export function usePrint() {
  const printRef = useRef<HTMLDivElement>(null);

  function triggerPrint() {
    if (!printRef.current) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title> </title>
        <style>
          @page { margin: 10mm; size: A4 landscape; }
          @media print {
            body { padding: 0; width: 100%; }
          }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: "Courier New", Courier, monospace; padding: 20px; color: #000; font-size: 11px; width: 277mm; }
          h1 { font-size: 14px; margin-bottom: 2px; font-weight: bold; }
          .subtitle { color: #000; font-size: 11px; margin-bottom: 12px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; border: 1px solid #000; }
          th { text-align: left; padding: 4px 6px; border: 1px solid #000; font-size: 10px; font-weight: bold; background: #eee; }
          td { padding: 4px 6px; border: 1px solid #000; vertical-align: top; }
          .capitalize { text-transform: capitalize; }
        </style>
      </head>
      <body>
        ${printRef.current.innerHTML}
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  }

  return { printRef, triggerPrint };
}

export function PrintView(props: PrintViewProps) {
  const { mode, appointments } = props;

  const sorted = [...appointments].sort((a, b) =>
    a.appointment_date.localeCompare(b.appointment_date) || a.start_time.localeCompare(b.start_time),
  );

  if (mode === "day") {
    const { currentDate } = props;
    const dayAppts = sorted.filter(
      (a) => a.appointment_date === format(currentDate, "yyyy-MM-dd"),
    );
    return (
      <div>
        <h1>Appointments — {format(currentDate, "EEEE, d MMMM yyyy")}</h1>
        <div className="subtitle">{dayAppts.length} appointment{dayAppts.length !== 1 ? "s" : ""}</div>
        <AppointmentTable appointments={dayAppts} showDate={false} />
      </div>
    );
  }

  // Month view
  const { currentMonth } = props;
  const monthLabel = format(currentMonth, "MMMM yyyy");

  return (
    <div>
      <h1>Appointments — {monthLabel}</h1>
      <div className="subtitle">{sorted.length} appointment{sorted.length !== 1 ? "s" : ""}</div>
      <AppointmentTable appointments={sorted} showDate />
    </div>
  );
}

function AppointmentTable({
  appointments,
  showDate,
}: {
  appointments: AppointmentWithRelations[];
  showDate: boolean;
}) {
  return (
    <table>
      <thead>
        <tr>
          {showDate && <th>Date</th>}
          <th>Time</th>
          <th>Customer</th>
          <th>Phone</th>
          <th>Area</th>
          <th>People</th>
          <th>Pieces</th>
          <th>Fabric</th>
          <th>Assigned To</th>
          <th>Status</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        {appointments.map((apt) => (
          <tr key={apt.id}>
            {showDate && (
              <td>{format(new Date(apt.appointment_date + "T00:00:00"), "EEE d MMM")}</td>
            )}
            <td style={{ whiteSpace: "nowrap" }}>
              {formatTime24to12(apt.start_time)} – {formatTime24to12(apt.end_time)}
            </td>
            <td style={{ fontWeight: 500 }}>{apt.customer_name}</td>
            <td>{apt.customer_phone}</td>
            <td>{apt.area || "—"}</td>
            <td>{apt.people_count ?? "—"}</td>
            <td>{apt.estimated_pieces ?? "—"}</td>
            <td className="capitalize">{apt.fabric_type ?? "—"}</td>
            <td>{apt.assignee?.name ?? "—"}</td>
            <td>{APPOINTMENT_STATUS_LABELS[apt.status]}</td>
            <td>{apt.notes || ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

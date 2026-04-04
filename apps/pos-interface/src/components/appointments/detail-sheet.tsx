import { toast } from "sonner";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
} from "@repo/ui/dialog";
import { Button } from "@repo/ui/button";
import { Badge } from "@repo/ui/badge";
import { useUpdateAppointment } from "@/hooks/useAppointments";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/constants";
import { formatTime24to12 } from "./time-picker";
import type { AppointmentWithRelations } from "@/api/appointments";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  User,
  Phone,
  MapPin,
  Calendar,
  Clock,
  UserCheck,
  BookOpen,
  StickyNote,
  Check,
  X,
  Ban,
  Pencil,
  Link2,
  Timer,
  Users,
  Shirt,
  ShoppingBag,
} from "lucide-react";

interface DetailSheetProps {
  appointment: AppointmentWithRelations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (appointment: AppointmentWithRelations) => void;
}

function statusBadgeVariant(status: string) {
  switch (status) {
    case "scheduled": return "default";
    case "completed": return "secondary";
    case "cancelled": return "outline";
    case "no_show": return "destructive";
    default: return "default";
  }
}

function getDuration(start: string, end: string): string {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const totalMin = (eh * 60 + em) - (sh * 60 + sm);
  if (totalMin <= 0) return "";
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}hr`;
  return `${h}hr ${m}min`;
}

export function DetailSheet({
  appointment,
  open,
  onOpenChange,
  onEdit,
}: DetailSheetProps) {
  const navigate = useNavigate();
  const { main } = useParams({ strict: false }) as { main: string };
  const updateMutation = useUpdateAppointment();

  if (!appointment) return null;

  const addressParts = [
    appointment.area,
    appointment.block && `Block ${appointment.block}`,
    appointment.street && `Street ${appointment.street}`,
    appointment.house_no && `House ${appointment.house_no}`,
  ].filter(Boolean);

  const addressLine = addressParts.join(", ");
  const hasAddress = addressLine.length > 0 || !!appointment.city;

  async function handleStatusChange(status: "completed" | "cancelled" | "no_show") {
    const res = await updateMutation.mutateAsync({
      id: appointment!.id,
      updates: { status },
    });
    if (res.status === "success") {
      onOpenChange(false);
    } else {
      toast.error(res.message ?? "Failed to update");
    }
  }

  const isScheduled = appointment.status === "scheduled";
  const dateStr = format(new Date(appointment.appointment_date + "T00:00:00"), "EEEE, d MMMM yyyy");
  const duration = getDuration(appointment.start_time, appointment.end_time);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-md w-full max-h-[90dvh] p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b bg-muted/30">
          <div className="flex items-center gap-2.5">
            <h2 className="text-sm font-semibold">Appointment</h2>
            <Badge variant={statusBadgeVariant(appointment.status)} className="text-[10px]">
              {APPOINTMENT_STATUS_LABELS[appointment.status]}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5">
            {isScheduled && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onEdit(appointment)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-0 max-h-[70dvh] overflow-y-auto">
          {/* Customer */}
          <div className="px-5 py-4 space-y-2.5">
            <DetailRow icon={User} label={appointment.customer_name} bold />
            <DetailRow
              icon={Phone}
              label={
                <a href={`tel:${appointment.customer_phone}`} className="text-primary hover:underline">
                  {appointment.customer_phone}
                </a>
              }
            />
          </div>

          <Divider />

          {/* Schedule */}
          <div className="px-5 py-4 space-y-2.5">
            <DetailRow icon={Calendar} label={dateStr} />
            <DetailRow
              icon={Clock}
              label={
                <span className="flex items-center gap-2">
                  {formatTime24to12(appointment.start_time)} &rarr; {formatTime24to12(appointment.end_time)}
                  {duration && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                      <Timer className="h-3 w-3" />
                      {duration}
                    </span>
                  )}
                </span>
              }
            />
          </div>

          {/* Estimate */}
          {(appointment.people_count || appointment.estimated_pieces || appointment.fabric_type) && (
            <>
              <Divider />
              <div className="px-5 py-4 space-y-2.5">
                {appointment.people_count && (
                  <DetailRow icon={Users} label={<><span className="text-muted-foreground">People:</span> <span className="font-medium">{appointment.people_count}</span></>} />
                )}
                {appointment.estimated_pieces && (
                  <DetailRow icon={Shirt} label={<><span className="text-muted-foreground">Pieces:</span> <span className="font-medium">{appointment.estimated_pieces}</span></>} />
                )}
                {appointment.fabric_type && (
                  <DetailRow icon={Shirt} label={<><span className="text-muted-foreground">Fabric:</span> <span className="font-medium capitalize">{appointment.fabric_type}</span></>} />
                )}
              </div>
            </>
          )}

          <Divider />

          {/* Address */}
          <div className="px-5 py-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Address</span>
              {isScheduled && (
                <button
                  type="button"
                  className="text-[10px] text-primary hover:underline cursor-pointer"
                  onClick={() => onEdit(appointment)}
                >
                  {hasAddress ? "Edit" : "Add address"}
                </button>
              )}
            </div>
            {hasAddress ? (
              <DetailRow
                icon={MapPin}
                label={
                  <div>
                    {addressLine && <div>{addressLine}</div>}
                    {appointment.city && (
                      <div className="text-muted-foreground text-xs mt-0.5">{appointment.city}</div>
                    )}
                    {appointment.address_note && (
                      <div className="text-muted-foreground text-xs mt-0.5 italic">{appointment.address_note}</div>
                    )}
                  </div>
                }
              />
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4 shrink-0 opacity-40" />
                <span className="italic text-xs">No address yet</span>
              </div>
            )}
          </div>

          <Divider />

          {/* Staff */}
          <div className="px-5 py-4 space-y-2.5">
            <DetailRow
              icon={UserCheck}
              label={<><span className="text-muted-foreground">Assigned:</span> <span className="font-medium">{appointment.assignee?.name ?? "—"}</span></>}
            />
            <DetailRow
              icon={BookOpen}
              label={<><span className="text-muted-foreground">Booked by:</span> {appointment.booker?.name ?? "—"}</>}
            />
          </div>

          {/* Notes */}
          {appointment.notes && (
            <>
              <Divider />
              <div className="px-5 py-4">
                <DetailRow icon={StickyNote} label={<span className="text-muted-foreground">{appointment.notes}</span>} />
              </div>
            </>
          )}

          {/* Linked Order */}
          {appointment.order_id && (
            <>
              <Divider />
              <div className="px-5 py-4">
                <DetailRow
                  icon={Link2}
                  label={<><span className="text-muted-foreground">Linked Order:</span> <span className="font-medium">#{appointment.order_id}</span></>}
                />
              </div>
            </>
          )}

          {/* Actions */}
          {isScheduled && (
            <>
              <Divider />
              <div className="px-5 py-4 space-y-2.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</span>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                    disabled={updateMutation.isPending}
                    onClick={() => handleStatusChange("completed")}
                  >
                    <Check className="h-3.5 w-3.5 mr-1" />
                    Completed
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-red-200 text-red-700 hover:bg-red-50"
                    disabled={updateMutation.isPending}
                    onClick={() => handleStatusChange("cancelled")}
                  >
                    <X className="h-3.5 w-3.5 mr-1" />
                    Cancel
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-amber-200 text-amber-700 hover:bg-amber-50"
                    disabled={updateMutation.isPending}
                    onClick={() => handleStatusChange("no_show")}
                  >
                    <Ban className="h-3.5 w-3.5 mr-1" />
                    No Show
                  </Button>
                  {!appointment.order_id && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        onOpenChange(false);
                        navigate({
                          to: "/$main/orders/new-work-order",
                          params: { main },
                          search: { appointmentId: appointment.id },
                        });
                      }}
                    >
                      <ShoppingBag className="h-3.5 w-3.5 mr-1" />
                      Start Order
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ icon: Icon, label, bold }: { icon: React.ElementType; label: React.ReactNode; bold?: boolean }) {
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
      <span className={bold ? "font-medium" : ""}>{label}</span>
    </div>
  );
}

function Divider() {
  return <div className="border-t mx-5" />;
}

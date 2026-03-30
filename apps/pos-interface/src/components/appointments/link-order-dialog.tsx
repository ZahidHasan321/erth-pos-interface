import * as React from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useUpdateAppointment } from "@/hooks/useAppointments";
import type { AppointmentWithRelations } from "@/api/appointments";

interface LinkOrderDialogProps {
  appointment: AppointmentWithRelations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LinkOrderDialog({
  appointment,
  open,
  onOpenChange,
}: LinkOrderDialogProps) {
  const [orderId, setOrderId] = React.useState("");
  const updateMutation = useUpdateAppointment();

  async function handleLink() {
    if (!appointment || !orderId) return;
    const id = parseInt(orderId, 10);
    if (isNaN(id)) {
      toast.error("Please enter a valid order ID");
      return;
    }
    const res = await updateMutation.mutateAsync({
      id: appointment.id,
      updates: { order_id: id },
    });
    if (res.status === "success") {
      toast.success(`Linked to Order #${id}`);
      onOpenChange(false);
      setOrderId("");
    } else {
      toast.error(res.message ?? "Failed to link");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Link to Order</DialogTitle>
          <DialogDescription>
            Enter the order ID to link this appointment to.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            placeholder="Order ID (e.g. 245)"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            type="number"
          />
          <Button
            onClick={handleLink}
            disabled={!orderId || updateMutation.isPending}
          >
            {updateMutation.isPending ? "Linking..." : "Link"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

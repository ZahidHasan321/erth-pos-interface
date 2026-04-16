import { useState } from "react";
import { DatePicker } from "@repo/ui/date-picker";
import { ConfirmationDialog } from "@repo/ui/confirmation-dialog";
import { formatDate } from "@/lib/utils";

interface Props {
  value: Date | string | null | undefined;
  onConfirm: (date: Date) => void | Promise<void>;
  /** Label used in the confirmation dialog (e.g. "garment delivery date"). */
  label?: string;
  /** Extra sentence appended to the default description. */
  extraDescription?: string;
  className?: string;
  displayFormat?: string;
  disabled?: boolean;
}

export function ConfirmedDatePicker({
  value,
  onConfirm,
  label = "delivery date",
  extraDescription,
  className,
  displayFormat,
  disabled,
}: Props) {
  const [pending, setPending] = useState<Date | null>(null);

  const currentStr = value ? formatDate(typeof value === "string" ? value : value.toISOString()) : "—";
  const nextStr = pending ? formatDate(pending.toISOString()) : "";

  return (
    <>
      <DatePicker
        value={value}
        onChange={(d) => {
          if (d) setPending(d);
        }}
        className={className}
        displayFormat={displayFormat}
        disabled={disabled}
      />
      <ConfirmationDialog
        isOpen={!!pending}
        onClose={() => setPending(null)}
        onConfirm={() => {
          const d = pending;
          setPending(null);
          if (d) {
            // Fire-and-forget — mutation hook surfaces errors via toast.
            void Promise.resolve(onConfirm(d));
          }
        }}
        title={`Change ${label}?`}
        description={`${currentStr} → ${nextStr}.${extraDescription ? " " + extraDescription : ""}`}
        confirmText="Change"
      />
    </>
  );
}

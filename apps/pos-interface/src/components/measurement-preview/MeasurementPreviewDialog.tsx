import type { ReactNode } from "react";
import { Eye } from "lucide-react";
import { Button } from "@repo/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/dialog";
import {
  MeasurementTerminalPreview,
  type MeasurementTerminalPreviewProps,
} from "./MeasurementTerminalPreview";

interface MeasurementPreviewDialogProps extends MeasurementTerminalPreviewProps {
  /** Custom trigger; defaults to a "Preview" outline button. */
  trigger?: ReactNode;
  title?: string;
  description?: string;
  /**
   * Controlled open state. Use when the trigger must capture a value snapshot
   * on click (e.g. live form values); pass `trigger={null}` to suppress the
   * built-in trigger. Omit for an uncontrolled "Preview" button.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * "Preview" button that opens the terminal-style measurement preview in a
 * dialog. Read-only — previewing never saves.
 */
export function MeasurementPreviewDialog({
  trigger,
  title = "Measurement Preview",
  description,
  open,
  onOpenChange,
  ...previewProps
}: MeasurementPreviewDialogProps) {
  const resolvedDescription =
    description ??
    (previewProps.changedKeys
      ? "The measurements being corrected, shown as on the terminal."
      : "The measurements as they appear on the terminal.");

  const controlled = open !== undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {!controlled && (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button type="button" variant="outline" size="sm">
              <Eye className="size-4" />
              Preview
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[90vh] sm:max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{resolvedDescription}</DialogDescription>
        </DialogHeader>
        <MeasurementTerminalPreview {...previewProps} />
      </DialogContent>
    </Dialog>
  );
}

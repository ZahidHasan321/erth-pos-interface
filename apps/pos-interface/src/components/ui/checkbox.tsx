import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { CheckIcon } from "lucide-react";

import { cn } from "@/lib/utils";

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        // Base layout
        "peer size-4 shrink-0 rounded-[4px] border shadow-xs outline-none transition-colors duration-150",
        // Base colors
        "border-border bg-background text-foreground dark:bg-input/30",
        // Checked state: brighter green, accessible contrast
        "data-[state=checked]:bg-[oklch(0.42_0.12_170)] data-[state=checked]:border-[oklch(0.42_0.12_170)] data-[state=checked]:text-primary-foreground",
        // Hover and focus ring
        "hover:border-[oklch(0.42_0.12_170)] hover:cursor-pointer focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring",
        // Error and disabled states
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current transition-none"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };


// ── Workshop-scoped table primitives ────────────────────────────────────────
// The shared @repo/ui/table is tuned for the shop app (rounded-xl + shadow,
// uppercase tracking-wider headers). The workshop design language (CLAUDE.md §6)
// wants rounded-md, no shadow, and sentence-case medium-muted headers.
//
// We re-export the shared primitives unchanged except for TableContainer and
// TableHead, where we prepend §6-compliant classes. Because cn() runs through
// tailwind-merge, these win over the shared baked-in defaults without touching
// the shared file — so the shop app renders byte-for-byte as before.
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableContainer as UiTableContainer,
  TableFooter,
  TableHead as UiTableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/table";
import { cn } from "@/lib/utils";
import * as React from "react";

function TableContainer({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <UiTableContainer
      className={cn("rounded-md shadow-none", className)}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <UiTableHead
      className={cn(
        "text-sm font-medium normal-case tracking-normal text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
};

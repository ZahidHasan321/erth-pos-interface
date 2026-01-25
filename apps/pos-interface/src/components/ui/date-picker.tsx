"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export interface DatePickerProps {
  value: Date | null | undefined;
  placeholder?: string;
  onChange: (value: Date | null) => void;
  [key: string]: any;
}

export function DatePicker({
  value,
  onChange,
  placeholder,
  ...props
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={"outline"}
          className={cn(
            "w-full justify-start text-left font-normal",
            !value && "text-muted-foreground border-foreground/20",
            value ? "bg-white" : "bg-transparent"
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? (
            format(value, "PPP")
          ) : (
            <span>{placeholder ?? "Pick a date"}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          selected={value ?? undefined}
          onSelect={(date) => {
            onChange(date ?? null);
            setOpen(false);
          }}
          autoFocus
          captionLayout="dropdown"
          startMonth={new Date(1950, 0)} // Jan 1950
          endMonth={new Date(2035, 11)} // Dec 2035
          {...props}
        />
      </PopoverContent>
    </Popover>
  );
}

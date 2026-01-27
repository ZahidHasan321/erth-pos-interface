"use client";

import * as React from "react";
import { CalendarIcon, X } from "lucide-react";
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
  className?: string;
  calendarProps?: React.ComponentProps<typeof Calendar>;
  clearable?: boolean;
  disabled?: boolean;
}

export function DatePicker({
  value,
  onChange,
  placeholder,
  className,
  calendarProps,
  clearable = false,
  disabled = false,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="relative w-full">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={"outline"}
            className={cn(
              "w-full justify-start text-left font-normal",
              !value && "text-muted-foreground border-foreground/20",
              value ? "bg-white" : "bg-transparent",
              clearable && value && "pr-10",
              className
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
        <PopoverContent className="w-auto p-0 bg-white" align="start">
          <Calendar
            {...calendarProps}
            mode="single"
            selected={value ?? undefined}
            onSelect={(date: any) => {
              onChange(date ?? null);
              setOpen(false);
            }}
            disabled={disabled}
            autoFocus
            captionLayout="dropdown"
            startMonth={new Date(1950, 0)} // Jan 1950
            endMonth={new Date(2035, 11)} // Dec 2035
          />
        </PopoverContent>
      </Popover>
      {clearable && value && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-transparent"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onChange(null);
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
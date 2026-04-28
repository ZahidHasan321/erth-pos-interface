"use client";
import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "./lib/utils";
import { Button } from "./button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./popover";
function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-screen" role="status" aria-label="Loading">
      <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-primary"></div>
    </div>
  );
}

type Option = {
  value: string;
  label: string;
  node?: React.ReactNode;
  selectedNode?: React.ReactNode;
};

interface ComboboxProps {
  options: Option[];
  value: string;
  isLoading?: boolean;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  onSearch?: (query: string) => void;
  className?: string;
  contentClassName?: string;
}

export function Combobox({
  options,
  value,
  isLoading = false,
  onChange,
  placeholder = "Select an option...",
  disabled,
  onSearch,
  className,
  contentClassName,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const selectedOption = options.find((option) => option.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          disabled={disabled}
          aria-expanded={open}
          className={cn(
            "w-full justify-between overflow-hidden bg-background border-border/60",
            disabled && "opacity-50 cursor-not-allowed",
            className
          )}
        >
          <div className="flex-1 min-w-0 overflow-hidden">
            {selectedOption
              ? (selectedOption.selectedNode || selectedOption.node || selectedOption.label)
              : <span className="truncate text-muted-foreground">{placeholder}</span>}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn("!w-[var(--radix-popover-trigger-width)] p-0 pointer-events-auto", contentClassName)}
      >
        <Command>
          <CommandInput placeholder={placeholder} {...(onSearch ? { onValueChange: onSearch } : {})} />
          <CommandList>
            <CommandEmpty>No option found.</CommandEmpty>
            <CommandGroup>
              {isLoading ? (
                <div className="p-2 flex justify-center items-center">
                  <LoadingSpinner />
                </div>
              ) : (
                options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.label} // Search against the label
                    onSelect={(selectedLabel) => {
                      const selectedOption = options.find(
                        (opt) => opt.label === selectedLabel
                      );
                      if (selectedOption) {
                        onChange(selectedOption.value); // Return the actual value
                      }
                      setOpen(false);
                    }}
                  >
                    {option.node || option.label}
                    {value === option.value && (
                      <Check className="ml-auto h-4 w-4 shrink-0" />
                    )}
                  </CommandItem>
                ))
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

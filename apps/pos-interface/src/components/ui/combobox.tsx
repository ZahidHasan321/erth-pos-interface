"use client";
import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { LoadingSpinner } from "../global/loading-spinner";

type Option = {
  value: string;
  label: string;
  node?: React.ReactNode;
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
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const selectedOption = options.find((option) => option.value === value);
  
  return (
    <Popover open={open} onOpenChange={setOpen}>
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
          {selectedOption
            ? (selectedOption.node || selectedOption.label)
            : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder={placeholder} onValueChange={onSearch} />
          <CommandEmpty>No option found.</CommandEmpty>
          <CommandGroup className="max-h-[200px] overflow-y-auto">
            {isLoading ? (
              <div className="p-2 flex justify-center items-center">
                <LoadingSpinner />
              </div>
            ) : (
              options.map((option) => (
                <CommandItem
                  className="pl-0"
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
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {option.node || option.label}
                </CommandItem>
              ))
            )}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
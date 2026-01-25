"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Customer } from "@repo/database";

interface CustomerSelectionDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  customers: Customer[];
  onSelectCustomer: (customer: Customer) => void;
}

export function CustomerSelectionDialog({
  isOpen,
  onOpenChange,
  customers,
  onSelectCustomer,
}: CustomerSelectionDialogProps) {
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  const handleSelect = (customer: Customer) => {
    onSelectCustomer(customer);
    onOpenChange(false);
  };

  React.useEffect(() => {
    if (isOpen) {
      setSelectedIndex(0);
    }
  }, [isOpen]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % customers.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(
          (prev) => (prev - 1 + customers.length) % customers.length
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleSelect(customers[selectedIndex]);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, customers, selectedIndex, handleSelect]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" aria-describedby="customer-selection-description">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Select a Customer</DialogTitle>
          <DialogDescription id="customer-selection-description" className="text-muted-foreground">
            Multiple customers found. Please select one to continue.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 my-4">
          {customers.map((customer, index) => (
            <div
              key={customer.id}
              onClick={() => handleSelect(customer)}
              className={`p-4 border rounded-xl cursor-pointer transition-all flex flex-col gap-2 ${
                selectedIndex === index
                  ? "border-primary bg-primary/5 shadow-md"
                  : "border-border hover:border-primary/50 hover:bg-accent/10"
              }`}
            >
              <span className="font-semibold text-lg text-foreground">
                {customer.name}
              </span>
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                {customer.city && (
                  <span className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">City:</span>{" "}
                    {customer.city}
                  </span>
                )}
                {customer.relation && (
                  <span className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Relation:</span>{" "}
                    {customer.relation}
                  </span>
                )}
                {customer.account_type && (
                  <span className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Account Type:</span>{" "}
                    {customer.account_type}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
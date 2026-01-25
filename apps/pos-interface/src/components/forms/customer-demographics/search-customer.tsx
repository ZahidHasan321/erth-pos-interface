"use client";

import { searchCustomerByPhone } from "@/api/customers";
import { getPendingOrdersByCustomer } from "@/api/orders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Customer, Order } from "@repo/database";
import { useQuery } from "@tanstack/react-query";
import { Loader2, SearchIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CustomerSelectionDialog } from "./customer-selection-dialog";
import { PendingOrdersDialog } from "./pending-orders-dialog";
import { customerDemographicsDefaults } from "./demographics-form.schema";

interface SearchCustomerProps {
  onCustomerFound: (customer: Customer) => void;
  onHandleClear: () => void;
  onPendingOrderSelected?: (order: Order) => void;
  checkPendingOrders?: boolean;
}

export function SearchCustomer({
  onCustomerFound,
  onHandleClear,
  onPendingOrderSelected,
  checkPendingOrders = false,
}: SearchCustomerProps) {
  const [searchMobile, setSearchMobile] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [customerOptions, setCustomerOptions] = useState<Customer[]>([]);
  const [showPendingOrders, setShowPendingOrders] = useState(false);
  const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  );
  const [isLoadingPendingOrders, setIsLoadingPendingOrders] = useState(false);

  const { data, isFetching, isSuccess, isError, error } = useQuery({
    queryKey: ["customerSearch", submittedSearch],
    queryFn: async () => {
      if (!submittedSearch) return null;
      return searchCustomerByPhone(submittedSearch);
    },
    enabled: !!submittedSearch,
    staleTime: 0, 
    retry: false,
  });

  const handleSelectCustomer = useCallback(
    async (customer: Customer) => {
      setShowDialog(false);
      setCustomerOptions([]);
      setSubmittedSearch(null);
      setSelectedCustomer(customer);

      if (checkPendingOrders && customer.id) {
        setIsLoadingPendingOrders(true);
        try {
          const response = await getPendingOrdersByCustomer(
            customer.id,
            5,
          );
          if (response.data && response.data.length > 0) {
            setPendingOrders(response.data as Order[]);
            setShowPendingOrders(true);
          } else {
            setShowPendingOrders(false);
            onCustomerFound(customer);
          }
        } catch (error) {
          console.error("Error fetching pending orders:", error);
          toast.error("Failed to check for pending orders");
          setShowPendingOrders(false);
          onCustomerFound(customer);
        } finally {
          setIsLoadingPendingOrders(false);
        }
      } else {
        onCustomerFound(customer);
      }
    },
    [checkPendingOrders, onCustomerFound],
  );

  useEffect(() => {
    if (isSuccess && data) {
      if (data.data) {
        if (data.count === 1) {
          handleSelectCustomer(data.data[0] as Customer);
        } else if (data.count && data.count > 1) {
          setCustomerOptions(data.data as Customer[]);
          setShowDialog(true);
        } else {
          toast.error("Customer not found.");
        }
      }
    }
  }, [isSuccess, data, handleSelectCustomer]);

  useEffect(() => {
    if (isError) {
      toast.error(error.message || "Failed to search for customer.");
      console.error("Error searching for customer:", error);
    }
  }, [isError, error]);

  useEffect(() => {
    return () => {
      setSubmittedSearch(null);
      setSearchMobile("");
    };
  }, []);

  const handlePendingOrderSelect = (order: Order) => {
    if (onPendingOrderSelected) {
      onPendingOrderSelected(order);
    }
    setShowPendingOrders(false);
    setPendingOrders([]);
    setSelectedCustomer(null);
  };

  const handleCreateNewOrder = () => {
    if (selectedCustomer) {
      onCustomerFound(selectedCustomer);
    }
    setShowPendingOrders(false);
    setPendingOrders([]);
    setSelectedCustomer(null);
  };

  const handleSearch = () => {
    setSubmittedSearch(searchMobile);
  };

  const handleClear = () => {
    setSearchMobile("");
    setSubmittedSearch(null);
    onHandleClear();
  };

  return (
    <div className="bg-muted p-4 rounded-lg space-y-4">
      <h2 className="text-xl font-semibold">Search Customer</h2>

      <div className="flex justify-between gap-4 items-end">
        <div className="flex-1 space-y-2">
          <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            Mobile Number
          </label>
          <Input
            placeholder="Enter mobile number..."
            value={searchMobile}
            onChange={(e) => setSearchMobile(e.target.value)}
            className="bg-white"
            name="customerSearchMobile"
            type="tel"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="on"
            disabled={isFetching || isLoadingPendingOrders}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSearch();
              }
            }}
          />
        </div>

        <div className="flex gap-2 flex-wrap justify-end lg:col-span-2">
          <Button
            type="button"
            disabled={isFetching || isLoadingPendingOrders}
            className="flex items-center"
            onClick={handleSearch}
          >
            {isFetching ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Searching...
              </>
            ) : (
              <>
                <SearchIcon className="w-4 h-4 mr-2" />
                Search Customer
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleClear}
            disabled={isFetching || isLoadingPendingOrders}
          >
            Clear Search
          </Button>
        </div>
      </div>

      <CustomerSelectionDialog
        isOpen={showDialog}
        onOpenChange={setShowDialog}
        customers={customerOptions}
        onSelectCustomer={handleSelectCustomer}
      />

      <PendingOrdersDialog
        isOpen={showPendingOrders}
        onOpenChange={setShowPendingOrders}
        orders={pendingOrders}
        onSelectOrder={handlePendingOrderSelect}
        onCreateNewOrder={handleCreateNewOrder}
        customerName={selectedCustomer?.name}
        isLoading={isLoadingPendingOrders}
      />
    </div>
  );
}

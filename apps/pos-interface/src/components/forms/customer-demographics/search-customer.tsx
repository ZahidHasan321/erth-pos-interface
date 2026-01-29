"use client";

import { fuzzySearchCustomers, getCustomerById } from "@/api/customers";
import { getPendingOrdersByCustomer } from "@/api/orders";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { Customer, Order } from "@repo/database";
import { useQuery } from "@tanstack/react-query";
import { Loader2, SearchIcon, UserIcon, X, AlertCircle, History } from "lucide-react";
import { useCallback, useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import { PendingOrdersDialog } from "./pending-orders-dialog";
import { cn } from "@/lib/utils";
import { FullScreenLoader } from "@/components/global/full-screen-loader";

const RECENT_CUSTOMERS_KEY = "recent_customer_searches";
const MAX_RECENT_CUSTOMERS = 4;

interface SearchCustomerProps {
  onCustomerFound: (customer: Customer) => void;
  onHandleClear: () => void;
  onPendingOrderSelected?: (order: Order) => void;
  checkPendingOrders?: boolean;
  clearOnSelect?: boolean;
}

export function SearchCustomer({
  onCustomerFound,
  onHandleClear,
  onPendingOrderSelected,
  checkPendingOrders = false,
  clearOnSelect = false,
}: SearchCustomerProps) {
  const [searchValue, setSearchValue] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [recentCustomers, setRecentCustomers] = useState<Customer[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [showPendingOrders, setShowPendingOrders] = useState(false);
  const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  );
  const [isLoadingPendingOrders, setIsLoadingPendingOrders] = useState(false);

  // Load recent customers on mount
  useEffect(() => {
    const saved = localStorage.getItem(RECENT_CUSTOMERS_KEY);
    if (saved) {
      try {
        setRecentCustomers(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse recent customers", e);
      }
    }
  }, []);

  const saveToRecent = (customer: Customer) => {
    const updated = [
      customer,
      ...recentCustomers.filter((c) => c.id !== customer.id),
    ].slice(0, MAX_RECENT_CUSTOMERS);
    
    setRecentCustomers(updated);
    localStorage.setItem(RECENT_CUSTOMERS_KEY, JSON.stringify(updated));
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchValue);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchValue]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { data: searchResults, isFetching } = useQuery({
    queryKey: ["customerFuzzySearch", debouncedSearch],
    queryFn: async () => {
      if (!debouncedSearch || debouncedSearch.length < 2) return { data: [], count: 0 };
      return fuzzySearchCustomers(debouncedSearch);
    },
    enabled: debouncedSearch.length >= 2 && !selectedCustomerId,
  });

  const fetchPendingOrders = useCallback(async (customer: Customer) => {
    if (!customer.id) return;
    
    setIsLoadingPendingOrders(true);
    try {
      const response = await getPendingOrdersByCustomer(customer.id, 5);
      if (response.data && response.data.length > 0) {
        setPendingOrders(response.data as Order[]);
        setShowPendingOrders(true);
      } else {
        setPendingOrders([]);
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
  }, [onCustomerFound]);

  const handleSelectCustomer = useCallback(
    async (customer: Customer, isFromRecent: boolean = false) => {
      if (!customer.id) return;

      // If it's from recent searches, we verify it still exists in the DB
      if (isFromRecent) {
        setIsLoadingPendingOrders(true);
        try {
          const response = await getCustomerById(customer.id);
          
          if (response.status === "success" && response.data) {
            const latestCustomer = response.data;
            saveToRecent(latestCustomer);
            
            if (clearOnSelect) {
              setSearchValue("");
              setDebouncedSearch("");
              setSelectedCustomerId(null);
              setSelectedCustomer(null);
            } else {
              setSelectedCustomer(latestCustomer);
              setSelectedCustomerId(latestCustomer.id);
              setSearchValue(latestCustomer.name);
              setDebouncedSearch("");
            }
            
            setIsFocused(false);

            if (checkPendingOrders) {
              await fetchPendingOrders(latestCustomer);
            } else {
              onCustomerFound(latestCustomer);
            }
          } else {
            toast.error("Customer profile not found. It may have been deleted.");
            // Remove from recent if not found
            const updated = recentCustomers.filter((c) => c.id !== customer.id);
            setRecentCustomers(updated);
            localStorage.setItem(RECENT_CUSTOMERS_KEY, JSON.stringify(updated));
            handleClear();
          }
        } catch (error) {
          console.error("Error selecting customer:", error);
          toast.error("Failed to load customer profile");
        } finally {
          setIsLoadingPendingOrders(false);
        }
      } else {
        // If it's a fresh search result, we just use the data we have
        saveToRecent(customer);
        
        if (clearOnSelect) {
          setSearchValue("");
          setDebouncedSearch("");
          setSelectedCustomerId(null);
          setSelectedCustomer(null);
        } else {
          setSelectedCustomer(customer);
          setSelectedCustomerId(customer.id);
          setSearchValue(customer.name);
          setDebouncedSearch("");
        }
        
        setIsFocused(false);

        if (checkPendingOrders) {
          await fetchPendingOrders(customer);
        } else {
          onCustomerFound(customer);
        }
      }
    },
    [checkPendingOrders, onCustomerFound, fetchPendingOrders, recentCustomers, clearOnSelect],
  );

  const handlePendingOrderSelect = (order: Order) => {
    if (onPendingOrderSelected) {
      onPendingOrderSelected(order);
    }
    setShowPendingOrders(false);
    setPendingOrders([]);
  };

  const handleCreateNewOrder = () => {
    if (selectedCustomer) {
      onCustomerFound(selectedCustomer);
    }
    setShowPendingOrders(false);
    setPendingOrders([]);
  };

  const handleOrderCancelled = useCallback(() => {
    if (selectedCustomer) {
      fetchPendingOrders(selectedCustomer);
    }
  }, [selectedCustomer, fetchPendingOrders]);

  const handleClear = () => {
    setSearchValue("");
    setDebouncedSearch("");
    setSelectedCustomerId(null);
    setSelectedCustomer(null);
    setIsFocused(false);
    onHandleClear();
  };

  const customers = searchResults?.data || [];
  const hasMinChars = searchValue.length >= 2;
  const showRecent = isFocused && !searchValue && recentCustomers.length > 0;
  const showList = (isFocused && hasMinChars && !selectedCustomerId) || showRecent;
  
  const showSkeleton = isFetching && customers.length === 0;

  return (
    <>
      {isLoadingPendingOrders && (
        <FullScreenLoader 
          title="Loading Profile" 
          subtitle="Checking for pending orders..." 
        />
      )}
      <div ref={containerRef} className="bg-muted/40 px-5 py-4 rounded-2xl space-y-3 border border-border/50 shadow-sm relative z-10 h-full flex flex-col justify-center">
        <div className="flex justify-between items-center px-1">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2 rounded-lg transition-colors shadow-sm",
              selectedCustomerId ? "bg-green-600 text-white" : "bg-primary/10 text-primary"
            )}>
              <SearchIcon className="size-4" />
            </div>
            <h2 className="text-sm font-bold text-foreground uppercase tracking-tight">
              {selectedCustomerId ? "Selected Customer" : "Find Customer"}
            </h2>
          </div>
        </div>

        <div className="relative">
          <div className="relative flex items-center group">
            <SearchIcon className={cn(
              "absolute left-4 size-5 transition-colors",
              selectedCustomerId ? "text-green-600" : "text-muted-foreground group-focus-within:text-primary"
            )} />
            <Input
              placeholder="Search name, mobile, or nickname..."
              value={searchValue}
              onChange={(e) => {
                const newValue = e.target.value;
                setSearchValue(newValue);
                if (selectedCustomerId) {
                  setSelectedCustomerId(null);
                  setSelectedCustomer(null);
                }
              }}
              onFocus={() => setIsFocused(true)}
              className={cn(
                "h-12 pl-12 pr-12 text-base bg-white rounded-xl border-border shadow-sm focus-visible:ring-primary/20 transition-all font-bold",
                selectedCustomerId && "border-green-600 ring-2 ring-green-600/10 font-semibold text-green-700"
              )}
            />
            <div className="absolute right-4 flex items-center gap-2">
              {isFetching && (
                <Loader2 className="size-5 animate-spin text-primary/60" />
              )}
              {searchValue && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="p-1 hover:bg-muted rounded-full transition-colors"
                >
                  <X className="size-4 text-muted-foreground" />
                </button>
              )}
            </div>
          </div>

          {/* Floating Results List */}
          {showList && (
            <div className="absolute top-full left-0 right-0 mt-2 rounded-xl border border-border bg-white shadow-2xl overflow-hidden z-40 transition-all duration-150 transform origin-top">
              <Command shouldFilter={false} className="bg-transparent">
                <CommandList className="max-h-[400px] scrollbar-thin overflow-y-auto">
                  {showSkeleton ? (
                    <div className="p-2 space-y-1">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center justify-between p-4 h-[76px] border-b border-border/20 last:border-0">
                          <div className="flex items-center gap-4">
                            <Skeleton className="h-10 w-10 rounded-full" />
                            <div className="space-y-2">
                              <Skeleton className="h-4 w-32" />
                              <Skeleton className="h-3 w-24" />
                            </div>
                          </div>
                          <Skeleton className="h-6 w-16 rounded-full" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      {!isFetching && customers.length === 0 && hasMinChars && (
                        <div className="p-12 py-16 flex flex-col items-center justify-center gap-3 text-muted-foreground min-h-[228px]">
                          <div className="bg-muted p-4 rounded-full">
                            <AlertCircle className="size-10 opacity-20" />
                          </div>
                          <p className="text-sm font-medium">No customers found matching "{debouncedSearch}"</p>
                        </div>
                      )}

                      {showRecent && (
                        <CommandGroup heading={
                          <div className="flex items-center gap-2">
                            <History className="size-3" />
                            <span>Recent Searches</span>
                          </div>
                        }>
                          {recentCustomers.map((customer) => (
                            <CommandItem
                              key={`recent-${customer.id}`}
                              value={customer.id.toString()}
                              onSelect={() => handleSelectCustomer(customer, true)}
                              className="flex items-center justify-between p-4 py-5 mx-1 rounded-lg cursor-pointer hover:bg-primary/5 data-[selected=true]:bg-primary/5 data-[selected=true]:text-accent-foreground border-b border-border/30 last:border-0 transition-none h-[76px]"
                            >
                               <div className="flex items-start gap-4">
                                <div className="bg-muted p-2.5 rounded-full mt-0.5">
                                  <UserIcon className="size-4 text-muted-foreground" />
                                </div>
                                <div className="flex flex-col gap-0.5">
                                  <div className="font-bold text-base flex items-center gap-2 text-foreground">
                                    {customer.name}
                                    {customer.arabic_name && (
                                      <span className="text-muted-foreground font-normal text-xs bg-muted/50 px-2 py-0.5 rounded border border-border/30" dir="rtl">
                                        {customer.arabic_name}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 text-sm text-muted-foreground font-medium">
                                    <span className="font-mono tracking-tight">{customer.phone}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-1.5 shrink-0">
                                                                 <Badge variant="outline" className="text-xs uppercase font-bold text-muted-foreground bg-muted/20">                                Recent
                                 </Badge>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}

                      {customers.length > 0 && (
                        <CommandGroup heading={`Found ${searchResults?.count || 0} accounts`}>
                          {customers.map((customer) => (
                            <CommandItem
                              key={customer.id}
                              value={customer.id.toString()}
                              onSelect={() => handleSelectCustomer(customer)}
                              className="flex items-center justify-between p-4 py-5 mx-1 rounded-lg cursor-pointer hover:bg-primary/5 data-[selected=true]:bg-primary/5 data-[selected=true]:text-accent-foreground border-b border-border/30 last:border-0 transition-none h-[76px]"
                            >
                              <div className="flex items-start gap-4">
                                <div className="bg-primary/10 p-2.5 rounded-full mt-0.5">
                                  <UserIcon className="size-4 text-primary" />
                                </div>
                                <div className="flex flex-col gap-0.5">
                                  <div className="font-bold text-base flex items-center gap-2 text-foreground">
                                    {customer.name}
                                    {customer.arabic_name && (
                                      <span className="text-muted-foreground font-normal text-xs bg-muted/50 px-2 py-0.5 rounded border border-border/30" dir="rtl">
                                        {customer.arabic_name}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 text-sm text-muted-foreground font-medium">
                                    <span className="font-mono tracking-tight">{customer.phone}</span>
                                    {customer.nick_name && (
                                      <span className="text-xs italic opacity-80 uppercase tracking-tighter">
                                        • {customer.nick_name}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              
                              <div className="flex flex-col items-end gap-1.5 shrink-0">
                                <Badge 
                                  variant={customer.account_type === 'Primary' ? 'default' : 'secondary'}
                                                                  className={cn(
                                                                      "px-2.5 py-0.5 text-xs font-black uppercase tracking-wider border",                                  customer.account_type === 'Primary' 
                                      ? "bg-primary border-primary shadow-sm" 
                                      : "bg-white text-muted-foreground border-border"
                                  )}
                                >
                                  {customer.account_type}
                                </Badge>
                                {customer.account_type === 'Secondary' && customer.relation && (
                                  <span className="text-xs uppercase font-bold text-primary px-1.5 py-0.5 bg-primary/5 rounded border border-primary/10">
                                    {customer.relation}
                                  </span>
                                )}
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}
                    </>
                  )}
                </CommandList>
              </Command>
            </div>
          )}
        </div>
      </div>

      <PendingOrdersDialog
        isOpen={showPendingOrders}
        onOpenChange={setShowPendingOrders}
        orders={pendingOrders}
        onSelectOrder={handlePendingOrderSelect}
        onCreateNewOrder={handleCreateNewOrder}
        onOrderCancelled={handleOrderCancelled}
        customerName={selectedCustomer?.name}
        isLoading={isLoadingPendingOrders}
      />
    </>
  );
}

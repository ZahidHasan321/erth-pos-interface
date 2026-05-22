import { useState, useEffect, useRef } from "react";
import type { UseFormReturn } from "react-hook-form";
import { useWatch, Controller } from "react-hook-form";
import type { CustomerDemographicsSchema } from "./demographics-form.schema";
import { mapFormValuesToCustomer } from "./demographics-form.mapper";
import { createCustomer } from "@/api/customers";
import type { Customer } from "@repo/database";
import { Button } from "@repo/ui/button";
import { Badge } from "@repo/ui/badge";
import { Input } from "@repo/ui/input";
import { Combobox } from "@repo/ui/combobox";
import { FlagIcon } from "@repo/ui/flag-icon";
import { getSortedCountries } from "@/lib/countries";
import { User, Phone, X, Loader2, UserPlus, Check, AlertCircle, Languages } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fuzzySearchCustomers } from "@/api/customers";
import { toast } from "sonner";

interface SimplifiedCustomerFormProps {
    form: UseFormReturn<CustomerDemographicsSchema>;
    onCustomerFound: (customer: Customer) => void;
    onClear: () => void;
    isOrderClosed?: boolean;
}

export function SimplifiedCustomerForm({
    form,
    onCustomerFound,
    onClear,
    isOrderClosed
}: SimplifiedCustomerFormProps) {
    const [searchValue, setSearchValue] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [isFocused, setIsFocused] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const queryClient = useQueryClient();

    const countries = getSortedCountries();

    // Watch values from the form
    const [customerId, customerPhone] = useWatch({
        control: form.control,
        name: ["id", "phone"],
    });

    const hasCustomer = !!customerId;

    // Search Logic
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchValue);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchValue]);

    const { data: searchResults, isFetching } = useQuery({
        queryKey: ["customerFuzzySearch", debouncedSearch],
        queryFn: async () => {
            if (!debouncedSearch || debouncedSearch.length < 3) return { data: [], count: 0 };
            return fuzzySearchCustomers(debouncedSearch);
        },
        enabled: debouncedSearch.length >= 3 && !hasCustomer,
        staleTime: 1000 * 30,
    });

    const { mutate: createCustomerMutation, isPending: isCreating } = useMutation({
        mutationFn: (data: Partial<Customer>) => createCustomer(data),
        onSuccess: (response) => {
            if (response.status === "success" && response.data) {
                queryClient.invalidateQueries({ queryKey: ["customers"] });
                onCustomerFound(response.data);
                setIsFocused(false);
                setSearchValue("");
            } else {
                toast.error(response.message || "Failed to create customer");
            }
        },
    });

    const handleSelect = (customer: Customer) => {
        onCustomerFound(customer);
        setSearchValue("");
        setIsFocused(false);
    };

    const handleCreateQuickly = () => {
        const values = form.getValues();
        if (!values.name || !values.phone) {
            toast.error("Name and Phone are required to create a customer");
            return;
        }
        const customerToSave = mapFormValuesToCustomer(values);
        createCustomerMutation(customerToSave);
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsFocused(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const customers = searchResults?.data || [];
    const showResults = isFocused && searchValue.length >= 3 && !hasCustomer;

    const inputClasses = "h-9";

    return (
        <div className="w-full space-y-5" ref={containerRef}>
            {/* Section Header */}
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    <div className="p-1.5 bg-primary/10 text-primary rounded-lg">
                        <User className="size-4" />
                    </div>
                    <div>
                        <h2 className="text-lg font-medium text-foreground">Customer Details</h2>
                        <p className="text-sm text-muted-foreground">Search existing or create new customer</p>
                    </div>
                </div>
                {hasCustomer && !isOrderClosed && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            onClear();
                            setSearchValue("");
                        }}
                        className="h-9 px-3 text-sm text-muted-foreground hover:text-foreground"
                    >
                        <X className="size-3.5 mr-1.5" />
                        Change
                    </Button>
                )}
            </div>

            {/* Form Content */}
            <div className="rounded-lg border border-border bg-card p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 items-end">

                    {/* 1. PHONE / SEARCH */}
                    <div className="sm:col-span-1 lg:col-span-4 space-y-2">
                        <label className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                            <Phone className="size-3" /> Mobile Number
                        </label>
                        <div className="flex gap-2 relative">
                            <div className="w-28 shrink-0">
                                <Controller
                                    name="country_code"
                                    control={form.control}
                                    render={({ field }) => (
                                        <Combobox
                                            disabled={hasCustomer || isOrderClosed}
                                            options={countries.map((c) => ({
                                                value: c.phoneCode,
                                                label: `${c.name} ${c.phoneCode}`,
                                                node: <span className="flex items-center gap-2"><FlagIcon code={c.code} /> {c.phoneCode}</span>,
                                            }))}
                                            value={field.value || "+965"}
                                            onChange={field.onChange}
                                            placeholder="Code"
                                            className="h-9"
                                        />
                                    )}
                                />
                            </div>
                            <div className="flex-1 relative">
                                <Controller
                                    name="phone"
                                    control={form.control}
                                    render={({ field }) => (
                                        <Input
                                            {...field}
                                            value={hasCustomer ? customerPhone : field.value}
                                            placeholder="Enter mobile…"
                                            readOnly={hasCustomer || isOrderClosed}
                                            className={cn(inputClasses, "pr-10")}
                                            onChange={(e) => {
                                                field.onChange(e);
                                                setSearchValue(e.target.value);
                                                setIsFocused(true);
                                            }}
                                        />
                                    )}
                                />
                                {isFetching && (
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                        <Loader2 className="size-4 animate-spin text-primary/60" />
                                    </div>
                                )}

                                {/* Search Results Dropdown */}
                                <AnimatePresence>
                                    {showResults && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 6 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 6 }}
                                            transition={{ duration: 0.15 }}
                                            className="absolute left-0 right-0 top-full mt-2 bg-popover border border-border shadow-md rounded-lg overflow-hidden z-50 max-h-[320px] overflow-y-auto scrollbar-thin"
                                        >
                                            {customers.length > 0 ? (
                                                <div className="p-1">
                                                    <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border">
                                                        Found {searchResults?.count} {searchResults?.count === 1 ? "account" : "accounts"}
                                                    </div>
                                                    {customers.map((c) => (
                                                        <button
                                                            key={c.id}
                                                            onClick={() => handleSelect(c)}
                                                            className="w-full flex items-center justify-between gap-3 p-2.5 rounded-md hover:bg-muted/60 transition-colors text-left"
                                                        >
                                                            <div className="flex items-center gap-3 min-w-0">
                                                                <div className="size-9 bg-muted rounded-md flex items-center justify-center text-muted-foreground shrink-0">
                                                                    <User className="size-4" />
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <div className="text-sm font-medium text-foreground truncate">{c.name}</div>
                                                                    <div className="text-xs font-mono text-muted-foreground">{c.phone}</div>
                                                                </div>
                                                            </div>
                                                            <Badge variant="secondary" className="text-xs font-normal shrink-0">
                                                                {c.account_type}
                                                            </Badge>
                                                        </button>
                                                    ))}
                                                </div>
                                            ) : !isFetching && (
                                                <div className="px-6 py-8 text-center">
                                                    <div className="size-10 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
                                                        <AlertCircle className="size-5 text-muted-foreground" />
                                                    </div>
                                                    <p className="text-sm font-medium text-foreground">No records found</p>
                                                    <p className="text-xs text-muted-foreground mt-1">Fill in the details and click Create</p>
                                                </div>
                                            )}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    </div>

                    {/* 2. NAME */}
                    <div className="sm:col-span-1 lg:col-span-3 space-y-2">
                        <label className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                            <User className="size-3" /> Customer Name
                        </label>
                        <Controller
                            name="name"
                            control={form.control}
                            render={({ field }) => (
                                <Input
                                    {...field}
                                    placeholder="Full name"
                                    readOnly={hasCustomer || isOrderClosed}
                                    className={inputClasses}
                                />
                            )}
                        />
                    </div>

                    {/* 3. ARABIC NAME */}
                    <div className="sm:col-span-1 lg:col-span-3 space-y-2">
                        <label className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                            <Languages className="size-3" /> Arabic Name
                        </label>
                        <Controller
                            name="arabic_name"
                            control={form.control}
                            render={({ field }) => (
                                <Input
                                    {...field}
                                    value={field.value || ""}
                                    placeholder="الاسم بالعربي"
                                    readOnly={hasCustomer || isOrderClosed}
                                    dir="rtl"
                                    className={cn(inputClasses, "text-right font-arabic")}
                                />
                            )}
                        />
                    </div>

                    {/* 4. ACTION */}
                    <div className="sm:col-span-1 lg:col-span-2 flex justify-end">
                        {!hasCustomer && !isOrderClosed && (
                            <Button
                                className="h-9 w-full gap-2"
                                onClick={handleCreateQuickly}
                                disabled={isCreating}
                            >
                                {isCreating ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
                                Create
                            </Button>
                        )}
                        {hasCustomer && (
                            <div className="h-9 flex items-center justify-center w-full text-sm text-primary gap-1.5">
                                <Check className="size-4" />
                                <span className="font-medium">Selected</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

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
                toast.success("Customer created successfully!");
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

    const inputClasses = cn(
        "h-9 font-bold transition-all",
        hasCustomer ? "bg-muted/50 border-transparent shadow-none" : "bg-background border-border/60"
    );

    return (
        <div className="w-full space-y-4" ref={containerRef}>
            {/* Section Header */}
            <div className="flex justify-between items-end">
                <div className="space-y-1">
                    <h2 className="text-lg font-black uppercase tracking-tight text-foreground flex items-center gap-2.5">
                        <div className={cn(
                            "p-1.5 rounded-lg",
                            hasCustomer ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
                        )}>
                            <User className="size-4" />
                        </div>
                        Customer <span className="text-primary">Details</span>
                    </h2>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest opacity-70 ml-9">
                        Search existing or create new customer
                    </p>
                </div>
                {hasCustomer && !isOrderClosed && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            onClear();
                            setSearchValue("");
                        }}
                        className="h-9 px-4 text-xs font-black uppercase tracking-widest border-destructive/20 text-destructive hover:bg-destructive hover:text-white transition-all shadow-sm"
                    >
                        <X className="size-3.5 mr-1.5" />
                        Change Customer
                    </Button>
                )}
            </div>

            {/* Form Content */}
            <div className={cn(
                "rounded-2xl border-2 p-4 transition-all duration-300",
                hasCustomer ? "border-primary/30 bg-primary/[0.02]" : "border-border bg-card"
            )}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 items-end">

                    {/* 1. PHONE / SEARCH */}
                    <div className="sm:col-span-1 lg:col-span-4 space-y-2">
                        <label className="text-xs font-black uppercase tracking-widest text-muted-foreground/80 flex items-center gap-1.5">
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
                                            className="h-9 border-border/60 bg-background font-bold"
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
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 10 }}
                                            className="absolute left-0 right-0 top-full mt-3 bg-white border-2 border-primary/20 shadow-lg rounded-2xl overflow-hidden z-50 max-h-[320px] overflow-y-auto scrollbar-thin"
                                        >
                                            {customers.length > 0 ? (
                                                <div className="p-2 space-y-1">
                                                    <div className="px-3 py-2 text-xs font-black uppercase tracking-widest text-muted-foreground/60 border-b border-muted mb-1">
                                                        Found {searchResults?.count} accounts
                                                    </div>
                                                    {customers.map((c) => (
                                                        <button
                                                            key={c.id}
                                                            onClick={() => handleSelect(c)}
                                                            className="w-full flex items-center justify-between p-3.5 rounded-xl hover:bg-primary/5 transition-colors text-left group"
                                                        >
                                                            <div className="flex items-center gap-3.5">
                                                                <div className="size-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all shadow-sm">
                                                                    <User className="size-5" />
                                                                </div>
                                                                <div>
                                                                    <div className="font-bold text-foreground group-hover:text-primary transition-colors">{c.name}</div>
                                                                    <div className="text-xs font-mono font-bold text-muted-foreground/70">{c.phone}</div>
                                                                </div>
                                                            </div>
                                                            <Badge className="text-xs font-black uppercase bg-muted/50 text-muted-foreground border-none group-hover:bg-primary/20 group-hover:text-primary">
                                                                {c.account_type}
                                                            </Badge>
                                                        </button>
                                                    ))}
                                                </div>
                                            ) : !isFetching && (
                                                <div className="p-8 text-center bg-muted/5">
                                                    <div className="size-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
                                                        <AlertCircle className="size-6 text-muted-foreground/30" />
                                                    </div>
                                                    <p className="text-sm font-black text-muted-foreground/60 uppercase tracking-tight">No records found</p>
                                                    <p className="text-xs font-bold text-muted-foreground/40 uppercase mt-1">Fill in details and click Create</p>
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
                        <label className="text-xs font-black uppercase tracking-widest text-muted-foreground/80 flex items-center gap-1.5">
                            <User className="size-3" /> Customer Name
                        </label>
                        <Controller
                            name="name"
                            control={form.control}
                            render={({ field }) => (
                                <Input
                                    {...field}
                                    placeholder="Full Name"
                                    readOnly={hasCustomer || isOrderClosed}
                                    className={inputClasses}
                                />
                            )}
                        />
                    </div>

                    {/* 3. ARABIC NAME */}
                    <div className="sm:col-span-1 lg:col-span-3 space-y-2">
                        <label className="text-xs font-black uppercase tracking-widest text-muted-foreground/80 flex items-center gap-1.5">
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
                                className="h-9 w-full font-black uppercase tracking-widest text-xs gap-2 shadow-lg shadow-primary/20"
                                onClick={handleCreateQuickly}
                                disabled={isCreating}
                            >
                                {isCreating ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
                                Create
                            </Button>
                        )}
                        {hasCustomer && (
                            <div className="h-9 flex items-center justify-center w-full">
                                <div className="size-9 bg-emerald-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
                                    <Check className="size-5" />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {hasCustomer && (
                    <div className="mt-4 flex items-center gap-3 animate-in fade-in slide-in-from-top-1 duration-500">
                         <Badge variant="outline" className="text-xs font-black uppercase tracking-[0.2em] px-2.5 py-1 bg-white border-primary/20 text-primary shadow-xs">
                            Account Verified
                         </Badge>
                         <div className="h-px flex-1 bg-linear-to-r from-primary/20 to-transparent" />
                    </div>
                )}
            </div>
        </div>
    );
}

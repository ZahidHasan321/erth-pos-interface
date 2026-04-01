import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  Eye,
  Phone,
  MapPin,
  Ruler,
  Users,
} from "lucide-react";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/table";
import { useCustomers } from "@/hooks/use-customers";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@repo/ui/card";
import { Skeleton } from "@repo/ui/skeleton";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription
} from "@repo/ui/sheet";
import { CustomerMeasurementsStandalone } from "@/components/forms/customer-measurements";
import type { Customer } from "@repo/database";

export const Route = createFileRoute("/$main/customers/")({
  component: CustomersListComponent,
  head: () => ({
    meta: [{ title: "Customers" }],
  }),
});

/**
 * Check if two customers share the same phone (linked accounts).
 * Returns true if prev and current have the same phone number.
 */
function isSameGroup(a: Customer | undefined, b: Customer | undefined): boolean {
  if (!a || !b) return false;
  return !!a.phone && !!b.phone && a.phone === b.phone;
}

function CustomersListComponent() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [selectedCustomer, setSelectedCustomer] = useState<{id: number, name: string} | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const { data, isLoading } = useCustomers(page, pageSize, search);

  const totalCount = data?.count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);
  const customers = data?.data || [];

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handlePageSizeChange = (value: string) => {
    setPageSize(Number(value));
    setPage(1);
  };

  const openMeasurements = (id: number, name: string) => {
    setSelectedCustomer({id, name});
    setIsSheetOpen(true);
  };

  return (
    <div className="space-y-3 p-4 md:p-5 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <h1 className="text-xl font-bold text-foreground tracking-tight">
            Customer <span className="text-primary">Directory</span>
          </h1>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest opacity-70">
            Manage and view your customer database
          </p>
        </div>
        <Button asChild className="h-9 px-4 gap-1.5 shadow-md text-xs shrink-0">
          <Link to="/$main/orders/customer-profiles-orders">
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">New Customer</span>
            <span className="sm:hidden">New</span>
          </Link>
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone, or area..."
            value={search}
            onChange={handleSearch}
            className="pl-9 h-9 text-sm bg-card border-border/60 focus-visible:ring-primary/20 rounded-lg"
          />
        </div>
        <div className="shrink-0">
          <Select value={pageSize.toString()} onValueChange={handlePageSizeChange}>
            <SelectTrigger className="h-9 w-16 bg-card border-border/60 text-xs">
              <SelectValue placeholder={pageSize.toString()} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="20" className="text-xs">20</SelectItem>
              <SelectItem value="50" className="text-xs">50</SelectItem>
              <SelectItem value="100" className="text-xs">100</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1.5 bg-primary/5 px-2.5 py-1 rounded-lg border border-primary/10 text-primary font-bold text-xs tabular-nums shrink-0">
          {totalCount}
        </div>
      </div>

      {/* Desktop Table (lg+) */}
      <Card className="hidden lg:block border-border/60 shadow-sm overflow-hidden py-0 gap-0">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="font-bold uppercase text-xs tracking-widest py-3">Customer</TableHead>
                <TableHead className="font-bold uppercase text-xs tracking-widest py-3">Contact</TableHead>
                <TableHead className="font-bold uppercase text-xs tracking-widest py-3">Location</TableHead>
                <TableHead className="font-bold uppercase text-xs tracking-widest py-3">Account</TableHead>
                <TableHead className="text-right font-bold uppercase text-xs tracking-widest py-3">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.length > 0 ? (
                customers.map((customer, index) => {
                  const prevCustomer = index > 0 ? customers[index - 1] : undefined;
                  const nextCustomer = index < customers.length - 1 ? customers[index + 1] : undefined;
                  const isGrouped = isSameGroup(prevCustomer, customer);
                  const isGroupEnd = !isSameGroup(customer, nextCustomer);
                  const isSecondary = customer.account_type === "Secondary";

                  return (
                    <TableRow
                      key={customer.id}
                      className={cn(
                        "hover:bg-muted/30 transition-colors group",
                        isGrouped && "border-t-0",
                        isGrouped && !isGroupEnd && "border-b-0",
                        isSecondary && isGrouped && "bg-muted/15",
                      )}
                    >
                      <TableCell className="py-3">
                        <div className="flex items-center gap-3">
                          {/* Indent secondary accounts */}
                          {isSecondary && isGrouped && (
                            <div className="w-4 flex justify-center shrink-0">
                              <div className="w-px h-4 bg-primary/20" />
                            </div>
                          )}
                          <div className={cn(
                            "size-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0",
                            isSecondary
                              ? "bg-amber-500/10 text-amber-700"
                              : "bg-primary/10 text-primary"
                          )}>
                            {customer.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">
                              {customer.name}
                              {isSecondary && customer.relation && (
                                <span className="text-muted-foreground font-medium ml-1">({customer.relation})</span>
                              )}
                            </p>
                            {customer.arabic_name && (
                              <p className="text-xs text-muted-foreground" dir="rtl">{customer.arabic_name}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex items-center gap-2 text-sm">
                          <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="font-mono text-xs">{customer.country_code} {customer.phone}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex items-center gap-2 text-sm">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-xs">{customer.area || "N/A"}, {customer.city || "N/A"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider",
                            customer.account_type === 'Primary'
                              ? "bg-primary/10 text-primary border-primary/20"
                              : "bg-amber-50 text-amber-700 border-amber-200"
                          )}>
                            {customer.account_type}
                          </span>
                          {!isSecondary && isGrouped === false && isSameGroup(customer, nextCustomer) && (
                            <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                              <Users className="h-3 w-3" />
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right py-3">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-secondary hover:text-secondary hover:bg-secondary/10"
                            onClick={() => openMeasurements(customer.id, customer.name)}
                          >
                            <Ruler className="h-3.5 w-3.5 mr-1.5" />
                            Measure
                          </Button>
                          <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs text-primary hover:text-primary hover:bg-primary/10">
                            <Link to="/$main/customers/$customerId" params={{ customerId: customer.id.toString() }}>
                              <Eye className="h-3.5 w-3.5 mr-1.5" />
                              Details
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell className="py-3"><div className="flex items-center gap-3"><Skeleton className="size-9 rounded-full" /><Skeleton className="h-4 w-28 rounded-md" /></div></TableCell>
                    <TableCell className="py-3"><Skeleton className="h-4 w-32 rounded-md" /></TableCell>
                    <TableCell className="py-3"><Skeleton className="h-4 w-28 rounded-md" /></TableCell>
                    <TableCell className="py-3"><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                    <TableCell className="py-3 text-right"><Skeleton className="h-7 w-20 rounded-md ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    No customers found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Mobile/Tablet Cards (<lg) */}
      <div className="lg:hidden flex flex-col gap-2">
        {customers.length > 0 ? (
          customers.map((customer, index) => {
            const prevCustomer = index > 0 ? customers[index - 1] : undefined;
            const isGrouped = isSameGroup(prevCustomer, customer);
            const isSecondary = customer.account_type === "Secondary";

            return (
              <Card
                key={customer.id}
                className={cn(
                  "border-border/50 shadow-sm py-0 gap-0 overflow-hidden",
                  isGrouped && "-mt-1.5 rounded-t-none border-t-0",
                  isSecondary && isGrouped && "bg-muted/10",
                )}
              >
                <CardContent className="p-0">
                  <div className="flex items-center gap-3 px-3 sm:px-4 py-2.5">
                    {/* Indent for secondary */}
                    {isSecondary && isGrouped && (
                      <div className="w-2 flex justify-center shrink-0">
                        <div className="w-px h-6 bg-primary/20" />
                      </div>
                    )}

                    {/* Avatar */}
                    <div className={cn(
                      "size-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0",
                      isSecondary
                        ? "bg-amber-500/10 text-amber-700"
                        : "bg-primary/10 text-primary"
                    )}>
                      {customer.name.charAt(0).toUpperCase()}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm truncate">
                          {customer.name}
                          {isSecondary && customer.relation && (
                            <span className="text-muted-foreground font-medium ml-1">({customer.relation})</span>
                          )}
                        </span>
                        <span className={cn(
                          "text-[10px] font-bold px-1.5 py-0.5 rounded-full border uppercase tracking-wider shrink-0",
                          customer.account_type === 'Primary'
                            ? "bg-primary/10 text-primary border-primary/20"
                            : "bg-amber-50 text-amber-700 border-amber-200"
                        )}>
                          {customer.account_type}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                        <span className="font-mono flex items-center gap-1">
                          <Phone className="h-3 w-3 shrink-0" />
                          {customer.country_code} {customer.phone}
                        </span>
                        {(customer.area || customer.city) && (
                          <span className="hidden sm:flex items-center gap-1">
                            <MapPin className="h-3 w-3 shrink-0" />
                            {customer.area || "N/A"}, {customer.city || "N/A"}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-secondary hover:text-secondary hover:bg-secondary/10"
                        onClick={() => openMeasurements(customer.id, customer.name)}
                        title="Measurements"
                      >
                        <Ruler className="h-4 w-4" />
                      </Button>
                      <Button asChild variant="ghost" size="icon" className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10">
                        <Link to="/$main/customers/$customerId" params={{ customerId: customer.id.toString() }} title="Details">
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        ) : isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="border-border/50 shadow-sm py-0 gap-0">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="size-9 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-32 rounded-md" />
                    <Skeleton className="h-3 w-44 rounded-md" />
                  </div>
                  <Skeleton className="h-8 w-8 rounded-md shrink-0" />
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="py-10 text-center text-muted-foreground text-sm">
            No customers found.
          </div>
        )}
      </div>

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent side="right" className="sm:max-w-4xl overflow-y-auto p-5">
          <SheetHeader className="mb-3 p-0">
            <SheetTitle className="text-2xl font-black uppercase tracking-tighter">
              <span className="text-primary block text-sm tracking-widest mb-1 opacity-70">Customer Measurements</span>
              {selectedCustomer?.name}
            </SheetTitle>
            <SheetDescription className="text-xs uppercase font-bold tracking-[0.2em] text-muted-foreground opacity-70">
              manage and update body measurements for this profile
            </SheetDescription>
          </SheetHeader>
          {selectedCustomer && (
            <div className="mt-4">
              <CustomerMeasurementsStandalone
                customerId={selectedCustomer.id}
                hideHeader={true}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Pagination */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-3 bg-muted/30 p-3 rounded-xl border border-border/50">
        <div className="text-sm text-muted-foreground order-2 sm:order-1">
          {totalCount > 0 ? (
            <>
              Showing <span className="font-bold text-foreground">{customers.length}</span> out of{" "}
              <span className="font-bold text-foreground">{totalCount}</span> customers
            </>
          ) : (
            "No customers to show"
          )}
        </div>

        <div className="flex items-center gap-1.5 order-1 sm:order-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setPage(1)}
            disabled={page === 1 || isLoading}
            className="h-9 w-9 border-border/60 hover:bg-background"
            title="First Page"
          >
            <span className="sr-only">First Page</span>
            <ChevronLeft className="h-4 w-4 -mr-2" />
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1 || isLoading}
            className="h-9 px-3 border-border/60 hover:bg-background gap-1"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Previous</span>
          </Button>

          <div className="flex items-center gap-1 mx-1">
            {totalPages <= 7 ? (
              Array.from({ length: totalPages }, (_, i) => (
                <Button
                  key={i + 1}
                  variant={page === i + 1 ? "default" : "ghost"}
                  size="sm"
                  className={cn(
                    "h-9 w-9 p-0 font-bold transition-all",
                    page === i + 1 ? "shadow-md shadow-primary/20" : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => setPage(i + 1)}
                  disabled={isLoading}
                >
                  {i + 1}
                </Button>
              ))
            ) : (
              <>
                <Button
                  variant={page === 1 ? "default" : "ghost"}
                  size="sm"
                  className={cn(
                    "h-9 w-9 p-0 font-bold",
                    page === 1 ? "shadow-md shadow-primary/20" : "text-muted-foreground"
                  )}
                  onClick={() => setPage(1)}
                  disabled={isLoading}
                >
                  1
                </Button>

                {page > 3 && <span className="text-muted-foreground px-1">...</span>}

                {Array.from({ length: 3 }, (_, i) => {
                  let pageNum;
                  if (page <= 3) pageNum = i + 2;
                  else if (page >= totalPages - 2) pageNum = totalPages - 3 + i;
                  else pageNum = page - 1 + i;

                  if (pageNum <= 1 || pageNum >= totalPages) return null;

                  return (
                    <Button
                      key={pageNum}
                      variant={page === pageNum ? "default" : "ghost"}
                      size="sm"
                      className={cn(
                        "h-9 w-9 p-0 font-bold",
                        page === pageNum ? "shadow-md shadow-primary/20" : "text-muted-foreground"
                      )}
                      onClick={() => setPage(pageNum)}
                      disabled={isLoading}
                    >
                      {pageNum}
                    </Button>
                  );
                })}

                {page < totalPages - 2 && <span className="text-muted-foreground px-1">...</span>}

                <Button
                  variant={page === totalPages ? "default" : "ghost"}
                  size="sm"
                  className={cn(
                    "h-9 w-9 p-0 font-bold",
                    page === totalPages ? "shadow-md shadow-primary/20" : "text-muted-foreground"
                  )}
                  onClick={() => setPage(totalPages)}
                  disabled={isLoading}
                >
                  {totalPages}
                </Button>
              </>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || isLoading}
            className="h-9 px-3 border-border/60 hover:bg-background gap-1"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={() => setPage(totalPages)}
            disabled={page === totalPages || isLoading}
            className="h-9 w-9 border-border/60 hover:bg-background"
            title="Last Page"
          >
            <span className="sr-only">Last Page</span>
            <ChevronRight className="h-4 w-4" />
            <ChevronRight className="h-4 w-4 -ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { formatDistanceToNowStrict } from "date-fns";
import {
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  Phone,
  MapPin,
  Ruler,
  ChevronRight as ChevronRightIcon,
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
  SheetDescription,
} from "@repo/ui/sheet";
import { CustomerMeasurementsStandalone } from "@/components/forms/customer-measurements";
import type { CustomerListItem } from "@/api/customers";

export const Route = createFileRoute("/$main/customers/")({
  component: CustomersListComponent,
  head: () => ({
    meta: [{ title: "Customers" }],
  }),
});

function isSameGroup(
  a: CustomerListItem | undefined,
  b: CustomerListItem | undefined,
): boolean {
  if (!a || !b) return false;
  return !!a.phone && !!b.phone && a.phone === b.phone;
}

function formatRelative(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return formatDistanceToNowStrict(new Date(iso), { addSuffix: false }) + " ago";
  } catch {
    return "—";
  }
}

function formatCurrency(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : value ?? 0;
  if (!n || Number.isNaN(n)) return "—";
  return n.toFixed(3);
}

// Count how many subsequent rows share this customer's phone — used to show
// a "+N linked" pill on a primary row when its secondaries follow it.
function countLinkedAfter(rows: CustomerListItem[], index: number): number {
  const phone = rows[index]?.phone;
  if (!phone) return 0;
  let count = 0;
  for (let i = index + 1; i < rows.length; i++) {
    if (rows[i]?.phone === phone) count++;
    else break;
  }
  return count;
}

function CustomersListComponent() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: number; name: string } | null>(
    null,
  );
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const { data, isLoading } = useCustomers(page, pageSize, search);

  const totalCount = data?.count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);
  const customers: CustomerListItem[] = data?.data || [];

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handlePageSizeChange = (value: string) => {
    setPageSize(Number(value));
    setPage(1);
  };

  const openMeasurements = (id: number, name: string) => {
    setSelectedCustomer({ id, name });
    setIsSheetOpen(true);
  };

  const goToDetails = (id: number) => {
    navigate({
      to: "/$main/customers/$customerId",
      params: (prev: Record<string, string>) => ({ ...prev, customerId: id.toString() }),
    });
  };

  return (
    <div className="space-y-3 p-4 md:p-5 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <h1 className="text-xl font-medium text-foreground tracking-tight">
            Customer <span className="text-primary">Directory</span>
          </h1>
          <p className="text-xs text-muted-foreground">
            Manage and view your customer database
          </p>
        </div>
        <Button asChild className="h-9 px-4 gap-1.5 text-xs shrink-0">
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
            className="pl-9 h-9 text-sm bg-card border-border focus-visible:ring-primary/20 rounded-lg"
          />
        </div>
        <div className="shrink-0">
          <Select value={pageSize.toString()} onValueChange={handlePageSizeChange}>
            <SelectTrigger className="h-9 w-16 bg-card border-border text-xs">
              <SelectValue placeholder={pageSize.toString()} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="20" className="text-xs">20</SelectItem>
              <SelectItem value="50" className="text-xs">50</SelectItem>
              <SelectItem value="100" className="text-xs">100</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1.5 bg-muted px-2.5 py-1 rounded-lg border border-border text-foreground font-medium text-xs tabular-nums shrink-0">
          {totalCount}
        </div>
      </div>

      {/* Desktop Table (lg+) */}
      <Card className="hidden lg:block border-border overflow-hidden py-0 gap-0">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-medium text-xs text-muted-foreground py-2.5">Customer</TableHead>
                <TableHead className="font-medium text-xs text-muted-foreground py-2.5">Contact</TableHead>
                <TableHead className="font-medium text-xs text-muted-foreground py-2.5">Location</TableHead>
                <TableHead className="font-medium text-xs text-muted-foreground py-2.5">Activity</TableHead>
                <TableHead className="font-medium text-xs text-muted-foreground py-2.5 text-right">Balance</TableHead>
                <TableHead className="w-12 py-2.5" aria-label="Actions" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.length > 0 ? (
                customers.map((customer, index) => {
                  const prevCustomer = index > 0 ? customers[index - 1] : undefined;
                  const nextCustomer =
                    index < customers.length - 1 ? customers[index + 1] : undefined;
                  const isGrouped = isSameGroup(prevCustomer, customer);
                  const isGroupEnd = !isSameGroup(customer, nextCustomer);
                  const isSecondary = customer.account_type === "Secondary";
                  const linkedAfter = !isGrouped ? countLinkedAfter(customers, index) : 0;
                  const outstanding =
                    typeof customer.outstanding_total === "string"
                      ? Number(customer.outstanding_total)
                      : (customer.outstanding_total ?? 0);
                  const ordersCount = customer.orders_count ?? 0;

                  return (
                    <TableRow
                      key={customer.id}
                      onClick={() => goToDetails(customer.id)}
                      className={cn(
                        "group cursor-pointer hover:bg-muted/40 transition-colors",
                        isGrouped && "border-t-0",
                        !isGroupEnd && "border-b-0",
                      )}
                    >
                      <TableCell className="py-2.5">
                        <div className="flex items-center gap-3">
                          {/* Linked-account rail (spans the group on the left) */}
                          <div className="w-3 flex justify-center shrink-0 self-stretch">
                            {(isGrouped || (!isGroupEnd && linkedAfter > 0)) && (
                              <div className="w-px bg-border" />
                            )}
                          </div>
                          <div
                            className={cn(
                              "size-8 rounded-full flex items-center justify-center font-medium text-sm shrink-0",
                              isSecondary
                                ? "bg-muted text-muted-foreground border border-border"
                                : "bg-primary/10 text-primary",
                            )}
                          >
                            {customer.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-sm text-foreground truncate">
                                {customer.name}
                              </span>
                              {isSecondary && customer.relation && (
                                <span className="text-xs text-muted-foreground truncate">
                                  ({customer.relation})
                                </span>
                              )}
                              {linkedAfter > 0 && (
                                <span className="text-[10px] font-medium text-muted-foreground border border-border rounded-full px-1.5 py-0 leading-relaxed tabular-nums shrink-0">
                                  +{linkedAfter} linked
                                </span>
                              )}
                              {customer.has_measurements && (
                                <Ruler
                                  className="h-3 w-3 text-muted-foreground shrink-0"
                                  aria-label="Has measurements on file"
                                />
                              )}
                            </div>
                            {customer.arabic_name && (
                              <p
                                className="text-xs text-muted-foreground truncate"
                                dir="rtl"
                              >
                                {customer.arabic_name}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <div className="flex items-center gap-2 text-sm">
                          <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="font-mono text-xs text-foreground">
                            {customer.country_code} {customer.phone}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">
                            {customer.area || "—"}
                            {customer.city ? `, ${customer.city}` : ""}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5">
                        {ordersCount > 0 ? (
                          <div className="text-xs leading-tight">
                            <div className="text-foreground font-medium tabular-nums">
                              {ordersCount} order{ordersCount === 1 ? "" : "s"}
                            </div>
                            <div className="text-muted-foreground">
                              {formatRelative(customer.last_order_at)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">No orders</span>
                        )}
                      </TableCell>
                      <TableCell className="py-2.5 text-right">
                        {outstanding > 0 ? (
                          <span className="font-mono text-xs text-destructive tabular-nums">
                            {formatCurrency(outstanding)}
                          </span>
                        ) : (
                          <span className="font-mono text-xs text-muted-foreground tabular-nums">—</span>
                        )}
                      </TableCell>
                      <TableCell className="py-2.5 text-right pr-3">
                        <div className="flex items-center justify-end gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              openMeasurements(customer.id, customer.name);
                            }}
                            title="Measurements"
                          >
                            <Ruler className="h-3.5 w-3.5" />
                          </Button>
                          <ChevronRightIcon className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-foreground transition-colors" />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    <TableCell className="py-2.5">
                      <div className="flex items-center gap-3">
                        <div className="w-3 shrink-0" />
                        <Skeleton className="size-8 rounded-full" />
                        <Skeleton className="h-4 w-32 rounded-md" />
                      </div>
                    </TableCell>
                    <TableCell className="py-2.5"><Skeleton className="h-4 w-28 rounded-md" /></TableCell>
                    <TableCell className="py-2.5"><Skeleton className="h-4 w-24 rounded-md" /></TableCell>
                    <TableCell className="py-2.5"><Skeleton className="h-4 w-20 rounded-md" /></TableCell>
                    <TableCell className="py-2.5 text-right"><Skeleton className="h-4 w-14 rounded-md ml-auto" /></TableCell>
                    <TableCell className="py-2.5" />
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground text-sm">
                    No customers found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Mobile/Tablet Cards (<lg) */}
      <div className="lg:hidden flex flex-col gap-1.5">
        {customers.length > 0 ? (
          customers.map((customer, index) => {
            const prevCustomer = index > 0 ? customers[index - 1] : undefined;
            const isGrouped = isSameGroup(prevCustomer, customer);
            const isSecondary = customer.account_type === "Secondary";
            const linkedAfter = !isGrouped ? countLinkedAfter(customers, index) : 0;
            const outstanding =
              typeof customer.outstanding_total === "string"
                ? Number(customer.outstanding_total)
                : (customer.outstanding_total ?? 0);
            const ordersCount = customer.orders_count ?? 0;

            return (
              <Card
                key={customer.id}
                onClick={() => goToDetails(customer.id)}
                className={cn(
                  "border-border py-0 gap-0 overflow-hidden cursor-pointer hover:bg-muted/30 transition-colors",
                  isGrouped && "-mt-1 rounded-t-none border-t-0",
                )}
              >
                <CardContent className="p-0">
                  <div className="flex items-center gap-3 px-3 sm:px-4 py-2.5">
                    {/* Linked-account rail */}
                    <div className="w-2 shrink-0 self-stretch flex justify-center">
                      {isGrouped && <div className="w-px bg-border" />}
                    </div>

                    <div
                      className={cn(
                        "size-8 rounded-full flex items-center justify-center font-medium text-sm shrink-0",
                        isSecondary
                          ? "bg-muted text-muted-foreground border border-border"
                          : "bg-primary/10 text-primary",
                      )}
                    >
                      {customer.name.charAt(0).toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-sm truncate">
                          {customer.name}
                        </span>
                        {isSecondary && customer.relation && (
                          <span className="text-xs text-muted-foreground">
                            ({customer.relation})
                          </span>
                        )}
                        {linkedAfter > 0 && (
                          <span className="text-[10px] font-medium text-muted-foreground border border-border rounded-full px-1.5 leading-relaxed tabular-nums">
                            +{linkedAfter}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2.5 mt-0.5 text-xs text-muted-foreground">
                        <span className="font-mono flex items-center gap-1">
                          <Phone className="h-3 w-3 shrink-0" />
                          {customer.country_code} {customer.phone}
                        </span>
                        {ordersCount > 0 ? (
                          <span className="tabular-nums">
                            {ordersCount} order{ordersCount === 1 ? "" : "s"}
                          </span>
                        ) : null}
                        {outstanding > 0 && (
                          <span className="font-mono text-destructive tabular-nums">
                            {formatCurrency(outstanding)}
                          </span>
                        )}
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        openMeasurements(customer.id, customer.name);
                      }}
                      title="Measurements"
                    >
                      <Ruler className="h-4 w-4" />
                    </Button>
                    <ChevronRightIcon className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                  </div>
                </CardContent>
              </Card>
            );
          })
        ) : isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="border-border py-0 gap-0">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="size-8 rounded-full shrink-0" />
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
            <span className="text-xs font-medium text-primary mb-1">Customer measurements</span>
            <SheetTitle className="text-lg font-semibold">
              {selectedCustomer?.name}
            </SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              Manage and update body measurements for this profile
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
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-3 bg-muted/30 p-3 rounded-lg border border-border">
        <div className="text-sm text-muted-foreground order-2 sm:order-1">
          {totalCount > 0 ? (
            <>
              Showing <span className="font-medium text-foreground">{customers.length}</span> out of{" "}
              <span className="font-medium text-foreground">{totalCount}</span> customers
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
            className="h-9 w-9 border-border hover:bg-background"
            title="First Page"
          >
            <span className="sr-only">First Page</span>
            <ChevronLeft className="h-4 w-4 -mr-2" />
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || isLoading}
            className="h-9 px-3 border-border hover:bg-background gap-1"
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
                    "h-9 w-9 p-0 font-medium transition-all",
                    page === i + 1 ? "" : "text-muted-foreground hover:text-foreground",
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
                    "h-9 w-9 p-0 font-medium",
                    page === 1 ? "" : "text-muted-foreground",
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
                        "h-9 w-9 p-0 font-medium",
                        page === pageNum ? "" : "text-muted-foreground",
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
                    "h-9 w-9 p-0 font-medium",
                    page === totalPages ? "" : "text-muted-foreground",
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
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || isLoading}
            className="h-9 px-3 border-border hover:bg-background gap-1"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={() => setPage(totalPages)}
            disabled={page === totalPages || isLoading}
            className="h-9 w-9 border-border hover:bg-background"
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

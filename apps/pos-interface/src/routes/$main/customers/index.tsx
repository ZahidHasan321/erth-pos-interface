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
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCustomers } from "@/hooks/use-customers";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/$main/customers/")({
  component: CustomersListComponent,
  head: () => ({
    meta: [
      {
        title: "Customers | Erth POS",
      },
    ],
  }),
});

function CustomersListComponent() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(20);

  const { data, isLoading } = useCustomers(page, pageSize, search);

  const totalCount = data?.count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handlePageSizeChange = (value: string) => {
    setPageSize(Number(value));
    setPage(1);
  };

  return (
    <div className="space-y-6 mx-4 lg:mx-8 my-8 max-w-[1600px] 2xl:mx-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border pb-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-black text-foreground tracking-tight uppercase">
            Customer <span className="text-primary">Directory</span>
          </h1>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-70">
            Manage and view your customer database
          </p>
        </div>
        <div className="flex items-center gap-3">
            <Button asChild className="h-10 px-6 gap-2 shadow-lg hover:shadow-primary/20 transition-all shrink-0">
                <Link to="/$main/orders/customer-profiles-orders">
                    <Plus className="h-4 w-4" />
                    Create New Customer
                </Link>
            </Button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone, or area..."
            value={search}
            onChange={handleSearch}
            className="pl-10 h-11 bg-card border-border/60 focus-visible:ring-primary/20"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Rows per page</span>
          <Select value={pageSize.toString()} onValueChange={handlePageSizeChange}>
            <SelectTrigger className="h-9 w-20 bg-card border-border/60">
              <SelectValue placeholder={pageSize.toString()} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="border-border/60 shadow-sm overflow-hidden py-0 gap-0">
        <CardContent className="p-0">
          <div className="relative">
            {isLoading && (
              <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] flex items-center justify-center z-10">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
              </div>
            )}
            
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="font-bold uppercase text-[10px] tracking-widest py-4">Customer</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] tracking-widest py-4">Contact</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] tracking-widest py-4">Location</TableHead>
                  <TableHead className="font-bold uppercase text-[10px] tracking-widest py-4">Account Type</TableHead>
                  <TableHead className="text-right font-bold uppercase text-[10px] tracking-widest py-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.data && data.data.length > 0 ? (
                  data.data.map((customer) => (
                    <TableRow key={customer.id} className="hover:bg-muted/30 transition-colors group">
                      <TableCell className="py-4">
                        <div className="flex items-center gap-3">
                          <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                            {customer.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-foreground group-hover:text-primary transition-colors">{customer.name}</p>
                            {customer.arabic_name && (
                              <p className="text-xs text-muted-foreground" dir="rtl">{customer.arabic_name}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="flex items-center gap-2 text-sm">
                          <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-mono">{customer.country_code} {customer.phone}</span>
                        </div>
                        {customer.email && (
                            <p className="text-xs text-muted-foreground mt-1 ml-5">{customer.email}</p>
                        )}
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="flex items-center gap-2 text-sm">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{customer.area || "N/A"}, {customer.city || "N/A"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <span className={cn(
                          "text-[10px] font-bold px-2.5 py-0.5 rounded-full border shadow-sm uppercase tracking-wider",
                          customer.account_type === 'Primary' 
                            ? "bg-blue-50 text-blue-700 border-blue-200" 
                            : "bg-amber-50 text-amber-700 border-amber-200"
                        )}>
                          {customer.account_type}
                        </span>
                      </TableCell>
                      <TableCell className="text-right py-4">
                        <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-primary hover:text-primary hover:bg-primary/10">
                          <Link to="/$main/customers/$customerId" params={{ customerId: customer.id.toString() }}>
                            <Eye className="h-4 w-4 mr-2" />
                            Details
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : !isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                      No customers found.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 bg-muted/30 p-4 rounded-xl border border-border/50">
        <div className="text-sm text-muted-foreground order-2 sm:order-1">
          {totalCount > 0 ? (
            <>
              Showing <span className="font-bold text-foreground">{data?.data?.length}</span> out of{" "}
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

import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Package,
  Scissors,
  Shirt,
  BarChart3,
  Search,
  ArrowRight,
} from "lucide-react";

import { Button } from "@repo/ui/button";
import { Card, CardContent } from "@repo/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@repo/ui/tabs";
import { Input } from "@repo/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/table";
import { Skeleton } from "@repo/ui/skeleton";

import { cn } from "@/lib/utils";
import { ANIMATION_CLASSES } from "@/lib/constants/animations";
import { getFabrics } from "@/api/fabrics";
import { getShelf } from "@/api/shelf";
import { getAccessories } from "@/api/accessories";
import {
  ACCESSORY_CATEGORY_LABELS,
  UNIT_OF_MEASURE_LABELS,
} from "@/components/store/transfer-constants";

import type { Fabric, Shelf, Accessory } from "@repo/database";

export const Route = createFileRoute("/$main/store/stock-report")({
  component: StockReportPage,
  head: () => ({ meta: [{ title: "Stock Report" }] }),
});

const LOW_STOCK_THRESHOLDS = { fabric: 5, shelf: 3, accessory: 10 };

function isLowStock(
  shopStock: number,
  workshopStock: number,
  type: keyof typeof LOW_STOCK_THRESHOLDS,
) {
  const t = LOW_STOCK_THRESHOLDS[type];
  return shopStock < t || workshopStock < t;
}

function StockReportPage() {
  const [activeTab, setActiveTab] = useState("fabric");
  const [search, setSearch] = useState("");

  const { data: fabrics = [], isLoading: fabricsLoading, isError: fabricsError, refetch: fabricsRefetch } = useQuery({
    queryKey: ["fabrics"],
    queryFn: getFabrics,
  });
  const { data: shelfItems = [], isLoading: shelfLoading, isError: shelfError, refetch: shelfRefetch } = useQuery({
    queryKey: ["shelf"],
    queryFn: getShelf,
  });
  const { data: accessories = [], isLoading: accessoriesLoading, isError: accessoriesError, refetch: accessoriesRefetch } = useQuery({
    queryKey: ["accessories"],
    queryFn: getAccessories,
  });

  const isLoading = fabricsLoading || shelfLoading || accessoriesLoading;
  const isError = fabricsError || shelfError || accessoriesError;
  const refetchAll = () => { fabricsRefetch(); shelfRefetch(); accessoriesRefetch(); };

  const lowStockItems = useMemo(() => {
    const items: string[] = [];
    for (const f of fabrics)
      if (isLowStock(Number(f.shop_stock ?? 0), Number(f.workshop_stock ?? 0), "fabric"))
        items.push(f.name ?? "Unknown fabric");
    for (const s of shelfItems)
      if (isLowStock(Number(s.shop_stock ?? 0), Number(s.workshop_stock ?? 0), "shelf"))
        items.push(s.type ?? "Unknown shelf item");
    for (const a of accessories)
      if (isLowStock(Number(a.shop_stock ?? 0), Number(a.workshop_stock ?? 0), "accessory"))
        items.push(a.name ?? "Unknown accessory");
    return items;
  }, [fabrics, shelfItems, accessories]);

  const lowStockCount = lowStockItems.length;

  const sortedFabrics = useMemo(() => {
    const q = search.toLowerCase();
    return [...fabrics]
      .filter((f) => !q || f.name?.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          Number(a.shop_stock ?? 0) +
          Number(a.workshop_stock ?? 0) -
          (Number(b.shop_stock ?? 0) + Number(b.workshop_stock ?? 0)),
      );
  }, [fabrics, search]);

  const sortedShelf = useMemo(() => {
    const q = search.toLowerCase();
    return [...shelfItems]
      .filter(
        (s) =>
          !q ||
          s.type?.toLowerCase().includes(q) ||
          s.brand?.toLowerCase().includes(q),
      )
      .sort(
        (a, b) =>
          Number(a.shop_stock ?? 0) +
          Number(a.workshop_stock ?? 0) -
          (Number(b.shop_stock ?? 0) + Number(b.workshop_stock ?? 0)),
      );
  }, [shelfItems, search]);

  const sortedAccessories = useMemo(() => {
    const q = search.toLowerCase();
    return [...accessories]
      .filter(
        (a) =>
          !q ||
          a.name?.toLowerCase().includes(q) ||
          a.category?.toLowerCase().includes(q),
      )
      .sort(
        (a, b) =>
          Number(a.shop_stock ?? 0) +
          Number(a.workshop_stock ?? 0) -
          (Number(b.shop_stock ?? 0) + Number(b.workshop_stock ?? 0)),
      );
  }, [accessories, search]);

  return (
    <div
      className={cn(
        "p-4 md:p-5 max-w-[1600px] mx-auto space-y-5",
        ANIMATION_CLASSES.fadeInUp,
      )}
    >
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight">Stock Report</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Inventory levels across shop and workshop
        </p>
      </div>

      {/* Low stock alert */}
      {!isLoading && lowStockCount > 0 && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <p className="text-sm font-medium text-amber-900">
              <span className="font-bold tabular-nums">{lowStockCount}</span>{" "}
              item{lowStockCount !== 1 ? "s" : ""} running low on stock
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-amber-200 text-amber-800 hover:bg-amber-100 hover:border-amber-300 shrink-0"
            asChild
          >
            <Link
              to="/$main/store/request-delivery"
              params={(p: Record<string, string>) => p}
            >
              Request Delivery
              <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </Link>
          </Button>
        </div>
      )}

      {/* Error state */}
      {isError && !isLoading && (
        <Card className="shadow-none rounded-xl border border-destructive/20">
          <CardContent className="py-10 text-center">
            <AlertCircle className="h-10 w-10 mx-auto mb-3 text-destructive/60" />
            <p className="font-medium text-sm">Failed to load stock data</p>
            <p className="text-xs text-muted-foreground mt-1">
              Something went wrong. Please try again.
            </p>
            <Button variant="outline" size="sm" onClick={refetchAll} className="mt-4">
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Stat strip */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            icon={<Scissors className="h-4 w-4 text-purple-600" />}
            bg="bg-purple-50"
            label="Fabric Types"
            value={fabrics.length}
            index={0}
          />
          <StatCard
            icon={<Shirt className="h-4 w-4 text-sky-600" />}
            bg="bg-sky-50"
            label="Shelf Items"
            value={shelfItems.length}
            index={1}
          />
          <StatCard
            icon={<Package className="h-4 w-4 text-pink-600" />}
            bg="bg-pink-50"
            label="Accessories"
            value={accessories.length}
            index={2}
          />
          <StatCard
            icon={<AlertTriangle className="h-4 w-4 text-amber-600" />}
            bg={lowStockCount > 0 ? "bg-amber-50" : "bg-muted/40"}
            label="Low Stock"
            value={lowStockCount}
            index={3}
            highlight={lowStockCount > 0}
          />
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search items by name, type, or category..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Inventory table */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <Card className="shadow-none rounded-xl overflow-hidden border">
          <div className="px-4 py-3 border-b bg-muted/30">
            <TabsList className="h-8 w-fit">
              <TabsTrigger value="fabric" className="text-xs px-3 h-7">
                Fabrics
              </TabsTrigger>
              <TabsTrigger value="shelf" className="text-xs px-3 h-7">
                Shelf Items
              </TabsTrigger>
              <TabsTrigger value="accessory" className="text-xs px-3 h-7">
                Accessories
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="overflow-x-auto">
            <TabsContent value="fabric" className="mt-0">
              <FabricTable fabrics={sortedFabrics} search={search} />
            </TabsContent>
            <TabsContent value="shelf" className="mt-0">
              <ShelfTable items={sortedShelf} search={search} />
            </TabsContent>
            <TabsContent value="accessory" className="mt-0">
              <AccessoryTable items={sortedAccessories} search={search} />
            </TabsContent>
          </div>
        </Card>
      </Tabs>
    </div>
  );
}

function StatCard({
  icon,
  bg,
  label,
  value,
  index,
  highlight,
}: {
  icon: React.ReactNode;
  bg: string;
  label: string;
  value: number;
  index: number;
  highlight?: boolean;
}) {
  return (
    <Card
      className={cn(
        "shadow-none rounded-xl border",
        ANIMATION_CLASSES.fadeInUp,
        highlight ? "border-amber-200" : "",
      )}
      style={ANIMATION_CLASSES.staggerDelay(index)}
    >
      <CardContent className="py-3.5 px-4 flex items-center gap-3">
        <div className={cn("p-2 rounded-lg shrink-0", bg)}>{icon}</div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p
            className={cn(
              "text-2xl font-bold tabular-nums leading-tight",
              highlight ? "text-amber-600" : "",
            )}
          >
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function LowStockBadge() {
  return (
    <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold bg-red-100 text-red-700">
      Low
    </span>
  );
}

function FabricTable({
  fabrics,
  search,
}: {
  fabrics: Fabric[];
  search: string;
}) {
  if (fabrics.length === 0)
    return (
      <EmptyState
        label={search ? "No fabrics match your search" : "No fabrics found"}
      />
    );
  return (
    <Table className="min-w-[600px]">
      <TableHeader>
        <TableRow className="bg-muted/20 hover:bg-muted/20">
          <TableHead className="pl-4">Name</TableHead>
          <TableHead className="text-right">Shop</TableHead>
          <TableHead className="text-right">Workshop</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead className="text-center pr-4">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {fabrics.map((f) => {
          const shop = Number(f.shop_stock ?? 0);
          const workshop = Number(f.workshop_stock ?? 0);
          const low = isLowStock(shop, workshop, "fabric");
          return (
            <TableRow key={f.id} className={low ? "bg-red-50/40" : ""}>
              <TableCell className="pl-4 font-medium">
                <div className="flex items-center gap-2">
                  {f.color_hex && (
                    <span
                      className="w-3.5 h-3.5 rounded-full border shrink-0"
                      style={{ backgroundColor: f.color_hex }}
                    />
                  )}
                  {f.name}
                </div>
              </TableCell>
              <TableCell
                className={cn(
                  "text-right tabular-nums",
                  shop < LOW_STOCK_THRESHOLDS.fabric
                    ? "text-red-600 font-semibold"
                    : "",
                )}
              >
                {shop}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right tabular-nums",
                  workshop < LOW_STOCK_THRESHOLDS.fabric
                    ? "text-red-600 font-semibold"
                    : "",
                )}
              >
                {workshop}
              </TableCell>
              <TableCell className="text-right tabular-nums font-medium">
                {shop + workshop}
              </TableCell>
              <TableCell className="text-center pr-4">
                {low && <LowStockBadge />}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function ShelfTable({ items, search }: { items: Shelf[]; search: string }) {
  if (items.length === 0)
    return (
      <EmptyState
        label={
          search ? "No shelf items match your search" : "No shelf items found"
        }
      />
    );
  return (
    <Table className="min-w-[660px]">
      <TableHeader>
        <TableRow className="bg-muted/20 hover:bg-muted/20">
          <TableHead className="pl-4">Type</TableHead>
          <TableHead>Brand</TableHead>
          <TableHead className="text-right">Shop</TableHead>
          <TableHead className="text-right">Workshop</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead className="text-center pr-4">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((s) => {
          const shop = Number(s.shop_stock ?? 0);
          const workshop = Number(s.workshop_stock ?? 0);
          const low = isLowStock(shop, workshop, "shelf");
          return (
            <TableRow key={s.id} className={low ? "bg-red-50/40" : ""}>
              <TableCell className="pl-4 font-medium">{s.type}</TableCell>
              <TableCell>{s.brand}</TableCell>
              <TableCell
                className={cn(
                  "text-right tabular-nums",
                  shop < LOW_STOCK_THRESHOLDS.shelf
                    ? "text-red-600 font-semibold"
                    : "",
                )}
              >
                {shop}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right tabular-nums",
                  workshop < LOW_STOCK_THRESHOLDS.shelf
                    ? "text-red-600 font-semibold"
                    : "",
                )}
              >
                {workshop}
              </TableCell>
              <TableCell className="text-right tabular-nums font-medium">
                {shop + workshop}
              </TableCell>
              <TableCell className="text-center pr-4">
                {low && <LowStockBadge />}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function AccessoryTable({
  items,
  search,
}: {
  items: Accessory[];
  search: string;
}) {
  if (items.length === 0)
    return (
      <EmptyState
        label={
          search ? "No accessories match your search" : "No accessories found"
        }
      />
    );
  return (
    <Table className="min-w-[720px]">
      <TableHeader>
        <TableRow className="bg-muted/20 hover:bg-muted/20">
          <TableHead className="pl-4">Name</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Unit</TableHead>
          <TableHead className="text-right">Shop</TableHead>
          <TableHead className="text-right">Workshop</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead className="text-center pr-4">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((a) => {
          const shop = Number(a.shop_stock ?? 0);
          const workshop = Number(a.workshop_stock ?? 0);
          const low = isLowStock(shop, workshop, "accessory");
          return (
            <TableRow key={a.id} className={low ? "bg-red-50/40" : ""}>
              <TableCell className="pl-4 font-medium">{a.name}</TableCell>
              <TableCell>
                {ACCESSORY_CATEGORY_LABELS[a.category] ?? a.category}
              </TableCell>
              <TableCell>
                {UNIT_OF_MEASURE_LABELS[a.unit_of_measure] ?? a.unit_of_measure}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right tabular-nums",
                  shop < LOW_STOCK_THRESHOLDS.accessory
                    ? "text-red-600 font-semibold"
                    : "",
                )}
              >
                {shop}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right tabular-nums",
                  workshop < LOW_STOCK_THRESHOLDS.accessory
                    ? "text-red-600 font-semibold"
                    : "",
                )}
              >
                {workshop}
              </TableCell>
              <TableCell className="text-right tabular-nums font-medium">
                {shop + workshop}
              </TableCell>
              <TableCell className="text-center pr-4">
                {low && <LowStockBadge />}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <BarChart3 className="h-10 w-10 mb-3 opacity-30" />
      <p>{label}</p>
    </div>
  );
}

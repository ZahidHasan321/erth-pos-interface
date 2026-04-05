import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Package,
  Scissors,
  Shirt,
  BarChart3,
  Search,
  ArrowRight,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

import { Card, CardContent } from "@repo/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@repo/ui/tabs";
import { Input } from "@repo/ui/input";
import { Button } from "@repo/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/table";

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

  const { data: fabrics = [], isLoading: fabricsLoading } = useQuery({
    queryKey: ["fabrics"],
    queryFn: getFabrics,
  });
  const { data: shelfItems = [], isLoading: shelfLoading } = useQuery({
    queryKey: ["shelf"],
    queryFn: getShelf,
  });
  const { data: accessories = [], isLoading: accessoriesLoading } = useQuery({
    queryKey: ["accessories"],
    queryFn: getAccessories,
  });

  const isLoading = fabricsLoading || shelfLoading || accessoriesLoading;

  const lowStockCount = useMemo(() => {
    let count = 0;
    for (const f of fabrics)
      if (
        isLowStock(
          Number(f.shop_stock ?? 0),
          Number(f.workshop_stock ?? 0),
          "fabric",
        )
      )
        count++;
    for (const s of shelfItems)
      if (
        isLowStock(
          Number(s.shop_stock ?? 0),
          Number(s.workshop_stock ?? 0),
          "shelf",
        )
      )
        count++;
    for (const a of accessories)
      if (
        isLowStock(
          Number(a.shop_stock ?? 0),
          Number(a.workshop_stock ?? 0),
          "accessory",
        )
      )
        count++;
    return count;
  }, [fabrics, shelfItems, accessories]);

  const distributionData = useMemo(
    () => [
      {
        name: "Fabrics",
        shop: fabrics.reduce((s, f) => s + Number(f.shop_stock ?? 0), 0),
        workshop: fabrics.reduce(
          (s, f) => s + Number(f.workshop_stock ?? 0),
          0,
        ),
      },
      {
        name: "Shelf",
        shop: shelfItems.reduce((s, i) => s + Number(i.shop_stock ?? 0), 0),
        workshop: shelfItems.reduce(
          (s, i) => s + Number(i.workshop_stock ?? 0),
          0,
        ),
      },
      {
        name: "Accessories",
        shop: accessories.reduce((s, a) => s + Number(a.shop_stock ?? 0), 0),
        workshop: accessories.reduce(
          (s, a) => s + Number(a.workshop_stock ?? 0),
          0,
        ),
      },
    ],
    [fabrics, shelfItems, accessories],
  );

  const categoryData = useMemo(() => {
    const map: Record<string, { shop: number; workshop: number }> = {};
    for (const a of accessories) {
      const cat = ACCESSORY_CATEGORY_LABELS[a.category] ?? a.category;
      if (!map[cat]) map[cat] = { shop: 0, workshop: 0 };
      map[cat].shop += Number(a.shop_stock ?? 0);
      map[cat].workshop += Number(a.workshop_stock ?? 0);
    }
    return Object.entries(map).map(([name, v]) => ({ name, ...v }));
  }, [accessories]);

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
    <div className="p-4 md:p-5 max-w-[1600px] mx-auto space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Stock Report</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Stock levels across shop and workshop locations
          </p>
        </div>
        {lowStockCount > 0 && (
          <Button variant="outline" size="sm" asChild>
            <Link
              to="/$main/store/request-delivery"
              params={(prev: Record<string, string>) => prev}
            >
              Request Delivery <ArrowRight className="h-4 w-4 ml-1.5" />
            </Link>
          </Button>
        )}
      </div>

      {/* KPI Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <KpiCard
            icon={<Scissors className="h-5 w-5 text-purple-600" />}
            label="Fabric Types"
            value={fabrics.length}
            bg="bg-purple-50"
          />
          <KpiCard
            icon={<Shirt className="h-5 w-5 text-sky-600" />}
            label="Shelf Items"
            value={shelfItems.length}
            bg="bg-sky-50"
          />
          <KpiCard
            icon={<Package className="h-5 w-5 text-pink-600" />}
            label="Accessories"
            value={accessories.length}
            bg="bg-pink-50"
          />
          <KpiCard
            icon={<AlertTriangle className="h-5 w-5 text-red-600" />}
            label="Low Stock Alerts"
            value={lowStockCount}
            bg="bg-red-50"
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

      {/* Tabs */}
      <Card>
        <CardContent className="py-5">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full justify-start overflow-x-auto sm:w-fit [&>[data-slot=tabs-trigger]]:shrink-0">
              <TabsTrigger value="fabric">Fabrics</TabsTrigger>
              <TabsTrigger value="shelf">Shelf Items</TabsTrigger>
              <TabsTrigger value="accessory">Accessories</TabsTrigger>
            </TabsList>

            <TabsContent value="fabric" className="mt-4">
              <FabricTable fabrics={sortedFabrics} search={search} />
            </TabsContent>
            <TabsContent value="shelf" className="mt-4">
              <ShelfTable items={sortedShelf} search={search} />
            </TabsContent>
            <TabsContent value="accessory" className="mt-4">
              <AccessoryTable items={sortedAccessories} search={search} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Charts */}
      {!isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardContent className="py-5">
              <h3 className="text-sm font-semibold mb-4">
                Stock Distribution by Location
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={distributionData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-muted"
                  />
                  <XAxis dataKey="name" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend />
                  <Bar
                    dataKey="shop"
                    name="Shop"
                    fill="#0ea5e9"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="workshop"
                    name="Workshop"
                    fill="#8b5cf6"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {categoryData.length > 0 && (
            <Card>
              <CardContent className="py-5">
                <h3 className="text-sm font-semibold mb-4">
                  Accessories by Category
                </h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={categoryData} layout="vertical">
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-muted"
                    />
                    <XAxis type="number" className="text-xs" />
                    <YAxis
                      dataKey="name"
                      type="category"
                      className="text-xs"
                      width={90}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend />
                    <Bar
                      dataKey="shop"
                      name="Shop"
                      fill="#0ea5e9"
                      radius={[0, 4, 4, 0]}
                    />
                    <Bar
                      dataKey="workshop"
                      name="Workshop"
                      fill="#8b5cf6"
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  bg,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  bg: string;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-red-200" : ""}>
      <CardContent className="py-4 flex items-center gap-3">
        <div className={`p-2.5 rounded-lg ${bg}`}>{icon}</div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p
            className={`text-2xl font-bold tabular-nums ${highlight ? "text-red-600" : ""}`}
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
    <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold bg-red-100 text-red-700">
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
    <Table className="min-w-[640px]">
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead className="text-right">Shop Stock</TableHead>
          <TableHead className="text-right">Workshop Stock</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead className="text-center">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {fabrics.map((f) => {
          const shop = Number(f.shop_stock ?? 0);
          const workshop = Number(f.workshop_stock ?? 0);
          const low = isLowStock(shop, workshop, "fabric");
          return (
            <TableRow key={f.id} className={low ? "bg-red-50/50" : ""}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  {f.color_hex && (
                    <span
                      className="w-4 h-4 rounded-full border shrink-0"
                      style={{ backgroundColor: f.color_hex }}
                    />
                  )}
                  {f.name}
                </div>
              </TableCell>
              <TableCell
                className={`text-right tabular-nums ${shop < LOW_STOCK_THRESHOLDS.fabric ? "text-red-600 font-semibold" : ""}`}
              >
                {shop}
              </TableCell>
              <TableCell
                className={`text-right tabular-nums ${workshop < LOW_STOCK_THRESHOLDS.fabric ? "text-red-600 font-semibold" : ""}`}
              >
                {workshop}
              </TableCell>
              <TableCell className="text-right tabular-nums font-medium">
                {shop + workshop}
              </TableCell>
              <TableCell className="text-center">
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
    <Table className="min-w-[700px]">
      <TableHeader>
        <TableRow>
          <TableHead>Type</TableHead>
          <TableHead>Brand</TableHead>
          <TableHead className="text-right">Shop Stock</TableHead>
          <TableHead className="text-right">Workshop Stock</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead className="text-center">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((s) => {
          const shop = Number(s.shop_stock ?? 0);
          const workshop = Number(s.workshop_stock ?? 0);
          const low = isLowStock(shop, workshop, "shelf");
          return (
            <TableRow key={s.id} className={low ? "bg-red-50/50" : ""}>
              <TableCell className="font-medium">{s.type}</TableCell>
              <TableCell>{s.brand}</TableCell>
              <TableCell
                className={`text-right tabular-nums ${shop < LOW_STOCK_THRESHOLDS.shelf ? "text-red-600 font-semibold" : ""}`}
              >
                {shop}
              </TableCell>
              <TableCell
                className={`text-right tabular-nums ${workshop < LOW_STOCK_THRESHOLDS.shelf ? "text-red-600 font-semibold" : ""}`}
              >
                {workshop}
              </TableCell>
              <TableCell className="text-right tabular-nums font-medium">
                {shop + workshop}
              </TableCell>
              <TableCell className="text-center">
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
    <Table className="min-w-[760px]">
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Unit</TableHead>
          <TableHead className="text-right">Shop Stock</TableHead>
          <TableHead className="text-right">Workshop Stock</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead className="text-center">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((a) => {
          const shop = Number(a.shop_stock ?? 0);
          const workshop = Number(a.workshop_stock ?? 0);
          const low = isLowStock(shop, workshop, "accessory");
          return (
            <TableRow key={a.id} className={low ? "bg-red-50/50" : ""}>
              <TableCell className="font-medium">{a.name}</TableCell>
              <TableCell>
                {ACCESSORY_CATEGORY_LABELS[a.category] ?? a.category}
              </TableCell>
              <TableCell>
                {UNIT_OF_MEASURE_LABELS[a.unit_of_measure] ?? a.unit_of_measure}
              </TableCell>
              <TableCell
                className={`text-right tabular-nums ${shop < LOW_STOCK_THRESHOLDS.accessory ? "text-red-600 font-semibold" : ""}`}
              >
                {shop}
              </TableCell>
              <TableCell
                className={`text-right tabular-nums ${workshop < LOW_STOCK_THRESHOLDS.accessory ? "text-red-600 font-semibold" : ""}`}
              >
                {workshop}
              </TableCell>
              <TableCell className="text-right tabular-nums font-medium">
                {shop + workshop}
              </TableCell>
              <TableCell className="text-center">
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
      <BarChart3 className="h-10 w-10 mb-3 opacity-40" />
      <p>{label}</p>
    </div>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md text-sm">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium tabular-nums">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

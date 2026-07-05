import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Boxes, AlertTriangle, Package, PackageX } from "lucide-react";
import {
  PageHeader,
  SectionCard,
  StatsCard,
  EmptyState,
  LoadingSkeleton,
} from "@/components/shared/PageShell";
import { StatusPill } from "@/components/shared/StatusPill";
import { SearchInput } from "@/components/shared/SearchInput";
import {
  FilterBar,
  Segmented,
  FilterToggle,
} from "@/components/shared/FilterBar";
import { useInventory, useStockMovements } from "@/hooks/useAdmin";
import { formatKwd, formatNum, titleCase } from "@/lib/format";
import { formatDate } from "@/lib/utils";
import type {
  FabricStockRow,
  ShelfStockRow,
  AccessoryStockRow,
  MovementRow,
} from "@/api/admin";

type Tab = "fabric" | "shelf" | "accessory";

interface InventorySearch {
  tab?: Tab;
  q?: string;
  archived?: boolean;
}

export const Route = createFileRoute("/(main)/inventory/")({
  validateSearch: (s: Record<string, unknown>): InventorySearch => ({
    tab: s.tab === "shelf" || s.tab === "accessory" ? s.tab : undefined,
    q: typeof s.q === "string" && s.q ? s.q : undefined,
    archived: s.archived === true || s.archived === "true" ? true : undefined,
  }),
  component: InventoryPage,
});

const TABS: { value: Tab; label: string }[] = [
  { value: "fabric", label: "Fabric" },
  { value: "shelf", label: "Shelf" },
  { value: "accessory", label: "Accessories" },
];

/** Render a stock quantity that may be a numeric string with decimals. */
function qty(value: number | string | null | undefined): string {
  const n = value == null ? 0 : Number(value);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function InventoryPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const tab: Tab = search.tab ?? "fabric";

  const { data, isLoading, isError, error } = useInventory(search.q ?? "", !!search.archived);

  const patch = (next: Partial<InventorySearch>) =>
    navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });

  const summary = data?.summary;

  return (
    <div>
      <PageHeader icon={Boxes} title="Inventory" subtitle="Shared stock pool — fabric, shelf & accessories (all brands draw from it)" />

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
          <StatsCard icon={Package} value={summary.fabric_count} label="Fabrics" color="blue" />
          <StatsCard icon={Package} value={summary.shelf_count} label="Shelf items" color="purple" />
          <StatsCard icon={Package} value={summary.accessory_count} label="Accessories" color="emerald" />
          <StatsCard icon={PackageX} value={summary.low_stock_count} label="Low stock" color="red" dimOnZero />
          <StatsCard icon={Boxes} value={Math.round(Number(summary.stock_value_at_cost))} label="Stock value (KWD)" color="amber" />
        </div>
      )}

      {/* Controls */}
      <FilterBar
        search={
          <SearchInput
            value={search.q ?? ""}
            onChange={(v) => patch({ q: v || undefined })}
            placeholder="Name or SKU…"
            className="sm:w-64"
          />
        }
      >
        <Segmented
          value={tab}
          onChange={(v) => patch({ tab: v === "fabric" ? undefined : v })}
          options={TABS}
        />
        <FilterToggle
          checked={!!search.archived}
          onChange={(v) => patch({ archived: v || undefined })}
          label="Include archived"
        />
      </FilterBar>

      {isError ? (
        <EmptyState icon={AlertTriangle} message={(error as Error)?.message ?? "Failed to load inventory"} />
      ) : isLoading || !data ? (
        <LoadingSkeleton count={6} />
      ) : (
        <>
          {tab === "fabric" && <FabricTable rows={data.fabrics} />}
          {tab === "shelf" && <ShelfTable rows={data.shelf} />}
          {tab === "accessory" && <AccessoryTable rows={data.accessories} />}

          <div className="mt-6">
            <MovementsSection itemType={tab} />
          </div>
        </>
      )}
    </div>
  );
}

function LowBadge({ low }: { low: boolean }) {
  if (!low) return null;
  return <StatusPill color="red" className="ml-2">Low</StatusPill>;
}

function StockCell({ shop, workshop }: { shop: number | string | null; workshop: number | string | null }) {
  const w = Number(workshop ?? 0);
  return (
    <span className="tabular-nums">
      {qty(shop)}
      {w > 0 && <span className="text-muted-foreground"> · {qty(workshop)} ws</span>}
    </span>
  );
}

function FabricTable({ rows }: { rows: FabricStockRow[] }) {
  if (rows.length === 0) return <EmptyState icon={Package} message="No fabrics match" />;
  return (
    <SectionCard bodyClassName="p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border">
              <th className="py-2.5 px-4 font-medium">Fabric</th>
              <th className="py-2.5 px-3 font-medium">SKU</th>
              <th className="py-2.5 px-3 font-medium text-right">Stock (m)</th>
              <th className="py-2.5 px-3 font-medium text-right">Avg cost</th>
              <th className="py-2.5 px-3 font-medium text-right">Sell price</th>
              <th className="py-2.5 px-3 font-medium">Supplier</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.id} className={"border-b border-border/60 hover:bg-muted/40 transition-colors " + (f.is_archived ? "opacity-50" : "")}>
                <td className="py-2.5 px-4">
                  <span className="inline-flex items-center gap-2">
                    {f.color_hex && <span className="w-3 h-3 rounded-full border border-border shrink-0" style={{ background: f.color_hex }} />}
                    <Link to="/inventory/$itemType/$itemId" params={{ itemType: "fabric", itemId: String(f.id) }} className="font-medium hover:underline">{f.name}</Link>
                    <LowBadge low={f.low} />
                  </span>
                </td>
                <td className="py-2.5 px-3 text-muted-foreground tabular-nums">{f.sku ?? "—"}</td>
                <td className="py-2.5 px-3 text-right"><StockCell shop={f.shop_stock} workshop={f.workshop_stock} /></td>
                <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">{f.avg_cost != null ? formatKwd(f.avg_cost) : "—"}</td>
                <td className="py-2.5 px-3 text-right tabular-nums">{f.price != null ? formatKwd(f.price) : "—"}</td>
                <td className="py-2.5 px-3 text-muted-foreground truncate max-w-[140px]">{f.supplier ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="p-3 border-t border-border text-xs text-muted-foreground">{formatNum(rows.length)} fabrics</div>
    </SectionCard>
  );
}

function ShelfTable({ rows }: { rows: ShelfStockRow[] }) {
  if (rows.length === 0) return <EmptyState icon={Package} message="No shelf items match" />;
  return (
    <SectionCard bodyClassName="p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border">
              <th className="py-2.5 px-4 font-medium">Item</th>
              <th className="py-2.5 px-3 font-medium">SKU</th>
              <th className="py-2.5 px-3 font-medium">Brand</th>
              <th className="py-2.5 px-3 font-medium text-right">Stock</th>
              <th className="py-2.5 px-3 font-medium text-right">Avg cost</th>
              <th className="py-2.5 px-3 font-medium text-right">Sell price</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className={"border-b border-border/60 hover:bg-muted/40 transition-colors " + (s.is_archived ? "opacity-50" : "")}>
                <td className="py-2.5 px-4 font-medium">
                  <Link to="/inventory/$itemType/$itemId" params={{ itemType: "shelf", itemId: String(s.id) }} className="hover:underline">{s.name ?? "—"}</Link>
                  <LowBadge low={s.low} />
                </td>
                <td className="py-2.5 px-3 text-muted-foreground tabular-nums">{s.sku ?? "—"}</td>
                <td className="py-2.5 px-3 text-muted-foreground">{s.brand ?? "—"}</td>
                <td className="py-2.5 px-3 text-right"><StockCell shop={s.shop_stock} workshop={s.workshop_stock} /></td>
                <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">{s.avg_cost != null ? formatKwd(s.avg_cost) : "—"}</td>
                <td className="py-2.5 px-3 text-right tabular-nums">{s.price != null ? formatKwd(s.price) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="p-3 border-t border-border text-xs text-muted-foreground">{formatNum(rows.length)} shelf items</div>
    </SectionCard>
  );
}

function AccessoryTable({ rows }: { rows: AccessoryStockRow[] }) {
  if (rows.length === 0) return <EmptyState icon={Package} message="No accessories match" />;
  return (
    <SectionCard bodyClassName="p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border">
              <th className="py-2.5 px-4 font-medium">Accessory</th>
              <th className="py-2.5 px-3 font-medium">Category</th>
              <th className="py-2.5 px-3 font-medium">Unit</th>
              <th className="py-2.5 px-3 font-medium text-right">Shop · Workshop</th>
              <th className="py-2.5 px-3 font-medium text-right">Price</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className={"border-b border-border/60 hover:bg-muted/40 transition-colors " + (a.is_archived ? "opacity-50" : "")}>
                <td className="py-2.5 px-4 font-medium">
                  <Link to="/inventory/$itemType/$itemId" params={{ itemType: "accessory", itemId: String(a.id) }} className="hover:underline">{a.name}</Link>
                  <LowBadge low={a.low} />
                </td>
                <td className="py-2.5 px-3 text-muted-foreground">{titleCase(a.category)}</td>
                <td className="py-2.5 px-3 text-muted-foreground">{a.unit_of_measure}</td>
                <td className="py-2.5 px-3 text-right tabular-nums">{qty(a.shop_stock)} · {qty(a.workshop_stock)}</td>
                <td className="py-2.5 px-3 text-right tabular-nums">{a.price != null ? formatKwd(a.price) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="p-3 border-t border-border text-xs text-muted-foreground">{formatNum(rows.length)} accessories</div>
    </SectionCard>
  );
}

// ── Movements + waste ────────────────────────────────────────────────────────

function MovementsSection({ itemType }: { itemType: Tab }) {
  const params = useMemo(() => ({ itemType, limit: 100 }), [itemType]);
  const { data, isLoading } = useStockMovements(params);

  return (
    <SectionCard title={`Recent stock movements — ${titleCase(itemType)}`}>
      {isLoading || !data ? (
        <LoadingSkeleton count={3} />
      ) : (
        <div className="space-y-4">
          {/* Aggregates + waste */}
          <div className="flex flex-wrap gap-2">
            {data.aggregates.map((a) => (
              <span key={a.movement_type} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2.5 py-1 text-xs">
                <span className="text-muted-foreground">{titleCase(a.movement_type)}</span>
                <span className="tabular-nums font-medium">{formatNum(a.count)}</span>
                <span className="tabular-nums text-muted-foreground">({Number(a.net_qty) >= 0 ? "+" : ""}{qty(a.net_qty)})</span>
              </span>
            ))}
            {data.aggregates.length === 0 && <span className="text-sm text-muted-foreground">No movements recorded.</span>}
          </div>
          {data.waste_by_cause.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {data.waste_by_cause.map((w) => (
                <StatusPill key={w.root_cause} color="amber">
                  {titleCase(w.root_cause)}: {qty(w.qty)} ({formatNum(w.count)})
                </StatusPill>
              ))}
            </div>
          )}

          {/* Recent rows */}
          {data.movements.length === 0 ? (
            <EmptyState icon={Boxes} message="No recent movements" />
          ) : (
            <div className="overflow-x-auto -mx-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-2 px-4 font-medium">Date</th>
                    <th className="py-2 px-3 font-medium">Item</th>
                    <th className="py-2 px-3 font-medium">Type</th>
                    <th className="py-2 px-3 font-medium">Where</th>
                    <th className="py-2 px-3 font-medium text-right">Δ Qty</th>
                    <th className="py-2 px-3 font-medium">Reason</th>
                    <th className="py-2 px-3 font-medium">By</th>
                  </tr>
                </thead>
                <tbody>
                  {data.movements.map((m) => <MovementRowView key={m.id} m={m} />)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

function MovementRowView({ m }: { m: MovementRow }) {
  const delta = Number(m.qty_delta);
  return (
    <tr className="border-b border-border/60">
      <td className="py-2 px-4 text-muted-foreground whitespace-nowrap">{formatDate(m.created_at)}</td>
      <td className="py-2 px-3 truncate max-w-[160px]">{m.item_name ?? `#${m.item_id}`}</td>
      <td className="py-2 px-3 text-muted-foreground">{titleCase(m.movement_type)}</td>
      <td className="py-2 px-3 text-muted-foreground">{titleCase(m.location)}</td>
      <td className={"py-2 px-3 text-right tabular-nums " + (delta < 0 ? "text-[var(--status-bad)]" : delta > 0 ? "text-[var(--status-ok)]" : "text-muted-foreground")}>
        {delta >= 0 ? "+" : ""}{qty(m.qty_delta)}
      </td>
      <td className="py-2 px-3 text-muted-foreground truncate max-w-[180px]">
        {m.root_cause ? titleCase(m.root_cause) : m.reason ?? "—"}
      </td>
      <td className="py-2 px-3 text-muted-foreground truncate max-w-[120px]">{m.user_name ?? "—"}</td>
    </tr>
  );
}

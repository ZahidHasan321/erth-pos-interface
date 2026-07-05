import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Boxes,
  Package,
  AlertTriangle,
  Scissors,
  TruckIcon,
  PackagePlus,
  PackageX,
  Undo2,
} from "lucide-react";
import {
  PageHeader,
  SectionCard,
  EmptyState,
  LoadingSkeleton,
} from "@/components/shared/PageShell";
import { StatusPill } from "@/components/shared/StatusPill";
import { useInventoryItem } from "@/hooks/useAdmin";
import { formatKwd, formatNum, titleCase } from "@/lib/format";
import { formatDate } from "@/lib/utils";
import type {
  InventoryItem,
  InventoryItemDetail,
  MovementRow,
  ConsumptionByBrand,
} from "@/api/admin";

type ItemType = "fabric" | "shelf" | "accessory";

export const Route = createFileRoute("/(main)/inventory/$itemType/$itemId")({
  component: InventoryItemPage,
});

const TYPE_LABEL: Record<ItemType, string> = {
  fabric: "Fabric",
  shelf: "Shelf item",
  accessory: "Accessory",
};

function InventoryItemPage() {
  const { itemType, itemId } = Route.useParams();
  const id = Number(itemId);
  const validType = itemType === "fabric" || itemType === "shelf" || itemType === "accessory";
  const { data, isLoading, isError, error } = useInventoryItem(validType ? itemType : "", id);

  return (
    <div>
      <Link
        to="/inventory"
        search={{ tab: itemType === "fabric" ? undefined : (itemType as ItemType) }}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3"
      >
        <ArrowLeft className="w-4 h-4" /> Back to inventory
      </Link>

      {!validType ? (
        <EmptyState icon={AlertTriangle} message={`Unknown inventory type "${itemType}"`} />
      ) : isError ? (
        <EmptyState icon={AlertTriangle} message={(error as Error)?.message ?? "Failed to load item"} />
      ) : isLoading ? (
        <LoadingSkeleton count={4} />
      ) : !data ? (
        <EmptyState icon={Package} message={`${TYPE_LABEL[itemType as ItemType]} #${itemId} not found`} />
      ) : (
        <ItemView data={data} itemType={itemType as ItemType} />
      )}
    </div>
  );
}

/** Render a stock quantity that may arrive as a numeric string with decimals. */
function qty(value: number | string | null | undefined): string {
  const n = value == null ? 0 : Number(value);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function ItemView({ data, itemType }: { data: InventoryItem; itemType: ItemType }) {
  const it = data.item;
  const r = data.rollup;
  const unit = it.unit ?? "";
  const totalStock = Number(it.shop_stock ?? 0) + Number(it.workshop_stock ?? 0);
  const consumeVerb = itemType === "shelf" ? "Sold" : "Consumed";

  return (
    <div>
      <PageHeader
        icon={itemType === "fabric" ? Boxes : Package}
        title={it.name ?? `#${it.id}`}
        subtitle={[TYPE_LABEL[itemType], it.sku ? `SKU ${it.sku}` : null].filter(Boolean).join(" · ")}
      >
        {it.low && <StatusPill color="red">Low stock</StatusPill>}
        {it.is_archived && <StatusPill color="zinc">Archived</StatusPill>}
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Profile */}
        <SectionCard title="Details" className="lg:col-span-2">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <Field
              label="On hand"
              value={
                <span className="tabular-nums">
                  {qty(totalStock)} {unit}
                  <span className="text-muted-foreground"> ({qty(it.shop_stock)} shop · {qty(it.workshop_stock)} workshop)</span>
                </span>
              }
            />
            <Field label="Sell price" value={it.price != null ? formatKwd(it.price) : "—"} />
            <Field label="Avg cost (WAC)" value={it.avg_cost != null ? formatKwd(it.avg_cost) : "—"} />
            <Field
              label="Low-stock threshold"
              value={it.low_stock_threshold != null ? `${qty(it.low_stock_threshold)} ${unit}` : "—"}
            />
            <TypeSpecificFields it={it} itemType={itemType} />
          </dl>
        </SectionCard>

        {/* Consumption by brand (SPEC §4 cross-brand fabric-usage view) */}
        <SectionCard
          title={itemType === "shelf" ? "Sold by brand" : "Consumed by brand"}
          className="lg:col-span-1"
        >
          {data.by_brand.length === 0 ? (
            <EmptyState message={`Never ${consumeVerb.toLowerCase()} yet`} />
          ) : (
            <ByBrandList rows={data.by_brand} unit={unit} />
          )}
        </SectionCard>
      </div>

      {/* Lifetime rollups */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-4">
        <RollupTile icon={Scissors} label={consumeVerb} value={r.consumed} unit={unit} accent="bad" />
        <RollupTile icon={PackagePlus} label="Restocked" value={r.restocked} unit={unit} accent="ok" />
        <RollupTile icon={PackageX} label="Wasted" value={r.wasted} unit={unit} accent="warn" dimOnZero />
        <RollupTile icon={Undo2} label="Returned" value={r.returned} unit={unit} dimOnZero />
        <RollupTile icon={TruckIcon} label="Transfer in" value={r.transferred_in} unit={unit} dimOnZero />
        <RollupTile icon={TruckIcon} label="Transfer out" value={r.transferred_out} unit={unit} dimOnZero />
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        {formatNum(r.movement_count)} movements
        {r.first_movement && ` · since ${formatDate(r.first_movement)}`}
        {r.last_movement && ` · last ${formatDate(r.last_movement)}`}
      </p>

      {/* Stock history — this item's own ledger */}
      <SectionCard title={`Stock history (${formatNum(data.movements.length)})`} className="mt-4" bodyClassName="p-0">
        {data.movements.length === 0 ? (
          <div className="p-4"><EmptyState icon={Boxes} message="No stock movements recorded" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2.5 px-4 font-medium">Date</th>
                  <th className="py-2.5 px-3 font-medium">Type</th>
                  <th className="py-2.5 px-3 font-medium">Where</th>
                  <th className="py-2.5 px-3 font-medium text-right">Δ Qty</th>
                  <th className="py-2.5 px-3 font-medium text-right">After</th>
                  <th className="py-2.5 px-3 font-medium">Brand</th>
                  <th className="py-2.5 px-3 font-medium">Reason</th>
                  <th className="py-2.5 px-3 font-medium">By</th>
                </tr>
              </thead>
              <tbody>
                {data.movements.map((m) => <HistoryRow key={m.id} m={m} />)}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function TypeSpecificFields({ it, itemType }: { it: InventoryItemDetail; itemType: ItemType }) {
  if (itemType === "fabric") {
    return (
      <>
        <Field
          label="Colour"
          value={
            <span className="inline-flex items-center gap-2">
              {it.color_hex && <span className="w-3 h-3 rounded-full border border-border" style={{ background: it.color_hex }} />}
              {it.color ?? "—"}
            </span>
          }
        />
        <Field label="Season" value={it.season ? titleCase(it.season) : "—"} />
        <Field label="Supplier" value={it.supplier ?? "—"} />
      </>
    );
  }
  if (itemType === "shelf") {
    return <Field label="Brand" value={it.brand ? it.brand.toUpperCase() : "—"} />;
  }
  return (
    <>
      <Field label="Category" value={it.category ? titleCase(it.category) : "—"} />
      <Field label="Unit" value={it.unit_of_measure ?? "—"} />
    </>
  );
}

function ByBrandList({ rows, unit }: { rows: ConsumptionByBrand[]; unit: string }) {
  return (
    <div className="divide-y divide-border -my-1">
      {rows.map((b) => (
        <div key={b.brand} className="flex items-center justify-between gap-2 py-2 text-sm">
          <span className="font-medium">{b.brand === "unattributed" ? "Unattributed" : b.brand.toUpperCase()}</span>
          <span className="tabular-nums text-muted-foreground">
            {qty(b.qty)} {unit} <span className="text-xs">({formatNum(b.count)})</span>
          </span>
        </div>
      ))}
    </div>
  );
}

const ROLLUP_ACCENT = {
  ok: "text-[var(--status-ok)]",
  bad: "text-[var(--status-bad)]",
  warn: "text-[var(--status-warn)]",
  none: "text-muted-foreground",
} as const;

function RollupTile({
  icon: Icon,
  label,
  value,
  unit,
  accent = "none",
  dimOnZero,
}: {
  icon: typeof Scissors;
  label: string;
  value: number | string;
  unit: string;
  accent?: keyof typeof ROLLUP_ACCENT;
  dimOnZero?: boolean;
}) {
  const n = Number(value ?? 0);
  const dimmed = dimOnZero && n === 0;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className={"mt-1 text-lg font-semibold tabular-nums " + (dimmed ? ROLLUP_ACCENT.none : ROLLUP_ACCENT[accent])}>
        {qty(value)}<span className="text-xs font-normal text-muted-foreground ml-1">{unit}</span>
      </div>
    </div>
  );
}

function HistoryRow({ m }: { m: MovementRow }) {
  const delta = Number(m.qty_delta);
  return (
    <tr className="border-b border-border/60 hover:bg-muted/40 transition-colors">
      <td className="py-2 px-4 text-muted-foreground whitespace-nowrap">{formatDate(m.created_at)}</td>
      <td className="py-2 px-3 text-muted-foreground">{titleCase(m.movement_type)}</td>
      <td className="py-2 px-3 text-muted-foreground">{titleCase(m.location)}</td>
      <td className={"py-2 px-3 text-right tabular-nums " + (delta < 0 ? "text-[var(--status-bad)]" : delta > 0 ? "text-[var(--status-ok)]" : "text-muted-foreground")}>
        {delta >= 0 ? "+" : ""}{qty(m.qty_delta)}
      </td>
      <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{m.qty_after != null ? qty(m.qty_after) : "—"}</td>
      <td className="py-2 px-3 text-muted-foreground">{m.brand ? m.brand.toUpperCase() : "—"}</td>
      <td className="py-2 px-3 text-muted-foreground truncate max-w-[180px]">
        {m.root_cause ? titleCase(m.root_cause) : m.supplier_name ? m.supplier_name : m.reason ?? "—"}
      </td>
      <td className="py-2 px-3 text-muted-foreground truncate max-w-[120px]">{m.user_name ?? "—"}</td>
    </tr>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{value ?? "—"}</dd>
    </div>
  );
}

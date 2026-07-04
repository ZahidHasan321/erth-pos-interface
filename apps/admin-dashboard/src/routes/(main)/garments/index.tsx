import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { Shirt, AlertTriangle } from "lucide-react";
import {
  PageHeader,
  SectionCard,
  StatsCard,
  EmptyState,
  LoadingSkeleton,
  GarmentTypeBadge,
} from "@/components/shared/PageShell";
import { BrandBadge, StageBadge } from "@/components/shared/StageBadge";
import { SearchInput } from "@/components/shared/SearchInput";
import { FilterChip, FilterChipGroup } from "@/components/shared/FilterChip";
import { BrandFilter } from "@/components/Filters";
import { Button } from "@repo/ui/button";
import { useGarmentsPage } from "@/hooks/useAdmin";
import { PIECE_STAGE_LABELS } from "@/lib/constants";
import { formatNum, titleCase } from "@/lib/format";
import { formatDate } from "@/lib/utils";
import type { GarmentRow } from "@/api/admin";

interface GarmentsSearch {
  brands?: string;
  type?: string;
  stage?: string;
  location?: string;
  q?: string;
}

export const Route = createFileRoute("/(main)/garments/")({
  validateSearch: (s: Record<string, unknown>): GarmentsSearch => ({
    brands: typeof s.brands === "string" && s.brands ? s.brands : undefined,
    type: typeof s.type === "string" && s.type ? s.type : undefined,
    stage: typeof s.stage === "string" && s.stage ? s.stage : undefined,
    location: typeof s.location === "string" && s.location ? s.location : undefined,
    q: typeof s.q === "string" && s.q ? s.q : undefined,
  }),
  component: GarmentsPage,
});

const TYPES = ["brova", "final", "alteration"];
const LOCATIONS = [
  { value: "shop", label: "Shop" },
  { value: "workshop", label: "Workshop" },
  { value: "transit_to_shop", label: "To shop" },
  { value: "transit_to_workshop", label: "To workshop" },
];

function GarmentsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const brands = useMemo(() => (search.brands ? search.brands.split(",") : []), [search.brands]);

  const filters = useMemo(
    () => ({
      brands,
      garmentType: search.type ?? null,
      pieceStage: search.stage ?? null,
      location: search.location ?? null,
      search: search.q ?? null,
      from: null,
      to: null,
    }),
    [brands, search.type, search.stage, search.location, search.q],
  );

  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage, isFetching } =
    useGarmentsPage(filters);

  const patch = (next: Partial<GarmentsSearch>) =>
    navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });

  const rows: GarmentRow[] = useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);
  const stats = data?.pages[0]?.stats ?? null;

  return (
    <div>
      <PageHeader icon={Shirt} title="Garments" subtitle="Every garment across all brands" />

      {/* Filters */}
      <div className="space-y-2 mb-4">
        <BrandFilter selected={brands} onChange={(b) => patch({ brands: b.length ? b.join(",") : undefined })} />
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            <FilterChipGroup>
              <FilterChip active={!search.type} onClick={() => patch({ type: undefined })}>All types</FilterChip>
              {TYPES.map((t) => (
                <FilterChip key={t} active={search.type === t} onClick={() => patch({ type: t })}>{titleCase(t)}</FilterChip>
              ))}
            </FilterChipGroup>
            <FilterChipGroup>
              <FilterChip active={!search.location} onClick={() => patch({ location: undefined })}>Any where</FilterChip>
              {LOCATIONS.map((l) => (
                <FilterChip key={l.value} active={search.location === l.value} onClick={() => patch({ location: l.value })}>{l.label}</FilterChip>
              ))}
            </FilterChipGroup>
            <select
              value={search.stage ?? ""}
              onChange={(e) => patch({ stage: e.target.value || undefined })}
              className="h-8 rounded-md border border-border bg-card px-2 text-sm text-foreground"
            >
              <option value="">All stages</option>
              {Object.entries(PIECE_STAGE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <SearchInput
            value={search.q ?? ""}
            onChange={(v) => patch({ q: v || undefined })}
            placeholder="Garment ID, order #, invoice, name, phone…"
            className="lg:w-72"
          />
        </div>
      </div>

      {/* Stats (page 1 only) */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
          <StatsCard icon={Shirt} value={stats.total_garments} label="Garments" color="blue" />
          <StatsCard icon={Shirt} value={stats.in_production} label="In production" color="orange" dimOnZero />
          <StatsCard icon={Shirt} value={stats.brova} label="Brovas" color="purple" dimOnZero />
          <StatsCard icon={Shirt} value={stats.final} label="Finals" color="green" dimOnZero />
          <StatsCard icon={Shirt} value={stats.alteration} label="Alterations" color="amber" dimOnZero />
        </div>
      )}

      {isError ? (
        <EmptyState icon={AlertTriangle} message={(error as Error)?.message ?? "Failed to load garments"} />
      ) : isLoading ? (
        <LoadingSkeleton count={6} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Shirt} message="No garments match these filters" />
      ) : (
        <SectionCard bodyClassName="p-0">
          <div className={"overflow-x-auto " + (isFetching && !isFetchingNextPage ? "opacity-60 transition-opacity" : "")}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2.5 px-4 font-medium">Garment</th>
                  <th className="py-2.5 px-3 font-medium">Type</th>
                  <th className="py-2.5 px-3 font-medium">Stage</th>
                  <th className="py-2.5 px-3 font-medium">Order</th>
                  <th className="py-2.5 px-3 font-medium">Customer</th>
                  <th className="py-2.5 px-3 font-medium">Brand</th>
                  <th className="py-2.5 px-3 font-medium">Assigned</th>
                  <th className="py-2.5 px-3 font-medium">Delivery</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((g) => <GarmentRowView key={g.id} g={g} />)}
              </tbody>
            </table>
          </div>
          <div className="p-3 border-t border-border flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Showing {formatNum(rows.length)}{stats ? ` of ${formatNum(stats.total_garments)}` : ""}</span>
            {hasNextPage && (
              <Button variant="outline" size="sm" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                {isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            )}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

function GarmentRowView({ g }: { g: GarmentRow }) {
  return (
    <tr className="border-b border-border/60 hover:bg-muted/40 transition-colors">
      <td className="py-2.5 px-4">
        <Link to="/garments/$garmentId" params={{ garmentId: g.id }} className="font-medium hover:underline">
          {g.garment_id ?? g.id.slice(0, 8)}
        </Link>
        {g.style && <div className="text-xs text-muted-foreground truncate max-w-[160px]">{g.style}</div>}
      </td>
      <td className="py-2.5 px-3"><GarmentTypeBadge type={g.garment_type} /></td>
      <td className="py-2.5 px-3">
        <StageBadge stage={g.piece_stage} garmentType={g.garment_type} inProduction={g.in_production} location={g.location} />
      </td>
      <td className="py-2.5 px-3">
        <Link to="/orders/$orderId" params={{ orderId: String(g.order_id) }} className="hover:underline">#{g.order_id}</Link>
        {g.invoice_number != null && <div className="text-xs text-muted-foreground tabular-nums">INV-{g.invoice_number}</div>}
      </td>
      <td className="py-2.5 px-3">
        <div className="truncate max-w-[150px]">{g.c_name ?? "—"}</div>
        {g.c_phone && <div className="text-xs text-muted-foreground tabular-nums">{g.c_phone}</div>}
      </td>
      <td className="py-2.5 px-3"><BrandBadge brand={g.brand} /></td>
      <td className="py-2.5 px-3 text-muted-foreground">
        {g.assigned_person || g.assigned_unit ? (
          <span className="truncate max-w-[140px] inline-block">{g.assigned_person ?? g.assigned_unit}</span>
        ) : <span className="text-muted-foreground/50">—</span>}
      </td>
      <td className="py-2.5 px-3 text-muted-foreground">
        {g.delivery_date ? formatDate(g.delivery_date) : <span className="text-muted-foreground/50">—</span>}
      </td>
    </tr>
  );
}

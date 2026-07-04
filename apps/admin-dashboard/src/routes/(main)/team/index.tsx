import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Users,
  AlertTriangle,
  UserCog,
  Factory,
  Receipt,
  Wallet,
  Ruler,
  Coins,
} from "lucide-react";
import {
  PageHeader,
  SectionCard,
  StatsCard,
  EmptyState,
  LoadingSkeleton,
} from "@/components/shared/PageShell";
import { BrandBadge } from "@/components/shared/StageBadge";
import { StatusPill } from "@/components/shared/StatusPill";
import { FilterBar, FilterField, Segmented } from "@/components/shared/FilterBar";
import { BrandSelect, RangeFilter } from "@/components/Filters";
import { useWorkshopRoster, useStaffPerformance } from "@/hooks/useAdmin";
import { getRangeBounds, type RangePreset, type RangeBounds } from "@/lib/date-range";
import { formatKwd, formatNum, titleCase } from "@/lib/format";
import type { StaffPerfRow, WorkerRow } from "@/api/admin";

type Tab = "staff" | "workers";

interface TeamSearch {
  tab?: Tab;
}

export const Route = createFileRoute("/(main)/team/")({
  validateSearch: (s: Record<string, unknown>): TeamSearch => ({
    tab: s.tab === "workers" ? s.tab : undefined,
  }),
  component: TeamPage,
});

const TABS: { value: Tab; label: string }[] = [
  { value: "staff", label: "Staff" },
  { value: "workers", label: "Workshop" },
];

function num(v: number | string | null | undefined): number {
  return v == null ? 0 : typeof v === "string" ? Number(v) : v;
}

function TeamPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const tab: Tab = search.tab ?? "staff";

  const patch = (next: Partial<TeamSearch>) =>
    navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });

  return (
    <div>
      <PageHeader icon={Users} title="Team" subtitle="Shop staff & workshop workers" />

      <Segmented
        className="mb-4"
        value={tab}
        onChange={(v) => patch({ tab: v === "staff" ? undefined : v })}
        options={TABS}
      />

      {tab === "staff" && <StaffTab />}
      {tab === "workers" && <WorkersTab />}
    </div>
  );
}

// ── Staff performance ────────────────────────────────────────────────────────

function StaffTab() {
  const [preset, setPreset] = useState<RangePreset>("month");
  const [brand, setBrand] = useState("");
  const range: RangeBounds = useMemo(() => getRangeBounds(preset), [preset]);

  const { data, isLoading, isError, error, isFetching } = useStaffPerformance({
    from: range.from,
    to: range.to,
    brands: brand ? [brand] : [],
  });

  return (
    <div>
      <FilterBar>
        <FilterField label="Period">
          <RangeFilter value={preset} onChange={setPreset} />
        </FilterField>
        <FilterField label="Brand">
          <BrandSelect value={brand} onChange={setBrand} />
        </FilterField>
      </FilterBar>

      {isError ? (
        <EmptyState icon={AlertTriangle} message={(error as Error)?.message ?? "Failed to load staff performance"} />
      ) : isLoading || !data ? (
        <LoadingSkeleton count={6} />
      ) : (
        <div className={isFetching ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
            <StatsCard icon={UserCog} value={data.stats.staff_count} label="Staff" color="blue" />
            <StatsCard icon={Receipt} value={data.stats.total_orders} label="Orders taken" color="green" dimOnZero />
            <StatsCard icon={Wallet} value={Math.round(num(data.stats.total_value))} label="Value (KWD)" color="emerald" dimOnZero />
            <StatsCard icon={Ruler} value={data.stats.total_measurements} label="Measurements" color="purple" dimOnZero />
            <StatsCard icon={Coins} value={Math.round(num(data.stats.total_collections))} label="Collections (KWD)" color="amber" dimOnZero />
          </div>

          {data.data.length === 0 ? (
            <EmptyState icon={UserCog} message="No staff found" />
          ) : (
            <SectionCard bodyClassName="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border">
                      <th className="py-2.5 px-4 font-medium">Name</th>
                      <th className="py-2.5 px-3 font-medium text-right">Orders</th>
                      <th className="py-2.5 px-3 font-medium text-right">Value</th>
                      <th className="py-2.5 px-3 font-medium">Mix</th>
                      <th className="py-2.5 px-3 font-medium text-right">Measurements</th>
                      <th className="py-2.5 px-3 font-medium text-right">Collections</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.data.map((s) => <StaffPerfRowView key={s.id} s={s} preset={preset} />)}
                  </tbody>
                </table>
              </div>
              <div className="p-3 border-t border-border text-xs text-muted-foreground">{formatNum(data.data.length)} staff</div>
            </SectionCard>
          )}
        </div>
      )}
    </div>
  );
}

function Dim({ value, children }: { value: number; children: React.ReactNode }) {
  return <span className={value === 0 ? "text-muted-foreground/40" : ""}>{children}</span>;
}

function StaffPerfRowView({ s, preset }: { s: StaffPerfRow; preset: RangePreset }) {
  const orders = num(s.orders_taken);
  const measurements = num(s.measurements_taken);
  const collections = num(s.collections_amount);

  return (
    <tr className={"border-b border-border/60 hover:bg-muted/40 transition-colors " + (s.is_active ? "" : "opacity-50")}>
      <td className="py-2.5 px-4">
        <Link to="/team/staff/$userId" params={{ userId: s.id }} search={{ preset }} className="font-medium hover:underline">{s.name}</Link>
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          {s.role ? titleCase(s.role) : "—"}
          {!s.is_active && <StatusPill color="zinc">Inactive</StatusPill>}
        </div>
      </td>
      <td className="py-2.5 px-3 text-right tabular-nums"><Dim value={orders}>{formatNum(orders)}</Dim></td>
      <td className="py-2.5 px-3 text-right tabular-nums"><Dim value={num(s.orders_value)}>{formatKwd(s.orders_value)}</Dim></td>
      <td className="py-2.5 px-3"><MixCell mix={s.order_mix} /></td>
      <td className="py-2.5 px-3 text-right tabular-nums"><Dim value={measurements}>{formatNum(measurements)}</Dim></td>
      <td className="py-2.5 px-3 text-right tabular-nums"><Dim value={collections}>{formatKwd(collections)}</Dim></td>
    </tr>
  );
}

function MixCell({ mix }: { mix: { WORK: number; SALES: number; ALTERATION: number } }) {
  const bits: { label: string; value: number }[] = [
    { label: "W", value: mix.WORK },
    { label: "S", value: mix.SALES },
    { label: "A", value: mix.ALTERATION },
  ];
  if (bits.every((b) => b.value === 0)) return <span className="text-muted-foreground/40">—</span>;
  return (
    <span className="inline-flex gap-2.5 text-xs tabular-nums">
      {bits.map((b) => (
        <span key={b.label} className={b.value === 0 ? "text-muted-foreground/40" : "text-muted-foreground"}>
          <span className={b.value === 0 ? "" : "font-medium text-foreground"}>{formatNum(b.value)}</span>{b.label}
        </span>
      ))}
    </span>
  );
}

// ── Workshop workers (unchanged roster, Phase 3 will extend) ──────────────────

function WorkersTab() {
  const { data, isLoading, isError, error } = useWorkshopRoster();

  if (isError) return <EmptyState icon={AlertTriangle} message={(error as Error)?.message ?? "Failed to load workers"} />;
  if (isLoading || !data) return <LoadingSkeleton count={6} />;
  if (data.length === 0) return <EmptyState icon={Factory} message="No workshop workers found" />;

  return (
    <SectionCard bodyClassName="p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border">
              <th className="py-2.5 px-4 font-medium">Worker</th>
              <th className="py-2.5 px-3 font-medium">Unit</th>
              <th className="py-2.5 px-3 font-medium">Stage</th>
              <th className="py-2.5 px-3 font-medium">Brand</th>
              <th className="py-2.5 px-3 font-medium text-right">Rating</th>
              <th className="py-2.5 px-3 font-medium text-right">Daily target</th>
              <th className="py-2.5 px-3 font-medium">Linked user</th>
            </tr>
          </thead>
          <tbody>
            {data.map((w) => <WorkerRowView key={w.id} w={w} />)}
          </tbody>
        </table>
      </div>
      <div className="p-3 border-t border-border text-xs text-muted-foreground">{formatNum(data.length)} workers</div>
    </SectionCard>
  );
}

function WorkerRowView({ w }: { w: WorkerRow }) {
  return (
    <tr className="border-b border-border/60 hover:bg-muted/40 transition-colors">
      <td className="py-2.5 px-4">
        <div className="font-medium">{w.resource_name}</div>
        {w.resource_type && <div className="text-xs text-muted-foreground">{titleCase(w.resource_type)}</div>}
      </td>
      <td className="py-2.5 px-3 text-muted-foreground">{w.unit_name ?? "—"}</td>
      <td className="py-2.5 px-3 text-muted-foreground">{w.stage ? titleCase(w.stage) : "—"}</td>
      <td className="py-2.5 px-3">{w.brand ? <BrandBadge brand={w.brand} /> : <span className="text-muted-foreground/50">—</span>}</td>
      <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">{w.rating ?? "—"}</td>
      <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">{w.daily_target ?? "—"}</td>
      <td className="py-2.5 px-3 text-muted-foreground">
        {w.user_name ? (
          <span className="inline-flex items-center gap-1.5">
            {w.user_name}
            {w.user_active === false && <StatusPill color="zinc">Inactive</StatusPill>}
          </span>
        ) : <span className="text-muted-foreground/50">—</span>}
      </td>
    </tr>
  );
}

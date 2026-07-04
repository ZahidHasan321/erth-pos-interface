import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { ArrowLeft, UserCog, Receipt, Wallet, Ruler, Coins, AlertTriangle } from "lucide-react";
import {
  PageHeader,
  SectionCard,
  StatsCard,
  EmptyState,
  LoadingSkeleton,
} from "@/components/shared/PageShell";
import { BrandBadge } from "@/components/shared/StageBadge";
import { StatusPill } from "@/components/shared/StatusPill";
import { FilterField } from "@/components/shared/FilterBar";
import { RangeFilter } from "@/components/Filters";
import { useStaffDetail } from "@/hooks/useAdmin";
import { getRangeBounds, type RangePreset, type RangeBounds } from "@/lib/date-range";
import { formatKwd, formatNum, titleCase } from "@/lib/format";
import { formatDate } from "@/lib/utils";
import type { StaffDetail, StaffDailyRow, OrderRow } from "@/api/admin";

const PRESETS: RangePreset[] = ["today", "week", "month", "quarter", "all"];

interface StaffDetailSearch {
  preset: RangePreset;
}

export const Route = createFileRoute("/(main)/team/staff/$userId")({
  validateSearch: (s: Record<string, unknown>): StaffDetailSearch => ({
    preset: PRESETS.includes(s.preset as RangePreset) ? (s.preset as RangePreset) : "month",
  }),
  component: StaffDetailPage,
});

function num(v: number | string | null | undefined): number {
  return v == null ? 0 : typeof v === "string" ? Number(v) : v;
}

function StaffDetailPage() {
  const { userId } = Route.useParams();
  const { preset } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const range: RangeBounds = useMemo(() => getRangeBounds(preset), [preset]);

  const { data, isLoading, isError, error, isFetching } = useStaffDetail(userId, {
    from: range.from,
    to: range.to,
  });

  return (
    <div>
      <Link to="/team" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3">
        <ArrowLeft className="w-4 h-4" /> Back to team
      </Link>

      {isError ? (
        <EmptyState icon={AlertTriangle} message={(error as Error)?.message ?? "Failed to load staff member"} />
      ) : isLoading ? (
        <LoadingSkeleton count={4} />
      ) : !data ? (
        <EmptyState icon={UserCog} message="Staff member not found" />
      ) : (
        <div className={isFetching ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <StaffDetailView
            data={data}
            preset={preset}
            onPreset={(p) => navigate({ search: () => ({ preset: p }), replace: true })}
          />
        </div>
      )}
    </div>
  );
}

function StaffDetailView({
  data,
  preset,
  onPreset,
}: {
  data: StaffDetail;
  preset: RangePreset;
  onPreset: (p: RangePreset) => void;
}) {
  const u = data.user;
  const t = data.totals;

  return (
    <div>
      <PageHeader
        icon={UserCog}
        title={u.name}
        subtitle={[`@${u.username}`, u.employee_id ? `#${u.employee_id}` : null].filter(Boolean).join(" · ") || undefined}
      >
        {u.is_active ? <StatusPill color="green">Active</StatusPill> : <StatusPill color="zinc">Inactive</StatusPill>}
      </PageHeader>

      {/* Profile */}
      <SectionCard title="Profile" className="mb-4">
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
          <Field label="Role" value={u.role ? titleCase(u.role) : null} />
          <Field label="Department" value={u.department ? titleCase(u.department) : null} />
          <Field
            label="Brands"
            value={u.brands && u.brands.length ? null : "—"}
            node={u.brands && u.brands.length ? (
              <span className="inline-flex flex-wrap gap-1">
                {u.brands.map((b) => <BrandBadge key={b} brand={b.toUpperCase()} />)}
              </span>
            ) : undefined}
          />
          <Field label="Phone" value={u.phone} mono />
          <Field label="Email" value={u.email} />
          <Field label="Hire date" value={u.hire_date ? formatDate(u.hire_date) : null} />
        </dl>
      </SectionCard>

      {/* Range control */}
      <div className="mb-4">
        <FilterField label="Period">
          <RangeFilter value={preset} onChange={onPreset} />
        </FilterField>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        <StatsCard icon={Receipt} value={num(t.orders_taken)} label="Orders taken" color="green" dimOnZero />
        <StatsCard icon={Wallet} value={Math.round(num(t.orders_value))} label="Value (KWD)" color="emerald" dimOnZero />
        <StatsCard icon={Receipt} value={num(t.order_mix.WORK) + num(t.order_mix.SALES) + num(t.order_mix.ALTERATION)} label="W/S/A" color="blue" dimOnZero />
        <StatsCard icon={Ruler} value={num(t.measurements_taken)} label="Measurements" color="purple" dimOnZero />
        <StatsCard icon={Coins} value={Math.round(num(t.collections_amount))} label="Collections (KWD)" color="amber" dimOnZero />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Daily breakdown */}
        <SectionCard title={`Daily breakdown (${data.daily.length})`} bodyClassName="p-0">
          {data.daily.length === 0 ? (
            <div className="p-4"><EmptyState message="No activity in range" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-2 px-4 font-medium">Day</th>
                    <th className="py-2 px-3 font-medium text-right">Orders</th>
                    <th className="py-2 px-3 font-medium text-right">Value</th>
                    <th className="py-2 px-3 font-medium text-right">Meas.</th>
                    <th className="py-2 px-4 font-medium text-right">Collected</th>
                  </tr>
                </thead>
                <tbody>
                  {data.daily.map((d) => <DailyRowView key={d.day} d={d} />)}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        {/* Order mix summary */}
        <SectionCard title="Order mix">
          <div className="space-y-2.5 text-sm">
            <MixRow label="Work orders" value={num(t.order_mix.WORK)} />
            <MixRow label="Sales orders" value={num(t.order_mix.SALES)} />
            <MixRow label="Alteration orders" value={num(t.order_mix.ALTERATION)} />
            <div className="pt-2 mt-1 border-t border-border/60 flex items-center justify-between">
              <span className="text-muted-foreground">Collections count</span>
              <span className="tabular-nums font-medium">{formatNum(t.collections_count)}</span>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Recent orders */}
      <SectionCard title={`Recent orders (${data.recent_orders.length})`} className="mt-4" bodyClassName="p-0">
        {data.recent_orders.length === 0 ? (
          <div className="p-4"><EmptyState icon={Receipt} message="No orders taken in range" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2.5 px-4 font-medium">Order</th>
                  <th className="py-2.5 px-3 font-medium">Date</th>
                  <th className="py-2.5 px-3 font-medium">Customer</th>
                  <th className="py-2.5 px-3 font-medium">Type</th>
                  <th className="py-2.5 px-3 font-medium">Brand</th>
                  <th className="py-2.5 px-3 font-medium">Status</th>
                  <th className="py-2.5 px-3 font-medium text-right">Total</th>
                  <th className="py-2.5 px-3 font-medium text-right">Paid</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_orders.map((o) => <RecentOrderRowView key={o.id} o={o} />)}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function DailyRowView({ d }: { d: StaffDailyRow }) {
  const orders = num(d.orders_taken);
  const meas = num(d.measurements_taken);
  const collected = num(d.collections_amount);
  return (
    <tr className="border-b border-border/60 last:border-0">
      <td className="py-2 px-4 text-muted-foreground">{formatDate(d.day)}</td>
      <td className={"py-2 px-3 text-right tabular-nums " + (orders === 0 ? "text-muted-foreground/40" : "")}>{formatNum(orders)}</td>
      <td className={"py-2 px-3 text-right tabular-nums " + (num(d.orders_value) === 0 ? "text-muted-foreground/40" : "")}>{formatKwd(d.orders_value)}</td>
      <td className={"py-2 px-3 text-right tabular-nums " + (meas === 0 ? "text-muted-foreground/40" : "")}>{formatNum(meas)}</td>
      <td className={"py-2 px-4 text-right tabular-nums " + (collected === 0 ? "text-muted-foreground/40" : "")}>{formatKwd(collected)}</td>
    </tr>
  );
}

function RecentOrderRowView({ o }: { o: OrderRow }) {
  return (
    <tr className="border-b border-border/60 hover:bg-muted/40 transition-colors">
      <td className="py-2.5 px-4">
        <Link to="/orders/$orderId" params={{ orderId: String(o.id) }} className="font-medium hover:underline">#{o.id}</Link>
        {o.invoice_number != null && <div className="text-xs text-muted-foreground tabular-nums">INV-{o.invoice_number}</div>}
      </td>
      <td className="py-2.5 px-3 text-muted-foreground">{formatDate(o.order_date)}</td>
      <td className="py-2.5 px-3 text-muted-foreground">{o.c_name ?? "—"}</td>
      <td className="py-2.5 px-3 text-muted-foreground">{titleCase(o.order_type)}</td>
      <td className="py-2.5 px-3"><BrandBadge brand={o.brand} /></td>
      <td className="py-2.5 px-3">
        {o.checkout_status === "cancelled"
          ? <StatusPill color="red">Cancelled</StatusPill>
          : <span className="text-muted-foreground">{o.status_label ?? titleCase(o.order_phase ?? "—")}</span>}
      </td>
      <td className="py-2.5 px-3 text-right tabular-nums">{formatKwd(o.order_total)}</td>
      <td className="py-2.5 px-3 text-right tabular-nums">{formatKwd(o.paid)}</td>
    </tr>
  );
}

function MixRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={"tabular-nums font-medium " + (value === 0 ? "text-muted-foreground/40" : "")}>{formatNum(value)}</span>
    </div>
  );
}

function Field({ label, value, node, mono }: { label: string; value?: string | null; node?: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={mono ? "tabular-nums" : ""}>{node ?? value ?? "—"}</dd>
    </div>
  );
}

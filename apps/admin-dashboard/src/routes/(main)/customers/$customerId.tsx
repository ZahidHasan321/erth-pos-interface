import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Contact, Users2, Receipt, AlertTriangle } from "lucide-react";
import {
  PageHeader,
  SectionCard,
  StatsCard,
  EmptyState,
  LoadingSkeleton,
} from "@/components/shared/PageShell";
import { BrandBadge } from "@/components/shared/StageBadge";
import { StatusPill } from "@/components/shared/StatusPill";
import { useCustomerDetail } from "@/hooks/useAdmin";
import { formatKwd, titleCase } from "@/lib/format";
import { formatDate } from "@/lib/utils";
import type { CustomerDetail, CustomerDetailOrder } from "@/api/admin";

export const Route = createFileRoute("/(main)/customers/$customerId")({
  component: CustomerDetailPage,
});

function CustomerDetailPage() {
  const { customerId } = Route.useParams();
  const id = Number(customerId);
  const { data, isLoading, isError, error } = useCustomerDetail(id);

  return (
    <div>
      <Link to="/customers" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3">
        <ArrowLeft className="w-4 h-4" /> Back to customers
      </Link>

      {isError ? (
        <EmptyState icon={AlertTriangle} message={(error as Error)?.message ?? "Failed to load customer"} />
      ) : isLoading ? (
        <LoadingSkeleton count={4} />
      ) : !data ? (
        <EmptyState icon={Contact} message={`Customer #${customerId} not found`} />
      ) : (
        <CustomerDetailView data={data} />
      )}
    </div>
  );
}

function CustomerDetailView({ data }: { data: CustomerDetail }) {
  const c = data.customer;
  const isSecondary = c.account_type === "Secondary";

  return (
    <div>
      <PageHeader
        icon={Contact}
        title={c.name}
        subtitle={[c.nick_name, c.created_at ? `Since ${formatDate(c.created_at)}` : null].filter(Boolean).join(" · ") || undefined}
      >
        {isSecondary
          ? <StatusPill color="purple">Secondary</StatusPill>
          : <StatusPill color="blue">Primary</StatusPill>}
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Profile */}
        <SectionCard title="Profile" className="lg:col-span-2">
          {c.arabic_name && <div className="text-base font-medium mb-3" dir="rtl">{c.arabic_name}</div>}
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <Field label="Phone" value={[c.country_code, c.phone].filter(Boolean).join(" ") || null} mono />
            <Field label="Email" value={c.email} />
            <Field label="Area" value={[c.area, c.city].filter(Boolean).join(", ") || null} />
            <Field label="Nationality" value={c.nationality} />
            <Field label="Segment" value={c.customer_segment ? titleCase(c.customer_segment) : null} />
            <Field
              label="Account type"
              value={isSecondary && c.relation ? `Secondary (${titleCase(c.relation)})` : (c.account_type ?? "Primary")}
            />
          </dl>
          {c.notes && (
            <div className="mt-3 pt-3 border-t border-border">
              <div className="text-xs text-muted-foreground mb-1">Notes</div>
              <p className="text-sm whitespace-pre-wrap">{c.notes}</p>
            </div>
          )}
        </SectionCard>

        {/* Linking */}
        <SectionCard title="Family links" className="lg:col-span-1">
          {isSecondary ? (
            data.primary ? (
              <div className="text-sm">
                <div className="text-xs text-muted-foreground mb-1">
                  {c.relation ? `${titleCase(c.relation)} of` : "Linked to"}
                </div>
                <Link to="/customers/$customerId" params={{ customerId: String(data.primary.id) }} className="font-medium hover:underline inline-flex items-center gap-1.5">
                  <Users2 className="w-3.5 h-3.5 text-muted-foreground" />
                  {data.primary.name}
                </Link>
              </div>
            ) : <EmptyState message="Primary account not found" />
          ) : data.secondaries.length > 0 ? (
            <div className="divide-y divide-border -my-1">
              {data.secondaries.map((s) => (
                <Link key={s.id} to="/customers/$customerId" params={{ customerId: String(s.id) }}
                  className="flex items-center justify-between py-2 text-sm hover:underline">
                  <span className="font-medium">{s.name}</span>
                  {s.relation && <span className="text-xs text-muted-foreground">{titleCase(s.relation)}</span>}
                </Link>
              ))}
            </div>
          ) : <EmptyState message="No linked family members" />}
        </SectionCard>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        <StatsCard icon={Receipt} value={data.stats.orders_count} label="Orders" color="blue" />
        <StatsCard icon={Receipt} value={Math.round(Number(data.stats.total_spend))} label="Total spend (KWD)" color="green" />
        <StatsCard icon={Receipt} value={Math.round(Number(data.stats.outstanding_total))} label="Outstanding (KWD)" color="amber" dimOnZero />
        <StatsCard icon={Receipt} value={data.orders.length} label="Order history" color="zinc" />
      </div>
      {data.stats.last_order_at && (
        <p className="text-xs text-muted-foreground mt-2">Last order {formatDate(data.stats.last_order_at)}</p>
      )}

      {/* Order history */}
      <SectionCard title={`Order history (${data.orders.length})`} className="mt-4" bodyClassName="p-0">
        {data.orders.length === 0 ? (
          <div className="p-4"><EmptyState icon={Receipt} message="No orders yet" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2.5 px-4 font-medium">Order</th>
                  <th className="py-2.5 px-3 font-medium">Date</th>
                  <th className="py-2.5 px-3 font-medium">Type</th>
                  <th className="py-2.5 px-3 font-medium">Brand</th>
                  <th className="py-2.5 px-3 font-medium">Status</th>
                  <th className="py-2.5 px-3 font-medium">Garments</th>
                  <th className="py-2.5 px-3 font-medium text-right">Total</th>
                  <th className="py-2.5 px-3 font-medium text-right">Paid</th>
                </tr>
              </thead>
              <tbody>
                {data.orders.map((o) => <OrderRowView key={o.id} o={o} />)}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function OrderRowView({ o }: { o: CustomerDetailOrder }) {
  const garmentBits = [
    o.brova_count ? `${o.brova_count}B` : null,
    o.final_count ? `${o.final_count}F` : null,
    o.alteration_count ? `${o.alteration_count}A` : null,
  ].filter(Boolean).join(" ");

  return (
    <tr className="border-b border-border/60 hover:bg-muted/40 transition-colors">
      <td className="py-2.5 px-4">
        <Link to="/orders/$orderId" params={{ orderId: String(o.id) }} className="font-medium hover:underline">#{o.id}</Link>
        {o.invoice_number != null && <div className="text-xs text-muted-foreground tabular-nums">INV-{o.invoice_number}</div>}
      </td>
      <td className="py-2.5 px-3 text-muted-foreground">{formatDate(o.order_date)}</td>
      <td className="py-2.5 px-3 text-muted-foreground">{titleCase(o.order_type)}</td>
      <td className="py-2.5 px-3"><BrandBadge brand={o.brand} /></td>
      <td className="py-2.5 px-3">
        {o.checkout_status === "cancelled"
          ? <StatusPill color="red">Cancelled</StatusPill>
          : <span className="text-muted-foreground">{o.status_label ?? titleCase(o.order_phase ?? "—")}</span>}
      </td>
      <td className="py-2.5 px-3 tabular-nums text-muted-foreground">{garmentBits || (o.garments_count ?? 0)}</td>
      <td className="py-2.5 px-3 text-right tabular-nums">{formatKwd(o.order_total)}</td>
      <td className="py-2.5 px-3 text-right tabular-nums">{formatKwd(o.paid)}</td>
    </tr>
  );
}

function Field({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={mono ? "tabular-nums" : ""}>{value || "—"}</dd>
    </div>
  );
}

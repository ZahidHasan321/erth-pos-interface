import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Receipt, Package, Link2, AlertTriangle } from "lucide-react";
import {
  PageHeader,
  SectionCard,
  EmptyState,
  LoadingSkeleton,
} from "@/components/shared/PageShell";
import { BrandBadge, FeedbackStatusBadge } from "@/components/shared/StageBadge";
import { StatusPill } from "@/components/shared/StatusPill";
import { GarmentTypeBadge } from "@/components/shared/PageShell";
import { useOrderDetail } from "@/hooks/useAdmin";
import { formatKwd, titleCase } from "@/lib/format";
import { formatDate } from "@/lib/utils";
import { PIECE_STAGE_LABELS } from "@/lib/constants";
import type { OrderGarmentSummary, PaymentRow } from "@/api/admin";

export const Route = createFileRoute("/(main)/orders/$orderId")({
  component: OrderDetailPage,
});

function stageLabel(stage: string | null | undefined): string {
  if (!stage) return "—";
  return (PIECE_STAGE_LABELS as Record<string, string>)[stage] ?? titleCase(stage);
}

function OrderDetailPage() {
  const { orderId } = Route.useParams();
  const id = Number(orderId);
  const { data, isLoading, isError, error } = useOrderDetail(id);

  return (
    <div>
      <Link to="/orders" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3">
        <ArrowLeft className="w-4 h-4" /> Back to explorer
      </Link>

      {isError ? (
        <EmptyState icon={AlertTriangle} message={(error as Error)?.message ?? "Failed to load order"} />
      ) : isLoading ? (
        <LoadingSkeleton count={4} />
      ) : !data ? (
        <EmptyState message={`Order #${orderId} not found`} />
      ) : (
        <OrderDetailView orderId={orderId} data={data} />
      )}
    </div>
  );
}

function OrderDetailView({ orderId, data }: { orderId: string; data: NonNullable<ReturnType<typeof useOrderDetail>["data"]> }) {
  const order = data.order as Record<string, unknown>;
  const brand = String(order.brand ?? "");
  const orderType = String(order.order_type ?? "");
  const invoice = data.totals.invoice_revision;
  const invoiceNumber = (data.work_order?.invoice_number ?? data.alteration_order?.invoice_number) as number | undefined;

  return (
    <div>
      <PageHeader icon={Receipt} title={`Order #${orderId}`}
        subtitle={[titleCase(orderType), invoiceNumber != null ? `INV-${invoiceNumber}${invoice > 0 ? `-R${invoice}` : ""}` : null,
          formatDate(String(order.order_date ?? ""))].filter(Boolean).join(" · ")}>
        <BrandBadge brand={brand} />
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Money */}
        <SectionCard title="Financial" className="lg:col-span-1">
          <dl className="space-y-2 text-sm">
            <Row label="Order total" value={formatKwd(data.totals.order_total)} strong />
            <Row label="Paid" value={formatKwd(data.totals.paid)} />
            <Row label="Outstanding" value={formatKwd(data.totals.outstanding)}
              tone={Number(data.totals.outstanding) > 0 ? "warn" : "ok"} />
            {data.totals.advance != null && <Row label="Advance" value={formatKwd(data.totals.advance)} />}
            <Row label="Invoice revision" value={invoice > 0 ? `R${invoice}` : "Original"} />
          </dl>
        </SectionCard>

        {/* Customer */}
        <SectionCard title="Customer" className="lg:col-span-2">
          {data.customer ? (
            <div className="text-sm space-y-1">
              <div className="font-medium">{String((data.customer as Record<string, unknown>).name ?? "—")}</div>
              <div className="text-muted-foreground tabular-nums">{String((data.customer as Record<string, unknown>).phone ?? "")}</div>
              {(data.customer as Record<string, unknown>).account_type === "Secondary" && (
                <StatusPill color="violet">Secondary account</StatusPill>
              )}
            </div>
          ) : <EmptyState message="No customer linked" />}
        </SectionCard>
      </div>

      {/* Payments */}
      <SectionCard title="Payments" className="mt-4" bodyClassName="p-0">
        {data.payments.length === 0 ? <div className="p-4"><EmptyState message="No transactions yet" /></div> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="py-2 px-4 font-medium">Date</th>
                <th className="py-2 px-3 font-medium">Type</th>
                <th className="py-2 px-3 font-medium">Method</th>
                <th className="py-2 px-3 font-medium">Ref</th>
                <th className="py-2 px-3 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.payments.map((p: PaymentRow) => (
                <tr key={p.id} className="border-b border-border/60">
                  <td className="py-2 px-4 text-muted-foreground">{formatDate(p.created_at)}</td>
                  <td className="py-2 px-3">
                    {p.transaction_type === "refund"
                      ? <StatusPill color="red">Refund</StatusPill>
                      : <StatusPill color="green">Payment</StatusPill>}
                  </td>
                  <td className="py-2 px-3 text-muted-foreground">{titleCase(p.payment_type ?? "—")}</td>
                  <td className="py-2 px-3 text-muted-foreground tabular-nums">{p.payment_ref_no ?? "—"}</td>
                  <td className={"py-2 px-3 text-right tabular-nums " + (p.transaction_type === "refund" ? "text-[var(--status-bad)]" : "")}>
                    {p.transaction_type === "refund" ? "-" : ""}{formatKwd(Math.abs(Number(p.amount)))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      {/* Linked orders */}
      {data.linked_group.length > 0 && (
        <SectionCard title="Linked orders" className="mt-4"
          action={<span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Link2 className="w-3 h-3" />{data.linked_group.length} sibling{data.linked_group.length > 1 ? "s" : ""}</span>}>
          <div className="divide-y divide-border -my-1">
            {data.linked_group.map((l) => (
              <div key={l.order_id} className="flex items-center justify-between py-2 text-sm">
                <Link to="/orders/$orderId" params={{ orderId: String(l.order_id) }} className="font-medium hover:underline">
                  #{l.order_id}{l.invoice_number != null ? ` · INV-${l.invoice_number}` : ""}
                </Link>
                <span className="flex items-center gap-3">
                  {l.is_primary && <StatusPill color="blue">Primary</StatusPill>}
                  {l.order_phase && <span className="text-xs text-muted-foreground">{titleCase(l.order_phase)}</span>}
                  <span className="tabular-nums">{formatKwd(l.order_total)}</span>
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Garments */}
      <SectionCard title={`Garments (${data.garments.length})`} className="mt-4" bodyClassName="p-0">
        {data.garments.length === 0 ? <div className="p-4"><EmptyState icon={Package} message="No garments on this order" /></div> : (
          <div className="divide-y divide-border">
            {data.garments.map((g: OrderGarmentSummary) => (
              <Link key={g.id} to="/garments/$garmentId" params={{ garmentId: g.id }}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <GarmentTypeBadge type={g.garment_type} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{g.garment_id}{g.style ? ` · ${g.style}` : ""}</div>
                    <div className="text-xs text-muted-foreground">
                      {stageLabel(g.piece_stage)} · {titleCase(g.location ?? "—")}{g.trip_number ? ` · trip ${g.trip_number}` : ""}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {g.feedback_status && <FeedbackStatusBadge status={g.feedback_status} />}
                  {g.in_production && <StatusPill color="sky">In production</StatusPill>}
                  {g.needs_investigation && <StatusPill color="red">Investigate</StatusPill>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "ok" | "warn" }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={"tabular-nums " + (strong ? "font-semibold " : "") + (tone === "warn" ? "text-[var(--status-warn)]" : tone === "ok" ? "text-[var(--status-ok)]" : "")}>{value}</dd>
    </div>
  );
}

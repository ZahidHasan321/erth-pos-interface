import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { SectionCard, EmptyState, LoadingSkeleton } from "@/components/shared/PageShell";
import { BrandBadge } from "@/components/shared/StageBadge";
import { StatusPill } from "@/components/shared/StatusPill";
import { usePurchaseDetail } from "@/hooks/useFinance";
import { formatKwd, formatNum, titleCase } from "@/lib/format";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { PurchaseDetail } from "@/api/finance";

export const Route = createFileRoute("/(main)/finance/purchases/$purchaseId")({
  component: PurchaseDetailPage,
});

function StatusBadge({ status }: { status: string }) {
  if (status === "paid") return <StatusPill color="green">Paid</StatusPill>;
  if (status === "partially_paid") return <StatusPill color="amber">Partial</StatusPill>;
  return <StatusPill color="red">Unpaid</StatusPill>;
}

function PurchaseDetailPage() {
  const { purchaseId } = Route.useParams();
  const { data, isLoading, isError, error } = usePurchaseDetail(Number(purchaseId));

  return (
    <div>
      <Link to="/finance/purchases" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> All purchases
      </Link>

      {isError ? (
        <EmptyState icon={AlertTriangle} message={(error as Error)?.message ?? "Failed to load purchase"} />
      ) : isLoading || !data ? (
        <LoadingSkeleton count={3} />
      ) : (
        <PurchaseDetailBody d={data} />
      )}
    </div>
  );
}

function PurchaseDetailBody({ d }: { d: PurchaseDetail }) {
  const p = d.purchase;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">Purchase #{p.id}</h2>
        <BrandBadge brand={p.brand} />
        <StatusBadge status={p.status} />
        <span className="text-sm text-muted-foreground">{formatDate(p.created_at)}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Payable">
          <div className="space-y-2 text-sm">
            <Row label="Item" value={p.item_name ?? `${titleCase(p.item_type)} #${p.item_id}`} />
            <Row label="Quantity" value={`${formatNum(p.qty)} × ${formatKwd(p.unit_cost)}`} />
            <Row label="Supplier" value={p.supplier_name ?? "—"} />
            <Row label="Recorded by" value={p.created_by_name ?? "—"} />
            {p.notes && <Row label="Notes" value={p.notes} />}
            <div className="flex items-center justify-between pt-2 mt-1 border-t border-border font-medium">
              <span>Total cost</span><span className="tabular-nums">{formatKwd(p.total_cost)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Paid</span><span className="tabular-nums">{formatKwd(p.amount_paid)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Outstanding</span>
              <span className={"tabular-nums font-medium " + (Number(p.outstanding) > 0 ? "text-[var(--status-warn)]" : "text-[var(--status-ok)]")}>{formatKwd(p.outstanding)}</span>
            </div>
          </div>
        </SectionCard>

        {p.invoice_image_url && (
          <SectionCard title="Supplier invoice">
            <a href={p.invoice_image_url} target="_blank" rel="noreferrer">
              <img src={p.invoice_image_url} alt="Supplier invoice" className="max-h-80 rounded-md border border-border object-contain" />
            </a>
          </SectionCard>
        )}
      </div>

      <SectionCard title={`Settlement payments (${formatNum(d.payments.length)})`} bodyClassName="p-0">
        {d.payments.length === 0 ? (
          <div className="p-4"><EmptyState message="No payments recorded yet" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 px-4 font-medium">When</th>
                  <th className="py-2 px-3 font-medium">Method</th>
                  <th className="py-2 px-3 font-medium">Drawer</th>
                  <th className="py-2 px-3 font-medium">By</th>
                  <th className="py-2 px-4 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {d.payments.map((pay) => (
                  <tr key={pay.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2 px-4 text-muted-foreground whitespace-nowrap">{formatDateTime(pay.paid_at)}</td>
                    <td className="py-2 px-3">
                      {titleCase(pay.payment_type)}
                      {pay.payment_ref_no && <div className="text-xs text-muted-foreground/70 tabular-nums">{pay.payment_ref_no}</div>}
                    </td>
                    <td className="py-2 px-3 tabular-nums">
                      {pay.register_session_id != null ? (
                        <Link to="/finance/registers/$sessionId" params={{ sessionId: String(pay.register_session_id) }} className="text-muted-foreground hover:underline">#{pay.register_session_id}</Link>
                      ) : <span className="text-muted-foreground/50">—</span>}
                      {pay.register_cash_movement_id != null && <span className="ml-1 text-xs text-[var(--status-warn)]">cash out</span>}
                    </td>
                    <td className="py-2 px-3 text-muted-foreground truncate max-w-[120px]">{pay.paid_by_name ?? "—"}</td>
                    <td className="py-2 px-4 text-right tabular-nums font-medium">{formatKwd(pay.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

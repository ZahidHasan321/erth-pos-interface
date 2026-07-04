import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, AlertTriangle, Scale } from "lucide-react";
import { SectionCard, EmptyState, LoadingSkeleton } from "@/components/shared/PageShell";
import { BrandBadge } from "@/components/shared/StageBadge";
import { StatusPill } from "@/components/shared/StatusPill";
import { useRegisterDetail } from "@/hooks/useFinance";
import { formatKwd, formatNum, titleCase } from "@/lib/format";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { RegisterDetail } from "@/api/finance";

export const Route = createFileRoute("/(main)/finance/registers/$sessionId")({
  component: RegisterDetailPage,
});

function num(v: number | string | null | undefined): number {
  return v == null ? 0 : typeof v === "string" ? Number(v) : v;
}

function VarianceValue({ value }: { value: number | string | null }) {
  if (value == null) return <span className="text-muted-foreground/50">not counted</span>;
  const n = Number(value);
  if (n === 0) return <span className="text-[var(--status-ok)] tabular-nums">0.000 (balanced)</span>;
  return (
    <span className={"tabular-nums font-medium " + (n < 0 ? "text-[var(--status-bad)]" : "text-[var(--status-warn)]")}>
      {n > 0 ? "+" : "−"}{formatKwd(Math.abs(n))} ({n < 0 ? "short" : "over"})
    </span>
  );
}

function RegisterDetailPage() {
  const { sessionId } = Route.useParams();
  const { data, isLoading, isError, error } = useRegisterDetail(Number(sessionId));

  return (
    <div>
      <Link to="/finance/registers" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> All registers
      </Link>

      {isError ? (
        <EmptyState icon={AlertTriangle} message={(error as Error)?.message ?? "Failed to load register"} />
      ) : isLoading || !data ? (
        <LoadingSkeleton count={4} />
      ) : (
        <RegisterDetailBody d={data} />
      )}
    </div>
  );
}

function RegisterDetailBody({ d }: { d: RegisterDetail }) {
  const s = d.session;
  const r = d.reconciliation;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">Register #{s.id}</h2>
        <BrandBadge brand={s.brand} />
        {s.status === "open"
          ? <StatusPill color="blue">Open</StatusPill>
          : <StatusPill color="green">Closed</StatusPill>}
        <span className="text-sm text-muted-foreground">{formatDate(s.date)}</span>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span>Opened {formatDateTime(s.opened_at)} by {s.opened_by_name ?? "—"}</span>
        {s.closed_at && <span>Closed {formatDateTime(s.closed_at)} by {s.closed_by_name ?? "—"}</span>}
        {s.reopened_at && <span>Reopened {formatDateTime(s.reopened_at)} by {s.reopened_by_name ?? "—"}</span>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Reconciliation */}
        <SectionCard title="Cash reconciliation">
          <div className="space-y-2 text-sm">
            <ReconRow label="Opening float" value={formatKwd(r.opening_float)} />
            <ReconRow label="+ Cash payments" value={formatKwd(r.cash_payments)} sign="pos" />
            <ReconRow label="− Cash refunds" value={formatKwd(r.cash_refunds)} sign="neg" dim={num(r.cash_refunds) === 0} />
            <ReconRow label="+ Cash in" value={formatKwd(r.cash_in)} sign="pos" dim={num(r.cash_in) === 0} />
            <ReconRow label="− Cash out" value={formatKwd(r.cash_out)} sign="neg" dim={num(r.cash_out) === 0} />
            <div className="flex items-center justify-between pt-2 mt-1 border-t border-border font-medium">
              <span>Expected in drawer</span>
              <span className="tabular-nums">{formatKwd(r.expected)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Counted</span>
              <span className="tabular-nums">{r.counted != null ? formatKwd(r.counted) : "—"}</span>
            </div>
            <div className="flex items-center justify-between pt-2 mt-1 border-t border-border">
              <span className="flex items-center gap-1.5"><Scale className="w-4 h-4 text-muted-foreground" />Variance</span>
              <VarianceValue value={r.variance} />
            </div>
            {s.closing_notes && <p className="text-xs text-muted-foreground pt-1">Note: {s.closing_notes}</p>}
          </div>
        </SectionCard>

        {/* By method (all methods, not just cash) */}
        <SectionCard title="All takings by method" bodyClassName="p-0">
          {d.by_method.length === 0 ? (
            <div className="p-4"><EmptyState message="No transactions on this drawer" /></div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 px-4 font-medium">Method</th>
                  <th className="py-2 px-3 font-medium text-right">Collected</th>
                  <th className="py-2 px-3 font-medium text-right">Refunded</th>
                  <th className="py-2 px-4 font-medium text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                {d.by_method.map((m) => (
                  <tr key={m.payment_type} className="border-b border-border/60 last:border-0">
                    <td className="py-2 px-4">{titleCase(m.payment_type)}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{formatKwd(m.collected)}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{num(m.refunded) > 0 ? formatKwd(m.refunded) : "—"}</td>
                    <td className="py-2 px-4 text-right tabular-nums font-medium">{formatKwd(m.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
      </div>

      {/* Cash movements */}
      {d.cash_movements.length > 0 && (
        <SectionCard title="Cash movements (in / out)" bodyClassName="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="py-2 px-4 font-medium">When</th>
                <th className="py-2 px-3 font-medium">Direction</th>
                <th className="py-2 px-3 font-medium">Reason</th>
                <th className="py-2 px-3 font-medium">By</th>
                <th className="py-2 px-4 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {d.cash_movements.map((c) => (
                <tr key={c.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2 px-4 text-muted-foreground whitespace-nowrap">{formatDateTime(c.created_at)}</td>
                  <td className="py-2 px-3">
                    <span className={c.type === "cash_in" ? "text-[var(--status-ok)]" : "text-[var(--status-warn)]"}>
                      {c.type === "cash_in" ? "In" : "Out"}
                    </span>
                  </td>
                  <td className="py-2 px-3">{titleCase(c.reason_category)}{c.reason && <div className="text-xs text-muted-foreground truncate max-w-[220px]">{c.reason}</div>}</td>
                  <td className="py-2 px-3 text-muted-foreground truncate max-w-[120px]">{c.performed_by_name ?? "—"}</td>
                  <td className="py-2 px-4 text-right tabular-nums">{formatKwd(c.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      )}

      {/* Close history */}
      {d.close_events.length > 0 && (
        <SectionCard title="Close history">
          <div className="space-y-2 text-sm">
            {d.close_events.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 border-b border-border/60 last:border-0">
                <span className="text-muted-foreground">{formatDateTime(e.closed_at)} · {e.closed_by_name ?? "—"}</span>
                <span className="flex items-center gap-4 tabular-nums">
                  <span>exp {formatKwd(e.expected_cash)}</span>
                  <span>counted {formatKwd(e.counted_cash)}</span>
                  <VarianceValue value={e.variance} />
                </span>
                {e.notes && <span className="w-full text-xs text-muted-foreground">Note: {e.notes}</span>}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Transactions on this drawer */}
      <SectionCard title={`Transactions (${formatNum(d.transactions.length)})`} bodyClassName="p-0">
        {d.transactions.length === 0 ? (
          <div className="p-4"><EmptyState message="No transactions on this drawer" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 px-4 font-medium">When</th>
                  <th className="py-2 px-3 font-medium">Order</th>
                  <th className="py-2 px-3 font-medium">Type</th>
                  <th className="py-2 px-3 font-medium">Method</th>
                  <th className="py-2 px-3 font-medium">Cashier</th>
                  <th className="py-2 px-4 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {d.transactions.map((t) => {
                  const isRefund = t.transaction_type === "refund";
                  return (
                    <tr key={t.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40 transition-colors">
                      <td className="py-2 px-4 text-muted-foreground whitespace-nowrap">{formatDateTime(t.created_at)}</td>
                      <td className="py-2 px-3">
                        <Link to="/orders/$orderId" params={{ orderId: String(t.order_id) }} className="font-medium hover:underline">#{t.order_id}</Link>
                        {t.invoice_number != null && <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">INV-{t.invoice_number}</span>}
                      </td>
                      <td className="py-2 px-3">
                        <span className={isRefund ? "text-[var(--status-warn)]" : "text-[var(--status-ok)]"}>{isRefund ? "Refund" : "Payment"}</span>
                      </td>
                      <td className="py-2 px-3 text-muted-foreground">{titleCase(t.payment_type ?? "—")}</td>
                      <td className="py-2 px-3 text-muted-foreground truncate max-w-[120px]">{t.cashier_name ?? "—"}</td>
                      <td className="py-2 px-4 text-right tabular-nums font-medium">
                        <span className={isRefund ? "text-[var(--status-warn)]" : ""}>{isRefund ? "−" : ""}{formatKwd(Math.abs(Number(t.amount)))}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function ReconRow({ label, value, sign, dim }: { label: string; value: string; sign?: "pos" | "neg"; dim?: boolean }) {
  return (
    <div className={"flex items-center justify-between " + (dim ? "opacity-50" : "")}>
      <span className="text-muted-foreground">{label}</span>
      <span className={"tabular-nums " + (sign === "pos" ? "text-[var(--status-ok)]" : sign === "neg" ? "text-[var(--status-warn)]" : "")}>{value}</span>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Package, AlertTriangle, Star } from "lucide-react";
import {
  PageHeader,
  SectionCard,
  EmptyState,
  LoadingSkeleton,
  GarmentTypeBadge,
} from "@/components/shared/PageShell";
import { BrandBadge, FeedbackStatusBadge } from "@/components/shared/StageBadge";
import { StatusPill } from "@/components/shared/StatusPill";
import { useGarmentDetail } from "@/hooks/useAdmin";
import { formatKwd, formatDuration, titleCase } from "@/lib/format";
import { formatDate, parseUtcTimestamp } from "@/lib/utils";
import { PIECE_STAGE_LABELS } from "@/lib/constants";
import type { GarmentDetail, GarmentFeedbackRow } from "@/api/admin";

export const Route = createFileRoute("/(main)/garments/$garmentId")({
  component: GarmentDetailPage,
});

function stageLabel(stage: string | null | undefined): string {
  if (!stage) return "—";
  return (PIECE_STAGE_LABELS as Record<string, string>)[stage] ?? titleCase(stage);
}

function GarmentDetailPage() {
  const { garmentId } = Route.useParams();
  const { data, isLoading, isError, error } = useGarmentDetail(garmentId);

  return (
    <div>
      <Link to="/orders" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3">
        <ArrowLeft className="w-4 h-4" /> Back to explorer
      </Link>
      {isError ? (
        <EmptyState icon={AlertTriangle} message={(error as Error)?.message ?? "Failed to load garment"} />
      ) : isLoading ? (
        <LoadingSkeleton count={5} />
      ) : !data ? (
        <EmptyState message="Garment not found" />
      ) : (
        <GarmentView data={data} />
      )}
    </div>
  );
}

// ── Section (native collapsible; Overview stays open) ────────────────────────
function Collapsible({ title, count, defaultOpen, children }: {
  title: string; count?: number; defaultOpen?: boolean; children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group bg-card border border-border rounded-md overflow-hidden mt-4">
      <summary className="px-4 py-2.5 border-b bg-muted/30 flex items-center justify-between gap-2 cursor-pointer list-none select-none">
        <h3 className="text-sm font-medium text-muted-foreground">
          {title}{count != null ? ` (${count})` : ""}
        </h3>
        <span className="text-xs text-muted-foreground group-open:rotate-90 transition-transform">›</span>
      </summary>
      <div className="p-4">{children}</div>
    </details>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm mt-0.5">{value ?? "—"}</dd>
    </div>
  );
}

interface StageSession { worker?: string | null; started_at?: string | null; completed_at?: string | null }
interface QcAttempt {
  inspector?: string | null; date?: string | null; result?: string | null; attempt_number?: number;
  quality_ratings?: Record<string, number> | null;
  failed_measurements?: string[] | null; failed_options?: string[] | null; failed_quality?: string[] | null;
  defect_attributions?: { category?: string; key?: string; stage?: string; scope?: string; responsible?: string }[] | null;
}
interface TripEntry {
  trip?: number; reentry_stage?: string | null; assigned_date?: string | null; completed_date?: string | null;
  qc_attempts?: QcAttempt[] | null;
}

function durationSecs(s: StageSession): number {
  if (!s.started_at || !s.completed_at) return 0;
  return Math.max(0, (parseUtcTimestamp(s.completed_at).getTime() - parseUtcTimestamp(s.started_at).getTime()) / 1000);
}

function GarmentView({ data }: { data: GarmentDetail }) {
  const g = data.garment as Record<string, unknown>;
  const stageTimings = (g.stage_timings && typeof g.stage_timings === "object" ? g.stage_timings : {}) as Record<string, StageSession[]>;
  const tripHistory = (Array.isArray(g.trip_history) ? g.trip_history : []) as TripEntry[];
  const allAttempts = tripHistory.flatMap((t) => (Array.isArray(t.qc_attempts) ? t.qc_attempts : []).map((a) => ({ ...a, trip: t.trip })));

  const timingRows = Object.entries(stageTimings)
    .map(([stage, sessions]) => {
      const arr = Array.isArray(sessions) ? sessions : [];
      const total = arr.reduce((sum, s) => sum + durationSecs(s), 0);
      return { stage, sessions: arr.length, total };
    })
    .filter((r) => r.sessions > 0);

  return (
    <div>
      <PageHeader icon={Package} title={String(g.garment_id ?? "Garment")}
        subtitle={[stageLabel(g.piece_stage as string), titleCase(String(g.location ?? "")), g.style ? String(g.style) : null]
          .filter(Boolean).join(" · ")}>
        <div className="flex items-center gap-2">
          <GarmentTypeBadge type={String(g.garment_type ?? "")} />
          <BrandBadge brand={data.order.brand} />
        </div>
      </PageHeader>

      {/* ── Overview (open) ─────────────────────────────────────────── */}
      <SectionCard title="Overview">
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KV label="Order" value={<Link to="/orders/$orderId" params={{ orderId: String(data.order.id) }} className="hover:underline font-medium">#{data.order.id}{data.order.invoice_number != null ? ` · INV-${data.order.invoice_number}` : ""}</Link>} />
          <KV label="Customer" value={data.customer.name ?? "—"} />
          <KV label="Stage" value={stageLabel(g.piece_stage as string)} />
          <KV label="Location" value={titleCase(String(g.location ?? "—"))} />
          <KV label="Trip" value={String(g.trip_number ?? 0)} />
          <KV label="In production" value={g.in_production ? <StatusPill color="sky">Yes</StatusPill> : "No"} />
          <KV label="Fabric" value={data.fabric ? `${data.fabric.name ?? ""}${data.fabric.sku ? ` (${data.fabric.sku})` : ""}` : "Customer-brought"} />
          <KV label="Acceptance" value={g.acceptance_status == null ? "—" : g.acceptance_status ? "Accepted" : "Not accepted"} />
          <KV label="Feedback" value={g.feedback_status ? <FeedbackStatusBadge status={String(g.feedback_status)} /> : "—"} />
          <KV label="Root cause" value={g.root_cause ? titleCase(String(g.root_cause)) : "—"} />
          <KV label="Delivery date" value={g.delivery_date ? formatDate(String(g.delivery_date)) : "—"} />
          <KV label="Collected" value={g.collected_at ? formatDate(String(g.collected_at)) : "—"} />
        </dl>
        {g.needs_investigation ? <div className="mt-3"><StatusPill color="red">Needs investigation</StatusPill></div> : null}
      </SectionCard>

      {/* ── Per-terminal timing ─────────────────────────────────────── */}
      <Collapsible title="Per-terminal timing" count={timingRows.length} defaultOpen={timingRows.length > 0}>
        {timingRows.length === 0 ? <EmptyState message="No stage timings recorded" /> : (
          <div className="divide-y divide-border -my-1">
            {timingRows.map((r) => (
              <div key={r.stage} className="flex items-center justify-between py-2 text-sm">
                <span>{titleCase(r.stage)}</span>
                <span className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{r.sessions} session{r.sessions > 1 ? "s" : ""}</span>
                  <span className="tabular-nums font-medium">{formatDuration(r.total)}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </Collapsible>

      {/* ── QC attempts ─────────────────────────────────────────────── */}
      <Collapsible title="QC attempts" count={allAttempts.length} defaultOpen={allAttempts.length > 0}>
        {allAttempts.length === 0 ? <EmptyState message="No QC attempts yet" /> : (
          <div className="space-y-3">
            {allAttempts.map((a, i) => (
              <div key={i} className="border border-border rounded-md p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">
                    Trip {a.trip ?? "—"} · attempt {a.attempt_number ?? i + 1}
                    {a.inspector ? <span className="text-muted-foreground font-normal"> · {a.inspector}</span> : null}
                  </span>
                  <span className="flex items-center gap-2">
                    {a.date && <span className="text-xs text-muted-foreground">{formatDate(a.date)}</span>}
                    <StatusPill color={a.result === "pass" ? "green" : "red"}>{titleCase(a.result ?? "—")}</StatusPill>
                  </span>
                </div>
                {a.quality_ratings && Object.keys(a.quality_ratings).length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {Object.entries(a.quality_ratings).map(([k, v]) => (
                      <span key={k} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-muted">
                        {titleCase(k)}
                        <span className={"inline-flex items-center gap-0.5 tabular-nums " + (v < 4 ? "text-[var(--status-bad)]" : "text-[var(--status-ok)]")}>
                          <Star className="w-3 h-3" fill="currentColor" />{v}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
                {[["Measurements", a.failed_measurements], ["Options", a.failed_options], ["Quality", a.failed_quality]]
                  .filter(([, arr]) => Array.isArray(arr) && (arr as string[]).length > 0)
                  .map(([label, arr]) => (
                    <div key={label as string} className="text-xs mb-1">
                      <span className="text-muted-foreground">Failed {String(label).toLowerCase()}: </span>
                      <span className="text-[var(--status-bad)]">{(arr as string[]).map(titleCase).join(", ")}</span>
                    </div>
                  ))}
                {Array.isArray(a.defect_attributions) && a.defect_attributions.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border/60 flex flex-wrap gap-1.5">
                    {a.defect_attributions.map((d, j) => (
                      <span key={j} className="text-xs px-2 py-0.5 rounded-md bg-[var(--status-warn-bg)] text-[var(--status-warn)]">
                        {titleCase(d.key ?? "")} → {titleCase(d.stage ?? "")}{d.responsible ? ` · ${d.responsible}` : ""}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Collapsible>

      {/* ── Lifecycle timeline ──────────────────────────────────────── */}
      <Collapsible title="Lifecycle timeline" count={tripHistory.length}>
        {tripHistory.length === 0 ? <EmptyState message="No trip history" /> : (
          <ol className="relative border-l border-border ml-2 space-y-4">
            {tripHistory.map((t, i) => (
              <li key={i} className="ml-4">
                <span className="absolute -left-1.5 w-3 h-3 rounded-full bg-[var(--status-info)]" />
                <div className="text-sm font-medium">Trip {t.trip ?? i}</div>
                <div className="text-xs text-muted-foreground">
                  {t.reentry_stage ? `Re-entry: ${titleCase(t.reentry_stage)} · ` : ""}
                  {t.assigned_date ? `assigned ${formatDate(t.assigned_date)}` : ""}
                  {t.completed_date ? ` · completed ${formatDate(t.completed_date)}` : ""}
                </div>
                {Array.isArray(t.qc_attempts) && t.qc_attempts.length > 0 && (
                  <div className="text-xs text-muted-foreground mt-0.5">{t.qc_attempts.length} QC attempt{t.qc_attempts.length > 1 ? "s" : ""}</div>
                )}
              </li>
            ))}
          </ol>
        )}
      </Collapsible>

      {/* ── Feedback ────────────────────────────────────────────────── */}
      <Collapsible title="Feedback" count={data.feedback.length}>
        {data.feedback.length === 0 ? <EmptyState message="No feedback recorded" /> : (
          <div className="space-y-2">
            {data.feedback.map((f: GarmentFeedbackRow) => (
              <div key={f.id} className="border border-border rounded-md p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{titleCase(f.feedback_type ?? "—")}{f.trip_number ? ` · trip ${f.trip_number}` : ""}</span>
                  <span className="flex items-center gap-2">
                    {f.action && <StatusPill color={f.action.includes("redo") ? "red" : f.action.includes("repair") ? "amber" : "green"}>{titleCase(f.action)}</StatusPill>}
                    {f.satisfaction_level != null && (
                      <span className="inline-flex items-center gap-0.5 text-xs tabular-nums text-muted-foreground"><Star className="w-3 h-3" fill="currentColor" />{f.satisfaction_level}</span>
                    )}
                  </span>
                </div>
                {f.notes && <p className="text-muted-foreground mt-1">{f.notes}</p>}
                <div className="text-xs text-muted-foreground mt-1">{formatDate(f.created_at)}</div>
              </div>
            ))}
          </div>
        )}
      </Collapsible>

      {/* ── Financial + redo chain ──────────────────────────────────── */}
      <Collapsible title="Financial & redo chain">
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KV label="Fabric price" value={g.fabric_price_snapshot != null ? formatKwd(g.fabric_price_snapshot as number) : "—"} />
          <KV label="Stitching price" value={g.stitching_price_snapshot != null ? formatKwd(g.stitching_price_snapshot as number) : "—"} />
          <KV label="Style price" value={g.style_price_snapshot != null ? formatKwd(g.style_price_snapshot as number) : "—"} />
          <KV label="Custom price" value={g.custom_price != null ? formatKwd(g.custom_price as number) : "—"} />
        </dl>
        {(data.replaced_by || data.original) && (
          <div className="mt-4 pt-4 border-t border-border space-y-2 text-sm">
            {data.original && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs">Replaces:</span>
                <Link to="/garments/$garmentId" params={{ garmentId: data.original.id }} className="hover:underline font-medium">{data.original.garment_id}</Link>
              </div>
            )}
            {data.replaced_by && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs">Replaced by:</span>
                <Link to="/garments/$garmentId" params={{ garmentId: data.replaced_by.id }} className="hover:underline font-medium">{data.replaced_by.garment_id}</Link>
                <span className="text-xs text-muted-foreground">({stageLabel(data.replaced_by.piece_stage)})</span>
              </div>
            )}
          </div>
        )}
      </Collapsible>
    </div>
  );
}

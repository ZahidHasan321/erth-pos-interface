import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getQcAnalytics, type QcAspectStat, type AttributedDefect } from "@/api/qcAnalytics";
import { QC_QUALITY, QC_OPTIONS } from "@/lib/qc-spec";
import { MEASUREMENTS_SPEC } from "@repo/database";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { Skeleton } from "@repo/ui/skeleton";
import { PageHeader, SectionCard, EmptyState, KpiCard } from "@/components/shared/PageShell";
import { cn, getLocalDateStr, getKuwaitDayRange, TIMEZONE } from "@/lib/utils";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip as RechartsTooltip, ReferenceLine,
} from "recharts";
import {
  ShieldCheck, ClipboardList, AlertTriangle, Ruler, ListChecks, Workflow, Users,
  Star, TrendingDown, RotateCcw, CheckCircle2, ArrowRight,
} from "lucide-react";

type Preset = "today" | "week" | "month" | "quarter";
type QcSearch = { preset?: Preset };

const isPreset = (v: unknown): v is Preset =>
  v === "today" || v === "week" || v === "month" || v === "quarter";

export const Route = createFileRoute("/(main)/qc-analytics")({
  component: QcAnalyticsPage,
  head: () => ({ meta: [{ title: "QC Analytics" }] }),
  validateSearch: (raw: Record<string, unknown>): QcSearch => ({
    preset: isPreset(raw.preset) ? raw.preset : undefined,
  }),
});

// Quality-aspect labels, derived from the QC spec (strip the "Rating " prefix so
// the analytics page reads "Seam", not "Rating Seam"). No new label set invented.
const ASPECT_LABEL: Record<string, string> = Object.fromEntries(
  QC_QUALITY.map((q) => [q.key, q.label.replace(/^Rating\s+/, "")]),
);

const STAGE_LABEL: Record<string, string> = {
  soaking: "Soaking", cutting: "Cutting", sewing: "Sewing",
  finishing: "Finishing", ironing: "Ironing", quality_check: "QC",
};

// Field-key → proper label maps for the measurement/option defect lists.
// Reused from the canonical specs — no new label set invented (same approach
// as ASPECT_LABEL). Keys are the measurement/option column names the QC eval
// stores in failed_measurements / failed_options. Measurements pull from
// MEASUREMENTS_SPEC (Title Case) rather than QC_MEASUREMENTS (uppercased for the
// operator spec sheet) so all four lists read in consistent Title Case.
const MEASUREMENT_LABEL: Record<string, string> = Object.fromEntries(
  MEASUREMENTS_SPEC.map((m) => [m.key, m.label]),
);
const OPTION_LABEL: Record<string, string> = Object.fromEntries(
  QC_OPTIONS.map((o) => [o.key, o.label]),
);

function getDateRange(preset: string): { from: string; to: string } {
  const today = new Date();
  const todayStr = getLocalDateStr(today);
  const end = getKuwaitDayRange(todayStr).end;
  const rangeFrom = (daysBack: number) => {
    const start = new Date(today);
    start.setDate(start.getDate() - daysBack);
    return getKuwaitDayRange(getLocalDateStr(start)).start;
  };
  switch (preset) {
    case "today":   return { from: getKuwaitDayRange(todayStr).start, to: end };
    case "month":   return { from: rangeFrom(29), to: end };
    case "quarter": return { from: rangeFrom(89), to: end };
    default:        return { from: rangeFrom(6), to: end }; // week
  }
}

// Rating tier → semantic token (4 = conformity threshold).
function ratingTone(avg: number): "ok" | "warn" | "bad" {
  if (avg >= 4.5) return "ok";
  if (avg >= 4) return "warn";
  return "bad";
}
// Pass-rate tier → tone. 90/75 breaks, matching the Performance page's vitals.
function passRateTone(pct: number | null): "ok" | "warn" | "bad" | null {
  if (pct === null) return null;
  if (pct >= 90) return "ok";
  if (pct >= 75) return "warn";
  return "bad";
}

const TONE_TEXT = {
  ok: "text-[var(--status-ok)]",
  warn: "text-[var(--status-warn)]",
  bad: "text-[var(--status-bad)]",
  info: "text-[var(--status-info)]",
} as const;
const TONE_BAR = {
  ok: "bg-[var(--status-ok)]",
  warn: "bg-[var(--status-warn)]",
  bad: "bg-[var(--status-bad)]",
} as const;

/** Simple count-ranked defect list (measurement / option / stage breakdowns).
 *  Bar = share of the worst field (longer = more defects = worse), the same
 *  "fuller bar is worse" language used everywhere else on the page. */
function DefectList({
  title, icon, data, labelFor, emptyMsg,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  data: Record<string, number>;
  labelFor?: (key: string) => string;
  emptyMsg: string;
}) {
  const rows = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = rows.length ? rows[0][1] : 0;
  return (
    <SectionCard title={title}>
      {rows.length === 0 ? (
        <EmptyState icon={icon} message={emptyMsg} />
      ) : (
        <div className="space-y-1.5">
          {rows.map(([key, count]) => (
            <div key={key} className="flex items-center gap-3 text-sm">
              <span className="w-40 truncate min-w-0">{labelFor ? labelFor(key) : key}</span>
              <div className="flex-1 bg-muted rounded-md h-2 overflow-hidden" aria-hidden="true">
                <div className="h-full bg-[var(--status-bad)]" style={{ width: `${max > 0 ? (count / max) * 100 : 0}%` }} />
              </div>
              <span className="tabular-nums font-medium w-12 text-right">{count}</span>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// Stage order for the team breakdown — soaking & QC are never attributable (§6).
const ATTRIBUTION_STAGE_ORDER = ["cutting", "sewing", "finishing", "ironing"] as const;

/** "3 quality · 2 measurement" — only the non-zero categories, quality first. */
function categoryHint(by: AttributedDefect["by_category"]): string {
  const parts: string[] = [];
  if (by.quality) parts.push(`${by.quality} quality`);
  if (by.measurement) parts.push(`${by.measurement} measurement`);
  if (by.option) parts.push(`${by.option} option`);
  return parts.join(" · ");
}

/** Inspector-attributed defect blame (§6), grouped by stage, worst-first within
 *  each stage. Bars share one scale (the global max count) for cross-stage reads. */
function TeamDefectBreakdown({ rows }: { rows: AttributedDefect[] }) {
  const max = rows.reduce((mx, r) => Math.max(mx, r.count), 0);
  const groups = ATTRIBUTION_STAGE_ORDER
    .map((stage) => ({
      stage,
      items: rows.filter((r) => r.stage === stage).sort((a, b) => b.count - a.count),
    }))
    .filter((g) => g.items.length > 0);

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={Users}
        message="No defects attributed yet. Tag the cause on each error in the QC fail dialog."
      />
    );
  }

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.stage}>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium flex items-center gap-1.5">
              {STAGE_LABEL[g.stage] ?? g.stage}
              {g.items[0]?.scope === "unit" && (
                <span className="text-xs text-muted-foreground font-normal">(unit)</span>
              )}
            </h4>
            <span className="text-xs text-muted-foreground tabular-nums">
              {g.items.reduce((s, r) => s + r.count, 0)} defects
            </span>
          </div>
          <div className="space-y-1.5">
            {g.items.map((r) => (
              <div key={`${r.stage}:${r.responsible}`} className="flex items-center gap-3 text-sm">
                <span className="w-36 truncate min-w-0">{r.responsible}</span>
                <div className="flex-1 bg-muted rounded-md h-2 overflow-hidden" aria-hidden="true">
                  <div className="h-full bg-[var(--status-bad)]" style={{ width: `${max > 0 ? (r.count / max) * 100 : 0}%` }} />
                </div>
                <span className="hidden sm:block text-xs text-muted-foreground w-40 text-right truncate">
                  {categoryHint(r.by_category)}
                </span>
                <span className="tabular-nums font-medium w-10 text-right">{r.count}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Needs-attention finding ─────────────────────────────────────────
// A finding is PURELY a re-presentation of metrics already computed — it carries
// no new evaluation. The panel turns the page from "read six charts" into "here's
// what to act on", mirroring the Performance page's Needs-attention strip.
type Finding = {
  id: string;
  tone: "ok" | "warn" | "bad" | "info";
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  detail: string;
  action?: { label: string; run: () => void };
};

const TONE_RANK: Record<Finding["tone"], number> = { bad: 0, warn: 1, info: 2, ok: 3 };

const scrollToId = (id: string) =>
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

function FindingRow({ f }: { f: Finding }) {
  const Icon = f.icon;
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <Icon className={cn("w-4 h-4 shrink-0 mt-0.5", TONE_TEXT[f.tone])} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{f.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{f.detail}</p>
      </div>
      {f.action && (
        <button
          type="button"
          onClick={f.action.run}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground shrink-0 transition-colors rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {f.action.label}
          <ArrowRight className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

function QcAnalyticsPage() {
  const sp = Route.useSearch();
  const preset = sp.preset ?? "week";
  const nav = Route.useNavigate();
  const setPreset = (v: string) =>
    nav({ search: () => ({ preset: isPreset(v) && v !== "week" ? v : undefined }), replace: true });

  const dateRange = useMemo(() => getDateRange(preset), [preset]);
  const { data, isLoading } = useQuery({
    queryKey: ["qc-analytics", dateRange.from, dateRange.to],
    queryFn: () => getQcAnalytics(dateRange.from, dateRange.to),
    staleTime: 30_000,
    enabled: !!dateRange.from && !!dateRange.to,
  });

  // Workmanship aspects, worst-first (lowest avg rating). null-avg aspects (rated 0) drop out.
  const aspectRows = useMemo(() => {
    const entries = Object.entries(data?.by_aspect ?? {}) as [string, QcAspectStat][];
    return entries
      .filter(([, s]) => s.rated > 0)
      .sort((a, b) => a[1].avg - b[1].avg);
  }, [data]);

  const passRate = data && data.total_attempts > 0
    ? Math.round((data.pass / data.total_attempts) * 100)
    : null;
  const passTone = passRateTone(passRate);

  // Overall workmanship: rated-count-weighted mean of every aspect's avg.
  const overallAvg = useMemo(() => {
    const rated = aspectRows.reduce((s, [, a]) => s + a.rated, 0);
    if (rated === 0) return null;
    return aspectRows.reduce((s, [, a]) => s + a.avg * a.rated, 0) / rated;
  }, [aspectRows]);

  const attributedDefects = data?.attributed_defects ?? [];

  const trendData = (data?.trend ?? []).filter((p) => p.avg !== null);

  // Spec-origin breakdowns — which to render (empty cards are suppressed).
  const measurementDefects = data?.measurement_defects ?? {};
  const optionDefects = data?.option_defects ?? {};
  const stageDefects = data?.stage_defects ?? {};
  const hasMeas = Object.keys(measurementDefects).length > 0;
  const hasOpt = Object.keys(optionDefects).length > 0;
  const hasStage = Object.keys(stageDefects).length > 0;
  const anyOrigin = hasMeas || hasOpt || hasStage;

  const presetLabel = preset === "today" ? "today" : preset === "week" ? "this week" : preset === "month" ? "this month" : "this quarter";

  // ── Needs-attention findings (re-presentation of the metrics above) ──
  const findings = useMemo(() => {
    const out: Finding[] = [];
    if (!data || data.total_attempts === 0) return out;

    // 1. Pass rate below "strong" — the headline failure signal.
    if (passRate !== null && passRate < 90) {
      out.push({
        id: "pass-rate",
        tone: passRate < 75 ? "bad" : "warn",
        icon: ShieldCheck,
        title: `QC pass rate ${passRate}%`,
        detail: `${data.fail} of ${data.total_attempts} inspection${data.total_attempts === 1 ? "" : "s"} failed ${presetLabel}`,
      });
    }

    // 2. Workmanship aspects under the conformity line (avg < 4), worst-first.
    const weak = aspectRows.filter(([, s]) => s.avg < 4);
    if (weak.length > 0) {
      out.push({
        id: "weak-aspects",
        tone: weak[0][1].avg < 3 ? "bad" : "warn",
        icon: TrendingDown,
        title: `${weak.length} workmanship aspect${weak.length === 1 ? "" : "s"} below conformity`,
        detail:
          weak.slice(0, 3).map(([k, s]) => `${ASPECT_LABEL[k] ?? k} ${s.avg.toFixed(1)}`).join(" · ") +
          (weak.length > 3 ? ` · +${weak.length - 3} more` : ""),
        action: { label: "View", run: () => scrollToId("qc-ratings") },
      });
    }

    // 3. Most common spec defect (measurement + option combined), ranked.
    const topDefects = [
      ...Object.entries(data.measurement_defects).map(([k, c]) => ({ label: MEASUREMENT_LABEL[k] ?? k, count: c })),
      ...Object.entries(data.option_defects).map(([k, c]) => ({ label: OPTION_LABEL[k] ?? k, count: c })),
    ].sort((a, b) => b.count - a.count);
    if (topDefects.length > 0) {
      const [top, ...rest] = topDefects;
      out.push({
        id: "top-defect",
        tone: "warn",
        icon: AlertTriangle,
        title: `Most common defect: ${top.label} (${top.count})`,
        detail: rest.length > 0
          ? `Then ${rest.slice(0, 2).map((d) => `${d.label} ${d.count}`).join(" · ")}`
          : "Only flagged spec defect this period",
        action: { label: "View", run: () => scrollToId("qc-origin") },
      });
    }

    // 4. Where rework is routed back most (routing view, not blame). Info-level.
    const stageRows = Object.entries(data.stage_defects)
      .map(([k, c]) => ({ label: STAGE_LABEL[k] ?? k, count: c }))
      .sort((a, b) => b.count - a.count);
    if (stageRows.length > 0) {
      out.push({
        id: "worst-stage",
        tone: "info",
        icon: RotateCcw,
        title: `Most rework routed back to ${stageRows[0].label}`,
        detail: `${stageRows[0].count} return${stageRows[0].count === 1 ? "" : "s"} sent to this stage`,
        action: { label: "View", run: () => scrollToId("qc-origin") },
      });
    }

    return out.sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone]);
  }, [data, passRate, aspectRows, presetLabel]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <PageHeader icon={ShieldCheck} title="QC Analytics">
        <Select value={preset} onValueChange={setPreset}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">Last 7 days</SelectItem>
            <SelectItem value="month">Last 30 days</SelectItem>
            <SelectItem value="quarter">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </PageHeader>

      {isLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-md" />)}
          </div>
          <Skeleton className="h-32 rounded-md" />
          <div className="grid lg:grid-cols-2 gap-4">
            <Skeleton className="h-72 rounded-md" />
            <Skeleton className="h-72 rounded-md" />
          </div>
        </div>
      ) : !data || data.total_attempts === 0 ? (
        <EmptyState icon={ClipboardList} message={`No QC inspections recorded ${presetLabel}`} />
      ) : (
        <>
          {/* Vitals — the glance layer. Colored by status so the number is the signal. */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              icon={ShieldCheck}
              label="QC pass rate"
              value={passRate === null ? "-" : `${passRate}%`}
              tone={passTone}
              subtitle={passRate === null ? "no inspections" : passRate >= 90 ? "Strong" : passRate >= 75 ? "Watch" : "Needs attention"}
            />
            <KpiCard
              icon={Star}
              label="Avg workmanship"
              value={overallAvg === null ? "-" : overallAvg.toFixed(1)}
              tone={overallAvg === null ? null : ratingTone(overallAvg)}
              subtitle={overallAvg === null ? "no ratings" : "of 5 · 4 = conformity"}
            />
            <KpiCard icon={ClipboardList} label="Inspections" value={data.total_attempts} subtitle={presetLabel} />
            <KpiCard
              icon={AlertTriangle}
              label="Failed inspections"
              value={data.fail}
              tone={data.fail > 0 ? "bad" : null}
              subtitle={`${data.pass} passed`}
            />
          </div>

          {/* Needs attention — exceptions auto-surfaced from the same metrics, so
              the inspector sees what to act on without reading every chart. */}
          <SectionCard
            title="Needs attention"
            action={
              findings.length > 0 ? (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {findings.length} flag{findings.length === 1 ? "" : "s"}
                </span>
              ) : null
            }
            bodyClassName="p-0"
          >
            {findings.length === 0 ? (
              <div className="flex items-center gap-2.5 px-4 py-4 text-sm text-muted-foreground">
                <CheckCircle2 className="w-4 h-4 text-[var(--status-ok)] shrink-0" />
                Quality is tracking well this period, no flags.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {findings.map((f) => (
                  <FindingRow key={f.id} f={f} />
                ))}
              </div>
            )}
          </SectionCard>

          {/* Quality lens — trend over time beside the per-aspect workmanship scores. */}
          <div className="grid lg:grid-cols-2 gap-4 items-start">
            <SectionCard title="Quality trend" action={<span className="text-xs text-muted-foreground">avg rating / day · 4 = conformity</span>}>
              {trendData.length > 1 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      tickFormatter={(v) => {
                        const d = new Date(v + "T12:00:00+03:00");
                        return d.toLocaleDateString("en-GB", { timeZone: TIMEZONE, month: "short", day: "numeric" });
                      }}
                    />
                    <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={24} />
                    <RechartsTooltip
                      contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid var(--border)" }}
                      labelFormatter={(v) => {
                        const d = new Date(v + "T12:00:00+03:00");
                        return d.toLocaleDateString("en-GB", { timeZone: TIMEZONE, weekday: "short", month: "short", day: "numeric" });
                      }}
                    />
                    <ReferenceLine y={4} stroke="var(--status-warn)" strokeDasharray="4 3" strokeWidth={1} />
                    <Line
                      type="monotone"
                      dataKey="avg"
                      stroke="var(--status-info)"
                      strokeWidth={2}
                      dot={{ r: 2.5, fill: "var(--status-info)" }}
                      activeDot={{ r: 4 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
                  Not enough rating data for a trend
                </div>
              )}
            </SectionCard>

            {/* Workmanship ratings (the 1–5 aspect scores). Bar = fail rate so a
                fuller bar reads as worse everywhere on the page; the number is the
                avg score, tinted by tier. */}
            <div id="qc-ratings" className="scroll-mt-4">
              <SectionCard
                title="Workmanship ratings"
                action={<span className="text-xs text-muted-foreground">avg score · bar = fail rate</span>}
              >
                {aspectRows.length === 0 ? (
                  <EmptyState icon={ShieldCheck} message="No quality ratings recorded in this period" />
                ) : (
                  <div className="space-y-1.5">
                    {aspectRows.map(([key, s]) => {
                      const tone = ratingTone(s.avg);
                      const failRate = s.rated > 0 ? Math.round((s.fails / s.rated) * 100) : 0;
                      return (
                        <div key={key} className="flex items-center gap-3 text-sm">
                          <span className="w-28 truncate min-w-0">{ASPECT_LABEL[key] ?? key}</span>
                          <div className="flex-1 bg-muted rounded-md h-2 overflow-hidden" aria-hidden="true">
                            <div className={cn("h-full", TONE_BAR[tone])} style={{ width: `${failRate}%` }} />
                          </div>
                          <span className={cn("tabular-nums font-medium w-10 text-right", TONE_TEXT[tone])}>
                            {s.avg.toFixed(1)}
                          </span>
                          <span className="tabular-nums text-muted-foreground w-16 text-right">
                            {s.fails}/{s.rated} fail
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </SectionCard>
            </div>
          </div>

          {/* Where defects come from — the spec/origin breakdowns. Empty lists are
              suppressed so a clean period doesn't render hollow cards. */}
          <div id="qc-origin" className="scroll-mt-4">
            {anyOrigin ? (
              <div className="grid lg:grid-cols-3 gap-4">
                {hasMeas && (
                  <DefectList
                    title="Measurement defects"
                    icon={Ruler}
                    data={measurementDefects}
                    labelFor={(k) => MEASUREMENT_LABEL[k] ?? k}
                    emptyMsg="No measurement defects"
                  />
                )}
                {hasOpt && (
                  <DefectList
                    title="Option defects"
                    icon={ListChecks}
                    data={optionDefects}
                    labelFor={(k) => OPTION_LABEL[k] ?? k}
                    emptyMsg="No option defects"
                  />
                )}
                {hasStage && (
                  <DefectList
                    title="Defect origin by stage"
                    icon={Workflow}
                    data={stageDefects}
                    labelFor={(k) => STAGE_LABEL[k] ?? k}
                    emptyMsg="No stage-attributed defects"
                  />
                )}
              </div>
            ) : (
              <SectionCard title="Where defects come from">
                <EmptyState icon={Workflow} message="No measurement, option, or stage defects recorded in this period" />
              </SectionCard>
            )}
          </div>

          {/* Accountability — the §6 inspector attribution. Demoted to the foot of
              the page: it's a manual, optional tag, so it's often empty and doesn't
              earn space above the fold. */}
          <SectionCard
            title="Defects by team & worker"
            action={<span className="text-xs text-muted-foreground">QC-attributed · worst first</span>}
          >
            <TeamDefectBreakdown rows={attributedDefects} />
            <p className="text-xs text-muted-foreground pt-3 mt-3 border-t border-border/60">
              Reflects the QC inspector's per-defect attribution from the fail dialog. The{" "}
              <span className="text-foreground">Performance</span> page's per-unit defect rate is the
              routing-based view (where pieces were sent back) — a distinct measure.
            </p>
          </SectionCard>
        </>
      )}
    </div>
  );
}

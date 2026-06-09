import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getQcAnalytics, type QcAspectStat } from "@/api/qcAnalytics";
import { QC_QUALITY, QC_OPTIONS } from "@/lib/qc-spec";
import { MEASUREMENTS_SPEC } from "@repo/database";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { Skeleton } from "@repo/ui/skeleton";
import { PageHeader, SectionCard, EmptyState } from "@/components/shared/PageShell";
import { cn, getLocalDateStr, getKuwaitDayRange, TIMEZONE } from "@/lib/utils";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip as RechartsTooltip, ReferenceLine,
} from "recharts";
import { ShieldCheck, ClipboardList, AlertTriangle, Ruler, ListChecks, Workflow } from "lucide-react";

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
const TONE_TEXT = {
  ok: "text-[var(--status-ok)]",
  warn: "text-[var(--status-warn)]",
  bad: "text-[var(--status-bad)]",
} as const;
const TONE_BAR = {
  ok: "bg-[var(--status-ok)]",
  warn: "bg-[var(--status-warn)]",
  bad: "bg-[var(--status-bad)]",
} as const;

function KpiCard({
  icon: Icon, label, value, subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  subtitle?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-md p-4">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <p className="text-xs">{label}</p>
      </div>
      <p className="text-2xl font-semibold tabular-nums tracking-tight mt-2">{value}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-1 truncate">{subtitle}</p>}
    </div>
  );
}

/** Simple count-ranked defect list (measurement / option / stage breakdowns). */
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

  // Defect categories, worst-first (lowest avg rating). null-avg aspects (rated 0) drop out.
  const aspectRows = useMemo(() => {
    const entries = Object.entries(data?.by_aspect ?? {}) as [string, QcAspectStat][];
    return entries
      .filter(([, s]) => s.rated > 0)
      .sort((a, b) => a[1].avg - b[1].avg);
  }, [data]);

  const passRate = data && data.total_attempts > 0
    ? Math.round((data.pass / data.total_attempts) * 100)
    : null;

  const trendData = (data?.trend ?? []).filter((p) => p.avg !== null);

  const presetLabel = preset === "today" ? "today" : preset === "week" ? "this week" : preset === "month" ? "this month" : "this quarter";

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
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-md" />)}
          </div>
          <Skeleton className="h-72 rounded-md" />
          <Skeleton className="h-72 rounded-md" />
        </div>
      ) : !data || data.total_attempts === 0 ? (
        <EmptyState icon={ClipboardList} message={`No QC inspections recorded ${presetLabel}`} />
      ) : (
        <>
          {/* Headline KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <KpiCard
              icon={ShieldCheck}
              label="QC pass rate (per inspection)"
              value={passRate === null ? "-" : `${passRate}%`}
              subtitle={passRate === null ? "no inspections" : passRate >= 90 ? "Strong" : passRate >= 75 ? "Watch" : "Needs attention"}
            />
            <KpiCard icon={ClipboardList} label="Inspections" value={data.total_attempts} subtitle={presetLabel} />
            <KpiCard icon={AlertTriangle} label="Failed inspections" value={data.fail} subtitle={`${data.pass} passed`} />
          </div>

          {/* Defect by category (the 1–5 ratings, analyzed) */}
          <SectionCard
            title="Defect by category"
            action={<span className="text-xs text-muted-foreground">avg rating · worst first</span>}
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
                      <span className="w-36 truncate min-w-0">{ASPECT_LABEL[key] ?? key}</span>
                      <div className="flex-1 bg-muted rounded-md h-2 overflow-hidden" aria-hidden="true">
                        {/* Bar = avg on a 1–5 scale (5 = full). */}
                        <div className={cn("h-full", TONE_BAR[tone])} style={{ width: `${(s.avg / 5) * 100}%` }} />
                      </div>
                      <span className={cn("tabular-nums font-medium w-12 text-right", TONE_TEXT[tone])}>
                        {s.avg.toFixed(2)}
                      </span>
                      <span className="tabular-nums text-muted-foreground w-24 text-right">
                        {s.fails}/{s.rated} fail
                      </span>
                      <span className="tabular-nums text-muted-foreground w-12 text-right">{failRate}%</span>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>

          {/* Quality trend */}
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

          {/* Spec & origin breakdowns */}
          <div className="grid lg:grid-cols-3 gap-4">
            <DefectList
              title="Measurement defects"
              icon={Ruler}
              data={data.measurement_defects}
              labelFor={(k) => MEASUREMENT_LABEL[k] ?? k}
              emptyMsg="No measurement defects"
            />
            <DefectList
              title="Option defects"
              icon={ListChecks}
              data={data.option_defects}
              labelFor={(k) => OPTION_LABEL[k] ?? k}
              emptyMsg="No option defects"
            />
            <DefectList
              title="Defect origin by stage"
              icon={Workflow}
              data={data.stage_defects}
              labelFor={(k) => STAGE_LABEL[k] ?? k}
              emptyMsg="No stage-attributed defects"
            />
          </div>

          <p className="text-xs text-muted-foreground px-1">
            Team-level quality comparison (per-unit defect rate) is on the{" "}
            <span className="text-foreground">Performance</span> page.
          </p>
        </>
      )}
    </div>
  );
}

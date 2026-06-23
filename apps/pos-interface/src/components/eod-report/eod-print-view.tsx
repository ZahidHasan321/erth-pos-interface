import { Document, Page, Text, View, StyleSheet, Svg, Path, Circle, Rect, Line, pdf } from "@react-pdf/renderer";
import { PAYMENT_TYPE_LABELS, PAYMENT_METHOD_COLORS } from "@/lib/constants";
import { parseUtcTimestamp, TIMEZONE } from "@/lib/utils";
import type { EodReportSummary, EodTransaction, RegisterSessionData } from "@/api/cashier";
import { CASH_MOVEMENT_CATEGORY_LABEL } from "@/lib/cashMovementLabels";

// ── Formatting ──────────────────────────────────────────────────────────────
// KWD is a 3-decimal currency (fils). Fixed decimals + thousands separators keep
// money columns aligned and unambiguous. IMPORTANT: never use the U+2212 math
// minus (−) — the built-in PDF fonts have no glyph for it, so it silently drops
// and a deduction reads as a credit. Negatives use accounting parentheses.
const numFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const money = (n: number | string): string => numFmt.format(Number(n) || 0);
const kwd = (n: number | string): string => `${money(n)} KWD`;
// Compact form for the donut centre, where the full 3-decimal string is too wide.
const compact = (n: number | string): string => {
    const v = Number(n) || 0;
    if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
    return numFmt.format(v);
};

const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false });
const dateFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, day: "2-digit", month: "short", year: "numeric" });
const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, day: "2-digit" });

export interface PrintEodReportParams {
    summary: EodReportSummary;
    transactions: EodTransaction[];
    dateFrom: string;
    dateTo: string;
    registerSession?: RegisterSessionData | null;
    // Cashier shell: omit expected cash + variance from the drawer table
    // (blind count, SPEC §3). The manager report leaves this false.
    hideCashReconciliation?: boolean;
}

// ── Palette ─────────────────────────────────────────────────────────────────
// A printed statement, not a screen. Mostly ink-on-paper, with one restrained
// brand accent reserved for the masthead, headings and the headline figure.
const C = {
    ink: "#16201b",
    body: "#2a2a27",
    muted: "#5f5f5b",
    faint: "#8c8c86",
    line: "#cdcabf",   // hairline rule
    rule: "#16201b",   // strong rule
    accent: "#1d5c4a",   // deep teal-green — masthead, headings, charts
    accentInk: "#123b30",
    pos: "#1d6b4f",
    neg: "#b3402f",
    track: "#e7e5dc",   // chart track
    zebra: "#f6f5f0",   // alternating table row
};

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    page: {
        paddingTop: 36,
        paddingHorizontal: 46,
        paddingBottom: 56, // room for the fixed footer
        fontFamily: "Helvetica",
        fontSize: 9.5,
        color: C.body,
        lineHeight: 1.35,
    },

    topAccent: { height: 3, backgroundColor: C.accent, marginBottom: 10 },

    // Masthead
    masthead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingBottom: 8 },
    brandName: { fontSize: 26, fontFamily: "Helvetica-Bold", letterSpacing: 5, color: C.accentInk, lineHeight: 1 },
    reportTitle: { fontSize: 9.5, letterSpacing: 2.5, textTransform: "uppercase", color: C.muted, marginTop: 8 },
    metaBlock: { alignItems: "flex-end" },
    metaRow: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 2.5 },
    metaLabel: { fontSize: 7.5, textTransform: "uppercase", letterSpacing: 0.8, color: C.faint, marginRight: 8, alignSelf: "center" },
    metaValue: { fontSize: 9.5, color: C.ink, fontFamily: "Helvetica-Bold", textAlign: "right" },
    metaValueSm: { fontSize: 8.5, color: C.muted, textAlign: "right" },
    ruleThick: { borderBottomWidth: 1.5, borderBottomColor: C.rule },
    ruleHair: { borderBottomWidth: 0.5, borderBottomColor: C.rule, marginTop: 1.5 },

    // Headline (the one big number + the payment-method donut)
    headlineRow: { flexDirection: "row", alignItems: "center", marginTop: 16, marginBottom: 14 },
    headlineLeft: { flex: 1, paddingRight: 18 },
    headlineKicker: { fontSize: 8, textTransform: "uppercase", letterSpacing: 1.4, color: C.muted, marginBottom: 5 },
    headlineValue: { fontSize: 31, fontFamily: "Helvetica-Bold", color: C.accentInk, lineHeight: 1 },
    headlineSub: { fontSize: 8.5, color: C.muted, marginTop: 8 },

    chartCol: { width: 156, alignItems: "center" },
    chartHead: { fontSize: 7, textTransform: "uppercase", letterSpacing: 0.7, color: C.faint, marginBottom: 6, textAlign: "center" },
    donutWrap: { width: 118, height: 118, position: "relative" },
    donutCenter: { position: "absolute", top: 0, left: 0, width: 118, height: 118, alignItems: "center", justifyContent: "center" },
    donutCenterVal: { fontSize: 12.5, fontFamily: "Helvetica-Bold", color: C.ink },
    donutCenterLbl: { fontSize: 6, textTransform: "uppercase", letterSpacing: 0.5, color: C.faint, marginTop: 1 },
    legend: { marginTop: 8, width: "100%" },
    legendRow: { flexDirection: "row", alignItems: "center", marginBottom: 2.5 },
    legendDot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
    legendLabel: { flex: 1, fontSize: 7.5, color: C.body },
    legendVal: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: C.ink, textAlign: "right" },

    // Section heading
    section: { marginTop: 16 },
    sectionFirst: { marginTop: 4 },
    sectionTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1.6, color: C.accentInk },
    sectionNote: { fontSize: 7.5, color: C.faint, marginTop: 2 },
    sectionRule: { borderBottomWidth: 0.75, borderBottomColor: C.rule, marginTop: 5, marginBottom: 8 },

    // Key/value statement table (ruled, HTML-table look)
    kvTable: { borderWidth: 0.75, borderColor: C.line },
    kvRow: { flexDirection: "row", alignItems: "baseline", paddingVertical: 5, paddingHorizontal: 10, borderBottomWidth: 0.5, borderBottomColor: C.line },
    kvRowLast: { borderBottomWidth: 0 },
    kvRowStrong: { backgroundColor: C.zebra, borderTopWidth: 0.75, borderTopColor: C.rule },
    kvLabelWrap: { flex: 1, paddingRight: 8 },
    kvLabel: { fontSize: 9.5, color: C.body },
    kvLabelStrong: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: C.ink },
    kvSub: { fontSize: 7, color: C.faint, marginTop: 1 },
    kvValue: { fontSize: 10, color: C.ink, textAlign: "right", fontVariant: ["tabular-nums"], minWidth: 110 },
    kvValueStrong: { fontSize: 11, fontFamily: "Helvetica-Bold", color: C.ink, textAlign: "right", fontVariant: ["tabular-nums"], minWidth: 110 },
    kvValueNeg: { fontSize: 10, color: C.neg, textAlign: "right", fontVariant: ["tabular-nums"], minWidth: 110 },

    // Daily chart
    dayLabelRow: { flexDirection: "row", marginTop: 3 },
    dayLabel: { fontSize: 5.8, color: C.faint, textAlign: "center" },

    // Statement rows (label … amount) — used for cash drawer / cash flow / sales
    stmt: {},
    stmtRow: { flexDirection: "row", alignItems: "baseline", paddingVertical: 3 },
    stmtLabel: { flex: 1, color: C.body },
    stmtLabelMuted: { flex: 1, color: C.muted },
    stmtNum: { width: 150, textAlign: "right", color: C.ink, fontVariant: ["tabular-nums"] },
    stmtRuleAbove: { borderTopWidth: 0.5, borderTopColor: C.line, marginTop: 2, paddingTop: 5 },
    stmtTotalLabel: { flex: 1, color: C.ink, fontFamily: "Helvetica-Bold" },
    stmtTotalNum: { width: 150, textAlign: "right", color: C.ink, fontFamily: "Helvetica-Bold" },

    // Tables
    tHead: { flexDirection: "row", borderTopWidth: 1, borderTopColor: C.rule, borderBottomWidth: 0.75, borderBottomColor: C.rule },
    tHeadCell: { fontSize: 7, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.5, color: C.ink, paddingVertical: 4, paddingHorizontal: 5 },
    tRow: { flexDirection: "row", borderBottomWidth: 0.4, borderBottomColor: C.line, alignItems: "center" },
    tRowAlt: { backgroundColor: C.zebra },
    tCell: { paddingVertical: 3.5, paddingHorizontal: 5, color: C.body },
    tCellNum: { paddingVertical: 3.5, paddingHorizontal: 5, color: C.ink, textAlign: "right" },
    tTotal: { flexDirection: "row", borderTopWidth: 0.75, borderTopColor: C.rule, borderBottomWidth: 1.5, borderBottomColor: C.rule, alignItems: "center" },
    tTotalCell: { paddingVertical: 4, paddingHorizontal: 5, color: C.ink, fontFamily: "Helvetica-Bold" },
    tTotalNum: { paddingVertical: 4, paddingHorizontal: 5, color: C.ink, fontFamily: "Helvetica-Bold", textAlign: "right" },

    closingNote: { fontSize: 7.5, color: C.muted, marginTop: 6 },

    // Sign-off
    signRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 26 },
    signCol: { width: "42%" },
    signLine: { borderBottomWidth: 0.75, borderBottomColor: C.ink, height: 26 },
    signLabel: { fontSize: 7.5, textTransform: "uppercase", letterSpacing: 0.8, color: C.muted, marginTop: 4 },

    // Footer (fixed on every page). NOTE: kept to static text only — in
    // @react-pdf/renderer 4.x a `render`-prop (dynamic "Page X of Y") fixed
    // element silently drops out when the document has more than one <Page>,
    // which this report needs (summary + ledger). Static fixed text is reliable.
    footer: {
        position: "absolute", bottom: 26, left: 46, right: 46,
        flexDirection: "row", justifyContent: "space-between", alignItems: "center",
        borderTopWidth: 0.5, borderTopColor: C.line, paddingTop: 6,
    },
    footerText: { fontSize: 7, color: C.faint, letterSpacing: 0.3 },
});

// ── Pie chart (hand-built SVG; react-pdf has no chart lib) ────────────────────
const CONTENT_W = 503; // A4 width (595.28) less 46pt margins each side

function polar(cx: number, cy: number, radius: number, deg: number): [number, number] {
    const a = ((deg - 90) * Math.PI) / 180; // 0deg = top, clockwise
    return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)];
}

function donutSegmentPath(cx: number, cy: number, rOuter: number, rInner: number, a0: number, a1: number): string {
    const [ox0, oy0] = polar(cx, cy, rOuter, a0);
    const [ox1, oy1] = polar(cx, cy, rOuter, a1);
    const [ix1, iy1] = polar(cx, cy, rInner, a1);
    const [ix0, iy0] = polar(cx, cy, rInner, a0);
    const large = a1 - a0 > 180 ? 1 : 0;
    const f = (n: number) => n.toFixed(2);
    return `M ${f(ox0)} ${f(oy0)} A ${rOuter} ${rOuter} 0 ${large} 1 ${f(ox1)} ${f(oy1)} L ${f(ix1)} ${f(iy1)} A ${rInner} ${rInner} 0 ${large} 0 ${f(ix0)} ${f(iy0)} Z`;
}

function DonutChart({ segments, size }: { segments: { value: number; color: string }[]; size: number }) {
    const cx = size / 2;
    const cy = size / 2;
    const rOuter = size / 2;
    const ring = 16;
    const rInner = rOuter - ring;
    const live = segments.filter((seg) => seg.value > 0);
    const total = live.reduce((acc, seg) => acc + seg.value, 0);
    if (total <= 0) return null;

    // A single tender is a full ring — an arc whose start == end is degenerate,
    // so draw it as a stroked circle instead.
    if (live.length === 1) {
        return (
            <Svg width={size} height={size}>
                <Circle cx={cx} cy={cy} r={(rOuter + rInner) / 2} stroke={live[0].color} strokeWidth={ring} fill="none" />
            </Svg>
        );
    }

    const gap = 1.6;
    let acc = 0;
    return (
        <Svg width={size} height={size}>
            <Circle cx={cx} cy={cy} r={(rOuter + rInner) / 2} stroke={C.track} strokeWidth={ring} fill="none" />
            {live.map((seg, i) => {
                const a0 = (acc / total) * 360 + gap / 2;
                acc += seg.value;
                const a1 = (acc / total) * 360 - gap / 2;
                if (a1 <= a0) return null;
                return <Path key={i} d={donutSegmentPath(cx, cy, rOuter, rInner, a0, a1)} fill={seg.color} />;
            })}
        </Svg>
    );
}

function DailyTrend({ data }: { data: { date: string; collected: number | string }[] }) {
    const W = CONTENT_W;
    const H = 88;
    const n = data.length;
    const max = Math.max(...data.map((d) => Number(d.collected)), 1);
    const gap = n > 24 ? 1.5 : n > 14 ? 3 : 5;
    const bw = Math.max(2, (W - gap * (n - 1)) / n);
    const showLabels = n <= 16;
    return (
        <View wrap={false}>
            <Svg width={W} height={H}>
                <Line x1={0} y1={H - 0.5} x2={W} y2={H - 0.5} stroke={C.line} strokeWidth={0.5} />
                {data.map((d, i) => {
                    const v = Number(d.collected);
                    const bh = max > 0 ? (v / max) * (H - 6) : 0;
                    const x = i * (bw + gap);
                    const y = H - bh;
                    return <Rect key={i} x={x} y={y} width={bw} height={bh} fill={C.accent} rx={1} />;
                })}
            </Svg>
            {showLabels ? (
                <View style={s.dayLabelRow}>
                    {data.map((d, i) => (
                        <Text key={i} style={[s.dayLabel, { width: bw, marginRight: i < n - 1 ? gap : 0 }]}>
                            {dayFmt.format(new Date(d.date + "T12:00:00+03:00"))}
                        </Text>
                    ))}
                </View>
            ) : null}
        </View>
    );
}

// ── Reusable pieces ─────────────────────────────────────────────────────────

function SectionTitle({ title, note, first }: { title: string; note?: string; first?: boolean }) {
    return (
        <View style={[s.section, ...(first ? [s.sectionFirst] : [])]}>
            <Text style={s.sectionTitle}>{title}</Text>
            {note ? <Text style={s.sectionNote}>{note}</Text> : null}
            <View style={s.sectionRule} />
        </View>
    );
}

type KvRow = { label: string; sub?: string; value: string; strong?: boolean; neg?: boolean };
function KvTable({ rows }: { rows: KvRow[] }) {
    return (
        <View style={s.kvTable}>
            {rows.map((r, i) => {
                const last = i === rows.length - 1;
                return (
                    <View
                        key={i}
                        style={[s.kvRow, ...(last ? [s.kvRowLast] : []), ...(r.strong ? [s.kvRowStrong] : [])]}
                        wrap={false}
                    >
                        <View style={s.kvLabelWrap}>
                            <Text style={r.strong ? s.kvLabelStrong : s.kvLabel}>{r.label}</Text>
                            {r.sub ? <Text style={s.kvSub}>{r.sub}</Text> : null}
                        </View>
                        <Text style={r.strong ? s.kvValueStrong : r.neg ? s.kvValueNeg : s.kvValue}>{r.value}</Text>
                    </View>
                );
            })}
        </View>
    );
}

type StmtRow = { label: string; value: string; muted?: boolean; total?: boolean; ruleAbove?: boolean };
function Statement({ rows }: { rows: StmtRow[] }) {
    return (
        <View style={s.stmt}>
            {rows.map((r, i) => (
                <View key={i} style={[s.stmtRow, ...(r.ruleAbove ? [s.stmtRuleAbove] : [])]} wrap={false}>
                    <Text style={r.total ? s.stmtTotalLabel : r.muted ? s.stmtLabelMuted : s.stmtLabel}>{r.label}</Text>
                    <Text style={r.total ? s.stmtTotalNum : s.stmtNum}>{r.value}</Text>
                </View>
            ))}
        </View>
    );
}

function Footer({ dateLabel }: { dateLabel: string }) {
    return (
        <View style={s.footer} fixed>
            <Text style={s.footerText}>ERTH  ·  End of Day Report  ·  {dateLabel}</Text>
            <Text style={s.footerText}>ERTH POS System</Text>
        </View>
    );
}

// ── Document ──────────────────────────────────────────────────────────────────

export function EodReportDocument({ summary, transactions, dateFrom, dateTo, registerSession, hideCashReconciliation = false }: PrintEodReportParams) {
    const fromLabel = dateFmt.format(new Date(dateFrom + "T12:00:00+03:00"));
    const toLabel = dateFmt.format(new Date(dateTo + "T12:00:00+03:00"));
    const isSingleDay = dateFrom === dateTo;
    const dateLabel = isSingleDay ? fromLabel : `${fromLabel} – ${toLabel}`;
    const now = new Date().toLocaleString("en-GB", { timeZone: TIMEZONE, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

    const totalCollected = Number(summary.total_collected) || 0;
    const totalRefunded = Number(summary.total_refunded) || 0;
    const paymentLabel = (type: string) => PAYMENT_TYPE_LABELS[type as keyof typeof PAYMENT_TYPE_LABELS] || type;

    const cashiers = (summary.by_cashier || []).filter((c) => Number(c.collected) > 0 || Number(c.refunded) > 0);

    // Cash drawer derived totals (single-day only)
    const cashTender = summary.by_payment_method.find((m) => m.payment_type === "cash");
    const cashPayments = Number(cashTender?.total) || 0;
    const cashRefunds = Number(cashTender?.refund_total) || 0;
    const cashIn = (registerSession?.cash_movements || []).filter((m) => m.type === "cash_in");
    const cashOut = (registerSession?.cash_movements || []).filter((m) => m.type === "cash_out");
    const cashInTotal = cashIn.reduce((acc, m) => acc + Number(m.amount), 0);
    const cashOutTotal = cashOut.reduce((acc, m) => acc + Number(m.amount), 0);
    const showDrawer = isSingleDay && !!registerSession;
    const expectedCash =
        Number(registerSession?.opening_float ?? 0) + cashPayments - cashRefunds + cashInTotal - cashOutTotal;
    const variance = registerSession?.variance ?? null;
    const varianceText =
        variance === null
            ? "—"
            : Number(variance) === 0
                ? "Balanced"
                : Number(variance) > 0
                    ? `${money(Math.abs(Number(variance)))} KWD over`
                    : `(${money(Math.abs(Number(variance)))}) KWD short`;
    const netSales = Number(summary.gross_sales) - Number(summary.discount_total);
    const invoiceRange =
        summary.invoice_first !== null && summary.invoice_last !== null
            ? summary.invoice_first === summary.invoice_last
                ? `#${summary.invoice_first}`
                : `#${summary.invoice_first} – #${summary.invoice_last}`
            : null;

    const purchaseLabel = (type: string) =>
        ({ cash: "Cash", knet: "K-Net", link_payment: "Link Payment", bank_transfer: "Bank Transfer", others: "Other" } as Record<string, string>)[type] || type;
    const purchases = summary.purchases ?? { total_paid: 0, payment_count: 0, by_payment_method: [] };

    // Cash flow — all drawer cash in/out for the period (works for multi-day,
    // where the single-session reconciliation above is omitted).
    const cashFlow = summary.cash_flow ?? { cash_in_total: 0, cash_out_total: 0, by_category: [] };
    const flowIn: { label: string; amount: number }[] = [];
    const flowOut: { label: string; amount: number }[] = [];
    if (cashPayments > 0) flowIn.push({ label: "Order payments (cash)", amount: cashPayments });
    if (cashRefunds > 0) flowOut.push({ label: "Order refunds (cash)", amount: cashRefunds });
    for (const c of cashFlow.by_category) {
        const line = { label: CASH_MOVEMENT_CATEGORY_LABEL[c.reason_category] ?? "Other", amount: Number(c.total) };
        if (c.type === "cash_in") flowIn.push(line);
        else flowOut.push(line);
    }
    const flowInTotal = flowIn.reduce((acc, l) => acc + l.amount, 0);
    const flowOutTotal = flowOut.reduce((acc, l) => acc + l.amount, 0);

    // Chart inputs
    const donutSegments = summary.by_payment_method
        .filter((m) => Number(m.total) > 0)
        .map((m) => ({
            value: Number(m.total),
            color: PAYMENT_METHOD_COLORS[m.payment_type] || C.faint,
            label: paymentLabel(m.payment_type),
        }));
    const orderTotal = summary.order_count;
    const workPct = orderTotal > 0 ? Math.round((summary.work_count / orderTotal) * 100) : 0;
    const salesPct = orderTotal > 0 ? Math.round((summary.sales_count / orderTotal) * 100) : 0;
    const showDailyTrend = !isSingleDay && summary.daily.length >= 2;

    const pmW = ["33%", "11%", "21%", "20%", "15%"];
    const purW = ["50%", "20%", "30%"];
    const cashierW = ["32%", "12%", "19%", "19%", "18%"];
    const txW = ["13%", "8%", "10%", "10%", "14%", "14%", "11%", "20%"];

    return (
        <Document title={`ERTH End of Day Report — ${dateLabel}`} author="ERTH POS" subject="End of Day Report">
            {/* ── Summary ── */}
            <Page size="A4" style={s.page} wrap>
                <Footer dateLabel={dateLabel} />
                <View style={s.topAccent} />
                {/* Masthead */}
                <View style={s.masthead}>
                    <View>
                        <Text style={s.brandName}>ERTH</Text>
                        <Text style={s.reportTitle}>End of Day Report</Text>
                    </View>
                    <View style={s.metaBlock}>
                        <View style={s.metaRow}>
                            <Text style={s.metaLabel}>Period</Text>
                            <Text style={s.metaValue}>{dateLabel}</Text>
                        </View>
                        {invoiceRange ? (
                            <View style={s.metaRow}>
                                <Text style={s.metaLabel}>Invoices</Text>
                                <Text style={s.metaValueSm}>{invoiceRange}</Text>
                            </View>
                        ) : null}
                        <View style={s.metaRow}>
                            <Text style={s.metaLabel}>Generated</Text>
                            <Text style={s.metaValueSm}>{now}</Text>
                        </View>
                    </View>
                </View>
                <View style={s.ruleThick} />
                <View style={s.ruleHair} />

                {/* Headline: the single most important figure, big, next to the
                    payment-method donut. No cards — just figure on paper. */}
                <View style={s.headlineRow} wrap={false}>
                    <View style={s.headlineLeft}>
                        <Text style={s.headlineKicker}>Net Revenue · {isSingleDay ? "the day" : "the period"}</Text>
                        <Text style={s.headlineValue}>{kwd(summary.net_revenue)}</Text>
                        <Text style={s.headlineSub}>
                            {kwd(summary.total_collected)} collected
                            {totalRefunded > 0 ? `   less   (${money(totalRefunded)}) refunded` : "   ·   no refunds"}
                            {`   ·   ${summary.transaction_count} transaction${summary.transaction_count === 1 ? "" : "s"}`}
                        </Text>
                    </View>
                    {donutSegments.length > 0 ? (
                        <View style={s.chartCol}>
                            <Text style={s.chartHead}>Collections by method</Text>
                            <View style={s.donutWrap}>
                                <DonutChart segments={donutSegments} size={118} />
                                <View style={s.donutCenter}>
                                    <Text style={s.donutCenterVal}>{compact(totalCollected)}</Text>
                                    <Text style={s.donutCenterLbl}>KWD</Text>
                                </View>
                            </View>
                            <View style={s.legend}>
                                {donutSegments.map((seg, i) => {
                                    const pct = totalCollected > 0 ? Math.round((seg.value / totalCollected) * 100) : 0;
                                    return (
                                        <View key={i} style={s.legendRow}>
                                            <View style={[s.legendDot, { backgroundColor: seg.color }]} />
                                            <Text style={s.legendLabel}>{seg.label}</Text>
                                            <Text style={s.legendVal}>{`${money(seg.value)}  ·  ${pct}%`}</Text>
                                        </View>
                                    );
                                })}
                            </View>
                        </View>
                    ) : null}
                </View>

                {/* Financial Summary (ruled table) */}
                <View wrap={false}>
                    <SectionTitle title="Financial Summary" note="Cash basis — money that actually moved during the period." />
                    <KvTable
                        rows={[
                            { label: "Total Collected", sub: `${summary.transaction_count} transaction${summary.transaction_count === 1 ? "" : "s"}`, value: kwd(summary.total_collected) },
                            { label: "Total Refunded", sub: "Returned to customers", value: totalRefunded > 0 ? `(${money(totalRefunded)})` : kwd(0), neg: totalRefunded > 0 },
                            { label: "Net Revenue", sub: "Collected less refunds", value: kwd(summary.net_revenue), strong: true },
                            { label: "Accounts Receivable Outstanding", sub: "All open balances, every order", value: kwd(summary.ar_outstanding) },
                        ]}
                    />
                </View>

                {/* Tailoring Activity (ruled table) */}
                <View wrap={false}>
                    <SectionTitle title="Tailoring Activity" note="Accrual basis — orders booked during the period." />
                    <KvTable
                        rows={[
                            { label: "Deposits Collected", sub: "First payment per order", value: kwd(summary.deposit_collected) },
                            { label: "Balance Payments", sub: "Settlements on prior orders", value: kwd(summary.balance_collected) },
                            { label: "New Orders Booked", sub: `Billed ${kwd(summary.gross_sales)}`, value: String(summary.order_count) },
                            { label: "Work Orders", sub: `${workPct}% of orders booked`, value: String(summary.work_count) },
                            { label: "Sales Orders", sub: `${salesPct}% of orders booked`, value: String(summary.sales_count) },
                            { label: "Delivered / Collected", sub: "Garments handed over", value: String(summary.delivered_count) },
                        ]}
                    />
                </View>

                {/* Daily Collections (multi-day) */}
                {showDailyTrend ? (
                    <View wrap={false}>
                        <SectionTitle title="Daily Collections" note="Cash and non-cash collected per day across the period." />
                        <DailyTrend data={summary.daily} />
                    </View>
                ) : null}

                {/* Cash Drawer Reconciliation (single day only) */}
                {showDrawer ? (
                    <View wrap={false}>
                        <SectionTitle title={hideCashReconciliation ? "Cash Drawer" : "Cash Drawer Reconciliation"} />
                        <Statement
                            rows={[
                                { label: "Opening Float", value: kwd(registerSession!.opening_float) },
                                { label: "Add: Cash Payments", value: kwd(cashPayments) },
                                { label: "Less: Cash Refunds", value: `(${money(cashRefunds)})` },
                                { label: "Add: Paid In", value: kwd(cashInTotal) },
                                { label: "Less: Paid Out", value: `(${money(cashOutTotal)})` },
                                // Expected + variance are the reconciliation target — hidden from the
                                // cashier shell so a blind count can't be back-solved.
                                ...(hideCashReconciliation
                                    ? []
                                    : [{ label: "Expected Cash in Drawer", value: kwd(expectedCash), total: true, ruleAbove: true }]),
                                {
                                    label: "Counted Cash",
                                    value: registerSession!.closing_counted_cash !== null ? kwd(registerSession!.closing_counted_cash) : "Pending close",
                                    total: hideCashReconciliation,
                                    ruleAbove: hideCashReconciliation,
                                },
                                ...(hideCashReconciliation ? [] : [{ label: "Variance (Over / Short)", value: varianceText }]),
                            ]}
                        />
                        {registerSession!.status === "closed" ? (
                            <Text style={s.closingNote}>
                                Closed by {registerSession!.closed_by_name ?? "—"} at{" "}
                                {registerSession!.closed_at ? timeFmt.format(new Date(registerSession!.closed_at)) : "—"}
                                {registerSession!.closing_notes ? `.  Note: ${registerSession!.closing_notes}` : ""}
                            </Text>
                        ) : null}
                    </View>
                ) : null}

                {/* Cash Movements Detail */}
                {showDrawer && (cashIn.length > 0 || cashOut.length > 0) ? (
                    <View wrap={false}>
                        <SectionTitle title="Cash Movements" />
                        <View style={s.tHead}>
                            {["Time", "Type", "Reason", "Performed By", "Amount (KWD)"].map((h, i) => (
                                <Text key={i} style={[s.tHeadCell, { width: ["13%", "13%", "35%", "22%", "17%"][i] }, ...(i === 4 ? [{ textAlign: "right" as const }] : [])]}>{h}</Text>
                            ))}
                        </View>
                        {[...cashIn, ...cashOut].map((m, i) => (
                            <View key={m.id} style={[s.tRow, ...(i % 2 === 1 ? [s.tRowAlt] : [])]} wrap={false}>
                                <Text style={[s.tCell, { width: "13%" }]}>{timeFmt.format(new Date(m.created_at))}</Text>
                                <Text style={[s.tCell, { width: "13%" }]}>{m.type === "cash_in" ? "Paid In" : "Paid Out"}</Text>
                                <Text style={[s.tCell, { width: "35%" }]}>
                                    {CASH_MOVEMENT_CATEGORY_LABEL[m.reason_category] ?? "Other"}{m.reason ? `: ${m.reason}` : ""}
                                </Text>
                                <Text style={[s.tCell, { width: "22%" }]}>{m.performed_by_name}</Text>
                                <Text style={[s.tCellNum, { width: "17%" }]}>{m.type === "cash_in" ? money(m.amount) : `(${money(m.amount)})`}</Text>
                            </View>
                        ))}
                    </View>
                ) : null}

                {/* Cash Flow — all drawer cash in/out for the period (works multi-day) */}
                {flowIn.length > 0 || flowOut.length > 0 ? (
                    <View wrap={false}>
                        <SectionTitle title="Cash Flow" note="All cash that moved through the drawer during the period." />
                        <Statement
                            rows={[
                                { label: "Cash In", value: "", muted: true },
                                ...flowIn.map((l) => ({ label: `  ${l.label}`, value: kwd(l.amount) })),
                                { label: "Total Cash In", value: kwd(flowInTotal), total: true, ruleAbove: true },
                                { label: "Cash Out", value: "", muted: true },
                                ...flowOut.map((l) => ({ label: `  ${l.label}`, value: `(${money(l.amount)})` })),
                                { label: "Total Cash Out", value: `(${money(flowOutTotal)})`, total: true, ruleAbove: true },
                                { label: "Net Cash Movement", value: kwd(flowInTotal - flowOutTotal), total: true, ruleAbove: true },
                            ]}
                        />
                    </View>
                ) : null}

                {/* Sales Summary */}
                <View wrap={false}>
                    <SectionTitle title="Sales Summary" note="Confirmed orders booked during the period." />
                    <Statement
                        rows={[
                            { label: "Gross Sales", value: kwd(summary.gross_sales) },
                            { label: "Less: Discounts", value: `(${money(summary.discount_total)})` },
                            { label: "Net Sales", value: kwd(netSales), total: true, ruleAbove: true },
                            { label: "Average Order Value", value: kwd(summary.avg_order_value), muted: true },
                            {
                                label: "Cancellations",
                                value: summary.cancelled_count > 0
                                    ? `${summary.cancelled_count} order${summary.cancelled_count === 1 ? "" : "s"}${summary.cancelled_billed > 0 ? `  ·  ${kwd(summary.cancelled_billed)}` : ""}`
                                    : "None",
                                muted: true,
                            },
                            { label: "Work Orders / Sales Orders", value: `${summary.work_count}  /  ${summary.sales_count}`, muted: true },
                        ]}
                    />
                </View>

                {/* Payment Method Breakdown */}
                <View wrap={false}>
                    <SectionTitle title="Payment Methods" />
                    <View style={s.tHead}>
                        {["Method", "Txns", "Collected (KWD)", "Refunded (KWD)", "Share"].map((h, i) => (
                            <Text key={i} style={[s.tHeadCell, { width: pmW[i] }, ...(i > 0 ? [{ textAlign: "right" as const }] : [])]}>{h}</Text>
                        ))}
                    </View>
                    {summary.by_payment_method.map((m, i) => {
                        const pct = totalCollected > 0 ? ((Number(m.total) / totalCollected) * 100).toFixed(1) : "0.0";
                        const refund = Number(m.refund_total) || 0;
                        return (
                            <View key={i} style={[s.tRow, ...(i % 2 === 1 ? [s.tRowAlt] : [])]} wrap={false}>
                                <Text style={[s.tCell, { width: pmW[0] }]}>{paymentLabel(m.payment_type)}</Text>
                                <Text style={[s.tCellNum, { width: pmW[1] }]}>{m.count}</Text>
                                <Text style={[s.tCellNum, { width: pmW[2] }]}>{money(m.total)}</Text>
                                <Text style={[s.tCellNum, { width: pmW[3] }]}>{refund > 0 ? `(${money(refund)})` : "—"}</Text>
                                <Text style={[s.tCellNum, { width: pmW[4] }]}>{pct}%</Text>
                            </View>
                        );
                    })}
                    <View style={s.tTotal} wrap={false}>
                        <Text style={[s.tTotalCell, { width: pmW[0] }]}>Net Total</Text>
                        <Text style={[s.tTotalNum, { width: pmW[1] }]} />
                        <Text style={[s.tTotalNum, { width: pmW[2] }]}>{money(summary.total_collected)}</Text>
                        <Text style={[s.tTotalNum, { width: pmW[3] }]}>({money(summary.total_refunded)})</Text>
                        <Text style={[s.tTotalNum, { width: pmW[4] }]} />
                    </View>
                </View>

                {/* Stock Purchases Settled */}
                {purchases.payment_count > 0 ? (
                    <View wrap={false}>
                        <SectionTitle title="Stock Purchases Settled" note="Fabric / shelf restock payables paid during the period (cash and non-cash)." />
                        <View style={s.tHead}>
                            {["Method", "Settlements", "Paid (KWD)"].map((h, i) => (
                                <Text key={i} style={[s.tHeadCell, { width: purW[i] }, ...(i > 0 ? [{ textAlign: "right" as const }] : [])]}>{h}</Text>
                            ))}
                        </View>
                        {purchases.by_payment_method.map((m, i) => (
                            <View key={i} style={[s.tRow, ...(i % 2 === 1 ? [s.tRowAlt] : [])]} wrap={false}>
                                <Text style={[s.tCell, { width: purW[0] }]}>{purchaseLabel(m.payment_type)}</Text>
                                <Text style={[s.tCellNum, { width: purW[1] }]}>{m.count}</Text>
                                <Text style={[s.tCellNum, { width: purW[2] }]}>{money(m.total)}</Text>
                            </View>
                        ))}
                        <View style={s.tTotal} wrap={false}>
                            <Text style={[s.tTotalCell, { width: purW[0] }]}>Total Settled</Text>
                            <Text style={[s.tTotalNum, { width: purW[1] }]}>{purchases.payment_count}</Text>
                            <Text style={[s.tTotalNum, { width: purW[2] }]}>{money(purchases.total_paid)}</Text>
                        </View>
                    </View>
                ) : null}

                {/* Cashier Breakdown */}
                {cashiers.length > 0 ? (
                    <View wrap={false}>
                        <SectionTitle title="Cashier Breakdown" />
                        <View style={s.tHead}>
                            {["Cashier", "Txns", "Collected (KWD)", "Refunded (KWD)", "Net (KWD)"].map((h, i) => (
                                <Text key={i} style={[s.tHeadCell, { width: cashierW[i] }, ...(i > 0 ? [{ textAlign: "right" as const }] : [])]}>{h}</Text>
                            ))}
                        </View>
                        {cashiers.map((c, i) => (
                            <View key={i} style={[s.tRow, ...(i % 2 === 1 ? [s.tRowAlt] : [])]} wrap={false}>
                                <Text style={[s.tCell, { width: cashierW[0] }]}>{c.cashier_name || "Unknown"}</Text>
                                <Text style={[s.tCellNum, { width: cashierW[1] }]}>{c.transaction_count}</Text>
                                <Text style={[s.tCellNum, { width: cashierW[2] }]}>{money(c.collected)}</Text>
                                <Text style={[s.tCellNum, { width: cashierW[3] }]}>{Number(c.refunded) > 0 ? `(${money(c.refunded)})` : "—"}</Text>
                                <Text style={[s.tCellNum, { width: cashierW[4] }]}>{money(Number(c.collected) - Number(c.refunded))}</Text>
                            </View>
                        ))}
                    </View>
                ) : null}

                {/* Sign-off */}
                {!hideCashReconciliation ? (
                    <View style={s.signRow} wrap={false}>
                        <View style={s.signCol}>
                            <View style={s.signLine} />
                            <Text style={s.signLabel}>Prepared by</Text>
                        </View>
                        <View style={s.signCol}>
                            <View style={s.signLine} />
                            <Text style={s.signLabel}>Reviewed by (Manager)</Text>
                        </View>
                    </View>
                ) : null}

            </Page>

            {/* ── Transaction Ledger ── */}
            <Page size="A4" style={s.page} wrap>
                <Footer dateLabel={dateLabel} />
                <SectionTitle title="Transaction Ledger" note={`${transactions.length} record${transactions.length === 1 ? "" : "s"} for the period.`} first />
                {/* Fixed header repeats on every ledger page */}
                <View style={s.tHead} fixed>
                    {["Date", "Time", "Order", "Type", "Method", "Amount (KWD)", "Ref.", "Cashier"].map((h, i) => (
                        <Text key={i} style={[s.tHeadCell, { width: txW[i] }, ...(i === 5 ? [{ textAlign: "right" as const }] : [])]}>{h}</Text>
                    ))}
                </View>
                {transactions.length === 0 ? (
                    <View style={[s.tRow, { borderBottomWidth: 0 }]}>
                        <Text style={[s.tCell, { color: C.faint }]}>No transactions in this period.</Text>
                    </View>
                ) : (
                    transactions.map((tx, i) => {
                        const isRefund = tx.transaction_type === "refund";
                        const amt = Math.abs(tx.amount);
                        return (
                            <View key={tx.id} style={[s.tRow, ...(i % 2 === 1 ? [s.tRowAlt] : [])]} wrap={false}>
                                <Text style={[s.tCell, { width: txW[0] }]}>{dateFmt.format(parseUtcTimestamp(tx.created_at))}</Text>
                                <Text style={[s.tCell, { width: txW[1] }]}>{timeFmt.format(parseUtcTimestamp(tx.created_at))}</Text>
                                <Text style={[s.tCell, { width: txW[2] }]}>#{tx.order_id}</Text>
                                <Text style={[s.tCell, { width: txW[3] }]}>{isRefund ? "Refund" : "Payment"}</Text>
                                <Text style={[s.tCell, { width: txW[4] }]}>{paymentLabel(tx.payment_type)}</Text>
                                <Text style={[s.tCellNum, { width: txW[5], fontFamily: "Helvetica-Bold" }]}>{isRefund ? `(${money(amt)})` : money(amt)}</Text>
                                <Text style={[s.tCell, { width: txW[6], color: C.muted }]}>{tx.payment_ref_no || "—"}</Text>
                                <Text style={[s.tCell, { width: txW[7] }]}>{tx.cashier_name || "—"}</Text>
                            </View>
                        );
                    })
                )}
            </Page>
        </Document>
    );
}

// ── Public API ────────────────────────────────────────────────────────────────

async function generatePdfBlob(params: PrintEodReportParams): Promise<Blob> {
    return await pdf(<EodReportDocument {...params} />).toBlob();
}

/** Opens the report PDF in a new tab using the browser's native PDF viewer */
export async function viewEodReport(params: PrintEodReportParams) {
    // Open window synchronously so browsers don't block it as a popup
    const win = window.open("about:blank", "_blank");
    const blob = await generatePdfBlob(params);
    const url = URL.createObjectURL(blob);
    if (win) {
        win.location.href = url;
    } else {
        window.open(url, "_blank");
    }
}

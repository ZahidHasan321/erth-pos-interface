import { Document, Page, Text, View, StyleSheet, pdf } from "@react-pdf/renderer";
import { PAYMENT_TYPE_LABELS } from "@/lib/constants";
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

const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false });
const dateFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, day: "2-digit", month: "short", year: "numeric" });

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

// ── Palette (monochrome — this is a document, not a UI) ─────────────────────────
const C = {
    ink: "#1a1a1a",
    body: "#262626",
    muted: "#5f5f5b",
    faint: "#8c8c86",
    line: "#cfcdc4",   // hairline rule
    rule: "#1a1a1a",   // strong rule
};

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    page: {
        paddingTop: 40,
        paddingHorizontal: 46,
        paddingBottom: 56, // room for the fixed footer
        fontFamily: "Helvetica",
        fontSize: 9.5,
        color: C.body,
        lineHeight: 1.35,
    },

    // Masthead
    masthead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingBottom: 8 },
    brandName: { fontSize: 25, fontFamily: "Helvetica-Bold", letterSpacing: 5, color: C.ink, lineHeight: 1 },
    reportTitle: { fontSize: 9.5, letterSpacing: 2.5, textTransform: "uppercase", color: C.muted, marginTop: 8 },
    metaBlock: { alignItems: "flex-end" },
    metaRow: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 2.5 },
    metaLabel: { fontSize: 7.5, textTransform: "uppercase", letterSpacing: 0.8, color: C.faint, marginRight: 8, alignSelf: "center" },
    metaValue: { fontSize: 9.5, color: C.ink, fontFamily: "Helvetica-Bold", textAlign: "right" },
    metaValueSm: { fontSize: 8.5, color: C.muted, textAlign: "right" },
    ruleThick: { borderBottomWidth: 1.5, borderBottomColor: C.rule },
    ruleHair: { borderBottomWidth: 0.5, borderBottomColor: C.rule, marginTop: 1.5 },

    // Section heading
    section: { marginTop: 17 },
    sectionFirst: { marginTop: 16 },
    sectionTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1.6, color: C.ink },
    sectionNote: { fontSize: 7.5, color: C.faint, marginTop: 2 },
    sectionRule: { borderBottomWidth: 0.75, borderBottomColor: C.rule, marginTop: 5, marginBottom: 8 },

    // Figure grid (statement-style summary box: square, hairline-divided, no fill)
    figGrid: { flexDirection: "row", borderWidth: 0.75, borderColor: C.line },
    figCell: { flex: 1, paddingVertical: 8, paddingHorizontal: 9 },
    figCellDiv: { borderLeftWidth: 0.5, borderLeftColor: C.line },
    figLabel: { fontSize: 6.8, textTransform: "uppercase", letterSpacing: 0.6, color: C.muted, marginBottom: 3 },
    figValue: { fontSize: 12.5, fontFamily: "Helvetica-Bold", color: C.ink },
    figSub: { fontSize: 6.8, color: C.faint, marginTop: 3 },

    // Statement rows (label … amount)
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

function FigureGrid({ cells }: { cells: { label: string; value: string; sub?: string }[] }) {
    return (
        <View style={s.figGrid}>
            {cells.map((c, i) => (
                <View key={i} style={[s.figCell, ...(i > 0 ? [s.figCellDiv] : [])]}>
                    <Text style={s.figLabel}>{c.label}</Text>
                    <Text style={s.figValue}>{c.value}</Text>
                    {c.sub ? <Text style={s.figSub}>{c.sub}</Text> : null}
                </View>
            ))}
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

function EodReportDocument({ summary, transactions, dateFrom, dateTo, registerSession, hideCashReconciliation = false }: PrintEodReportParams) {
    const fromLabel = dateFmt.format(new Date(dateFrom + "T12:00:00+03:00"));
    const toLabel = dateFmt.format(new Date(dateTo + "T12:00:00+03:00"));
    const isSingleDay = dateFrom === dateTo;
    const dateLabel = isSingleDay ? fromLabel : `${fromLabel} – ${toLabel}`;
    const now = new Date().toLocaleString("en-GB", { timeZone: TIMEZONE, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

    const totalCollected = Number(summary.total_collected) || 0;
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

    const pmW = ["33%", "11%", "21%", "20%", "15%"];
    const cashierW = ["32%", "12%", "19%", "19%", "18%"];
    const txW = ["13%", "8%", "10%", "10%", "14%", "14%", "11%", "20%"];

    return (
        <Document title={`ERTH End of Day Report — ${dateLabel}`} author="ERTH POS" subject="End of Day Report">
            {/* ── Summary ── */}
            <Page size="A4" style={s.page} wrap>
                <Footer dateLabel={dateLabel} />
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

                {/* Financial Summary */}
                <SectionTitle title="Financial Summary" note="Cash basis — money that actually moved during the period." first />
                <FigureGrid
                    cells={[
                        { label: "Total Collected", value: kwd(summary.total_collected), sub: `${summary.transaction_count} transactions` },
                        { label: "Total Refunded", value: kwd(summary.total_refunded), sub: "Returned to customers" },
                        { label: "Net Revenue", value: kwd(summary.net_revenue), sub: "Collected less refunds" },
                        { label: "AR Outstanding", value: kwd(summary.ar_outstanding), sub: "All open balances" },
                    ]}
                />

                {/* Tailoring Activity */}
                <SectionTitle title="Tailoring Activity" note="Accrual basis — orders booked during the period." />
                <FigureGrid
                    cells={[
                        { label: "Deposits Collected", value: kwd(summary.deposit_collected), sub: "First payment per order" },
                        { label: "Balance Payments", value: kwd(summary.balance_collected), sub: "Settlements on prior orders" },
                        { label: "New Orders Booked", value: String(summary.order_count), sub: `Billed ${kwd(summary.gross_sales)}` },
                        { label: "Delivered / Collected", value: String(summary.delivered_count), sub: "Garments handed over" },
                    ]}
                />

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
                        {[...cashIn, ...cashOut].map((m) => (
                            <View key={m.id} style={s.tRow} wrap={false}>
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
                            <View key={i} style={s.tRow} wrap={false}>
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
                            <View key={i} style={s.tRow} wrap={false}>
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
                    transactions.map((tx) => {
                        const isRefund = tx.transaction_type === "refund";
                        const amt = Math.abs(tx.amount);
                        return (
                            <View key={tx.id} style={s.tRow} wrap={false}>
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

/** Opens the report PDF in a new tab and triggers the print dialog */
export async function printEodReport(params: PrintEodReportParams) {
    const win = window.open("about:blank", "_blank");
    const blob = await generatePdfBlob(params);
    const url = URL.createObjectURL(blob);
    if (win) {
        win.location.href = url;
        win.addEventListener("load", () => {
            win.focus();
            win.print();
        });
    }
}

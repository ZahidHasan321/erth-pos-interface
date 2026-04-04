import { Document, Page, Text, View, StyleSheet, pdf } from "@react-pdf/renderer";
import { PAYMENT_TYPE_LABELS } from "@/lib/constants";
import { parseUtcTimestamp } from "@/lib/utils";
import type { EodReportSummary, EodTransaction } from "@/api/cashier";

const fmt = (n: number): string => Number(Number(n).toFixed(3)).toString();
const fmtK = (n: number): string => `${fmt(n)} KWD`;
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export interface PrintEodReportParams {
    summary: EodReportSummary;
    transactions: EodTransaction[];
    dateFrom: string;
    dateTo: string;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
    page: {
        padding: "20mm 18mm 18mm 18mm",
        fontFamily: "Times-Roman",
        fontSize: 10.5,
        color: "#111",
        lineHeight: 1.45,
    },

    // Header
    header: { textAlign: "center", paddingBottom: 14, borderBottom: "2.5pt double #111", marginBottom: 16 },
    brandName: { fontSize: 22, fontWeight: "bold", letterSpacing: 3, textTransform: "uppercase", marginBottom: 2 },
    reportTitle: { fontSize: 13, letterSpacing: 1, textTransform: "uppercase", color: "#333", marginBottom: 6 },
    reportPeriod: { fontSize: 10.5, color: "#444" },
    reportGenerated: { fontSize: 8, color: "#888", marginTop: 4 },

    // Section heading
    sectionHeading: {
        fontSize: 10, fontWeight: "bold", textTransform: "uppercase", letterSpacing: 1.2,
        borderBottom: "1pt solid #111", paddingBottom: 3, marginTop: 18, marginBottom: 10,
    },
    sectionHeadingFirst: { marginTop: 0 },

    // Summary grid (2x2)
    summaryGrid: { flexDirection: "row", flexWrap: "wrap", border: "1pt solid #333", marginBottom: 18 },
    summaryCell: { width: "50%", padding: "10pt 14pt", borderBottom: "0.5pt solid #ccc" },
    summaryCellRight: { borderLeft: "0.5pt solid #ccc" },
    summaryCellBottom: { borderBottom: "none" },
    summaryLabel: { fontSize: 7.5, textTransform: "uppercase", letterSpacing: 0.8, color: "#666", marginBottom: 2 },
    summaryValue: { fontSize: 14, fontWeight: "bold" },
    summarySub: { fontSize: 8, color: "#888", marginTop: 1 },

    // Two-column layout
    twoCol: { flexDirection: "row", gap: 24 },
    col: { flex: 1 },

    // Table
    table: { width: "100%", fontSize: 9.5 },
    tableHeaderRow: { flexDirection: "row", borderTop: "1.5pt solid #111", borderBottom: "1pt solid #111" },
    tableHeaderCell: {
        fontSize: 7.5, fontWeight: "bold", textTransform: "uppercase", letterSpacing: 0.6,
        color: "#111", padding: "5pt 6pt",
    },
    tableRow: { flexDirection: "row", borderBottom: "0.5pt solid #ddd" },
    tableRowLast: { borderBottom: "1pt solid #111" },
    tableCell: { padding: "4pt 6pt" },
    tableCellNum: { padding: "4pt 6pt", textAlign: "right" },
    totalRow: { flexDirection: "row", borderTop: "1.5pt solid #111", borderBottom: "2pt solid #111" },
    totalCell: { padding: "5pt 6pt", fontWeight: "bold" },
    totalCellNum: { padding: "5pt 6pt", fontWeight: "bold", textAlign: "right" },

    // KV table
    kvRow: { flexDirection: "row", borderBottom: "0.5pt dotted #ccc", padding: "4pt 0" },
    kvRowLast: { borderBottom: "1pt solid #111" },
    kvLabel: { flex: 1 },
    kvValue: { textAlign: "right", fontWeight: "bold" },

    // Footer
    footer: {
        marginTop: 24, paddingTop: 8, borderTop: "1pt solid #999",
        flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: "#999",
    },
});

// ── Table helpers ─────────────────────────────────────────────────────────────

function TableHeader({ widths, labels }: { widths: string[]; labels: string[] }) {
    return (
        <View style={s.tableHeaderRow}>
            {labels.map((label, i) => (
                <Text key={i} style={[s.tableHeaderCell, { width: widths[i] }, ...(i > 0 ? [{ textAlign: "right" as const }] : [])]}>
                    {label}
                </Text>
            ))}
        </View>
    );
}

function TableRow({ widths, cells, isLast }: { widths: string[]; cells: string[]; isLast?: boolean }) {
    return (
        <View style={[s.tableRow, ...(isLast ? [s.tableRowLast] : [])]} wrap={false}>
            {cells.map((cell, i) => (
                <Text key={i} style={[i === 0 ? s.tableCell : s.tableCellNum, { width: widths[i] }]}>
                    {cell}
                </Text>
            ))}
        </View>
    );
}

// ── Document ──────────────────────────────────────────────────────────────────

function EodReportDocument({ summary, transactions, dateFrom, dateTo }: PrintEodReportParams) {
    const fromLabel = dateFmt.format(new Date(dateFrom + "T00:00:00"));
    const toLabel = dateFmt.format(new Date(dateTo + "T00:00:00"));
    const dateLabel = dateFrom === dateTo ? fromLabel : `${fromLabel} – ${toLabel}`;
    const now = new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

    const totalCollected = Number(summary.total_collected) || 0;
    const paymentLabel = (type: string) => PAYMENT_TYPE_LABELS[type as keyof typeof PAYMENT_TYPE_LABELS] || type;

    const cashiers = (summary.by_cashier || []).filter(c => Number(c.collected) > 0 || Number(c.refunded) > 0);

    const pmWidths = ["35%", "15%", "30%", "20%"];
    const cashierWidths = ["30%", "17%", "18%", "18%", "17%"];
    const txWidths = ["12%", "8%", "10%", "10%", "12%", "16%", "16%", "16%"];

    return (
        <Document>
            {/* ── Page 1: Summary ── */}
            <Page size="A4" style={s.page}>
                {/* Header */}
                <View style={s.header}>
                    <Text style={s.brandName}>ERTH</Text>
                    <Text style={s.reportTitle}>End of Day Report</Text>
                    <Text style={s.reportPeriod}>{dateLabel}</Text>
                    <Text style={s.reportGenerated}>Generated on {now}</Text>
                </View>

                {/* Financial Summary */}
                <Text style={[s.sectionHeading, s.sectionHeadingFirst]}>Financial Summary</Text>
                <View style={s.summaryGrid}>
                    <View style={s.summaryCell}>
                        <Text style={s.summaryLabel}>Total Collected</Text>
                        <Text style={s.summaryValue}>{fmtK(summary.total_collected)}</Text>
                        <Text style={s.summarySub}>{summary.transaction_count} transactions</Text>
                    </View>
                    <View style={[s.summaryCell, s.summaryCellRight]}>
                        <Text style={s.summaryLabel}>Total Refunded</Text>
                        <Text style={s.summaryValue}>{fmtK(summary.total_refunded)}</Text>
                    </View>
                    <View style={[s.summaryCell, s.summaryCellBottom]}>
                        <Text style={s.summaryLabel}>Net Revenue</Text>
                        <Text style={s.summaryValue}>{fmtK(summary.net_revenue)}</Text>
                        <Text style={s.summarySub}>Total billed: {fmtK(summary.total_billed)}</Text>
                    </View>
                    <View style={[s.summaryCell, s.summaryCellRight, s.summaryCellBottom]}>
                        <Text style={s.summaryLabel}>Outstanding Balance</Text>
                        <Text style={s.summaryValue}>{fmtK(summary.outstanding)}</Text>
                        <Text style={s.summarySub}>{summary.order_count} orders</Text>
                    </View>
                </View>

                {/* Payment Methods + Order Summary side by side */}
                <View style={s.twoCol}>
                    <View style={s.col}>
                        <Text style={s.sectionHeading}>Payment Method Breakdown</Text>
                        <View style={s.table}>
                            <TableHeader widths={pmWidths} labels={["Method", "Txns", "Amount", "Share"]} />
                            {summary.by_payment_method.map((m, i) => {
                                const pct = totalCollected > 0 ? ((Number(m.total) / totalCollected) * 100).toFixed(1) : "0.0";
                                return (
                                    <TableRow
                                        key={i}
                                        widths={pmWidths}
                                        cells={[paymentLabel(m.payment_type), String(m.count), fmtK(m.total), `${pct}%`]}
                                    />
                                );
                            })}
                            {Number(summary.total_refunded) > 0 && (
                                <TableRow
                                    widths={pmWidths}
                                    cells={["Less: Refunds", "–", `(${fmtK(summary.total_refunded)})`, "–"]}
                                    isLast
                                />
                            )}
                            <View style={s.totalRow}>
                                <Text style={[s.totalCell, { width: pmWidths[0] }]}>Net Total</Text>
                                <Text style={[s.totalCellNum, { width: pmWidths[1] }]}></Text>
                                <Text style={[s.totalCellNum, { width: pmWidths[2] }]}>{fmtK(summary.net_revenue)}</Text>
                                <Text style={[s.totalCellNum, { width: pmWidths[3] }]}></Text>
                            </View>
                        </View>
                    </View>

                    <View style={s.col}>
                        <Text style={s.sectionHeading}>Order Summary</Text>
                        {[
                            ["Total Orders", String(summary.order_count)],
                            ["Work Orders", String(summary.work_count)],
                            ["Sales Orders", String(summary.sales_count)],
                            ["Total Billed", fmtK(summary.total_billed)],
                            ["Avg. Order Value", fmtK(summary.avg_order_value)],
                            ["Outstanding", fmtK(summary.outstanding)],
                        ].map(([label, value], i, arr) => (
                            <View key={i} style={[s.kvRow, ...(i === arr.length - 1 ? [s.kvRowLast] : [])]} wrap={false}>
                                <Text style={s.kvLabel}>{label}</Text>
                                <Text style={s.kvValue}>{value}</Text>
                            </View>
                        ))}
                    </View>
                </View>

                {/* Cashier Breakdown */}
                {cashiers.length > 0 && (
                    <>
                        <Text style={s.sectionHeading}>Cashier Breakdown</Text>
                        <View style={s.table}>
                            <TableHeader widths={cashierWidths} labels={["Cashier", "Transactions", "Collected", "Refunded", "Net"]} />
                            {cashiers.map((c, i) => (
                                <TableRow
                                    key={i}
                                    widths={cashierWidths}
                                    cells={[
                                        c.cashier_name || "Unknown",
                                        String(c.transaction_count),
                                        fmtK(c.collected),
                                        fmtK(c.refunded),
                                        fmtK(Number(c.collected) - Number(c.refunded)),
                                    ]}
                                    isLast={i === cashiers.length - 1}
                                />
                            ))}
                        </View>
                    </>
                )}

                {/* Footer */}
                <View style={s.footer}>
                    <Text>End of Day Report – {dateLabel}</Text>
                    <Text>ERTH POS System</Text>
                </View>
            </Page>

            {/* ── Page 2+: Transaction Ledger ── */}
            <Page size="A4" style={s.page}>
                <Text style={[s.sectionHeading, s.sectionHeadingFirst]}>
                    Transaction Ledger ({transactions.length} records)
                </Text>
                <View style={s.table}>
                    <TableHeader widths={txWidths} labels={["Date", "Time", "Order", "Type", "Method", "Amount", "Reference", "Cashier"]} />
                    {transactions.map((tx, i) => {
                        const isRefund = tx.transaction_type === "refund";
                        const amt = Math.abs(tx.amount);
                        return (
                            <TableRow
                                key={tx.id}
                                widths={txWidths}
                                cells={[
                                    dateFmt.format(parseUtcTimestamp(tx.created_at)),
                                    timeFmt.format(parseUtcTimestamp(tx.created_at)),
                                    `#${tx.order_id}`,
                                    isRefund ? "Refund" : "Payment",
                                    paymentLabel(tx.payment_type),
                                    isRefund ? `(${fmtK(amt)})` : fmtK(amt),
                                    tx.payment_ref_no || "–",
                                    tx.cashier_name || "–",
                                ]}
                                isLast={i === transactions.length - 1}
                            />
                        );
                    })}
                </View>

                <View style={s.footer}>
                    <Text>End of Day Report – {dateLabel}</Text>
                    <Text>ERTH POS System</Text>
                </View>
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

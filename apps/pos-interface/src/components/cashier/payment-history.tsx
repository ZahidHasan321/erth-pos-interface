import { Fragment, useRef, useState, useCallback, useEffect } from "react";
import { useReactToPrint } from "react-to-print";
import { Printer, ChevronDown, ChevronUp, AlertCircle, Package, Shirt } from "lucide-react";
import { Button } from "@repo/ui/button";
import { Badge } from "@repo/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@repo/ui/table";
import { PAYMENT_TYPE_LABELS } from "@/lib/constants";
import { displaySoakHours, parseUtcTimestamp, TIMEZONE } from "@/lib/utils";
import { OrderInvoice, SalesInvoice, AlterationInvoice, type InvoiceData, type AlterationInvoiceData } from "@/components/invoice";

interface RefundItemRecord {
    garment_id?: string;
    fabric?: boolean;
    stitching?: boolean;
    style?: boolean;
    express?: boolean;
    soaking?: boolean;
    soaking_hours?: number | null;
    shelf_item_id?: number | null;
    quantity?: number;
    amount?: number;
}

interface TransactionRecord {
    id: number;
    amount: number;
    payment_type?: string | null;
    payment_ref_no?: string | null;
    transaction_type: "payment" | "refund";
    refund_reason?: string | null;
    refund_items?: RefundItemRecord[] | null;
    created_at: string;
    cashier?: { name: string } | null;
}

interface PaymentHistoryProps {
    transactions: TransactionRecord[];
    orderType?: "WORK" | "SALES" | "ALTERATION";
    // The full order invoice (line items, charges, signature, current revision).
    // Per print we override `paid` (running total as of the printed transaction)
    // and that transaction's payment method/ref.
    invoiceData: InvoiceData;
    // ALTERATION orders print a dedicated invoice (the recorded per-garment
    // changes + manual total) instead of OrderInvoice, which assumes
    // fabric/style charges an alteration doesn't have.
    alterationData?: AlterationInvoiceData;
}

export function PaymentHistory({ transactions, orderType, invoiceData, alterationData }: PaymentHistoryProps) {
    const receiptRef = useRef<HTMLDivElement>(null);
    const [printData, setPrintData] = useState<InvoiceData | null>(null);
    const [printAlteration, setPrintAlteration] = useState<AlterationInvoiceData | null>(null);
    const [expandedTx, setExpandedTx] = useState<number | null>(null);
    const [pendingPrint, setPendingPrint] = useState(false);

    const handlePrint = useReactToPrint({
        contentRef: receiptRef,
        // Tight A4 margins so a full order (up to 10 garments + shelf items)
        // prints on a single page.
        pageStyle: "@page { size: A4; margin: 8mm; }",
    });

    // Print after the invoice data renders
    useEffect(() => {
        if (pendingPrint && (printData || printAlteration)) {
            const timer = setTimeout(() => {
                handlePrint();
                setPendingPrint(false);
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [pendingPrint, printData, printAlteration, handlePrint]);

    // Reprint the proper signed order invoice (SPEC §3) at the current revision.
    // `paid` is the running total as of the printed transaction, so an older row
    // reflects the balance as it stood then; method/ref are that transaction's.
    const printTransaction = useCallback((tx: TransactionRecord) => {
        // Same-millisecond ties: tiebreak by id so two transactions stamped at the
        // same instant don't both count toward the earlier one's prior-paid total.
        const txTs = parseUtcTimestamp(tx.created_at).getTime();
        const paid = transactions
            .filter((t) => {
                const ts = parseUtcTimestamp(t.created_at).getTime();
                if (ts < txTs) return true;
                if (ts > txTs) return false;
                return t.id <= tx.id;
            })
            .reduce((sum: number, t) => sum + (t.amount || 0), 0);

        if (orderType === "ALTERATION" && alterationData) {
            setPrintData(null);
            setPrintAlteration({
                ...alterationData,
                paid,
                paymentType: tx.payment_type ?? undefined,
                paymentRefNo: tx.payment_ref_no ?? undefined,
            });
        } else {
            setPrintAlteration(null);
            setPrintData({
                ...invoiceData,
                paid,
                paymentType: tx.payment_type ?? invoiceData.paymentType,
                paymentRefNo: tx.payment_ref_no ?? undefined,
            });
        }
        setPendingPrint(true);
    }, [transactions, invoiceData, alterationData, orderType]);

    const fmt = (n: number): string => Number(Number(n).toFixed(3)).toString();

    if (!transactions || transactions.length === 0) {
        return (
            <div className="text-center py-8 text-muted-foreground">
                No payment transactions recorded yet.
            </div>
        );
    }

    return (
        <>
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Method</TableHead>
                            <TableHead>Ref #</TableHead>
                            <TableHead>Cashier</TableHead>
                            <TableHead className="w-10"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {transactions.map((tx) => {
                            const isRefund = tx.transaction_type === "refund";
                            const hasRefundDetails = isRefund && (tx.refund_reason || (tx.refund_items && tx.refund_items.length > 0));
                            const isExpanded = expandedTx === tx.id;
                            const refundItems: RefundItemRecord[] = tx.refund_items || [];

                            return (
                                <Fragment key={tx.id}>
                                    <TableRow
                                        className={hasRefundDetails ? "cursor-pointer" : ""}
                                        onClick={() => hasRefundDetails && setExpandedTx(isExpanded ? null : tx.id)}
                                    >
                                        <TableCell className="text-xs">
                                            {parseUtcTimestamp(tx.created_at).toLocaleDateString("en-GB", {
                                                timeZone: TIMEZONE,
                                                day: "2-digit",
                                                month: "short",
                                                year: "numeric",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            })}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1">
                                                <Badge
                                                    variant={isRefund ? "destructive" : "default"}
                                                    className={!isRefund ? "bg-green-600" : ""}
                                                >
                                                    {isRefund ? "Refund" : "Payment"}
                                                </Badge>
                                                {hasRefundDetails && (
                                                    isExpanded
                                                        ? <ChevronUp className="h-3 w-3 text-muted-foreground" />
                                                        : <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell
                                            className={`font-semibold tabular-nums ${tx.amount < 0 ? "text-red-600" : "text-green-600"}`}
                                        >
                                            {tx.amount < 0 ? "-" : "+"}{fmt(Math.abs(tx.amount))} KD
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {PAYMENT_TYPE_LABELS[tx.payment_type as keyof typeof PAYMENT_TYPE_LABELS] || tx.payment_type}
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground">
                                            {tx.payment_ref_no || "-"}
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {tx.cashier?.name || "-"}
                                        </TableCell>
                                        <TableCell>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7"
                                                onClick={(e) => { e.stopPropagation(); printTransaction(tx); }}
                                                aria-label="Print receipt"
                                            >
                                                <Printer className="h-3.5 w-3.5" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>

                                    {/* Refund details - expanded row */}
                                    {isExpanded && hasRefundDetails && (
                                        <TableRow className="hover:bg-red-50/60 bg-red-50/40">
                                            <TableCell colSpan={7} className="px-4 py-2">
                                                {tx.refund_reason && (
                                                    <div className="flex items-start gap-1.5 mb-2">
                                                        <AlertCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
                                                        <span className="text-xs text-red-700"><span className="font-semibold">Reason:</span> {tx.refund_reason}</span>
                                                    </div>
                                                )}
                                                {refundItems.length > 0 && (
                                                    <div className="space-y-1">
                                                        {refundItems.map((item, i: number) => {
                                                            if (item.garment_id) {
                                                                const parts = [
                                                                    item.fabric && "Fabric",
                                                                    item.stitching && "Stitching",
                                                                    item.style && "Style",
                                                                    item.express && "Express",
                                                                    item.soaking && (item.soaking_hours ? `Soaking ${displaySoakHours(item.soaking_hours)}h` : "Soaking"),
                                                                ].filter(Boolean);
                                                                return (
                                                                    <div key={i} className="flex items-center gap-1.5 text-xs text-red-700">
                                                                        <Shirt className="h-3 w-3 shrink-0" />
                                                                        <span className="font-medium">{item.garment_id.slice(0, 8)}</span>
                                                                        <span className="text-red-500">{parts.join(", ")}</span>
                                                                        <span className="ml-auto font-semibold tabular-nums">{fmt(item.amount ?? 0)} KD</span>
                                                                    </div>
                                                                );
                                                            }
                                                            if (item.shelf_item_id != null) {
                                                                return (
                                                                    <div key={i} className="flex items-center gap-1.5 text-xs text-red-700">
                                                                        <Package className="h-3 w-3 shrink-0" />
                                                                        <span className="font-medium">Shelf item</span>
                                                                        <span className="text-red-500">x{item.quantity}</span>
                                                                        <span className="ml-auto font-semibold tabular-nums">{fmt(item.amount ?? 0)} KD</span>
                                                                    </div>
                                                                );
                                                            }
                                                            return null;
                                                        })}
                                                    </div>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </Fragment>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>

            {/* Hidden invoice for printing — the proper signed invoice (SPEC §3) */}
            <div className="hidden">
                <div ref={receiptRef}>
                    {printAlteration
                        ? <AlterationInvoice data={printAlteration} />
                        : printData && (orderType === "SALES"
                            ? <SalesInvoice data={printData} />
                            : <OrderInvoice data={printData} />)}
                </div>
            </div>
        </>
    );
}

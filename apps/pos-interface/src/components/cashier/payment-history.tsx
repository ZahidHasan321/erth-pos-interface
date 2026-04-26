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
import { parseUtcTimestamp, TIMEZONE } from "@/lib/utils";
import { PaymentReceipt, type PaymentReceiptData, type ReceiptGarment, type ReceiptShelfItem } from "./payment-receipt";

interface PaymentHistoryProps {
    transactions: any[];
    orderId: number;
    invoiceNumber?: number;
    invoiceRevision?: number;
    orderType?: "WORK" | "SALES";
    homeDelivery?: boolean;
    customerName?: string;
    customerPhone?: string;
    orderTotal: number;
    totalPaid: number;
    discountValue?: number;
    garments?: ReceiptGarment[];
    shelfItems?: ReceiptShelfItem[];
}

export function PaymentHistory({
    transactions,
    orderId,
    invoiceNumber,
    invoiceRevision,
    orderType,
    homeDelivery,
    customerName,
    customerPhone,
    orderTotal,
    discountValue,
    garments,
    shelfItems,
}: PaymentHistoryProps) {
    const receiptRef = useRef<HTMLDivElement>(null);
    const [receiptData, setReceiptData] = useState<PaymentReceiptData | null>(null);
    const [expandedTx, setExpandedTx] = useState<number | null>(null);
    const [pendingPrint, setPendingPrint] = useState(false);

    const handlePrint = useReactToPrint({
        contentRef: receiptRef,
    });

    // Print after the receipt data renders
    useEffect(() => {
        if (pendingPrint && receiptData) {
            const timer = setTimeout(() => {
                handlePrint();
                setPendingPrint(false);
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [pendingPrint, receiptData, handlePrint]);

    const printTransaction = useCallback((tx: any) => {
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
            .reduce((sum: number, t: any) => sum + (t.amount || 0), 0);

        const invoiceDisplay = invoiceNumber ? `${invoiceNumber}${invoiceRevision ? `-R${invoiceRevision}` : ""}` : undefined;
        setReceiptData({
            orderId,
            invoiceDisplay,
            orderType,
            homeDelivery,
            customerName,
            customerPhone,
            transactionAmount: tx.amount,
            transactionType: tx.transaction_type,
            paymentType: tx.payment_type,
            paymentRefNo: tx.payment_ref_no,
            orderTotal,
            totalPaid: paid,
            remainingBalance: orderTotal - paid,
            discountValue,
            cashierName: tx.cashier?.name,
            timestamp: tx.created_at,
            garments,
            shelfItems,
        });
        setPendingPrint(true);
    }, [transactions, invoiceNumber, invoiceRevision, orderType, homeDelivery, orderId, customerName, customerPhone, orderTotal, discountValue, garments, shelfItems]);

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
                        {transactions.map((tx: any) => {
                            const isRefund = tx.transaction_type === "refund";
                            const hasRefundDetails = isRefund && (tx.refund_reason || (tx.refund_items && tx.refund_items.length > 0));
                            const isExpanded = expandedTx === tx.id;
                            const refundItems: any[] = tx.refund_items || [];

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

                                    {/* Refund details — expanded row */}
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
                                                        {refundItems.map((item: any, i: number) => {
                                                            if (item.garment_id) {
                                                                const parts = [
                                                                    item.fabric && "Fabric",
                                                                    item.stitching && "Stitching",
                                                                    item.style && "Style",
                                                                    item.express && "Express",
                                                                    item.soaking && (item.soaking_hours ? `Soaking ${item.soaking_hours}h` : "Soaking"),
                                                                ].filter(Boolean);
                                                                return (
                                                                    <div key={i} className="flex items-center gap-1.5 text-xs text-red-700">
                                                                        <Shirt className="h-3 w-3 shrink-0" />
                                                                        <span className="font-medium">{item.garment_id.slice(0, 8)}</span>
                                                                        <span className="text-red-500">{parts.join(", ")}</span>
                                                                        <span className="ml-auto font-semibold tabular-nums">{fmt(item.amount)} KD</span>
                                                                    </div>
                                                                );
                                                            }
                                                            if (item.shelf_item_id != null) {
                                                                return (
                                                                    <div key={i} className="flex items-center gap-1.5 text-xs text-red-700">
                                                                        <Package className="h-3 w-3 shrink-0" />
                                                                        <span className="font-medium">Shelf item</span>
                                                                        <span className="text-red-500">x{item.quantity}</span>
                                                                        <span className="ml-auto font-semibold tabular-nums">{fmt(item.amount)} KD</span>
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

            {/* Hidden receipt for printing */}
            <div className="hidden">
                <div ref={receiptRef}>
                    {receiptData && (
                        <PaymentReceipt data={receiptData} />
                    )}
                </div>
            </div>
        </>
    );
}

import { useRef } from "react";
import { useReactToPrint } from "react-to-print";
import { Printer } from "lucide-react";
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
import { PaymentReceipt, type PaymentReceiptData } from "./payment-receipt";

interface PaymentHistoryProps {
    transactions: any[];
    orderId: number;
    invoiceNumber?: number;
    invoiceRevision?: number;
    customerName?: string;
    customerPhone?: string;
    orderTotal: number;
    totalPaid: number;
}

export function PaymentHistory({
    transactions,
    orderId,
    invoiceNumber,
    invoiceRevision,
    customerName,
    customerPhone,
    orderTotal,
}: PaymentHistoryProps) {
    const receiptRef = useRef<HTMLDivElement>(null);
    const printReceiptRef = useRef<PaymentReceiptData | null>(null);

    const handlePrint = useReactToPrint({
        contentRef: receiptRef,
    });

    const printTransaction = (tx: any) => {
        const paid = transactions
            .filter((t) => new Date(t.created_at) <= new Date(tx.created_at))
            .reduce((sum: number, t: any) => sum + (t.amount || 0), 0);

        const invoiceDisplay = invoiceNumber ? `${invoiceNumber}${invoiceRevision ? `-R${invoiceRevision}` : ""}` : undefined;
        printReceiptRef.current = {
            orderId,
            invoiceDisplay,
            customerName,
            customerPhone,
            transactionAmount: tx.amount,
            transactionType: tx.transaction_type,
            paymentType: tx.payment_type,
            paymentRefNo: tx.payment_ref_no,
            orderTotal,
            totalPaid: paid,
            remainingBalance: orderTotal - paid,
            cashierName: tx.cashier?.name,
            timestamp: tx.created_at,
        };

        setTimeout(() => handlePrint(), 100);
    };

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
                        {transactions.map((tx: any) => (
                            <TableRow key={tx.id}>
                                <TableCell className="text-xs">
                                    {new Date(tx.created_at).toLocaleDateString("en-GB", {
                                        day: "2-digit",
                                        month: "short",
                                        year: "numeric",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                    })}
                                </TableCell>
                                <TableCell>
                                    <Badge
                                        variant={tx.transaction_type === "refund" ? "destructive" : "default"}
                                        className={tx.transaction_type === "payment" ? "bg-green-600" : ""}
                                    >
                                        {tx.transaction_type === "refund" ? "Refund" : "Payment"}
                                    </Badge>
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
                                        onClick={() => printTransaction(tx)}
                                        aria-label="Print receipt"
                                    >
                                        <Printer className="h-3.5 w-3.5" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {/* Hidden receipt for printing */}
            <div className="hidden">
                <div ref={receiptRef}>
                    {printReceiptRef.current && (
                        <PaymentReceipt data={printReceiptRef.current} />
                    )}
                </div>
            </div>
        </>
    );
}

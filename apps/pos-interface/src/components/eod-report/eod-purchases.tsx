import { Card } from "@repo/ui/card";
import { ShoppingCart } from "lucide-react";
import type { EodReportSummary } from "@/api/cashier";

const fmt = (n: number): string => Number(Number(n).toFixed(3)).toString();
const fmtK = (n: number): string => `${fmt(n)} KWD`;

// Stock-purchase settlement methods. Falls back to the raw key for anything new.
const PURCHASE_METHOD_LABEL: Record<string, string> = {
    cash: "Cash",
    knet: "K-Net",
    link_payment: "Link payment",
    bank_transfer: "Bank transfer",
    others: "Other",
};

interface EodPurchasesProps {
    data: EodReportSummary;
}

export function EodPurchases({ data }: EodPurchasesProps) {
    const { total_paid, payment_count, by_payment_method } = data.purchases;

    return (
        <Card className="p-5 shadow-none">
            <div className="mb-4 pb-3 border-b border-border flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                <div>
                    <h2 className="text-base font-semibold">Stock purchases settled</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Fabric / shelf restock payables paid in this period (cash and non-cash)
                    </p>
                </div>
            </div>

            {payment_count === 0 ? (
                <p className="text-sm text-muted-foreground">No stock purchases were settled in this period.</p>
            ) : (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
                        <Cell label="Total settled" value={fmtK(total_paid)} emphasize />
                        <Cell label="Settlements" value={`${payment_count}`} sub="Payment records" />
                    </div>

                    <div className="mt-5 pt-4 border-t border-border">
                        <p className="text-xs font-medium text-muted-foreground mb-2">By method</p>
                        <div className="space-y-1.5">
                            {by_payment_method.map((m) => (
                                <div key={m.payment_type} className="flex items-center justify-between text-sm">
                                    <span>
                                        {PURCHASE_METHOD_LABEL[m.payment_type] ?? m.payment_type}
                                        <span className="text-muted-foreground"> · {m.count}</span>
                                    </span>
                                    <span className="tabular-nums font-medium">{fmtK(m.total)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </Card>
    );
}

function Cell({
    label,
    value,
    sub,
    emphasize,
}: {
    label: string;
    value: string;
    sub?: string;
    emphasize?: boolean;
}) {
    const color = emphasize ? "text-primary" : "text-foreground";
    const size = emphasize ? "text-lg font-semibold" : "text-base font-medium";
    return (
        <div>
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className={`${size} tabular-nums ${color}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
    );
}

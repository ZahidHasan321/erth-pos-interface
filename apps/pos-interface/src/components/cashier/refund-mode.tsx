import { useEffect, useRef, useState } from "react";
import { AlertTriangle, History, Info, Loader2, Undo2 } from "lucide-react";
import { Alert, AlertDescription } from "@repo/ui/alert";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@repo/ui/tooltip";
import { useAuth } from "@/context/auth";
import { usePaymentMutation } from "@/hooks/useCashier";
import { usePricing } from "@/hooks/usePricing";
import { PAYMENT_TYPE_LABELS, PAYMENT_METHOD_COLORS } from "@/lib/constants";
import { Numpad } from "@/components/cashier/numpad";
import { RefundItemSelector } from "@/components/cashier/refund-item-selector";
import type { RefundItem } from "@/api/cashier";
import type { Order, Garment, OrderShelfItem } from "@repo/database";

type Props = {
    order: Order;
    garments: Garment[];
    shelfItems: OrderShelfItem[];
    orderTotal: number;
    totalPaid: number;
    advance: number;
    remainingBalance: number;
    cancelledWithPayments: boolean;
};

const fmt = (n: number): string => Number(Number(n).toFixed(3)).toString();
const fmtK = (n: number): string => `${fmt(n)} KD`;

const PAYMENT_METHODS = ["cash", "knet", "link_payment", "installments", "others"] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const MAX_DECIMALS = 3;

function sanitizeAmount(raw: string): string | null {
    if (raw === "") return "";
    if (!/^\d*\.?\d*$/.test(raw)) return null;
    const parts = raw.split(".");
    if (parts.length > 2) return null;
    if (parts[1] && parts[1].length > MAX_DECIMALS) return null;
    return raw;
}

export function RefundMode({
    order, garments, shelfItems, orderTotal, totalPaid, cancelledWithPayments,
}: Props) {
    const { user: currentUser } = useAuth();
    const { getPrice } = usePricing();
    const paymentMutation = usePaymentMutation();
    const idempotencyKeyRef = useRef(crypto.randomUUID());

    const [refundItems, setRefundItems] = useState<RefundItem[]>([]);
    const [refundTotal, setRefundTotal] = useState(0);
    const [tendered, setTendered] = useState("");
    const [method, setMethod] = useState<PaymentMethod>("cash");
    const [refNo, setRefNo] = useState("");
    const [reason, setReason] = useState("");
    const [refError, setRefError] = useState<string | null>(null);
    const [amountError, setAmountError] = useState<string | null>(null);
    const [reasonError, setReasonError] = useState<string | null>(null);
    const [selectorResetKey, setSelectorResetKey] = useState(0);

    useEffect(() => {
        setTendered("");
        setRefNo("");
        setReason("");
        setRefError(null);
        setAmountError(null);
        setReasonError(null);
        idempotencyKeyRef.current = crypto.randomUUID();
        setSelectorResetKey(k => k + 1);
    }, [order?.id]);

    // Auto-fill tendered when items selected
    useEffect(() => {
        if (refundTotal > 0) setTendered(fmt(refundTotal));
    }, [refundTotal]);

    const tenderedNum = Number(tendered);
    const tenderedValid = !isNaN(tenderedNum) && tenderedNum > 0;
    const overpayment = Math.max(0, totalPaid - orderTotal);
    const hasItems = refundItems.length > 0;

    const onTenderedTyped = (raw: string) => {
        const cleaned = sanitizeAmount(raw);
        if (cleaned === null) return;
        setTendered(cleaned);
        if (amountError) setAmountError(null);
    };

    const submit = async () => {
        setRefError(null);
        setAmountError(null);
        setReasonError(null);
        if (!reason.trim()) { setReasonError("Refund reason is required"); return; }
        if (!tenderedValid) { setAmountError("Enter an amount"); return; }
        if (!hasItems) {
            if (overpayment <= 0.001) { setAmountError("Select items to refund"); return; }
            if (tenderedNum > overpayment + 0.001) {
                setAmountError(`Without items, refund capped at overpayment (${fmt(overpayment)} KD)`);
                return;
            }
        }
        if (tenderedNum > totalPaid + 0.001) {
            setAmountError(`Cannot refund more than paid (${fmt(totalPaid)} KD)`);
            return;
        }
        if (method !== "cash" && !refNo.trim()) { setRefError("Reference number required"); return; }

        paymentMutation.mutate({
            orderId: order.id,
            amount: tenderedNum,
            paymentType: method,
            paymentRefNo: refNo.trim() || undefined,
            cashierId: currentUser?.id ?? undefined,
            transactionType: "refund",
            refundReason: reason.trim(),
            refundItems: hasItems ? refundItems : undefined,
            idempotencyKey: idempotencyKeyRef.current,
        }, {
            onSuccess: (res) => {
                if (res.status === "success") {
                    setTendered("");
                    setRefNo("");
                    setReason("");
                    idempotencyKeyRef.current = crypto.randomUUID();
                    setSelectorResetKey(k => k + 1);
                }
            },
        });
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 pt-3 lg:items-stretch lg:h-full lg:min-h-0">
            {/* LEFT — items to refund + reason + ref no */}
            <div className="lg:col-span-3 space-y-3 lg:overflow-y-auto lg:min-h-0 lg:px-1 lg:py-1 scrollbar-thin">
                {cancelledWithPayments && (
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                            Order cancelled with payments on file. Refund the customer to close it out.
                        </AlertDescription>
                    </Alert>
                )}

                <div className="bg-card border-2 border-red-200 rounded-xl p-4">
                        <div className="flex items-center gap-1.5 mb-2">
                            <h3 className="text-base font-semibold">Select items to refund</h3>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        type="button"
                                        className="text-muted-foreground hover:text-foreground transition-colors"
                                        aria-label="Refund mode info"
                                    >
                                        <Info className="h-4 w-4" />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="max-w-xs">
                                    Refund mode. Money moves out, not in. Pick items to refund or enter an overpayment amount.
                                </TooltipContent>
                            </Tooltip>
                        </div>
                        <RefundItemSelector
                            garments={garments as Parameters<typeof RefundItemSelector>[0]["garments"]}
                            shelfItems={shelfItems as Parameters<typeof RefundItemSelector>[0]["shelfItems"]}
                            expressSurcharge={getPrice("EXPRESS_SURCHARGE") || 2}
                            soaking8hPrice={getPrice("SOAKING_8H_CHARGE") || 0}
                            soaking24hPrice={getPrice("SOAKING_24H_CHARGE") || 0}
                            totalPaid={totalPaid}
                            onRefundItemsChange={(items, total) => { setRefundItems(items); setRefundTotal(total); }}
                            resetKey={selectorResetKey}
                        />
                    </div>

                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                            Refund Reason <span className="text-red-500">*</span>
                        </Label>
                        <Input
                            value={reason}
                            onChange={(e) => { setReason(e.target.value); setReasonError(null); }}
                            placeholder="Reason for refund (required)"
                            className="h-11 text-sm"
                        />
                        {reasonError && <p className="text-xs text-red-500">{reasonError}</p>}
                    </div>
                </div>

                {/* RIGHT — refund summary + numpad */}
                <div className="lg:col-span-2 lg:h-full lg:min-h-0 flex flex-col gap-2">
                    <div className="space-y-2 lg:flex-1 lg:min-h-0">
                        {/* Hero: refund total */}
                        <div className="bg-card border-2 border-border rounded-xl p-3">
                            <div className="flex items-baseline justify-between mb-1">
                                <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                                    {hasItems ? "Items Selected" : overpayment > 0.001 ? "Overpaid" : "Refund Total"}
                                </Label>
                                <span className="text-xs flex items-center gap-1 text-muted-foreground">
                                    <History className="h-3.5 w-3.5" />
                                    Paid {fmtK(totalPaid)}
                                </span>
                            </div>
                            <div className="text-3xl font-bold tabular-nums text-red-600">
                                {hasItems ? fmtK(refundTotal) : overpayment > 0.001 ? fmtK(overpayment) : fmtK(0)}
                            </div>
                        </div>

                        {/* Tendered */}
                        <div className="bg-card border-2 border-border rounded-xl p-3">
                            <div className="flex items-center justify-between mb-2">
                                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Refunding</Label>
                                {!hasItems && overpayment > 0.001 && (
                                    <button
                                        type="button"
                                        onClick={() => setTendered(fmt(overpayment))}
                                        className="h-8 px-2.5 rounded-md border-2 border-red-300 bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100 active:bg-red-200 cursor-pointer touch-manipulation"
                                    >
                                        Overpaid {fmt(overpayment)}
                                    </button>
                                )}
                            </div>
                            <div className="relative">
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={tendered}
                                    placeholder="0.000"
                                    onChange={(e) => onTenderedTyped(e.target.value)}
                                    onFocus={(e) => e.target.select()}
                                    className="w-full rounded-lg px-3 py-2 bg-muted/40 border-2 border-transparent focus:border-red-500 focus:bg-background outline-none text-3xl font-bold tabular-nums text-right pr-12 placeholder:text-muted-foreground/40"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground pointer-events-none">KD</span>
                            </div>
                            {amountError && <p className="text-xs text-red-500 mt-1">{amountError}</p>}
                            {!hasItems && overpayment > 0.001 && (
                                <p className="text-[11px] text-muted-foreground mt-1">No items selected. Refunding overpayment only.</p>
                            )}
                        </div>

                        {/* Method tiles */}
                        <div className="grid grid-cols-5 gap-1.5">
                            {PAYMENT_METHODS.map((m) => {
                                const active = method === m;
                                return (
                                    <button
                                        key={m}
                                        type="button"
                                        onClick={() => { setMethod(m); if (m === "cash") setRefError(null); }}
                                        className={`h-11 rounded-lg border-2 text-xs font-semibold transition-all touch-manipulation pointer-coarse:active:scale-[0.97] ${active ? "text-white" : "bg-background text-foreground border-border hover:border-foreground/30"}`}
                                        style={active ? { backgroundColor: PAYMENT_METHOD_COLORS[m], borderColor: PAYMENT_METHOD_COLORS[m] } : undefined}
                                    >
                                        {PAYMENT_TYPE_LABELS[m]}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Ref No */}
                        <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                                Ref No.{method !== "cash" && <span className="text-red-500"> *</span>}
                            </Label>
                            <Input
                                value={refNo}
                                onChange={(e) => { setRefNo(e.target.value); setRefError(null); }}
                                onFocus={(e) => e.target.select()}
                                placeholder={method === "cash" ? "Optional" : "Reference"}
                                className="h-11 text-sm"
                            />
                            {refError && <p className="text-xs text-red-500">{refError}</p>}
                        </div>

                    </div>

                    {/* Bottom: numpad + refund button — always visible */}
                    <div className="space-y-2 shrink-0">
                        <Numpad
                            value={tendered}
                            onChange={setTendered}
                            maxDecimals={MAX_DECIMALS}
                        />
                        <Button
                            type="button"
                            onClick={submit}
                            disabled={paymentMutation.isPending || !tenderedValid}
                            className="w-full h-14 text-lg font-bold bg-red-600 hover:bg-red-700"
                        >
                            {paymentMutation.isPending ? (
                                <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Processing...</>
                            ) : (
                                <><Undo2 className="h-5 w-5 mr-2" /> Refund {tendered ? fmtK(tenderedNum) : "KD ___"}</>
                            )}
                        </Button>
                    </div>
                </div>
            </div>
    );
}

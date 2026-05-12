import { useEffect, useRef, useState } from "react";
import { Banknote, History, Loader2, Package, Shirt, Tag, Truck } from "lucide-react";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Label } from "@repo/ui/label";
import { Separator } from "@repo/ui/separator";
import { useAuth } from "@/context/auth";
import { usePaymentMutation } from "@/hooks/useCashier";
import { PAYMENT_TYPE_LABELS, PAYMENT_METHOD_COLORS } from "@/lib/constants";
import { Numpad } from "@/components/cashier/numpad";
import { DiscountDialog } from "@/components/cashier/discount-dialog";
import { DeliveryDialog } from "@/components/cashier/delivery-dialog";

type Props = {
    order: any;
    orderTotal: number;
    totalPaid: number;
    advance: number;
    remainingBalance: number;
    isFullyPaid: boolean;
    transactionsCount: number;
    totalPayments: number;
    totalRefunds: number;
    onOpenHistory: () => void;
    isHomeDelivery: boolean;
    isOrderCompleted: boolean;
};

const fmt = (n: number): string => Number(Number(n).toFixed(3)).toString();
const fmtK = (n: number): string => `${fmt(n)} KD`;

const PAYMENT_METHODS = ["cash", "knet", "link_payment", "installments", "others"] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const DISCOUNT_TYPE_LABELS: Record<string, string> = {
    flat: "Flat",
    referral: "Referral",
    loyalty: "Loyalty",
    by_value: "By Value",
};

const MAX_DECIMALS = 3;

/** Sanitize a string so it represents a valid decimal with up to MAX_DECIMALS places. */
function sanitizeAmount(raw: string): string | null {
    if (raw === "") return "";
    // Allow only digits and a single dot
    if (!/^\d*\.?\d*$/.test(raw)) return null;
    const parts = raw.split(".");
    if (parts.length > 2) return null;
    if (parts[1] && parts[1].length > MAX_DECIMALS) return null;
    return raw;
}

export function PaymentMode({
    order, orderTotal, totalPaid, advance, remainingBalance, isFullyPaid,
    transactionsCount, totalPayments, totalRefunds, onOpenHistory,
    isHomeDelivery, isOrderCompleted,
}: Props) {
    const { user: currentUser } = useAuth();
    const paymentMutation = usePaymentMutation();
    const idempotencyKeyRef = useRef(crypto.randomUUID());

    const [tendered, setTendered] = useState("");
    const [method, setMethod] = useState<PaymentMethod>("cash");
    const [refNo, setRefNo] = useState("");
    const [note, setNote] = useState("");
    const [refError, setRefError] = useState<string | null>(null);
    const [amountError, setAmountError] = useState<string | null>(null);
    const [discountOpen, setDiscountOpen] = useState(false);
    const [deliveryOpen, setDeliveryOpen] = useState(false);

    useEffect(() => {
        setTendered("");
        setRefNo("");
        setNote("");
        setRefError(null);
        setAmountError(null);
        setDiscountOpen(false);
        setDeliveryOpen(false);
        idempotencyKeyRef.current = crypto.randomUUID();
    }, [order?.id]);

    const tenderedNum = Number(tendered);
    const tenderedValid = !isNaN(tenderedNum) && tenderedNum > 0;

    const cappedAdvance = Math.min(advance, Math.max(0, remainingBalance));
    const showAdvance = totalPaid === 0 && cappedAdvance > 0 && cappedAdvance < remainingBalance - 0.001;

    const isWorkOrder = order?.order_type === "WORK";
    const discountValue = Number(order?.discount_value) || 0;
    const discountType = order?.discount_type;
    const discountPercentage = Number(order?.discount_percentage) || 0;
    const subtotal = orderTotal + discountValue;
    const hasDiscount = discountValue > 0;
    const isOverpaid = remainingBalance < -0.001;

    const garments = Array.isArray(order?.garments) ? order.garments : [];
    const shelfItems = Array.isArray(order?.shelf_items) ? order.shelf_items : [];

    const charges: Array<[string, number]> = [
        ["Stitching", Number(order?.stitching_charge) || 0],
        ["Fabric", Number(order?.fabric_charge) || 0],
        ["Style", Number(order?.style_charge) || 0],
        ["Delivery", Number(order?.delivery_charge) || 0],
        ["Express", Number(order?.express_charge) || 0],
        ["Soaking", Number(order?.soaking_charge) || 0],
        ["Shelf items", Number(order?.shelf_charge) || 0],
    ];

    const onTenderedTyped = (raw: string) => {
        const cleaned = sanitizeAmount(raw);
        if (cleaned === null) return;
        setTendered(cleaned);
        if (amountError) setAmountError(null);
    };

    const submit = async () => {
        setRefError(null);
        setAmountError(null);
        if (!tenderedValid) { setAmountError("Enter an amount"); return; }
        if (method !== "cash" && !refNo.trim()) { setRefError("Reference number required"); return; }
        paymentMutation.mutate({
            orderId: order.id,
            amount: tenderedNum,
            paymentType: method,
            paymentRefNo: refNo.trim() || undefined,
            paymentNote: note.trim() || undefined,
            cashierId: currentUser?.id ?? undefined,
            transactionType: "payment",
            idempotencyKey: idempotencyKeyRef.current,
        }, {
            onSuccess: (res) => {
                if (res.status === "success") {
                    setTendered("");
                    setRefNo("");
                    setNote("");
                    idempotencyKeyRef.current = crypto.randomUUID();
                }
            },
        });
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 pt-3 lg:items-stretch lg:h-full lg:min-h-0">
            {/* LEFT — order details + breakdown */}
            <div className="lg:col-span-3 space-y-3 lg:overflow-y-auto lg:min-h-0 lg:pr-1 scrollbar-thin">
                <OrderItemsList garments={garments} shelfItems={shelfItems} orderDeliveryDate={order?.delivery_date} />

                {/* Breakdown */}
                <div className="bg-card border-2 border-border rounded-xl p-4">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Breakdown</Label>
                    <div className="mt-2 space-y-1 text-sm">
                        {charges.map(([label, value]) => {
                            const show = isWorkOrder || value > 0;
                            if (!show) return null;
                            return (
                                <div key={label} className="flex justify-between text-muted-foreground">
                                    <span>{label}</span>
                                    <span className="tabular-nums">{fmtK(value)}</span>
                                </div>
                            );
                        })}
                        {hasDiscount && (
                            <>
                                <div className="flex justify-between pt-1">
                                    <span className="text-muted-foreground">Subtotal</span>
                                    <span className="tabular-nums">{fmtK(subtotal)}</span>
                                </div>
                                <div className="flex justify-between text-amber-600">
                                    <span className="flex items-center gap-1">
                                        <Tag className="h-3.5 w-3.5" />
                                        Discount
                                        {discountType && <span className="text-xs">({DISCOUNT_TYPE_LABELS[discountType] || discountType})</span>}
                                        {discountPercentage > 0 && <span className="text-xs">{discountPercentage}%</span>}
                                    </span>
                                    <span className="tabular-nums">-{fmtK(discountValue)}</span>
                                </div>
                            </>
                        )}
                        <div className="flex justify-between font-semibold pt-1 text-base">
                            <span>Total</span>
                            <span className="tabular-nums">{fmtK(orderTotal)}</span>
                        </div>
                        <Separator className="my-1.5" />
                        <div className="flex justify-between text-emerald-600">
                            <span>Payments</span>
                            <span className="tabular-nums">{fmtK(totalPayments)}</span>
                        </div>
                        {totalRefunds > 0 && (
                            <div className="flex justify-between text-red-600">
                                <span>Refunds</span>
                                <span className="tabular-nums">-{fmtK(totalRefunds)}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Ref + Note */}
                <div className="grid grid-cols-2 gap-2">
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
                    <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wider">Note</Label>
                        <Input
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            onFocus={(e) => e.target.select()}
                            placeholder="Optional"
                            className="h-11 text-sm"
                        />
                    </div>
                </div>
            </div>

            {/* RIGHT — payment summary + numpad. Numpad pinned at bottom. */}
            <div className="lg:col-span-2 lg:h-full lg:min-h-0 flex flex-col gap-2">
                {/* Top: scrollable summary */}
                <div className="space-y-2 lg:flex-1 lg:overflow-y-auto lg:min-h-0 lg:pr-1 scrollbar-thin">
                {/* Hero: due */}
                <div className="bg-card border-2 border-border rounded-xl p-3">
                    <div className="flex items-baseline justify-between mb-1">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                            {isOverpaid ? "Overpaid" : isFullyPaid ? "Fully Paid" : "Amount Due"}
                        </Label>
                        <button
                            type="button"
                            onClick={onOpenHistory}
                            className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                            <History className="h-3.5 w-3.5" />
                            History ({transactionsCount})
                        </button>
                    </div>
                    <div className={`text-3xl font-bold tabular-nums ${isOverpaid ? "text-amber-600" : isFullyPaid ? "text-emerald-600" : "text-foreground"}`}>
                        {isOverpaid ? `+${fmtK(Math.abs(remainingBalance))}` : fmtK(Math.max(0, remainingBalance))}
                    </div>
                </div>

                {/* Tendered */}
                <div className="bg-card border-2 border-border rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wider">Tendered</Label>
                        <div className="flex items-center gap-1.5">
                            {showAdvance && (
                                <button
                                    type="button"
                                    onClick={() => setTendered(fmt(cappedAdvance))}
                                    className="h-8 px-2.5 rounded-md border-2 border-primary/30 bg-primary/5 text-primary text-xs font-semibold hover:bg-primary/10 active:bg-primary/15 cursor-pointer touch-manipulation"
                                >
                                    Advance {fmt(cappedAdvance)}
                                </button>
                            )}
                            {remainingBalance > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setTendered(fmt(remainingBalance))}
                                    className="h-8 px-2.5 rounded-md border-2 border-primary/30 bg-primary/5 text-primary text-xs font-semibold hover:bg-primary/10 active:bg-primary/15 cursor-pointer touch-manipulation"
                                >
                                    Full {fmt(remainingBalance)}
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="relative">
                        <input
                            type="text"
                            inputMode="decimal"
                            value={tendered}
                            placeholder="0.000"
                            onChange={(e) => onTenderedTyped(e.target.value)}
                            onFocus={(e) => e.target.select()}
                            className="w-full rounded-lg px-3 py-2 bg-muted/40 border-2 border-transparent focus:border-primary focus:bg-background outline-none text-3xl font-bold tabular-nums text-right pr-12 placeholder:text-muted-foreground/40"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground pointer-events-none">KD</span>
                    </div>
                    {amountError && <p className="text-xs text-red-500 mt-1">{amountError}</p>}
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
                </div>

                {/* Bottom: numpad + charge — always visible */}
                <div className="space-y-2 shrink-0">
                <Numpad
                    value={tendered}
                    onChange={setTendered}
                    maxDecimals={MAX_DECIMALS}
                    actions={[
                        {
                            label: (
                                <span className="flex items-center gap-1.5">
                                    <Tag className="h-4 w-4" />
                                    {hasDiscount ? `-${fmt(discountValue)}` : "Discount"}
                                </span>
                            ),
                            onClick: () => setDiscountOpen(true),
                            active: hasDiscount,
                        },
                        ...(isWorkOrder ? [{
                            label: (
                                <span className="flex items-center gap-1.5">
                                    <Truck className="h-4 w-4" />
                                    {isHomeDelivery ? "Delivery" : "Pickup"}
                                </span>
                            ),
                            onClick: () => setDeliveryOpen(true),
                            active: isHomeDelivery,
                        }] : []),
                    ]}
                />
                <Button
                    type="button"
                    onClick={submit}
                    disabled={paymentMutation.isPending || !tenderedValid}
                    className="w-full h-14 text-lg font-bold"
                    style={tenderedValid && !paymentMutation.isPending ? { backgroundColor: "#0d7a5e" } : undefined}
                >
                    {paymentMutation.isPending ? (
                        <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Processing...</>
                    ) : (
                        <><Banknote className="h-5 w-5 mr-2" /> Charge {tendered ? fmtK(tenderedNum) : "KD ___"}</>
                    )}
                </Button>
                </div>
            </div>

            <DiscountDialog
                open={discountOpen}
                onOpenChange={setDiscountOpen}
                order={order}
                orderTotal={orderTotal}
                totalPaid={totalPaid}
            />
            <DeliveryDialog
                open={deliveryOpen}
                onOpenChange={setDeliveryOpen}
                order={order}
                isOrderCompleted={isOrderCompleted}
            />
        </div>
    );
}

// ── Read-only items list (LEFT panel) ──────────────────────────────────────
const itemDateFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" });
function sameDay(a?: string | null, b?: string | null): boolean {
    if (!a || !b) return false;
    return new Date(a).toDateString() === new Date(b).toDateString();
}

function OrderItemsList({ garments, shelfItems, orderDeliveryDate }: { garments: any[]; shelfItems: any[]; orderDeliveryDate?: string | null }) {
    const hasGarments = garments.length > 0;
    const hasShelf = shelfItems.length > 0;
    if (!hasGarments && !hasShelf) return null;

    return (
        <div className="bg-card border-2 border-border rounded-xl p-4 space-y-3">
            {hasGarments && (
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                            <Shirt className="h-3.5 w-3.5" />
                            Garments ({garments.length})
                        </Label>
                    </div>
                    <ul className="space-y-1">
                        {garments.map((g: any, i: number) => {
                            const showOwnDate = g.delivery_date && !sameDay(g.delivery_date, orderDeliveryDate);
                            return (
                            <li key={g.id} className="flex items-center gap-2 text-sm py-1.5 px-2 rounded-md bg-muted/40">
                                <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-6">#{i + 1}</span>
                                <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded shrink-0 ${g.garment_type === "brova" ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700"}`}>
                                    {g.garment_type === "brova" ? "Brova" : "Final"}
                                </span>
                                <span className="font-medium truncate">{g.fabric?.name || "Outside"}</span>
                                {g.express && (
                                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-700 shrink-0">Express</span>
                                )}
                                {g.soaking && (
                                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 shrink-0">Soak</span>
                                )}
                                {showOwnDate && (
                                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 shrink-0 tabular-nums">
                                        Due {itemDateFmt.format(new Date(g.delivery_date))}
                                    </span>
                                )}
                                <span className="ml-auto text-xs text-muted-foreground tabular-nums shrink-0">
                                    {Number(g.fabric_length) || 0}m
                                </span>
                            </li>
                            );
                        })}
                    </ul>
                </div>
            )}
            {hasShelf && (
                <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <Package className="h-3.5 w-3.5" />
                        Shelf items ({shelfItems.length})
                    </Label>
                    <ul className="space-y-1">
                        {shelfItems.map((it: any) => (
                            <li key={it.id} className="flex items-center gap-2 text-sm py-1.5 px-2 rounded-md bg-muted/40">
                                <span className="font-medium truncate">{it.shelf?.type || `Item #${it.shelf_id}`}</span>
                                <span className="text-xs text-muted-foreground shrink-0">× {it.quantity}</span>
                                <span className="ml-auto font-semibold tabular-nums shrink-0">{fmtK(it.unit_price * it.quantity)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

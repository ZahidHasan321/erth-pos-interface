import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, AlertTriangle, X, Check, Banknote, CreditCard, Link2, MoreHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Skeleton } from "@repo/ui/skeleton";
import { useAuth } from "@/context/auth";
import { toLocalDateStr } from "@/lib/utils";
import { Numpad } from "@/components/cashier/numpad";
import { useCashierPendingOrders, useBulkPaymentMutation } from "@/hooks/useCashier";
import type { CashierPendingOrder } from "@/api/cashier";

const fmtK = (n: number): string => `${Number(Number(n).toFixed(3))} KWD`;
// Touch-friendly method tabs: short labels + an icon per method. Short labels
// (not PAYMENT_TYPE_LABELS) keep each tap target on one line in a 4-up grid.
const PAYMENT_METHODS: { value: string; label: string; Icon: LucideIcon }[] = [
    { value: "cash", label: "Cash", Icon: Banknote },
    { value: "knet", label: "K-Net", Icon: CreditCard },
    { value: "link_payment", label: "Link", Icon: Link2 },
    { value: "others", label: "Other", Icon: MoreHorizontal },
];
// Amounts round-trip as KWD strings (3 dp); treat two amounts as equal within
// half a fils so preset buttons can light up when the row matches them.
const sameAmount = (a: number, b: number): boolean => Math.abs(a - b) < 0.0005;

interface RowState {
    amount: string;
    method: string;
    refNo: string;
}

/**
 * §3 bulk-payment page. Payment ONLY (no refund/handover). The cashier sets a
 * per-order amount — Advance (the order's agreed advance) or Full (remaining),
 * or a custom amount via the numpad on the focused row — then charges them all
 * in one atomic, idempotent batch (record_bulk_payment): all-or-nothing, so no
 * order is partially collected.
 *
 * `onClose` (back / after-charge navigation) is injected so the same panel works
 * in both the standalone /cashier terminal and the shop-shell /$main/cashier
 * surface, which return to different paths.
 */
export function BulkPaymentPanel({
    orderIds,
    onClose,
}: {
    orderIds: number[];
    onClose: () => void;
}) {
    const { user } = useAuth();
    const { data: result, isLoading } = useCashierPendingOrders();
    const bulkMutation = useBulkPaymentMutation();
    const idemKeyRef = useRef<string | null>(null);

    const selectedOrders = useMemo(() => {
        const byId = new Map((result?.data ?? []).map((o) => [o.order_id, o]));
        return orderIds.map((id) => byId.get(id)).filter((o): o is CashierPendingOrder => !!o);
    }, [result, orderIds]);

    const missingCount = orderIds.length - selectedOrders.length;
    const remainingOf = (o: CashierPendingOrder) => Math.max(o.order_total - o.paid, 0);

    const [rows, setRows] = useState<Record<number, RowState>>({});
    const [focusedId, setFocusedId] = useState<number | null>(null);

    const rowState = (id: number): RowState => rows[id] ?? { amount: "", method: "cash", refNo: "" };
    const setRow = (id: number, patch: Partial<RowState>) =>
        setRows((prev) => ({ ...prev, [id]: { ...rowState(id), ...patch } }));

    const setAmount = (id: number, amount: string) => setRow(id, { amount });

    // Effective focus falls back to the first order (no setState during render).
    const effectiveFocusedId = focusedId ?? selectedOrders[0]?.order_id ?? null;

    const setAll = (kind: "advance" | "full") => {
        setRows((prev) => {
            const next = { ...prev };
            for (const o of selectedOrders) {
                const remaining = remainingOf(o);
                const value = kind === "full" ? remaining : Math.min(o.advance || 0, remaining);
                next[o.order_id] = {
                    ...(next[o.order_id] ?? { method: "cash", refNo: "" }),
                    amount: value > 0 ? String(Number(value.toFixed(3))) : "",
                };
            }
            return next;
        });
    };

    const total = selectedOrders.reduce((sum, o) => sum + (Number(rowState(o.order_id).amount) || 0), 0);
    // Orders with a positive amount entered are the ones that will actually be
    // charged; outstanding is the full remaining balance across the selection.
    const chargingCount = selectedOrders.filter((o) => (Number(rowState(o.order_id).amount) || 0) > 0).length;
    const outstanding = selectedOrders.reduce((sum, o) => sum + remainingOf(o), 0);

    const focusedOrder = selectedOrders.find((o) => o.order_id === effectiveFocusedId);

    const handleCharge = () => {
        const payments = selectedOrders
            .map((o) => {
                const r = rowState(o.order_id);
                return { o, amount: Number(r.amount) || 0, method: r.method, refNo: r.refNo.trim() };
            })
            .filter((p) => p.amount > 0)
            .map((p) => ({
                orderId: p.o.order_id,
                amount: p.amount,
                paymentType: p.method,
                paymentRefNo: p.refNo || undefined,
            }));

        if (payments.length === 0) {
            toast.error("Enter an amount for at least one order");
            return;
        }

        if (!idemKeyRef.current) idemKeyRef.current = crypto.randomUUID();
        bulkMutation.mutate(
            { payments, cashierId: user?.id ?? undefined, idempotencyKey: idemKeyRef.current },
            {
                onSuccess: (res) => {
                    if (res.status === "success") {
                        idemKeyRef.current = null;
                        onClose();
                    }
                },
            },
        );
    };

    if (isLoading) {
        return (
            <div className="p-4 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            <div className="px-4 py-3 border-b bg-card shrink-0 flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={onClose}>
                    <ArrowLeft className="h-4 w-4 mr-1" /> Back
                </Button>
                <div>
                    <h1 className="text-base font-bold">Take Payment</h1>
                    <p className="text-xs text-muted-foreground">
                        {selectedOrders.length} order{selectedOrders.length === 1 ? "" : "s"} selected
                    </p>
                </div>
                {selectedOrders.length > 0 && (
                    <div className="ml-auto text-right">
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Outstanding</div>
                        <div className="text-sm font-semibold tabular-nums">{fmtK(outstanding)}</div>
                    </div>
                )}
            </div>

            {missingCount > 0 && (
                <div className="mx-4 mt-3 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {missingCount} selected order{missingCount === 1 ? " is" : "s are"} no longer pending (already processed) and {missingCount === 1 ? "was" : "were"} skipped.
                </div>
            )}

            <div className="flex-1 min-h-0 overflow-auto lg:overflow-hidden lg:grid lg:grid-cols-[1fr_auto] lg:gap-4 p-4">
                {/* Order rows */}
                <div className="space-y-2 lg:overflow-auto lg:pr-1">
                    {selectedOrders.length === 0 ? (
                        <div className="text-sm text-muted-foreground py-10 text-center">
                            No pending orders to pay. <Button variant="link" onClick={onClose}>Back to pending</Button>
                        </div>
                    ) : (
                        selectedOrders.map((o) => {
                            const r = rowState(o.order_id);
                            const remaining = remainingOf(o);
                            const isFocused = effectiveFocusedId === o.order_id;
                            const amountNum = Number(r.amount) || 0;
                            const willCharge = amountNum > 0;
                            const advanceValue = Math.min(o.advance || 0, remaining);
                            const isAdvance = willCharge && advanceValue > 0 && sameAmount(amountNum, advanceValue);
                            const isFull = willCharge && sameAmount(amountNum, remaining);
                            const delivery = toLocalDateStr(o.delivery_date);
                            return (
                                <div
                                    key={o.order_id}
                                    onClick={() => setFocusedId(o.order_id)}
                                    className={`rounded-lg border-2 p-3 transition-colors cursor-pointer ${
                                        isFocused
                                            ? "border-primary bg-primary/5"
                                            : willCharge
                                                ? "border-primary/40 hover:bg-muted/40"
                                                : "border-border hover:bg-muted/40"
                                    }`}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-semibold truncate">
                                                    #{o.invoice_number ?? o.order_id} · {o.customer_name ?? "Unknown"}
                                                </span>
                                                {willCharge && (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary shrink-0">
                                                        <Check className="h-3 w-3" /> to charge
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-xs text-muted-foreground truncate">
                                                {o.garment_count > 0 && (
                                                    <>{o.garment_count} garment{o.garment_count === 1 ? "" : "s"}</>
                                                )}
                                                {delivery && <>{o.garment_count > 0 ? " · " : ""}due {delivery}</>}
                                            </div>
                                            <div className="mt-0.5 text-xs tabular-nums">
                                                {o.paid > 0 ? (
                                                    <span className="text-muted-foreground">
                                                        paid {fmtK(o.paid)} of {fmtK(o.order_total)} ·{" "}
                                                        <span className="font-medium text-foreground">remaining {fmtK(remaining)}</span>
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground">
                                                        total {fmtK(o.order_total)} ·{" "}
                                                        <span className="font-medium text-foreground">remaining {fmtK(remaining)}</span>
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            {willCharge && (
                                                <button
                                                    type="button"
                                                    aria-label="Clear amount"
                                                    onClick={(e) => { e.stopPropagation(); setFocusedId(o.order_id); setAmount(o.order_id, ""); }}
                                                    className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground active:scale-[0.96] touch-manipulation"
                                                >
                                                    <X className="h-4 w-4" />
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); setFocusedId(o.order_id); }}
                                                className={`flex min-w-[7.5rem] items-baseline justify-end gap-1 rounded-md border px-3 py-1.5 ${
                                                    isFocused ? "border-primary ring-2 ring-primary/30" : willCharge ? "border-primary/40" : "border-border"
                                                }`}
                                            >
                                                <span className={`text-base font-semibold tabular-nums ${willCharge ? "" : "text-muted-foreground"}`}>
                                                    {r.amount === "" ? "0" : r.amount}
                                                </span>
                                                <span className="text-[10px] text-muted-foreground">KWD</span>
                                            </button>
                                        </div>
                                    </div>
                                    <div className="mt-2 flex items-center gap-2">
                                        <Button
                                            variant={isAdvance ? "default" : "outline"}
                                            size="sm"
                                            className="h-9 flex-1"
                                            disabled={!(advanceValue > 0)}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setFocusedId(o.order_id);
                                                setAmount(o.order_id, String(Number(advanceValue.toFixed(3))));
                                            }}
                                        >
                                            Advance {advanceValue > 0 ? fmtK(advanceValue) : "—"}
                                        </Button>
                                        <Button
                                            variant={isFull ? "default" : "outline"}
                                            size="sm"
                                            className="h-9 flex-1"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setFocusedId(o.order_id);
                                                setAmount(o.order_id, String(Number(remaining.toFixed(3))));
                                            }}
                                        >
                                            Full {fmtK(remaining)}
                                        </Button>
                                    </div>
                                    <MethodTabs
                                        value={r.method}
                                        onChange={(m) => setRow(o.order_id, { method: m })}
                                    />
                                    <Input
                                        value={r.refNo}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(e) => setRow(o.order_id, { refNo: e.target.value })}
                                        placeholder="Reference no. (optional)"
                                        className="mt-2 h-9 text-sm"
                                    />
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Numpad + total + charge */}
                <div className="mt-4 lg:mt-0 lg:w-72 shrink-0 flex flex-col gap-3">
                    <div className="rounded-lg border bg-card px-3 py-2">
                        {focusedOrder ? (
                            <>
                                <div className="text-xs text-muted-foreground">Entering amount for</div>
                                <div className="text-sm font-semibold truncate">
                                    #{focusedOrder.invoice_number ?? focusedOrder.order_id} · {focusedOrder.customer_name ?? "Unknown"}
                                </div>
                                <div className="text-xs text-muted-foreground tabular-nums">
                                    remaining {fmtK(remainingOf(focusedOrder))}
                                </div>
                            </>
                        ) : (
                            <div className="text-xs text-muted-foreground">Select an order to enter an amount.</div>
                        )}
                    </div>
                    <Numpad
                        value={effectiveFocusedId !== null ? rowState(effectiveFocusedId).amount : ""}
                        onChange={(v) => effectiveFocusedId !== null && setAmount(effectiveFocusedId, v)}
                        max={focusedOrder ? remainingOf(focusedOrder) : undefined}
                        disabled={effectiveFocusedId === null}
                        actions={[
                            { label: "All Adv", onClick: () => setAll("advance") },
                            { label: "All Full", onClick: () => setAll("full") },
                        ]}
                    />
                    <div className="rounded-lg border bg-muted/40 px-3 py-2">
                        <div className="flex items-baseline justify-between">
                            <span className="text-sm">Total to charge</span>
                            <span className="text-lg font-bold tabular-nums">{fmtK(total)}</span>
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                            {chargingCount > 0
                                ? <>charging {chargingCount} of {selectedOrders.length} order{selectedOrders.length === 1 ? "" : "s"}</>
                                : "no amounts entered yet"}
                        </div>
                    </div>
                    <Button
                        size="lg"
                        className="w-full"
                        disabled={total <= 0 || bulkMutation.isPending}
                        onClick={handleCharge}
                    >
                        {bulkMutation.isPending
                            ? "Charging…"
                            : chargingCount > 0
                                ? `Charge ${chargingCount} order${chargingCount === 1 ? "" : "s"} · ${fmtK(total)}`
                                : "Charge"}
                    </Button>
                </div>
            </div>
        </div>
    );
}

/**
 * Touch-first payment-method picker: a 4-up grid of tap targets (icon + label)
 * replacing the dropdown — one tap, no menu, finger-sized hit areas. The active
 * method is filled with the brand primary; stopPropagation keeps the tap from
 * also re-focusing the card's amount field.
 */
function MethodTabs({ value, onChange }: { value: string; onChange: (m: string) => void }) {
    return (
        <div className="mt-2 grid grid-cols-4 gap-1.5">
            {PAYMENT_METHODS.map(({ value: m, label, Icon }) => {
                const active = value === m;
                return (
                    <button
                        key={m}
                        type="button"
                        aria-pressed={active}
                        onClick={(e) => { e.stopPropagation(); onChange(m); }}
                        className={`flex h-12 flex-col items-center justify-center gap-1 rounded-md border text-[11px] font-medium transition-[transform,background-color,border-color] duration-75 touch-manipulation active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                            active
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-background text-foreground hover:bg-muted/60 active:bg-muted"
                        }`}
                    >
                        <Icon className="h-4 w-4" />
                        {label}
                    </button>
                );
            })}
        </div>
    );
}

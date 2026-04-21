import { useState, useMemo, useEffect, useRef } from "react";
import {
    Search, User, Receipt, Package, CreditCard,
    CheckCircle2, XCircle, Shirt, Tag, ArrowLeft, Clock, Loader2,
    MapPin, Truck, Hash, CalendarDays,
} from "lucide-react";
import { Input } from "@repo/ui/input";
import { Button } from "@repo/ui/button";
import { Card } from "@repo/ui/card";
import { Badge } from "@repo/ui/badge";
import { ChipToggle } from "@repo/ui/chip-toggle";
import { Separator } from "@repo/ui/separator";
import { Alert, AlertDescription } from "@repo/ui/alert";
import { Skeleton } from "@repo/ui/skeleton";
import { TIMEZONE } from "@/lib/utils";
import {
    useCashierOrderSearch,
    usePaymentTransactions,
    useRecentCashierOrders,
    useCashierOrderListSearch,
    useCashierSummary,
    useToggleHomeDeliveryMutation,
    useUpdateDeliveryChargeMutation,
    useCollectGarmentsMutation,
} from "@/hooks/useCashier";
import type { CashierOrderListItem, CashierSummary } from "@/api/cashier";
import { PaymentForm } from "@/components/cashier/payment-form";
import { PaymentHistory } from "@/components/cashier/payment-history";
import { PaymentSummary } from "@/components/cashier/payment-summary";
import { DiscountControls } from "@/components/cashier/discount-controls";
import { GarmentCollection } from "@/components/cashier/garment-collection";
import { RefundItemSelector } from "@/components/cashier/refund-item-selector";
import { ORDER_PHASE_LABELS } from "@/lib/constants";
import { DonutChart } from "@/components/charts/donut-chart";
import { usePricing } from "@/hooks/usePricing";
import { updateCustomer } from "@/api/customers";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Label } from "@repo/ui/label";
import { Textarea } from "@repo/ui/textarea";
import HomeDeliveryIcon from "@/assets/home_delivery.png";
import PickUpIcon from "@/assets/pickup.png";
import { RegisterGate } from "./register-gate";

const PAGE_SIZE = 15;
const fmt = (n: number): string => Number(Number(n).toFixed(3)).toString();
const fmtK = (n: number): string => `${fmt(n)} KWD`;
const shortDateFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" });

// ── Custom keyframes (injected once) ────────────────────────────────────────
const CASHIER_KEYFRAMES_ID = "cashier-keyframes";
if (typeof document !== "undefined" && !document.getElementById(CASHIER_KEYFRAMES_ID)) {
    const style = document.createElement("style");
    style.id = CASHIER_KEYFRAMES_ID;
    style.textContent = `
        @keyframes cashier-focus-in {
            from { opacity: 0; transform: scale(0.96); }
            to   { opacity: 1; transform: scale(1); }
        }
        @keyframes cashier-pop {
            0%   { opacity: 0; transform: scale(0.6); }
            70%  { transform: scale(1.05); }
            100% { opacity: 1; transform: scale(1); }
        }
        @keyframes cashier-deal {
            from { opacity: 0; transform: translateX(-12px) scale(0.97); }
            to   { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes cashier-bar-fill {
            from { transform: scaleX(0); }
            to   { transform: scaleX(1); }
        }
        @keyframes cashier-number-count {
            from { opacity: 0; transform: translateY(8px); }
            to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes cashier-new-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
    `;
    document.head.appendChild(style);
}

// ── Order List Row ──────────────────────────────────────────────────────────
/** Check if an order was confirmed recently (within minutes) and hasn't been paid yet */
function isNewUnprocessed(item: CashierOrderListItem, withinMinutes = 10): boolean {
    if (item.checkout_status !== "confirmed") return false;
    if (item.paid > 0) return false;
    if (!item.order_date) return false;
    const orderTime = new Date(item.order_date).getTime();
    const cutoff = Date.now() - withinMinutes * 60 * 1000;
    return orderTime >= cutoff;
}

function OrderRow({ item, onSelect }: { item: CashierOrderListItem; onSelect: (id: string) => void }) {
    const remaining = item.order_total - item.paid;
    const isPaid = remaining <= 0;
    const isCancelled = item.checkout_status === "cancelled";
    const hasReady = item.garment_ready > 0;
    const isNew = isNewUnprocessed(item);

    const rowBg = isNew
        ? "bg-violet-50 border-violet-400 hover:bg-violet-100 hover:shadow-sm"
        : isCancelled
            ? "bg-red-50 border-red-300 hover:bg-red-100"
            : isPaid
                ? "bg-emerald-50 border-emerald-300 hover:bg-emerald-100"
                : "bg-amber-50 border-amber-300 hover:bg-amber-100 hover:shadow-sm";

    const phaseColors: Record<string, string> = {
        new: "bg-sky-100 text-sky-700",
        in_progress: "bg-amber-100 text-amber-700",
        completed: "bg-primary/15 text-primary",
    };

    const orderDateStr = item.order_date ? shortDateFmt.format(new Date(item.order_date)) : "-";
    const deliveryDateStr = item.delivery_date ? shortDateFmt.format(new Date(item.delivery_date)) : null;

    return (
        <button
            type="button"
            onClick={() => onSelect(String(item.id))}
            className={`w-full text-left px-3.5 py-3 rounded-lg border transition-all duration-150 cursor-pointer pointer-coarse:active:scale-[0.99] ${rowBg}`}
        >
            <div className="flex items-center gap-3">
                <div className="relative shrink-0">
                    <div className={`w-1.5 h-10 rounded-full ${isNew ? "bg-violet-500" : isPaid ? "bg-emerald-500" : isCancelled ? "bg-red-400" : "bg-amber-400"}`} />
                    {isNew && (
                        <span
                            className="absolute -top-1 -left-1 w-3.5 h-3.5 rounded-full bg-violet-500 border-2 border-violet-50"
                            style={{ animation: "cashier-new-pulse 1.5s ease-in-out infinite" }}
                        />
                    )}
                </div>
                <div className="w-16 shrink-0">
                    <span className="font-bold text-sm tabular-nums">#{item.id}</span>
                    {item.invoice_number && <p className="text-xs text-muted-foreground tabular-nums leading-tight">INV {item.invoice_number}</p>}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="font-semibold text-base truncate leading-tight">{item.customer_name || "Unknown"}</p>
                    <p className="text-sm text-muted-foreground leading-tight">{item.customer_phone || "-"}</p>
                </div>
                <div className="text-right shrink-0">
                    <p className="font-bold text-sm tabular-nums leading-tight">{fmtK(item.order_total)}</p>
                    <p className={`text-sm font-semibold tabular-nums leading-tight ${isPaid ? "text-emerald-600" : "text-red-600"}`}>
                        {isPaid ? "Paid" : `-${fmtK(remaining)}`}
                    </p>
                </div>
            </div>
            <div className="flex items-center gap-2 mt-2 ml-[28px]">
                {isNew && (
                    <span className="text-[10px] font-bold tracking-wide uppercase px-1.5 py-0.5 rounded bg-violet-500 text-white shrink-0">
                        New
                    </span>
                )}
                {item.order_phase && (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded shrink-0 ${phaseColors[item.order_phase] || "bg-muted text-muted-foreground"}`}>
                        {ORDER_PHASE_LABELS[item.order_phase as keyof typeof ORDER_PHASE_LABELS] || item.order_phase}
                    </span>
                )}
                {item.order_type && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                        {item.order_type === "WORK" ? "Work" : "Sales"}
                    </span>
                )}
                {hasReady && item.garment_total > 0 && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-primary text-primary-foreground shrink-0">
                        {item.garment_ready}/{item.garment_total} ready
                    </span>
                )}
                {item.home_delivery && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded bg-blue-100 text-blue-700 shrink-0">
                        Delivery
                    </span>
                )}
                <div className="flex-1" />
                <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                    <span className="tabular-nums">{orderDateStr}</span>
                    {deliveryDateStr && (
                        <span className="tabular-nums font-semibold text-foreground">
                            Due {deliveryDateStr}
                        </span>
                    )}
                </div>
            </div>
        </button>
    );
}

// ── Reports Panel ───────────────────────────────────────────────────────────
const UNPAID_PAGE_SIZE = 8;

export type DashboardFilter = "all" | "today" | "unpaid" | "paid" | "work" | "sales";

function ReportsPanel({ summary, unpaidOrders, onSelectOrder }: {
    summary: CashierSummary;
    unpaidOrders: CashierOrderListItem[];
    onSelectOrder: (id: string) => void;
}) {
    const [unpaidVisible, setUnpaidVisible] = useState(UNPAID_PAGE_SIZE);
    const now = new Date();
    const monthName = now.toLocaleDateString("en-GB", { timeZone: TIMEZONE, month: "long" });

    const todayCount = Number(summary.today_count);
    const todayBilled = Number(summary.today_billed);
    const todayPaid = Number(summary.today_paid);
    const todayDue = Math.max(0, todayBilled - todayPaid);
    const todayCollectionRate = todayBilled > 0 ? Math.round((todayPaid / todayBilled) * 100) : 0;

    const monthTotal = Number(summary.month_billed);
    const monthPaid = Number(summary.month_paid);
    const monthOutstanding = Number(summary.month_outstanding);
    const monthCollectionRate = monthTotal > 0 ? Math.round((monthPaid / monthTotal) * 100) : 0;

    const totalUnpaidAmount = Number(summary.all_outstanding);
    const unpaidCount = Number(summary.unpaid_count);

    return (
        <div className="space-y-2">
            <Card className="p-2.5">
                <h3 className="font-bold text-sm mb-2.5 flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-muted-foreground" /> Today
                </h3>
                {todayCount > 0 ? (
                    <div className="flex items-center gap-3">
                        <DonutChart
                            size={90}
                            strokeWidth={11}
                            hideLegend
                            center={{ value: `${todayCollectionRate}%`, label: "collected" }}
                            segments={[
                                { value: todayPaid, color: "#047857", label: "Collected", amount: fmtK(todayPaid) },
                                { value: todayDue, color: "#ea580c", label: "Due", amount: fmtK(todayDue) },
                            ]}
                        />
                        <div className="flex-1 text-xs tabular-nums space-y-1">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Orders</span>
                                <span className="font-semibold">{todayCount}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />Collected</span>
                                <span className="font-semibold">{fmtK(todayPaid)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-orange-500" />Due</span>
                                <span className="font-semibold text-orange-600">{fmtK(todayDue)}</span>
                            </div>
                            <div className="border-t border-border pt-1 flex justify-between font-bold">
                                <span>Billed</span>
                                <span>{fmtK(todayBilled)}</span>
                            </div>
                        </div>
                    </div>
                ) : (
                    <p className="text-xs text-muted-foreground text-center py-3">No orders today yet</p>
                )}
            </Card>

            <Card className="p-2.5">
                <h3 className="font-bold text-sm mb-2.5 flex items-center gap-1.5">
                    <CreditCard className="h-4 w-4 text-muted-foreground" /> {monthName}
                </h3>
                {monthTotal > 0 ? (
                    <div className="flex items-center gap-3">
                        <DonutChart
                            size={90}
                            strokeWidth={11}
                            hideLegend
                            center={{ value: `${monthCollectionRate}%`, label: "collected" }}
                            segments={[
                                { value: monthPaid, color: "#047857", label: "Collected", amount: fmtK(monthPaid) },
                                { value: monthOutstanding, color: "#ea580c", label: "Remaining", amount: fmtK(monthOutstanding) },
                            ]}
                        />
                        <div className="flex-1 text-xs tabular-nums space-y-1">
                            <div className="flex justify-between">
                                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />Collected</span>
                                <span className="font-semibold">{fmtK(monthPaid)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-orange-500" />Remaining</span>
                                <span className="font-semibold text-orange-600">{fmtK(monthOutstanding)}</span>
                            </div>
                            <div className="border-t border-border pt-1 flex justify-between font-bold">
                                <span>Billed</span>
                                <span>{fmtK(monthTotal)}</span>
                            </div>
                        </div>
                    </div>
                ) : (
                    <p className="text-xs text-muted-foreground text-center py-3">No orders this month</p>
                )}
            </Card>

            <Card className={`p-2.5 ${unpaidOrders.length > 0 ? "border-red-200 bg-red-50/30" : ""}`}>
                <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-sm text-red-700 flex items-center gap-1.5">
                        <CreditCard className="h-4 w-4" /> Outstanding ({unpaidCount || unpaidOrders.length})
                    </h3>
                    {totalUnpaidAmount > 0 && (
                        <span className="font-bold text-sm text-red-600 tabular-nums">{fmtK(totalUnpaidAmount)}</span>
                    )}
                </div>
                {unpaidOrders.length === 0 ? (
                    <div className="text-center py-4">
                        <CheckCircle2 className="h-6 w-6 mx-auto mb-1 text-emerald-500" />
                        <p className="text-xs text-emerald-600 font-medium">All orders are fully paid</p>
                    </div>
                ) : (
                    <>
                        <div className="space-y-1">
                            {unpaidOrders.slice(0, unpaidVisible).map((o, i) => {
                                const due = o.order_total - o.paid;
                                const paidPct = o.order_total > 0 ? Math.round((o.paid / o.order_total) * 100) : 0;
                                return (
                                    <button key={o.id} type="button" onClick={() => onSelectOrder(String(o.id))}
                                        className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-red-100/80 transition-all duration-150 cursor-pointer pointer-coarse:active:scale-[0.99] border border-transparent hover:border-red-200"
                                        style={i < 8 ? { animation: `cashier-deal 300ms cubic-bezier(0.2, 0, 0, 1) ${i * 40}ms both` } : undefined}>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className="font-bold text-xs tabular-nums text-red-800">#{o.id}</span>
                                                <span className="text-xs truncate">{o.customer_name || "—"}</span>
                                            </div>
                                            <span className="font-bold text-xs text-red-600 tabular-nums shrink-0">{fmtK(due)}</span>
                                        </div>
                                        <div className="flex items-center gap-2 mt-1.5">
                                            <div className="flex-1 h-2 rounded-full bg-red-200/60 overflow-hidden">
                                                <div className="h-full rounded-full bg-emerald-500 origin-left" style={{ width: `${paidPct}%`, animation: "cashier-bar-fill 600ms cubic-bezier(0.2, 0, 0, 1) 200ms both" }} />
                                            </div>
                                            <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 font-medium">
                                                {fmt(o.paid)} / {fmt(o.order_total)}
                                            </span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                        {unpaidOrders.length > unpaidVisible && (
                            <Button variant="ghost" size="sm" className="w-full text-xs text-red-600 mt-1.5 hover:bg-red-100"
                                onClick={() => setUnpaidVisible(v => v + UNPAID_PAGE_SIZE)}>
                                Show more ({unpaidOrders.length - unpaidVisible} remaining)
                            </Button>
                        )}
                    </>
                )}
            </Card>
        </div>
    );
}

// ── Delivery & Address ──────────────────────────────────────────────────────
/**
 * Input is fully controlled by the parent so the parent can flush a pending
 * (unsaved) charge edit before submitting a payment.
 */
function DeliveryAndAddress({
    order, isHomeDelivery, isOrderCompleted, onOptimisticToggle,
    chargeInput, setChargeInput,
}: {
    order: any;
    isHomeDelivery: boolean;
    isOrderCompleted: boolean;
    onOptimisticToggle: (value: boolean) => void;
    chargeInput: string;
    setChargeInput: (v: string) => void;
}) {
    const queryClient = useQueryClient();
    const c = order.customer;
    const [city, setCity] = useState(c?.city || "");
    const [area, setArea] = useState(c?.area || "");
    const [block, setBlock] = useState(c?.block || "");
    const [street, setStreet] = useState(c?.street || "");
    const [houseNo, setHouseNo] = useState(c?.house_no || "");
    const [note, setNote] = useState(c?.address_note || "");

    useEffect(() => {
        setCity(c?.city || "");
        setArea(c?.area || "");
        setBlock(c?.block || "");
        setStreet(c?.street || "");
        setHouseNo(c?.house_no || "");
        setNote(c?.address_note || "");
    }, [c?.city, c?.area, c?.block, c?.street, c?.house_no, c?.address_note]);

    const isDirty = city !== (c?.city || "") || area !== (c?.area || "") ||
        block !== (c?.block || "") || street !== (c?.street || "") ||
        houseNo !== (c?.house_no || "") || note !== (c?.address_note || "");

    const saveMutation = useMutation({
        mutationFn: () => updateCustomer(c?.id, {
            city: city || null, area: area || null, block: block || null,
            street: street || null, house_no: houseNo || null, address_note: note || null,
        } as any),
        onSuccess: (res) => {
            if (res.status === "error") { toast.error(`Failed to save address: ${res.message}`); return; }
            queryClient.invalidateQueries({ queryKey: ["cashier-order"] });
        },
        onError: (err) => toast.error(`Error saving address: ${err.message}`),
    });

    return (
        <Card className="p-3">
            <h3 className="font-semibold flex items-center gap-2 text-sm"><Truck className="h-4 w-4" />Delivery</h3>
            {!isOrderCompleted ? (
                <div className="relative flex rounded-lg bg-muted p-1">
                    <div
                        className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-md bg-primary shadow-sm transition-transform duration-250 ease-out"
                        style={{ transform: isHomeDelivery ? "translateX(calc(100% + 8px))" : "translateX(0)" }}
                    />
                    {([
                        { value: false, label: "Pick Up", img: PickUpIcon },
                        { value: true, label: "Home Delivery", img: HomeDeliveryIcon },
                    ] as const).map((option) => {
                        const isActive = isHomeDelivery === option.value;
                        return (
                            <button key={option.label} type="button"
                                onClick={() => { if (!isActive) onOptimisticToggle(option.value); }}
                                className="relative z-10 flex-1 flex items-center justify-center gap-2 rounded-md py-2 cursor-pointer select-none touch-manipulation pointer-coarse:active:scale-[0.97] transition-all duration-150">
                                <img src={option.img} alt={option.label} className={`h-7 object-contain transition-all duration-200 ${isActive ? "brightness-0 invert" : ""}`} />
                                <span className={`text-sm font-semibold transition-colors duration-200 ${isActive ? "text-primary-foreground" : "text-muted-foreground"}`}>{option.label}</span>
                            </button>
                        );
                    })}
                </div>
            ) : (
                <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-muted/50 border border-border">
                    <img src={isHomeDelivery ? HomeDeliveryIcon : PickUpIcon} alt="" className="h-7 object-contain" />
                    <span className="font-semibold text-sm">{isHomeDelivery ? "Home Delivery" : "Pick Up"}</span>
                </div>
            )}
            {isHomeDelivery && (
                <div className="flex items-center gap-2 mt-2">
                    <Label className="text-xs font-medium text-blue-800/70 shrink-0">Charge (KWD)</Label>
                    <Input
                        type="number"
                        step="0.001"
                        min="0"
                        value={chargeInput}
                        onChange={(e) => setChargeInput(e.target.value)}
                        disabled={isOrderCompleted}
                        className="h-8 w-28 text-sm text-right tabular-nums"
                    />
                    <span className="text-[11px] text-muted-foreground">Saved on payment</span>
                </div>
            )}

            <div
                className="grid transition-[grid-template-rows,opacity] duration-300 ease-out"
                style={{
                    gridTemplateRows: isHomeDelivery ? "1fr" : "0fr",
                    opacity: isHomeDelivery ? 1 : 0,
                }}
            >
                <div className="overflow-hidden">
                    <div className="mt-3 rounded-lg bg-blue-50/60 border border-blue-200/60 p-3 space-y-2.5">
                        <div className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-blue-600" />
                            <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Delivery Address</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                                <Label className="text-xs font-medium text-blue-800/70">City</Label>
                                <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className="h-8 text-sm border-blue-200 bg-white focus-visible:border-blue-400 focus-visible:ring-blue-400/30" />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs font-medium text-blue-800/70">Area</Label>
                                <Input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Area" className="h-8 text-sm border-blue-200 bg-white focus-visible:border-blue-400 focus-visible:ring-blue-400/30" />
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-1">
                                <Label className="text-xs font-medium text-blue-800/70">Block</Label>
                                <Input value={block} onChange={(e) => setBlock(e.target.value)} placeholder="Block" className="h-8 text-sm border-blue-200 bg-white focus-visible:border-blue-400 focus-visible:ring-blue-400/30" />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs font-medium text-blue-800/70">Street</Label>
                                <Input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Street" className="h-8 text-sm border-blue-200 bg-white focus-visible:border-blue-400 focus-visible:ring-blue-400/30" />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs font-medium text-blue-800/70">House No.</Label>
                                <Input value={houseNo} onChange={(e) => setHouseNo(e.target.value)} placeholder="House" className="h-8 text-sm border-blue-200 bg-white focus-visible:border-blue-400 focus-visible:ring-blue-400/30" />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs font-medium text-blue-800/70">Note</Label>
                            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Delivery instructions..." rows={2} className="text-sm resize-none min-h-0 border-blue-200 bg-white focus-visible:border-blue-400 focus-visible:ring-blue-400/30" />
                        </div>
                        {isDirty && (
                            <Button size="sm" className="w-full h-8 text-xs bg-blue-600 hover:bg-blue-700" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                                {saveMutation.isPending ? <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Saving...</> : "Save Address"}
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </Card>
    );
}

// ── List View ───────────────────────────────────────────────────────────────
function CashierListView({ onSelectOrder }: { onSelectOrder: (id: string) => void }) {
    const [listSearchInput, setListSearchInput] = useState("");
    const [listSearchQuery, setListSearchQuery] = useState("");
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const [dashboardFilter, setDashboardFilter] = useState<DashboardFilter>("all");

    const { data: recentResult, isLoading: isLoadingRecent, isFetching: isFetchingRecent } = useRecentCashierOrders(dashboardFilter);
    const recentOrders = recentResult?.data || [];
    const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
    useEffect(() => { if (recentResult) setHasLoadedOnce(true); }, [recentResult]);
    const isInitialLoad = !hasLoadedOnce && isLoadingRecent;

    const { data: summaryResult } = useCashierSummary();
    const summary: CashierSummary = summaryResult?.data || {
        all_billed: 0, all_collected: 0, all_outstanding: 0, today_count: 0, today_billed: 0, today_paid: 0,
        today_collected: 0, today_refunded: 0, month_billed: 0, month_paid: 0, month_outstanding: 0,
        month_collected: 0, month_refunded: 0, work_count: 0, sales_count: 0, unpaid_count: 0,
        work_billed: 0, sales_billed: 0, month_work_billed: 0, month_sales_billed: 0,
    };

    const { data: listSearchResult, isFetching: isListSearching } = useCashierOrderListSearch(listSearchQuery);
    const searchedOrders = listSearchResult?.data || [];

    const { data: unpaidResult } = useRecentCashierOrders("unpaid");
    const allUnpaidOrders = (unpaidResult?.data || []).filter(o => (o.order_total - o.paid) > 0.001);

    const allDisplayOrders = listSearchQuery ? searchedOrders : recentOrders;
    const displayOrders = allDisplayOrders.slice(0, visibleCount);
    const hasMore = allDisplayOrders.length > visibleCount;

    useEffect(() => {
        const val = listSearchInput.trim();
        if (!val) { setListSearchQuery(""); return; }
        const timer = setTimeout(() => setListSearchQuery(val), 400);
        return () => clearTimeout(timer);
    }, [listSearchInput]);

    useEffect(() => { setVisibleCount(PAGE_SIZE); }, [listSearchQuery]);

    if (isInitialLoad) {
        return (
            <div className="h-full flex flex-col">
                <div className="flex-1 p-3">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5 md:h-full">
                        <div className="md:col-span-3 space-y-2">
                            <Skeleton className="h-9 w-full" />
                            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
                        </div>
                        <div className="md:col-span-2 space-y-2">
                            <Skeleton className="h-52 rounded-lg" />
                            <Skeleton className="h-32 rounded-lg" />
                            <Skeleton className="h-24 rounded-lg" />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            <div className="flex-1 overflow-y-auto p-3 will-change-scroll [transform:translateZ(0)]">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5 md:h-full">
                    <div className="md:col-span-3 flex flex-col min-h-0">
                        <div className="relative mb-2 shrink-0">
                            {isListSearching ? (
                                <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary animate-spin" />
                            ) : (
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            )}
                            <Input placeholder="Search by name, phone, or order ID..." value={listSearchInput}
                                onChange={(e) => setListSearchInput(e.target.value)} className="pl-10 h-11 text-sm font-medium border-2 border-border rounded-xl shadow-sm focus-visible:border-primary focus-visible:shadow-md transition-shadow" />
                            {listSearchInput && (
                                <button type="button" onClick={() => setListSearchInput("")}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                                    <XCircle className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-1.5 mb-2 shrink-0">
                            {([
                                { key: "all" as const, label: "All" },
                                { key: "today" as const, label: `Today (${Number(summary.today_count)})` },
                                { key: "unpaid" as const, label: `Unpaid (${Number(summary.unpaid_count)})` },
                                { key: "paid" as const, label: "Paid" },
                                { key: "work" as const, label: `Work (${Number(summary.work_count)})` },
                                { key: "sales" as const, label: `Sales (${Number(summary.sales_count)})` },
                            ] as const).map((f) => (
                                <ChipToggle
                                    key={f.key}
                                    active={dashboardFilter === f.key}
                                    onClick={() => setDashboardFilter(dashboardFilter === f.key ? "all" : f.key)}>
                                    {f.label}
                                </ChipToggle>
                            ))}
                        </div>
                        <div className="flex items-center justify-between px-1 mb-1 shrink-0">
                            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                                {isListSearching ? (
                                    <>Searching...</>
                                ) : listSearchQuery ? (
                                    <>{allDisplayOrders.length} result{allDisplayOrders.length !== 1 ? "s" : ""}</>
                                ) : dashboardFilter !== "all" ? (
                                    <>
                                        {{ today: "Today", paid: "Paid", unpaid: "Unpaid", work: "Work Orders", sales: "Sales Orders" }[dashboardFilter] || dashboardFilter} ({allDisplayOrders.length})
                                        <button type="button" onClick={() => setDashboardFilter("all")} className="ml-1 text-primary hover:underline">clear</button>
                                    </>
                                ) : (
                                    <><Clock className="h-3 w-3" /> Recent ({recentOrders.length})</>
                                )}
                            </p>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Paid</span>
                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Due</span>
                            </div>
                        </div>
                        <div className="max-h-[50vh] md:max-h-none flex-1 overflow-y-auto space-y-1 min-h-0 pr-3 md:pr-2 scrollbar-thin will-change-scroll [transform:translateZ(0)]">
                            {isListSearching && (
                                <div className="space-y-1">
                                    {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11 rounded-md" />)}
                                </div>
                            )}

                            {isFetchingRecent && !isLoadingRecent && !isListSearching && (
                                <div className="flex items-center justify-center py-2">
                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                </div>
                            )}

                            {!isListSearching && displayOrders.map((item, i) => (
                                <div key={item.id} style={i < 10 ? { animation: `cashier-deal 300ms cubic-bezier(0.2, 0, 0, 1) ${i * 30}ms both` } : undefined}>
                                    <OrderRow item={item} onSelect={onSelectOrder} />
                                </div>
                            ))}

                            {!isListSearching && hasMore && (
                                <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground mt-1"
                                    onClick={() => setVisibleCount(v => v + PAGE_SIZE)}>
                                    Show more ({allDisplayOrders.length - visibleCount} remaining)
                                </Button>
                            )}

                            {!isFetchingRecent && !isListSearching && displayOrders.length === 0 && (
                                <div className="text-center py-8 text-muted-foreground">
                                    <CreditCard className="h-8 w-8 mx-auto mb-1.5 opacity-20" />
                                    <p className="text-xs">{listSearchQuery ? "No orders match your search" : "No recent orders"}</p>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="md:col-span-2 pr-1 overflow-visible">
                        <ReportsPanel summary={summary} unpaidOrders={allUnpaidOrders} onSelectOrder={onSelectOrder} />
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Order Detail View ───────────────────────────────────────────────────────
function CashierOrderDetailView({ orderId, onBack }: { orderId: string; onBack: () => void }) {
    const { data: searchResult, isFetching: isOrderLoading } = useCashierOrderSearch(orderId);
    const order = searchResult?.status === "success" ? searchResult.data : null;

    const { data: txResult } = usePaymentTransactions(order?.id);
    const txData = txResult?.status === "success" ? txResult.data : [];
    const transactions = Array.isArray(txData) ? txData : [];

    const serverOrderTotal = Number(order?.order_total) || 0;
    const totalPaid = Number(order?.paid) || 0;
    const discountValue = Number(order?.discount_value) || 0;

    const totalPayments = useMemo(() => transactions.filter((tx: any) => tx.transaction_type === "payment")
        .reduce((sum: number, tx: any) => sum + Math.abs(Number(tx.amount) || 0), 0), [transactions]);
    const totalRefunds = useMemo(() => transactions.filter((tx: any) => tx.transaction_type === "refund")
        .reduce((sum: number, tx: any) => sum + Math.abs(Number(tx.amount) || 0), 0), [transactions]);

    const toggleDeliveryMutation = useToggleHomeDeliveryMutation();
    const updateChargeMutation = useUpdateDeliveryChargeMutation();
    const { getPrice } = usePricing();
    const collectGarmentsMutation = useCollectGarmentsMutation();

    const isCancelled = order?.checkout_status === "cancelled";
    const isOrderCompleted = order?.order_phase === "completed";
    const cancelledWithPayments = isCancelled && totalPaid > 0;
    const serverHomeDelivery = !!(order as any)?.home_delivery;
    const serverDeliveryCharge = Number((order as any)?.delivery_charge) || 0;
    const deliveryPrice = getPrice('HOME_DELIVERY') || 0;

    const [optimisticDelivery, setOptimisticDelivery] = useState<boolean | null>(null);
    const [optimisticChargeOverride, setOptimisticChargeOverride] = useState<number | null>(null);
    const isHomeDelivery = optimisticDelivery ?? serverHomeDelivery;

    // Delivery charge input — controlled, initialised from server. No default fallback
    // so the displayed value always matches what's persisted.
    const [chargeInput, setChargeInput] = useState<string>(() => serverDeliveryCharge.toString());
    const chargeInputRef = useRef(chargeInput);
    chargeInputRef.current = chargeInput;

    // Reset on order switch.
    const prevServerChargeRef = useRef(serverDeliveryCharge);
    useEffect(() => {
        setChargeInput(serverDeliveryCharge.toString());
        prevServerChargeRef.current = serverDeliveryCharge;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orderId]);

    // Sync input to new server value ONLY when user hasn't edited away from the
    // previous server value (i.e., the input still matches what the server had).
    // This covers async initial load and post-save refetch without wiping edits.
    useEffect(() => {
        const prev = prevServerChargeRef.current;
        if (Math.abs(prev - serverDeliveryCharge) < 0.0005) return;
        const current = chargeInputRef.current === "" ? 0 : Number(chargeInputRef.current);
        if (!isNaN(current) && Math.abs(current - prev) < 0.0005) {
            setChargeInput(serverDeliveryCharge.toString());
        }
        prevServerChargeRef.current = serverDeliveryCharge;
    }, [serverDeliveryCharge]);

    // When toggling home delivery ON, prefill charge with default if input is empty/zero
    const prevOptimisticDelivery = useRef(optimisticDelivery);
    useEffect(() => {
        if (optimisticDelivery === true && prevOptimisticDelivery.current !== true) {
            const current = Number(chargeInputRef.current);
            if (!chargeInputRef.current || isNaN(current) || current === 0) {
                setChargeInput(deliveryPrice.toString());
            }
        }
        prevOptimisticDelivery.current = optimisticDelivery;
    }, [optimisticDelivery, deliveryPrice]);

    const parsedChargeInput = chargeInput === "" ? 0 : Number(chargeInput);
    const hasValidChargeInput = !isNaN(parsedChargeInput) && parsedChargeInput >= 0;
    const isChargeDirty = isHomeDelivery && hasValidChargeInput && Math.abs(parsedChargeInput - serverDeliveryCharge) > 0.0005;

    // Effective (optimistic) delivery charge. Priority: typed input > explicit override > toggle default > server.
    const optimisticDeliveryCharge = !isHomeDelivery
        ? 0
        : isChargeDirty
            ? parsedChargeInput
            : optimisticChargeOverride !== null
                ? optimisticChargeOverride
                : optimisticDelivery === true
                    ? deliveryPrice
                    : serverDeliveryCharge;

    const orderTotal = (optimisticDelivery !== null || optimisticChargeOverride !== null || isChargeDirty)
        ? parseFloat((serverOrderTotal - serverDeliveryCharge + optimisticDeliveryCharge).toFixed(3))
        : serverOrderTotal;
    const remainingBalance = orderTotal - totalPaid;
    const isFullyPaid = remainingBalance <= 0;

    const effectiveOrder = (optimisticDelivery !== null || optimisticChargeOverride !== null || isChargeDirty) && order
        ? { ...(order as any), order_total: orderTotal, delivery_charge: optimisticDeliveryCharge }
        : order;

    // Sync optimistic toggle back once server catches up
    useEffect(() => {
        if (optimisticDelivery !== null && optimisticDelivery === serverHomeDelivery) {
            const t = setTimeout(() => setOptimisticDelivery(null), 350);
            return () => clearTimeout(t);
        }
    }, [serverHomeDelivery, optimisticDelivery]);

    useEffect(() => {
        if (optimisticChargeOverride !== null && Math.abs(optimisticChargeOverride - serverDeliveryCharge) < 0.0005) {
            const t = setTimeout(() => setOptimisticChargeOverride(null), 350);
            return () => clearTimeout(t);
        }
    }, [serverDeliveryCharge, optimisticChargeOverride]);

    // Flush any pending delivery edits (toggle OR charge input) before recording a payment.
    // Without this, payment would process against the stale server total.
    const saveDeliveryPendingIfAny = async () => {
        if (!order) return;
        if (optimisticDelivery !== null) {
            const result = await toggleDeliveryMutation.mutateAsync({ orderId: order.id, homeDelivery: optimisticDelivery });
            if (result.status === "error") throw new Error(result.message);
        }
        const pending = chargeInputRef.current === "" ? 0 : Number(chargeInputRef.current);
        if (isHomeDelivery && !isNaN(pending) && pending >= 0 && Math.abs(pending - serverDeliveryCharge) > 0.0005) {
            setOptimisticChargeOverride(pending);
            const result = await updateChargeMutation.mutateAsync({ orderId: order.id, deliveryCharge: pending });
            if (result.status === "error") {
                setOptimisticChargeOverride(null);
                throw new Error(result.message);
            }
        }
    };

    const [collectGarmentIds, setCollectGarmentIds] = useState<Set<string>>(new Set());
    const [garmentFulfillmentModes, setGarmentFulfillmentModes] = useState<Map<string, "collected" | "delivered">>(new Map());
    const [isRefundMode, setIsRefundMode] = useState(false);
    const [refundItems, setRefundItems] = useState<import("@/api/cashier").RefundItem[]>([]);
    const [refundTotal, setRefundTotal] = useState(0);

    // Reset per-order UI state when navigating between orders
    useEffect(() => {
        setOptimisticDelivery(null);
        setOptimisticChargeOverride(null);
        setCollectGarmentIds(new Set());
        setGarmentFulfillmentModes(new Map());
        setIsRefundMode(false);
        setRefundItems([]);
        setRefundTotal(0);
    }, [orderId]);

    const handleRefundModeChange = (val: boolean) => {
        setIsRefundMode(val);
        if (!val) {
            setRefundItems([]);
            setRefundTotal(0);
        }
    };

    const garments = Array.isArray(order?.garments) ? order.garments : [];
    const shelfItems = Array.isArray(order?.shelf_items) ? order.shelf_items : [];
    const hasGarments = garments.length > 0;
    const hasShelfItems = shelfItems.length > 0;

    const eligibleGarments = garments.filter((g: any) =>
        g.location === "shop" && ["ready_for_pickup", "brova_trialed", "awaiting_trial"].includes(g.piece_stage)
    );

    const toggleCollectGarment = (id: string) => {
        const isCurrentlySelected = collectGarmentIds.has(id);
        setCollectGarmentIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
        if (isCurrentlySelected) {
            setGarmentFulfillmentModes((prev) => { const m = new Map(prev); m.delete(id); return m; });
        } else {
            const defaultMode: "collected" | "delivered" = isHomeDelivery ? "delivered" : "collected";
            setGarmentFulfillmentModes((prev) => new Map(prev).set(id, defaultMode));
        }
    };

    const toggleAllCollectGarments = () => {
        if (collectGarmentIds.size === eligibleGarments.length) {
            setCollectGarmentIds(new Set());
            setGarmentFulfillmentModes(new Map());
        } else {
            const defaultMode: "collected" | "delivered" = isHomeDelivery ? "delivered" : "collected";
            setCollectGarmentIds(new Set(eligibleGarments.map((g: any) => g.id)));
            setGarmentFulfillmentModes(new Map(
                eligibleGarments.map((g: any) => [g.id, defaultMode] as [string, "collected" | "delivered"])
            ));
        }
    };

    const handleFulfillmentModeChange = (id: string, mode: "collected" | "delivered") => {
        setGarmentFulfillmentModes((prev) => new Map(prev).set(id, mode));
    };

    const collectActionLabel = useMemo(() => {
        if (collectGarmentIds.size === 0) return "Collect";
        const modes = Array.from(collectGarmentIds).map(id => garmentFulfillmentModes.get(id));
        if (modes.every(m => m === "delivered")) return "Deliver";
        if (modes.some(m => m === "delivered")) return "Dispatch";
        return "Collect";
    }, [collectGarmentIds, garmentFulfillmentModes]);

    const allGarmentsCompleted = useMemo(() => {
        if (garments.length === 0) return true;
        return garments.every((g: any) => g.piece_stage === "completed");
    }, [garments]);

    const advance = useMemo(() => {
        if (!order) return 0;
        const stitching = Number((order as any)?.stitching_charge) || 0;
        const fabric = Number((order as any)?.fabric_charge) || 0;
        const style = Number((order as any)?.style_charge) || 0;
        const express = Number((order as any)?.express_charge) || 0;
        const soaking = Number((order as any)?.soaking_charge) || 0;
        const shelf = Number((order as any)?.shelf_charge) || 0;
        return parseFloat(((stitching * 0.5) + fabric + style + optimisticDeliveryCharge + express + soaking + shelf).toFixed(3));
    }, [order, optimisticDeliveryCharge]);

    // ── Loading ─────────────────────────────────────────────────────────────
    if (isOrderLoading && !order) {
        return (
            <div className="h-full flex flex-col">
                <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30 shrink-0">
                    <Button variant="ghost" size="sm" onClick={onBack}>
                        <ArrowLeft className="h-4 w-4 mr-1" /> Orders
                    </Button>
                    <div className="flex-1" />
                    <Skeleton className="h-4 w-12 rounded" />
                </div>
                <div className="flex-1 p-4 max-w-[1400px] mx-auto w-full">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5">
                        <div className="md:col-span-3 space-y-2">
                            <Card className="p-3 space-y-3">
                                <div className="flex items-center gap-2.5">
                                    <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                                    <div className="flex-1 space-y-1.5">
                                        <Skeleton className="h-4 w-36 rounded" />
                                        <Skeleton className="h-3 w-28 rounded" />
                                    </div>
                                    <Skeleton className="h-5 w-16 rounded shrink-0" />
                                </div>
                                <Separator />
                                <div className="grid grid-cols-4 gap-3">
                                    {Array.from({ length: 4 }).map((_, i) => (
                                        <div key={i} className="space-y-1">
                                            <Skeleton className="h-2.5 w-10 rounded" />
                                            <Skeleton className="h-4 w-14 rounded" />
                                        </div>
                                    ))}
                                </div>
                            </Card>
                            <Card className="p-3 space-y-2.5">
                                <Skeleton className="h-4 w-24 rounded" />
                                <div className="grid grid-cols-2 gap-3">
                                    <Skeleton className="h-16 rounded-lg" />
                                    <Skeleton className="h-16 rounded-lg" />
                                </div>
                            </Card>
                            <Card className="p-4 space-y-3">
                                <Skeleton className="h-4 w-28 rounded" />
                                <Skeleton className="h-12 rounded-lg" />
                                <Skeleton className="h-12 rounded-lg" />
                            </Card>
                        </div>
                        <div className="md:col-span-2 space-y-2.5">
                            <Card className="p-3 space-y-2">
                                <Skeleton className="h-4 w-32 rounded" />
                                <Skeleton className="h-3 w-full rounded" />
                                <Skeleton className="h-3 w-full rounded" />
                                <Skeleton className="h-3 w-3/4 rounded" />
                                <Skeleton className="h-5 w-full rounded mt-1" />
                            </Card>
                            <Card className="p-3 space-y-2">
                                <Skeleton className="h-4 w-20 rounded" />
                                <Skeleton className="h-8 w-full rounded" />
                            </Card>
                            <Card className="p-3 space-y-2">
                                <Skeleton className="h-4 w-28 rounded" />
                                <Skeleton className="h-9 w-full rounded" />
                                <Skeleton className="h-9 w-full rounded" />
                                <Skeleton className="h-10 w-full rounded" />
                            </Card>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ── Error / Not found ───────────────────────────────────────────────────
    if (!order) {
        const errorMessage = searchResult?.status === "error" ? searchResult.message : "Order not found";
        return (
            <div className="p-4">
                <Alert variant="destructive" className="py-2 mb-4"><XCircle className="h-4 w-4" />
                    <AlertDescription>
                        {errorMessage}
                        <Button variant="link" size="sm" className="ml-2 h-auto p-0" onClick={onBack}>Back to list</Button>
                    </AlertDescription>
                </Alert>
            </div>
        );
    }

    // ── Detail render ───────────────────────────────────────────────────────
    return (
        <div className="h-full flex flex-col" style={{ animation: "cashier-focus-in 250ms cubic-bezier(0.2, 0, 0, 1) both" }}>
            <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30 shrink-0">
                <Button variant="ghost" size="sm" onClick={onBack}>
                    <ArrowLeft className="h-4 w-4 mr-1" /> Orders
                </Button>
                <div className="flex-1" />
                <span className="text-sm font-bold tabular-nums text-muted-foreground">#{order.id}</span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 max-w-[1400px] mx-auto w-full will-change-scroll [transform:translateZ(0)]">
                {isCancelled && (
                    <Alert variant="destructive" className="mb-4"><XCircle className="h-4 w-4" />
                        <AlertDescription>This order has been <strong>cancelled</strong>.</AlertDescription></Alert>
                )}
                {isOrderCompleted && allGarmentsCompleted && isFullyPaid && !isCancelled && (
                    <Alert className="bg-green-50 border-green-200 mb-4"><CheckCircle2 className="h-4 w-4 text-green-600" />
                        <AlertDescription className="text-green-800">Fully completed — all garments collected and paid.</AlertDescription></Alert>
                )}

                <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5">
                    <div className="md:col-span-3 space-y-2">
                        <div className="bg-card border rounded-xl p-2.5 space-y-1.5">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                    <User className="h-3 w-3 text-primary" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-baseline gap-2">
                                        <p className="font-bold text-sm truncate leading-tight">{order.customer?.name || "N/A"}</p>
                                        <span className="text-[11px] text-muted-foreground shrink-0">{order.customer?.country_code || "+965"} {order.customer?.phone || "—"}</span>
                                    </div>
                                </div>
                                {order.customer?.account_type && (
                                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border shrink-0 ${order.customer.account_type === "Secondary" ? "border-amber-300 bg-amber-50 text-amber-700" : "border-primary/30 bg-primary/5 text-primary"}`}>
                                        {order.customer.account_type}
                                        {order.customer.account_type === "Secondary" && order.customer.relation && <span className="font-normal"> · {order.customer.relation}</span>}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2.5 flex-wrap text-xs bg-muted/40 rounded-md px-2.5 py-1.5">
                                <span className="flex items-center gap-1 font-bold tabular-nums"><Hash className="h-3 w-3 text-muted-foreground" />{order.id}</span>
                                {order.invoice_number && <span className="flex items-center gap-1 tabular-nums text-muted-foreground"><Receipt className="h-3 w-3" />INV {order.invoice_number}</span>}
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-border">{order.order_type === "WORK" ? "Work" : "Sales"}</span>
                                {order.order_phase && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-secondary/10 text-secondary">{ORDER_PHASE_LABELS[order.order_phase as keyof typeof ORDER_PHASE_LABELS] || order.order_phase}</span>}
                                {isCancelled && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive">Cancelled</span>}
                                {(order as any).campaign?.name && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">{(order as any).campaign.name}</span>}
                                {order.delivery_date && <span className="flex items-center gap-1 text-muted-foreground ml-auto tabular-nums"><CalendarDays className="h-3 w-3" />{shortDateFmt.format(new Date(order.delivery_date))}</span>}
                            </div>
                        </div>

                        {order.order_type === "WORK" && !isCancelled && (
                            <DeliveryAndAddress
                                order={order}
                                isHomeDelivery={isHomeDelivery}
                                isOrderCompleted={isOrderCompleted}
                                onOptimisticToggle={setOptimisticDelivery}
                                chargeInput={chargeInput}
                                setChargeInput={setChargeInput}
                            />
                        )}

                        {(hasGarments || hasShelfItems) && !isRefundMode && !(isFullyPaid && allGarmentsCompleted) && (
                            <div className={`grid grid-cols-1 ${hasGarments && hasShelfItems ? "xl:grid-cols-2" : ""} gap-4`}>
                                {hasGarments && (
                                    <Card className="p-3">
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <h3 className="font-semibold flex items-center gap-2 text-sm"><Shirt className="h-4 w-4" />Garments ({garments.length})</h3>
                                            {allGarmentsCompleted && <Badge className="bg-green-600 text-xs">All Completed</Badge>}
                                            {(() => {
                                                const gTotal = (Number(order?.stitching_charge) || 0) + (Number(order?.fabric_charge) || 0) + (Number(order?.style_charge) || 0);
                                                return gTotal > 0 ? <span className="ml-auto text-sm font-bold tabular-nums text-muted-foreground">{fmtK(gTotal)}</span> : null;
                                            })()}
                                        </div>
                                        {isCancelled ? <p className="text-sm text-muted-foreground text-center py-3">Cancelled.</p> : <GarmentCollection garments={garments} selectedIds={collectGarmentIds} onToggle={toggleCollectGarment} onToggleAll={toggleAllCollectGarments} fulfillmentModes={garmentFulfillmentModes} onFulfillmentModeChange={handleFulfillmentModeChange} isHomeDelivery={isHomeDelivery} />}
                                    </Card>
                                )}
                                {hasShelfItems && (
                                    <Card className="p-3">
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <h3 className="font-semibold flex items-center gap-2 text-sm"><Package className="h-4 w-4" />Shelf Items ({shelfItems.length})</h3>
                                            <span className="ml-auto text-sm font-bold tabular-nums text-muted-foreground">{fmtK(shelfItems.reduce((s: number, i: any) => s + (i.unit_price * i.quantity), 0))}</span>
                                        </div>
                                        <div className="space-y-1.5">
                                            {shelfItems.map((item: any) => (
                                                <div key={item.id} className="flex justify-between items-center text-sm p-2 bg-muted/50 rounded-lg">
                                                    <div><span className="font-medium">{item.shelf?.type || `Item #${item.shelf_id}`}</span><span className="text-muted-foreground ml-2">x{item.quantity}</span></div>
                                                    <span className="font-semibold">{fmtK(item.unit_price * item.quantity)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </Card>
                                )}
                            </div>
                        )}

                        {(hasGarments || hasShelfItems) && (isRefundMode || (isFullyPaid && allGarmentsCompleted) || cancelledWithPayments) && (
                            <Card className="p-3 border-red-200 bg-red-50/30">
                                <h3 className="font-semibold flex items-center gap-2 text-sm mb-2"><Shirt className="h-4 w-4 text-red-600" />Select Items to Refund</h3>
                                <RefundItemSelector
                                    garments={garments as any}
                                    shelfItems={shelfItems as any}
                                    expressSurcharge={getPrice("EXPRESS_SURCHARGE") || 2}
                                    soakingPrice={getPrice("SOAKING_CHARGE") || 0}
                                    totalPaid={totalPaid}
                                    onRefundItemsChange={(items, total) => { setRefundItems(items); setRefundTotal(total); }}
                                />
                            </Card>
                        )}

                        <Card className="p-3">
                            <h3 className="font-semibold flex items-center gap-2 mb-1.5 text-sm"><Receipt className="h-4 w-4" />Payment History ({transactions.length})</h3>
                            <PaymentHistory transactions={transactions} orderId={order.id} invoiceNumber={order.invoice_number ?? undefined}
                                invoiceRevision={order.invoice_revision ?? 0} orderType={order.order_type as "WORK" | "SALES"} homeDelivery={isHomeDelivery}
                                customerName={order.customer?.name ?? undefined} customerPhone={order.customer?.phone ?? undefined} orderTotal={orderTotal} totalPaid={totalPaid}
                                discountValue={discountValue}
                                garments={garments.map((g: any) => ({
                                    garment_type: g.garment_type, style: g.style,
                                    collar_type: g.collar_type, collar_button: g.collar_button, cuffs_type: g.cuffs_type,
                                    jabzour_1: g.jabzour_1, jabzour_thickness: g.jabzour_thickness, fabric_length: Number(g.fabric_length) || 0,
                                    fabric_name: g.fabric?.name, express: g.express,
                                    fabric_price_snapshot: Number(g.fabric_price_snapshot) || 0, stitching_price_snapshot: Number(g.stitching_price_snapshot) || 0, style_price_snapshot: Number(g.style_price_snapshot) || 0,
                                }))}
                                shelfItems={shelfItems.map((i: any) => ({ name: i.shelf?.type || `Item #${i.shelf_id}`, brand: i.shelf?.brand, quantity: i.quantity, unit_price: i.unit_price }))} />
                        </Card>
                    </div>

                    <div className="md:col-span-2 space-y-2.5">
                        <Card className="p-3">
                            <h3 className="font-semibold flex items-center gap-2 mb-1 text-sm"><CreditCard className="h-4 w-4" />Payment Summary</h3>
                            <PaymentSummary order={effectiveOrder} totalPayments={totalPayments} totalRefunds={totalRefunds} />
                        </Card>
                        {!isCancelled && (
                            <Card className={`p-3 ${discountValue > 0 ? "bg-green-50 border-green-300" : ""}`}>
                                <h3 className="font-semibold flex items-center gap-2 mb-1 text-sm"><Tag className="h-4 w-4" />Discount</h3>
                                <DiscountControls orderId={order.id} currentDiscountType={(order as any).discount_type} currentDiscountValue={discountValue}
                                    currentDiscountPercentage={Number((order as any).discount_percentage) || 0} currentReferralCode={(order as any).referral_code} orderTotal={orderTotal} totalPaid={totalPaid} />
                            </Card>
                        )}
                        {!isCancelled && collectGarmentIds.size > 0 && (
                            <Card className="p-3 bg-emerald-50 border-emerald-300">
                                <div className="flex items-center justify-between mb-1.5">
                                    <h3 className="font-semibold flex items-center gap-2 text-sm"><Package className="h-4 w-4" />{collectActionLabel} Only</h3>
                                    <span className="text-xs text-emerald-700 font-medium">{collectGarmentIds.size} garment{collectGarmentIds.size !== 1 ? "s" : ""}</span>
                                </div>
                                <p className="text-xs text-muted-foreground mb-2">Hand over garments without recording a payment.</p>
                                <Button
                                    size="sm"
                                    className="w-full h-9 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700"
                                    disabled={collectGarmentsMutation.isPending || toggleDeliveryMutation.isPending}
                                    onClick={async () => {
                                        try { await saveDeliveryPendingIfAny(); } catch { return; }
                                        collectGarmentsMutation.mutate(
                                            {
                                                orderId: order.id,
                                                garmentIds: Array.from(collectGarmentIds),
                                                fulfillmentOverrides: Object.fromEntries(garmentFulfillmentModes),
                                            },
                                            {
                                                onSuccess: (res) => {
                                                    if (res.status === "success") {
                                                        setCollectGarmentIds(new Set());
                                                        setGarmentFulfillmentModes(new Map());
                                                    }
                                                },
                                            }
                                        );
                                    }}
                                >
                                    {collectGarmentsMutation.isPending
                                        ? <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Processing...</>
                                        : `${collectActionLabel} ${collectGarmentIds.size} Garment${collectGarmentIds.size !== 1 ? "s" : ""}`}
                                </Button>
                            </Card>
                        )}
                        {cancelledWithPayments ? (
                            <Card className="p-3 bg-red-50 border-red-300">
                                <h3 className="font-semibold flex items-center gap-2 mb-1 text-sm"><CreditCard className="h-4 w-4" />Refund Cancelled Order</h3>
                                <Alert variant="destructive" className="mb-2"><XCircle className="h-4 w-4" /><AlertDescription className="text-xs">Order cancelled with {fmtK(totalPaid)} paid. Refund customer to close it out.</AlertDescription></Alert>
                                <PaymentForm orderId={order.id} remainingBalance={remainingBalance} orderTotal={orderTotal} totalPaid={totalPaid} advance={advance} refundOnly isRefund={true} onRefundModeChange={() => {}} refundItems={refundItems} refundTotal={refundTotal} />
                            </Card>
                        ) : isCancelled ? (
                            <Card className="p-3"><Alert variant="destructive"><XCircle className="h-4 w-4" /><AlertDescription>Cancelled. No payments allowed.</AlertDescription></Alert></Card>
                        ) : isFullyPaid && allGarmentsCompleted ? (
                            <Card className="p-3 bg-green-50 border-green-300">
                                <h3 className="font-semibold flex items-center gap-2 mb-1 text-sm"><CreditCard className="h-4 w-4" />Refund Only</h3>
                                <Alert className="mb-2 bg-green-50 border-green-200"><CheckCircle2 className="h-4 w-4 text-green-600" /><AlertDescription className="text-green-800 text-xs">Fully paid and all garments collected.</AlertDescription></Alert>
                                <PaymentForm orderId={order.id} remainingBalance={remainingBalance} orderTotal={orderTotal} totalPaid={totalPaid} advance={advance} refundOnly isRefund={true} onRefundModeChange={() => {}} refundItems={refundItems} refundTotal={refundTotal} />
                            </Card>
                        ) : (
                            <Card className={`p-3 ${isFullyPaid ? "bg-green-50 border-green-300" : ""}`}>
                                <h3 className="font-semibold flex items-center gap-2 mb-1 text-sm"><CreditCard className="h-4 w-4" />{isRefundMode ? "Record Refund" : isFullyPaid ? "Refund / Additional" : "Record Payment"}</h3>
                                {isFullyPaid && !isRefundMode && <Alert className="mb-2 bg-green-50 border-green-200"><CheckCircle2 className="h-4 w-4 text-green-600" /><AlertDescription className="text-green-800 text-xs">Fully paid.</AlertDescription></Alert>}
                                <PaymentForm orderId={order.id} remainingBalance={remainingBalance} orderTotal={orderTotal} totalPaid={totalPaid} advance={advance} collectGarmentIds={isRefundMode ? undefined : collectGarmentIds} collectFulfillmentOverrides={isRefundMode ? undefined : Object.fromEntries(garmentFulfillmentModes)} collectActionLabel={isRefundMode ? undefined : collectActionLabel} onCollected={() => { setCollectGarmentIds(new Set()); setGarmentFulfillmentModes(new Map()); }} isRefund={isRefundMode} onRefundModeChange={handleRefundModeChange} refundItems={refundItems} refundTotal={refundTotal} onBeforeSubmit={isRefundMode ? undefined : saveDeliveryPendingIfAny} />
                            </Card>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Public exports ──────────────────────────────────────────────────────────
export function CashierListBody({ onSelectOrder }: { onSelectOrder: (id: string) => void }) {
    return (
        <RegisterGate>
            <CashierListView onSelectOrder={onSelectOrder} />
        </RegisterGate>
    );
}

export function CashierOrderDetailBody({ orderId, onBack }: { orderId: string; onBack: () => void }) {
    return (
        <RegisterGate>
            <CashierOrderDetailView orderId={orderId} onBack={onBack} />
        </RegisterGate>
    );
}

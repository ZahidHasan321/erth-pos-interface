import { useState, useMemo, useEffect } from "react";
import {
    Search, User, Receipt, Package, CreditCard,
    CheckCircle2, XCircle, Shirt, Tag, ArrowLeft, Clock, Loader2,
    MapPin, Pencil, Truck, Store,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChipToggle } from "@/components/ui/chip-toggle";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
    useCashierOrderSearch,
    usePaymentTransactions,
    useRecentCashierOrders,
    useCashierOrderListSearch,
    useCashierSummary,
    useToggleHomeDeliveryMutation,
} from "@/hooks/useCashier";
import type { CashierOrderListItem, CashierSummary } from "@/api/cashier";
import { PaymentForm } from "@/components/cashier/payment-form";
import { PaymentHistory } from "@/components/cashier/payment-history";
import { PaymentSummary } from "@/components/cashier/payment-summary";
import { DiscountControls } from "@/components/cashier/discount-controls";
import { GarmentCollection } from "@/components/cashier/garment-collection";
import { AddressDialog } from "@/components/cashier/address-dialog";
import { ORDER_PHASE_LABELS } from "@/lib/constants";

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
    `;
    document.head.appendChild(style);
}

// ── Order List Row ──────────────────────────────────────────────────────────
function OrderRow({ item, onSelect, isSelected }: { item: CashierOrderListItem; onSelect: (id: string) => void; isSelected?: boolean }) {
    const remaining = item.order_total - item.paid;
    const isPaid = remaining <= 0;
    const isCancelled = item.checkout_status === "cancelled";
    const hasReady = item.garment_ready > 0;

    const rowBg = isSelected
        ? "border-primary ring-2 ring-primary/20 bg-primary/5"
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
            className={`w-full text-left px-3.5 py-3 rounded-lg border transition-colors cursor-pointer active:scale-[0.99] ${rowBg}`}
        >
            {/* Top row: ID, customer, amount */}
            <div className="flex items-center gap-3">
                <div className={`w-1.5 h-10 rounded-full shrink-0 ${isPaid ? "bg-emerald-500" : isCancelled ? "bg-red-400" : "bg-amber-400"}`} />
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
            {/* Bottom row: badges and dates */}
            <div className="flex items-center gap-2 mt-2 ml-[28px]">
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

// ── Donut Chart ─────────────────────────────────────────────────────────────
function DonutChart({ segments, size = 120, strokeWidth = 14, center, summaryLine, hideLegend }: {
    segments: { value: number; color: string; label: string; amount: string }[];
    size?: number;
    strokeWidth?: number;
    center?: { label: string; value: string };
    summaryLine?: { label: string; amount: string };
    hideLegend?: boolean;
}) {
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
    const [mounted, setMounted] = useState(false);
    const pad = 6;
    const svgSize = size + pad * 2;
    const cx = svgSize / 2;
    const cy = svgSize / 2;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const total = segments.reduce((s, seg) => s + seg.value, 0);

    useEffect(() => {
        const raf = requestAnimationFrame(() => setMounted(true));
        return () => cancelAnimationFrame(raf);
    }, []);

    if (total === 0) return null;

    let accumulated = 0;
    const arcs = segments.filter(s => s.value > 0).map((seg, origIdx) => {
        const pct = seg.value / total;
        const offset = circumference * (1 - accumulated) + circumference * 0.25;
        accumulated += pct;
        return { ...seg, origIdx, pct, dashArray: `${circumference * pct} ${circumference * (1 - pct)}`, dashOffset: offset };
    });

    const hovered = hoveredIdx !== null ? arcs.find(a => a.origIdx === hoveredIdx) : null;

    return (
        <div className="flex flex-col items-center gap-2.5">
            <div className="relative" style={{ width: size, height: size }}>
                <svg width={svgSize} height={svgSize} className="-rotate-90" style={{ overflow: "visible", margin: -pad }}>
                    <circle cx={cx} cy={cy} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth - 2} className="text-muted/20" />
                    {arcs.map((arc, i) => (
                        <circle key={i} cx={cx} cy={cy} r={radius} fill="none"
                            stroke={arc.color}
                            strokeWidth={hoveredIdx === arc.origIdx ? strokeWidth + 5 : strokeWidth}
                            strokeLinecap="round"
                            strokeDasharray={mounted ? arc.dashArray : `0 ${circumference}`}
                            strokeDashoffset={arc.dashOffset}
                            onMouseEnter={() => setHoveredIdx(arc.origIdx)}
                            onMouseLeave={() => setHoveredIdx(null)}
                            onTouchStart={(e) => { e.stopPropagation(); setHoveredIdx(hoveredIdx === arc.origIdx ? null : arc.origIdx); }}
                            className="cursor-pointer"
                            style={{
                                transition: `stroke-dasharray 800ms cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 150}ms, stroke-width 300ms ease`,
                            }} />
                    ))}
                </svg>
                {/* Center text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={mounted ? { animation: "cashier-number-count 500ms cubic-bezier(0.2, 0, 0, 1) 400ms both" } : { opacity: 0 }}>
                    {hovered && !hideLegend ? (
                        <>
                            <span className="text-lg font-bold tabular-nums leading-tight transition-colors duration-200" style={{ color: hovered.color }}>{Math.round(hovered.pct * 100)}%</span>
                            <span className="text-[10px] text-muted-foreground leading-tight">{hovered.label}</span>
                            <span className="text-[10px] font-semibold tabular-nums leading-tight">{hovered.amount}</span>
                        </>
                    ) : center ? (
                        <>
                            <span className="text-xl font-bold tabular-nums leading-tight">{center.value}</span>
                            <span className="text-[10px] text-muted-foreground leading-tight">{center.label}</span>
                        </>
                    ) : null}
                </div>
                {/* Floating tooltip */}
                {hideLegend && hovered && hovered.label && (
                    <div className="absolute left-1/2 -translate-x-1/2 z-50 pointer-events-none"
                        style={{ top: size + 4, animation: "cashier-pop 200ms cubic-bezier(0.34, 1.56, 0.64, 1) both" }}>
                        <div className="w-2 h-2 bg-foreground rotate-45 mx-auto -mb-1" />
                        <div className="bg-foreground text-background text-[10px] font-semibold px-2.5 py-1 rounded-md shadow-lg whitespace-nowrap tabular-nums">
                            <span style={{ color: hovered.color === "#3730a3" ? "#a5b4fc" : "#fcd34d" }}>{hovered.label}</span> {hovered.amount}
                        </div>
                    </div>
                )}
            </div>
            {/* Legend — hidden when all labels are empty or hideLegend is set */}
            {!hideLegend && (arcs.some(a => a.label) || summaryLine) && (
                <div className="flex flex-col items-center gap-1" style={mounted ? { animation: "cashier-number-count 400ms cubic-bezier(0.2, 0, 0, 1) 600ms both" } : { opacity: 0 }}>
                    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
                        {arcs.filter(a => a.label).map((arc, i) => (
                            <div key={i} className="flex items-center gap-1.5 text-xs">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: arc.color }} />
                                <span className="text-muted-foreground">{arc.label}</span>
                                <span className="font-bold tabular-nums">{arc.amount}</span>
                            </div>
                        ))}
                    </div>
                    {summaryLine && (
                        <div className="text-[11px] text-muted-foreground pt-0.5">
                            {summaryLine.label}: <span className="font-bold text-foreground tabular-nums">{summaryLine.amount}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
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
    const monthName = now.toLocaleDateString("en-US", { month: "long" });

    const allBilled = Number(summary.all_billed);
    const allCollected = Number(summary.all_collected);
    const totalUnpaidAmount = Number(summary.all_outstanding);
    const monthTotal = Number(summary.month_billed);
    const monthPaid = Number(summary.month_paid);
    const monthOutstanding = Number(summary.month_outstanding);
    const collectionRate = monthTotal > 0 ? Math.round((monthPaid / monthTotal) * 100) : 0;
    const workBilled = Number(summary.work_billed);
    const salesBilled = Number(summary.sales_billed);
    const monthWorkBilled = Number(summary.month_work_billed);
    const monthSalesBilled = Number(summary.month_sales_billed);

    return (
        <div className="space-y-2">
            {/* Overall Payment Summary */}
            <Card className="p-2.5">
                <h3 className="font-bold text-sm mb-2 flex items-center gap-1.5">
                    <CreditCard className="h-4 w-4 text-muted-foreground" /> Payment Summary
                </h3>
                {/* Today — simple addition-style, operational info */}
                <div className="mb-1">
                    <p className="text-xs font-bold mb-1.5">Today</p>
                    {Number(summary.today_count) > 0 ? (
                        <div className="text-xs tabular-nums space-y-1">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Orders</span>
                                <span className="font-semibold">{Number(summary.today_count)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Collected</span>
                                <span className="font-semibold">{fmtK(Number(summary.today_paid))}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-orange-400" />Due</span>
                                <span className="font-semibold text-orange-600">{fmtK(Math.max(0, Number(summary.today_billed) - Number(summary.today_paid)))}</span>
                            </div>
                            <div className="border-t border-border pt-1 flex justify-between font-bold">
                                <span>Billed</span>
                                <span>{fmtK(Number(summary.today_billed))}</span>
                            </div>
                        </div>
                    ) : (
                        <p className="text-xs text-muted-foreground text-center py-2">No orders today</p>
                    )}
                </div>

                {/* Monthly — donuts + addition-style legend */}
                <div className="mt-2 pt-1.5 border-t border-border">
                    <p className="text-xs font-bold mb-1.5">{monthName}</p>
                    {monthTotal > 0 ? (
                        <div className="flex items-center gap-3">
                            {/* Left: two donuts */}
                            <div className="flex gap-3 shrink-0 items-center">
                                <DonutChart
                                    size={75}
                                    strokeWidth={9}
                                    hideLegend
                                    center={{ value: `${(monthWorkBilled + monthSalesBilled) > 0 ? Math.round((monthWorkBilled / (monthWorkBilled + monthSalesBilled)) * 100) : 0}%`, label: "work" }}
                                    segments={[
                                        { value: monthWorkBilled, color: "#0d9488", label: "Work", amount: fmtK(monthWorkBilled) },
                                        { value: monthSalesBilled, color: "#7c3aed", label: "Sales", amount: fmtK(monthSalesBilled) },
                                    ]}
                                />
                                <DonutChart
                                    size={95}
                                    strokeWidth={12}
                                    hideLegend
                                    center={{ value: `${collectionRate}%`, label: "paid" }}
                                    segments={[
                                        { value: monthPaid, color: "#047857", label: "Collected", amount: fmtK(monthPaid) },
                                        { value: monthOutstanding, color: "#ea580c", label: "Remaining", amount: fmtK(monthOutstanding) },
                                    ]}
                                />
                            </div>
                            {/* Right: addition-style breakdown */}
                            <div className="flex-1 text-xs tabular-nums space-y-1">
                                <div className="flex justify-between">
                                    <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Collected</span>
                                    <span className="font-semibold">{fmtK(monthPaid)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-red-400" />Remaining</span>
                                    <span className="font-semibold text-red-600">{fmtK(monthOutstanding)}</span>
                                </div>
                                <div className="border-t border-border pt-1 flex justify-between font-bold">
                                    <span>Total</span>
                                    <span>{fmtK(monthTotal)}</span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <p className="text-xs text-muted-foreground text-center py-2">No orders this month</p>
                    )}
                </div>

                {/* All Time — donuts + addition-style legend */}
                <div className="mt-2 pt-1.5 border-t border-border">
                    <p className="text-xs font-bold mb-1.5">All Time</p>
                    {allBilled > 0 ? (
                        <div className="flex items-center gap-3">
                            <div className="flex gap-3 shrink-0 items-center">
                                <DonutChart
                                    size={80}
                                    strokeWidth={10}
                                    hideLegend
                                    center={{ value: `${(workBilled + salesBilled) > 0 ? Math.round((workBilled / (workBilled + salesBilled)) * 100) : 0}%`, label: "work" }}
                                    segments={[
                                        { value: workBilled, color: "#0d9488", label: "Work", amount: fmtK(workBilled) },
                                        { value: salesBilled, color: "#7c3aed", label: "Sales", amount: fmtK(salesBilled) },
                                    ]}
                                />
                                <DonutChart
                                    size={100}
                                    strokeWidth={13}
                                    hideLegend
                                    center={{ value: `${Math.round((allCollected / allBilled) * 100)}%`, label: "paid" }}
                                    segments={[
                                        { value: allCollected, color: "#047857", label: "Collected", amount: fmtK(allCollected) },
                                        { value: totalUnpaidAmount, color: "#ea580c", label: "Remaining", amount: fmtK(totalUnpaidAmount) },
                                    ]}
                                />
                            </div>
                            <div className="flex-1 text-xs tabular-nums space-y-1">
                                <div className="flex justify-between">
                                    <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Collected</span>
                                    <span className="font-semibold">{fmtK(allCollected)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-orange-400" />Remaining</span>
                                    <span className="font-semibold text-orange-600">{fmtK(totalUnpaidAmount)}</span>
                                </div>
                                <div className="border-t border-border pt-1 flex justify-between font-bold">
                                    <span>Total</span>
                                    <span>{fmtK(allBilled)}</span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <p className="text-xs text-muted-foreground text-center py-2">No orders yet</p>
                    )}
                </div>
            </Card>

            {/* Remaining Payments — orders with outstanding balance */}
            <Card className={`p-2.5 ${unpaidOrders.length > 0 ? "border-red-200 bg-red-50/30" : ""}`}>
                <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-sm text-red-700 flex items-center gap-1.5">
                        <CreditCard className="h-4 w-4" /> Remaining ({unpaidOrders.length})
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
                                        className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-red-100/80 transition-colors cursor-pointer active:scale-[0.99] border border-transparent hover:border-red-200"
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

// ── Shared Cashier Body ─────────────────────────────────────────────────────
export function CashierBody() {
    const [listSearchInput, setListSearchInput] = useState("");
    const [listSearchQuery, setListSearchQuery] = useState("");
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const [dashboardFilter, setDashboardFilter] = useState<DashboardFilter>("all");
    const [addressDialogOpen, setAddressDialogOpen] = useState(false);

    const { data: recentResult, isLoading: isLoadingRecent, isFetching: isFetchingRecent } = useRecentCashierOrders(dashboardFilter);
    const recentOrders = recentResult?.data || [];
    // True only on very first page load (no data at all), not on filter switches
    // Only true on very first page load — not on filter switches
    const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
    useEffect(() => { if (recentResult) setHasLoadedOnce(true); }, [recentResult]);
    const isInitialLoad = !hasLoadedOnce && isLoadingRecent;

    const { data: summaryResult } = useCashierSummary();
    const summary: CashierSummary = summaryResult?.data || { all_billed: 0, all_collected: 0, all_outstanding: 0, today_count: 0, today_billed: 0, today_paid: 0, month_billed: 0, month_paid: 0, month_outstanding: 0, work_count: 0, sales_count: 0, unpaid_count: 0, work_billed: 0, sales_billed: 0, month_work_billed: 0, month_sales_billed: 0 };

    const { data: listSearchResult, isFetching: isListSearching } = useCashierOrderListSearch(listSearchQuery);
    const searchedOrders = listSearchResult?.data || [];

    // Always-fetched unpaid orders for the Remaining section (independent of filter)
    const { data: unpaidResult } = useRecentCashierOrders("unpaid");
    const allUnpaidOrders = (unpaidResult?.data || []).filter(o => (o.order_total - o.paid) > 0.001);

    const { data: searchResult, isFetching: isOrderLoading } = useCashierOrderSearch(selectedOrderId || "");
    const order = searchResult?.status === "success" ? searchResult.data : null;

    const { data: txResult } = usePaymentTransactions(order?.id);
    const txData = txResult?.status === "success" ? txResult.data : [];
    const transactions = Array.isArray(txData) ? txData : [];

    // When searching, use search results; otherwise use DB-filtered recent orders
    const allDisplayOrders = listSearchQuery ? searchedOrders : recentOrders;
    const displayOrders = allDisplayOrders.slice(0, visibleCount);
    const hasMore = allDisplayOrders.length > visibleCount;

    // Debounced search
    useEffect(() => {
        const val = listSearchInput.trim();
        if (!val) { setListSearchQuery(""); return; }
        const timer = setTimeout(() => setListSearchQuery(val), 400);
        return () => clearTimeout(timer);
    }, [listSearchInput]);

    useEffect(() => { setVisibleCount(PAGE_SIZE); }, [listSearchQuery]);

    const handleSelectOrder = (orderId: string) => setSelectedOrderId(orderId);
    const handleBackToList = () => setSelectedOrderId(null);

    const orderTotal = Number(order?.order_total) || 0;
    const totalPaid = Number(order?.paid) || 0;
    const remainingBalance = orderTotal - totalPaid;
    const discountValue = Number(order?.discount_value) || 0;

    const totalPayments = useMemo(() => {
        return transactions.filter((tx: any) => tx.transaction_type === "payment")
            .reduce((sum: number, tx: any) => sum + Math.abs(Number(tx.amount) || 0), 0);
    }, [transactions]);

    const totalRefunds = useMemo(() => {
        return transactions.filter((tx: any) => tx.transaction_type === "refund")
            .reduce((sum: number, tx: any) => sum + Math.abs(Number(tx.amount) || 0), 0);
    }, [transactions]);

    const toggleDeliveryMutation = useToggleHomeDeliveryMutation();

    const isCancelled = order?.checkout_status === "cancelled";
    const isOrderCompleted = order?.order_phase === "completed";
    const isFullyPaid = remainingBalance <= 0;
    const isHomeDelivery = !!(order as any)?.home_delivery;

    const [collectGarmentIds, setCollectGarmentIds] = useState<Set<string>>(new Set());

    const garments = Array.isArray(order?.garments) ? order.garments : [];
    const shelfItems = Array.isArray(order?.shelf_items) ? order.shelf_items : [];
    const hasGarments = garments.length > 0;
    const hasShelfItems = shelfItems.length > 0;

    const eligibleGarments = garments.filter((g: any) =>
        g.location === "shop" && ["ready_for_pickup", "brova_trialed", "awaiting_trial"].includes(g.piece_stage)
    );

    const toggleCollectGarment = (id: string) => {
        setCollectGarmentIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleAllCollectGarments = () => {
        if (collectGarmentIds.size === eligibleGarments.length) {
            setCollectGarmentIds(new Set());
        } else {
            setCollectGarmentIds(new Set(eligibleGarments.map((g: any) => g.id)));
        }
    };

    const allGarmentsCompleted = useMemo(() => {
        if (garments.length === 0) return true;
        return garments.every((g: any) => g.piece_stage === "completed");
    }, [garments]);

    const advance = useMemo(() => {
        if (!order) return 0;
        const stitching = Number((order as any)?.stitching_charge) || 0;
        const fabric = Number((order as any)?.fabric_charge) || 0;
        const style = Number((order as any)?.style_charge) || 0;
        const delivery = Number((order as any)?.delivery_charge) || 0;
        const shelf = Number((order as any)?.shelf_charge) || 0;
        return parseFloat(((stitching * 0.5) + fabric + style + delivery + shelf).toFixed(3));
    }, [order]);

    // ── Order Detail ────────────────────────────────────────────────────────
    if (selectedOrderId && order) {
        return (
            <div className="h-full flex flex-col" style={{ animation: "cashier-focus-in 250ms cubic-bezier(0.2, 0, 0, 1) both" }}>
                <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30 shrink-0">
                    <Button variant="ghost" size="sm" onClick={handleBackToList}>
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

                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                        <div className="md:col-span-3 space-y-4">
                            <Card className="p-3">
                                <div className="flex gap-3">
                                    {/* Customer */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 mb-1">
                                            <User className="h-3 w-3 text-muted-foreground" />
                                            <span className="font-semibold text-sm">{order.customer?.name || "N/A"}</span>
                                            <span className="text-xs text-muted-foreground">{order.customer?.phone || ""}</span>
                                        </div>
                                        {/* Address */}
                                        <div className="flex items-start gap-1 text-xs">
                                            <MapPin className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                                            {(() => {
                                                const c = order.customer;
                                                const parts = [c?.area, c?.block && `Blk ${c.block}`, c?.street && `St ${c.street}`, c?.house_no && `#${c.house_no}`].filter(Boolean);
                                                return parts.length > 0 ? (
                                                    <span className="text-muted-foreground">{parts.join(", ")}{c?.city ? ` - ${c.city}` : ""}</span>
                                                ) : (
                                                    <span className="text-red-500">No address</span>
                                                );
                                            })()}
                                            <button type="button" onClick={() => setAddressDialogOpen(true)}
                                                className="text-primary hover:text-primary/80 shrink-0 ml-1 cursor-pointer">
                                                <Pencil className="h-3 w-3" />
                                            </button>
                                        </div>
                                        {order.customer?.address_note && (
                                            <p className="text-[10px] text-muted-foreground/60 italic ml-4">{order.customer.address_note}</p>
                                        )}
                                    </div>
                                    <Separator orientation="vertical" className="h-10" />
                                    {/* Order info */}
                                    <div className="shrink-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-sm tabular-nums">#{order.id}</span>
                                            {order.invoice_number && <span className="text-xs text-muted-foreground">INV {order.invoice_number}</span>}
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-1">
                                            <Badge variant="outline" className="text-[10px] px-1.5">{order.order_type}</Badge>
                                            {order.order_phase && <Badge variant="secondary" className="text-[10px] px-1.5">{ORDER_PHASE_LABELS[order.order_phase as keyof typeof ORDER_PHASE_LABELS] || order.order_phase}</Badge>}
                                            {isCancelled && <Badge variant="destructive" className="text-[10px] px-1.5">Cancelled</Badge>}
                                        </div>
                                    </div>
                                </div>
                                {/* Delivery Type Toggle */}
                                {order.order_type === "WORK" && !isCancelled && !isOrderCompleted && (
                                    <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t">
                                        <span className="text-xs text-muted-foreground">Delivery:</span>
                                        <div className="flex rounded-lg border bg-muted p-0.5">
                                            <ChipToggle
                                                active={!isHomeDelivery}
                                                onClick={() => { if (isHomeDelivery) toggleDeliveryMutation.mutate({ orderId: order.id, homeDelivery: false }); }}
                                                disabled={toggleDeliveryMutation.isPending}
                                                className="px-3">
                                                <Store className="h-3.5 w-3.5" /> Pickup
                                            </ChipToggle>
                                            <ChipToggle
                                                active={isHomeDelivery}
                                                activeVariant="blue"
                                                onClick={() => { if (!isHomeDelivery) toggleDeliveryMutation.mutate({ orderId: order.id, homeDelivery: true }); }}
                                                disabled={toggleDeliveryMutation.isPending}
                                                className="px-3">
                                                <Truck className="h-3.5 w-3.5" /> Home Delivery
                                            </ChipToggle>
                                        </div>
                                        {toggleDeliveryMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                                    </div>
                                )}
                            </Card>

                            {/* Address Dialog */}
                            {order.customer && (
                                <AddressDialog
                                    open={addressDialogOpen}
                                    onOpenChange={setAddressDialogOpen}
                                    customerId={order.customer.id}
                                    currentAddress={{
                                        city: order.customer.city ?? undefined,
                                        area: order.customer.area ?? undefined,
                                        block: order.customer.block ?? undefined,
                                        street: order.customer.street ?? undefined,
                                        house_no: order.customer.house_no ?? undefined,
                                        address_note: order.customer.address_note ?? undefined,
                                    }}
                                />
                            )}

                            {(hasGarments || hasShelfItems) && (
                                <div className={`grid grid-cols-1 ${hasGarments && hasShelfItems ? "xl:grid-cols-2" : ""} gap-4`}>
                                    {hasGarments && (
                                        <Card className="p-4">
                                            <h3 className="font-semibold flex items-center gap-2 mb-3"><Shirt className="h-4 w-4" />Garments ({garments.length})
                                                {allGarmentsCompleted && <Badge className="bg-green-600 ml-auto text-xs">All Completed</Badge>}</h3>
                                            {isCancelled ? <p className="text-sm text-muted-foreground text-center py-4">Cancelled.</p> : <GarmentCollection garments={garments} selectedIds={collectGarmentIds} onToggle={toggleCollectGarment} onToggleAll={toggleAllCollectGarments} />}
                                        </Card>
                                    )}
                                    {hasShelfItems && (
                                        <Card className="p-4">
                                            <h3 className="font-semibold flex items-center gap-2 mb-3"><Package className="h-4 w-4" />Shelf Items ({shelfItems.length})</h3>
                                            <div className="space-y-2">
                                                {shelfItems.map((item: any) => (
                                                    <div key={item.id} className="flex justify-between items-center text-sm p-2.5 bg-muted/50 rounded-lg">
                                                        <div><span className="font-medium">{item.shelf?.type || `Item #${item.shelf_id}`}</span><span className="text-muted-foreground ml-2">x{item.quantity}</span></div>
                                                        <span className="font-semibold">{fmtK(item.unit_price * item.quantity)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </Card>
                                    )}
                                </div>
                            )}

                            <Card className="p-4">
                                <h3 className="font-semibold flex items-center gap-2 mb-3"><Receipt className="h-4 w-4" />Payment History ({transactions.length})</h3>
                                <PaymentHistory transactions={transactions} orderId={order.id} invoiceNumber={order.invoice_number ?? undefined}
                                    customerName={order.customer?.name ?? undefined} customerPhone={order.customer?.phone ?? undefined} orderTotal={orderTotal} totalPaid={totalPaid} />
                            </Card>
                        </div>

                        <div className="md:col-span-2 space-y-2.5">
                            <Card className="p-3">
                                <h3 className="font-semibold flex items-center gap-2 mb-2 text-sm"><CreditCard className="h-4 w-4" />Payment Summary</h3>
                                <PaymentSummary order={order} totalPayments={totalPayments} totalRefunds={totalRefunds} />
                            </Card>
                            {!isCancelled && (
                                <Card className={`p-3 ${discountValue > 0 ? "bg-green-50 border-green-300" : ""}`}>
                                    <h3 className="font-semibold flex items-center gap-2 mb-2 text-sm"><Tag className="h-4 w-4" />Discount</h3>
                                    <DiscountControls orderId={order.id} currentDiscountType={(order as any).discount_type} currentDiscountValue={discountValue}
                                        currentDiscountPercentage={Number((order as any).discount_percentage) || 0} currentReferralCode={(order as any).referral_code} orderTotal={orderTotal} />
                                </Card>
                            )}
                            {!isCancelled ? (
                                <Card className={`p-3 ${isFullyPaid ? "bg-green-50 border-green-300" : ""}`}>
                                    <h3 className="font-semibold flex items-center gap-2 mb-2 text-sm"><CreditCard className="h-4 w-4" />{isFullyPaid ? "Refund / Additional" : "Record Payment"}</h3>
                                    {isFullyPaid && <Alert className="mb-3 bg-green-50 border-green-200"><CheckCircle2 className="h-4 w-4 text-green-600" /><AlertDescription className="text-green-800 text-xs">Fully paid.</AlertDescription></Alert>}
                                    <PaymentForm orderId={order.id} remainingBalance={remainingBalance} orderTotal={orderTotal} totalPaid={totalPaid} advance={advance} collectGarmentIds={collectGarmentIds} onCollected={() => setCollectGarmentIds(new Set())} />
                                </Card>
                            ) : (
                                <Card className="p-3"><Alert variant="destructive"><XCircle className="h-4 w-4" /><AlertDescription>Cancelled. No payments allowed.</AlertDescription></Alert></Card>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ── Loading ─────────────────────────────────────────────────────────────
    if (isOrderLoading && selectedOrderId) {
        return (
            <div className="p-4 max-w-[1400px] mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <div className="md:col-span-3 space-y-4"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>
                    <div className="md:col-span-2 space-y-4"><Skeleton className="h-48" /><Skeleton className="h-48" /></div>
                </div>
            </div>
        );
    }

    // ── Error ───────────────────────────────────────────────────────────────
    if (selectedOrderId && searchResult?.status === "error") {
        return (
            <div className="p-4">
                <Alert variant="destructive" className="py-2 mb-4"><XCircle className="h-4 w-4" />
                    <AlertDescription>{searchResult.message} <Button variant="link" size="sm" className="ml-2 h-auto p-0" onClick={handleBackToList}>Back to list</Button></AlertDescription>
                </Alert>
            </div>
        );
    }

    // ── Initial loading ────────────────────────────────────────────────────
    if (isInitialLoad && !selectedOrderId) {
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

    // ── Dashboard / Order List ──────────────────────────────────────────────
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
                        {/* Filter bar */}
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
                            {/* Loading: only show skeletons for search, not filter switches */}
                            {isListSearching && (
                                <div className="space-y-1">
                                    {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11 rounded-md" />)}
                                </div>
                            )}

                            {/* Inline fetching indicator for filter switches */}
                            {isFetchingRecent && !isLoadingRecent && !isListSearching && (
                                <div className="flex items-center justify-center py-2">
                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                </div>
                            )}

                            {/* Results */}
                            {!isListSearching && !isInitialLoad && displayOrders.map((item, i) => (
                                <div key={item.id} style={i < 10 ? { animation: `cashier-deal 300ms cubic-bezier(0.2, 0, 0, 1) ${i * 30}ms both` } : undefined}>
                                    <OrderRow item={item} onSelect={handleSelectOrder} isSelected={String(item.id) === selectedOrderId} />
                                </div>
                            ))}

                            {!isListSearching && hasMore && (
                                <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground mt-1"
                                    onClick={() => setVisibleCount(v => v + PAGE_SIZE)}>
                                    Show more ({allDisplayOrders.length - visibleCount} remaining)
                                </Button>
                            )}

                            {!isInitialLoad && !isFetchingRecent && !isListSearching && displayOrders.length === 0 && (
                                <div className="text-center py-8 text-muted-foreground">
                                    <CreditCard className="h-8 w-8 mx-auto mb-1.5 opacity-20" />
                                    <p className="text-xs">{listSearchQuery ? "No orders match your search" : "No recent orders"}</p>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="md:col-span-2 pr-1 overflow-visible">
                        <ReportsPanel summary={summary} unpaidOrders={allUnpaidOrders} onSelectOrder={handleSelectOrder} />
                    </div>
                </div>
            </div>
        </div>
    );
}

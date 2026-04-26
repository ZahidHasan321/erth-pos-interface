import { useState, useEffect } from "react";
import {
    Search, CreditCard, CheckCircle2, XCircle, Clock, Loader2,
} from "lucide-react";
import { Input } from "@repo/ui/input";
import { Button } from "@repo/ui/button";
import { Card } from "@repo/ui/card";
import { ChipToggle } from "@repo/ui/chip-toggle";
import { Skeleton } from "@repo/ui/skeleton";
import { TIMEZONE } from "@/lib/utils";
import {
    useRecentCashierOrders,
    useCashierOrderListSearch,
    useCashierSummary,
} from "@/hooks/useCashier";
import type { CashierOrderListItem, CashierSummary } from "@/api/cashier";
import { ORDER_PHASE_LABELS } from "@/lib/constants";
import { DonutChart } from "@/components/charts/donut-chart";
import { CashierOrderDetailView } from "./cashier-order-detail";
import { RegisterGate } from "./register-gate";
import "./cashier-keyframes";

const PAGE_SIZE = 15;
const fmt = (n: number): string => Number(Number(n).toFixed(3)).toString();
const fmtK = (n: number): string => `${fmt(n)} KWD`;
const shortDateFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" });

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

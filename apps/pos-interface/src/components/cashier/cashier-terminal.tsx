import { useState, useEffect } from "react";
import {
    Search, CreditCard, CheckCircle2, XCircle, Clock, Loader2, Wallet, Layers, AlertCircle,
} from "lucide-react";
import { Input } from "@repo/ui/input";
import { Button } from "@repo/ui/button";
import { Card } from "@repo/ui/card";
import { ChipToggle } from "@repo/ui/chip-toggle";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";
import { Skeleton } from "@repo/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui/table";
import {
    useRecentCashierOrders,
    useCashierOrderListSearch,
    useCashierSummary,
} from "@/hooks/useCashier";
import type { CashierOrderListItem, CashierSummary, CashierPeriod, CashierFilter } from "@/api/cashier";
import { EMPTY_CASHIER_SUMMARY } from "@/api/cashier";
import { ORDER_PHASE_LABELS } from "@/lib/constants";
import { DonutChart } from "@/components/charts/donut-chart";
import { OrderDetailShell } from "./order-detail-shell";
import { RegisterGate, useRegisterReady } from "./register-gate";
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
        ? "bg-card border-primary/40 hover:bg-accent"
        : isCancelled
            ? "bg-card border-border opacity-70 hover:bg-accent"
            : "bg-card border-border hover:bg-accent";

    const phaseColors: Record<string, string> = {
        new: "bg-muted text-muted-foreground",
        in_progress: "bg-muted text-muted-foreground",
        completed: "bg-primary/10 text-primary",
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
                    <p className={`text-sm font-semibold tabular-nums leading-tight ${isPaid ? "text-emerald-700" : "text-destructive"}`}>
                        {isPaid ? "Paid" : `-${fmtK(remaining)}`}
                    </p>
                </div>
            </div>
            <div className="flex items-center gap-2 mt-2">
                {isNew && (
                    <span className="text-[10px] font-bold tracking-wide uppercase px-1.5 py-0.5 rounded bg-primary text-primary-foreground shrink-0">
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
                        {item.order_type === "WORK" ? "Work" : item.order_type === "ALTERATION" ? "Alteration" : "Sales"}
                    </span>
                )}
                {hasReady && item.garment_total > 0 && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-primary text-primary-foreground shrink-0">
                        {item.garment_ready}/{item.garment_total} ready
                    </span>
                )}
                {item.home_delivery && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
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

// ── Order Table Row (lg+) ───────────────────────────────────────────────────

function OrderTableRow({ item, onSelect }: { item: CashierOrderListItem; onSelect: (id: string) => void }) {
    const remaining = item.order_total - item.paid;
    const isPaid = remaining <= 0;
    const isCancelled = item.checkout_status === "cancelled";
    const hasReady = item.garment_ready > 0;
    const isNew = isNewUnprocessed(item);

    const phaseColors: Record<string, string> = {
        new: "bg-muted text-muted-foreground",
        in_progress: "bg-muted text-muted-foreground",
        completed: "bg-primary/10 text-primary",
    };

    const orderDateStr = item.order_date ? shortDateFmt.format(new Date(item.order_date)) : "-";
    const deliveryDateStr = item.delivery_date ? shortDateFmt.format(new Date(item.delivery_date)) : "-";

    const rowTint = isNew
        ? "bg-primary/[0.04] hover:bg-primary/[0.07]"
        : isCancelled
            ? "opacity-60 hover:bg-muted/50"
            : "hover:bg-muted/50";

    return (
        <TableRow
            onClick={() => onSelect(String(item.id))}
            className={`cursor-pointer ${rowTint}`}
        >
            <TableCell className="py-2.5">
                <div className="font-semibold text-sm tabular-nums leading-tight">#{item.id}</div>
                {item.invoice_number && (
                    <div className="text-[11px] text-muted-foreground tabular-nums leading-tight">INV {item.invoice_number}</div>
                )}
            </TableCell>
            <TableCell className="py-2.5">
                <div className="font-medium text-sm truncate leading-tight">{item.customer_name || "Unknown"}</div>
                <div className="text-[11px] text-muted-foreground truncate leading-tight">{item.customer_phone || "-"}</div>
            </TableCell>
            <TableCell className="py-2.5 text-xs text-muted-foreground tabular-nums whitespace-nowrap">{orderDateStr}</TableCell>
            <TableCell className="py-2.5 text-xs tabular-nums whitespace-nowrap">
                {deliveryDateStr === "-" ? (
                    <span className="text-muted-foreground">-</span>
                ) : (
                    <span className="font-semibold">{deliveryDateStr}</span>
                )}
            </TableCell>
            <TableCell className="py-2.5 text-right font-semibold text-sm tabular-nums whitespace-nowrap">
                {fmtK(item.order_total)}
            </TableCell>
            <TableCell className={`py-2.5 text-right font-semibold text-sm tabular-nums whitespace-nowrap ${isPaid ? "text-emerald-700" : "text-destructive"}`}>
                {isPaid ? "Paid" : `-${fmtK(remaining)}`}
            </TableCell>
            <TableCell className="py-2.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                    {isNew && (
                        <span className="text-[10px] font-bold tracking-wide uppercase px-1.5 py-0.5 rounded bg-primary text-primary-foreground">
                            New
                        </span>
                    )}
                    {item.order_phase && (
                        <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${phaseColors[item.order_phase] || "bg-muted text-muted-foreground"}`}>
                            {ORDER_PHASE_LABELS[item.order_phase as keyof typeof ORDER_PHASE_LABELS] || item.order_phase}
                        </span>
                    )}
                    {item.order_type && (
                        <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {item.order_type === "WORK" ? "Work" : item.order_type === "ALTERATION" ? "Alteration" : "Sales"}
                        </span>
                    )}
                    {hasReady && item.garment_total > 0 && (
                        <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-primary text-primary-foreground">
                            {item.garment_ready}/{item.garment_total} ready
                        </span>
                    )}
                    {item.home_delivery && (
                        <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            Delivery
                        </span>
                    )}
                </div>
            </TableCell>
        </TableRow>
    );
}

function OrderTable({ items, onSelect }: { items: CashierOrderListItem[]; onSelect: (id: string) => void }) {
    return (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
            <Table>
                <TableHeader>
                    <TableRow className="hover:bg-transparent bg-muted/40">
                        <TableHead className="w-[88px]">#</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead className="w-[72px]">Placed</TableHead>
                        <TableHead className="w-[72px]">Due</TableHead>
                        <TableHead className="w-[96px] text-right">Total</TableHead>
                        <TableHead className="w-[112px] text-right">Remaining</TableHead>
                        <TableHead className="w-[240px]">Status</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {items.map((item) => (
                        <OrderTableRow key={item.id} item={item} onSelect={onSelect} />
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

// ── Reports Panel ───────────────────────────────────────────────────────────
const OWING_PAGE_SIZE = 8;

const PERIOD_LABEL: Record<CashierPeriod, string> = {
    all: "All time",
    today: "Today",
    month: "This month",
    last2: "Last 2 months",
    quarter: "This quarter",
};

function StatRow({ label, value, dotClass, strong }: { label: string; value: string; dotClass?: string; strong?: boolean }) {
    return (
        <div className={`flex justify-between ${strong ? "font-semibold" : ""}`}>
            <span className="flex items-center gap-1.5 text-muted-foreground">
                {dotClass && <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />}
                {label}
            </span>
            <span className="font-semibold tabular-nums">{value}</span>
        </div>
    );
}

// Period-scoped cashier stats. Everything here reflects the same period the list
// is filtered to, so the panel and the rows always tell one story:
//   1. Collections — billed / collected / outstanding for orders placed in the period
//   2. Payment status — clickable buckets that drive the list filter
//   3. Outstanding — the actionable "who still owes" worklist, largest balance first
function ReportsPanel({ summary, period, owingOrders, activeFilter, onFilter, onSelectOrder }: {
    summary: CashierSummary;
    period: CashierPeriod;
    owingOrders: CashierOrderListItem[];
    activeFilter: CashierFilter;
    onFilter: (f: CashierFilter) => void;
    onSelectOrder: (id: string) => void;
}) {
    const [owingVisible, setOwingVisible] = useState(OWING_PAGE_SIZE);

    const billed = Number(summary.billed);
    const collected = Number(summary.collected);
    const outstanding = Number(summary.outstanding);
    const orderCount = Number(summary.order_count);
    const collectionRate = billed > 0 ? Math.round((collected / billed) * 100) : 0;
    const avgOrder = orderCount > 0 ? billed / orderCount : 0;

    const statusRows = [
        { key: "paid" as const, label: "Fully paid", count: Number(summary.paid_count), owed: 0, dot: "bg-emerald-600" },
        { key: "partial" as const, label: "Partially paid", count: Number(summary.partial_count), owed: Number(summary.partial_outstanding), dot: "bg-amber-500" },
        { key: "unpaid" as const, label: "Unpaid", count: Number(summary.unpaid_count), owed: Number(summary.unpaid_outstanding), dot: "bg-destructive" },
    ];

    const sortedOwing = [...owingOrders].sort((a, b) => (b.order_total - b.paid) - (a.order_total - a.paid));

    return (
        <div className="space-y-2">
            {/* 1. Collections overview for the selected period */}
            <Card className="p-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                    <Wallet className="h-3.5 w-3.5" /> Collections · {PERIOD_LABEL[period]}
                </h3>
                {orderCount > 0 ? (
                    <div className="flex items-center gap-3">
                        <DonutChart
                            size={92}
                            strokeWidth={11}
                            hideLegend
                            center={{ value: `${collectionRate}%`, label: "collected" }}
                            segments={[
                                { value: collected, color: "#047857", label: "Collected", amount: fmtK(collected) },
                                { value: outstanding, color: "#ea580c", label: "Outstanding", amount: fmtK(outstanding) },
                            ]}
                        />
                        <div className="flex-1 text-xs tabular-nums space-y-1">
                            <StatRow label="Orders" value={String(orderCount)} />
                            <StatRow label="Collected" value={fmtK(collected)} dotClass="bg-emerald-600" />
                            <StatRow label="Outstanding" value={fmtK(outstanding)} dotClass="bg-orange-500" />
                            <div className="border-t border-border pt-1">
                                <StatRow label="Billed" value={fmtK(billed)} strong />
                            </div>
                            <StatRow label="Avg order" value={fmtK(avgOrder)} />
                        </div>
                    </div>
                ) : (
                    <p className="text-xs text-muted-foreground text-center py-3">No orders in this period</p>
                )}
                {(Number(summary.work_count) > 0 || Number(summary.sales_count) > 0) && (
                    <div className="mt-2 pt-2 border-t border-border grid grid-cols-2 gap-2 text-xs tabular-nums">
                        <div>
                            <p className="text-muted-foreground">Work · {Number(summary.work_count)}</p>
                            <p className="font-semibold">{fmtK(Number(summary.work_billed))}</p>
                        </div>
                        <div>
                            <p className="text-muted-foreground">Sales · {Number(summary.sales_count)}</p>
                            <p className="font-semibold">{fmtK(Number(summary.sales_billed))}</p>
                        </div>
                    </div>
                )}
            </Card>

            {/* 2. Payment status breakdown — click a row to filter the list */}
            <Card className="p-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5" /> Payment status
                </h3>
                <div className="space-y-1">
                    {statusRows.map((s) => {
                        const isActive = activeFilter === s.key;
                        return (
                            <button
                                key={s.key}
                                type="button"
                                onClick={() => onFilter(s.key)}
                                className={`w-full text-left px-2.5 py-2 rounded-lg border transition-colors ${isActive ? "border-primary bg-primary/5" : "border-transparent hover:bg-accent hover:border-border"}`}
                            >
                                <div className="flex items-center justify-between">
                                    <span className="flex items-center gap-2 text-xs font-medium">
                                        <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                                        {s.label}
                                    </span>
                                    <span className="flex items-center gap-2 tabular-nums">
                                        {s.owed > 0 && <span className="text-[11px] text-destructive">{fmtK(s.owed)}</span>}
                                        <span className="text-xs font-bold">{s.count}</span>
                                    </span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </Card>

            {/* 3. Outstanding worklist — largest balance owed first */}
            <Card className="p-3">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <AlertCircle className="h-3.5 w-3.5" /> Outstanding ({Number(summary.owing_count)})
                    </h3>
                    {outstanding > 0 && (
                        <span className="font-semibold text-base text-destructive tabular-nums">{fmtK(outstanding)}</span>
                    )}
                </div>
                {sortedOwing.length === 0 ? (
                    <div className="text-center py-4">
                        <CheckCircle2 className="h-6 w-6 mx-auto mb-1 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground font-medium">Everything is collected</p>
                    </div>
                ) : (
                    <>
                        <div className="space-y-1">
                            {sortedOwing.slice(0, owingVisible).map((o, i) => {
                                const due = o.order_total - o.paid;
                                const paidPct = o.order_total > 0 ? Math.round((o.paid / o.order_total) * 100) : 0;
                                const ready = o.garment_ready > 0 && o.garment_total > 0;
                                return (
                                    <button key={o.id} type="button" onClick={() => onSelectOrder(String(o.id))}
                                        className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-accent transition-all duration-150 cursor-pointer pointer-coarse:active:scale-[0.99] border border-transparent hover:border-border"
                                        style={i < 8 ? { animation: `cashier-deal 300ms cubic-bezier(0.2, 0, 0, 1) ${i * 40}ms both` } : undefined}>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className="font-semibold text-xs tabular-nums">#{o.id}</span>
                                                <span className="text-xs truncate text-muted-foreground">{o.customer_name || "-"}</span>
                                                {ready && <span className="text-[9px] font-bold uppercase tracking-wide px-1 py-0.5 rounded bg-primary text-primary-foreground shrink-0">Ready</span>}
                                            </div>
                                            <span className="font-semibold text-xs text-destructive tabular-nums shrink-0">{fmtK(due)}</span>
                                        </div>
                                        <div className="flex items-center gap-2 mt-1.5">
                                            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                                                <div className="h-full rounded-full bg-primary origin-left" style={{ width: `${paidPct}%`, animation: "cashier-bar-fill 600ms cubic-bezier(0.2, 0, 0, 1) 200ms both" }} />
                                            </div>
                                            <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 font-medium">
                                                {fmt(o.paid)} / {fmt(o.order_total)}
                                            </span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                        {sortedOwing.length > owingVisible && (
                            <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground mt-1.5"
                                onClick={() => setOwingVisible(v => v + OWING_PAGE_SIZE)}>
                                Show more ({sortedOwing.length - owingVisible} remaining)
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
    // "All Orders" is a lookup surface (the initial-processing queue is the Pending
    // tab), so default to All. Period drives both the list and the stats panel.
    const [dashboardFilter, setDashboardFilter] = useState<CashierFilter>("all");
    const [period, setPeriod] = useState<CashierPeriod>("all");

    const { data: recentResult, isLoading: isLoadingRecent, isFetching: isFetchingRecent } = useRecentCashierOrders(dashboardFilter, period);
    const recentOrders = recentResult?.data || [];
    const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
    useEffect(() => { if (recentResult) setHasLoadedOnce(true); }, [recentResult]);
    const isInitialLoad = !hasLoadedOnce && isLoadingRecent;

    const { data: summaryResult } = useCashierSummary(period);
    const summary: CashierSummary = summaryResult?.data || EMPTY_CASHIER_SUMMARY;

    const { data: listSearchResult, isFetching: isListSearching } = useCashierOrderListSearch(listSearchQuery);
    const searchedOrders = listSearchResult?.data || [];

    // The outstanding worklist tracks every owing order in the period (unpaid +
    // partial), independent of the list's current chip.
    const { data: owingResult } = useRecentCashierOrders("owing", period);
    const owingOrders = (owingResult?.data || []).filter(o => (o.order_total - o.paid) > 0.001);

    const allDisplayOrders = listSearchQuery ? searchedOrders : recentOrders;
    const displayOrders = allDisplayOrders.slice(0, visibleCount);
    const hasMore = allDisplayOrders.length > visibleCount;

    useEffect(() => {
        const val = listSearchInput.trim();
        if (!val) { setListSearchQuery(""); return; }
        const timer = setTimeout(() => setListSearchQuery(val), 400);
        return () => clearTimeout(timer);
    }, [listSearchInput]);

    useEffect(() => { setVisibleCount(PAGE_SIZE); }, [listSearchQuery, dashboardFilter, period]);

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
                    <div className="md:col-span-3 flex flex-col min-h-0 rounded-lg bg-muted/40 border border-border p-2">
                        <div className="relative mb-2 shrink-0">
                            {isListSearching ? (
                                <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary animate-spin" />
                            ) : (
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            )}
                            <Input placeholder="Search by name, phone, or order ID..." value={listSearchInput}
                                onChange={(e) => setListSearchInput(e.target.value)} className="pl-10 h-11 text-sm font-medium border border-border rounded-lg focus-visible:border-primary" />
                            {listSearchInput && (
                                <button type="button" onClick={() => setListSearchInput("")}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                                    <XCircle className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-1.5 mb-2 shrink-0">
                            <div className="flex flex-wrap gap-1.5">
                                {([
                                    { key: "all" as const, label: "All" },
                                    { key: "unpaid" as const, label: `Unpaid (${Number(summary.unpaid_count)})` },
                                    { key: "partial" as const, label: `Partial (${Number(summary.partial_count)})` },
                                    { key: "paid" as const, label: `Paid (${Number(summary.paid_count)})` },
                                ] as const).map((f) => (
                                    <ChipToggle
                                        key={f.key}
                                        active={dashboardFilter === f.key}
                                        onClick={() => setDashboardFilter(dashboardFilter === f.key ? "all" : f.key)}>
                                        {f.label}
                                    </ChipToggle>
                                ))}
                            </div>
                            <Select value={period} onValueChange={(v) => setPeriod(v as CashierPeriod)}>
                                <SelectTrigger className="h-8 w-[140px] text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="today">Today</SelectItem>
                                    <SelectItem value="month">This month</SelectItem>
                                    <SelectItem value="last2">Last 2 months</SelectItem>
                                    <SelectItem value="quarter">This quarter</SelectItem>
                                    <SelectItem value="all">All time</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-center justify-between px-1 mb-1 shrink-0">
                            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                                {isListSearching ? (
                                    <>Searching...</>
                                ) : listSearchQuery ? (
                                    <>{allDisplayOrders.length} result{allDisplayOrders.length !== 1 ? "s" : ""}</>
                                ) : dashboardFilter !== "all" ? (
                                    <>
                                        {{ paid: "Paid", unpaid: "Unpaid", partial: "Partially paid", owing: "Outstanding", work: "Work Orders", sales: "Sales Orders" }[dashboardFilter] || dashboardFilter} ({allDisplayOrders.length})
                                        <button type="button" onClick={() => setDashboardFilter("all")} className="ml-1 text-primary hover:underline">clear</button>
                                    </>
                                ) : (
                                    <><Clock className="h-3 w-3" /> Recent ({recentOrders.length})</>
                                )}
                            </p>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-600 inline-block" />Paid</span>
                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />Due</span>
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

                            {!isListSearching && displayOrders.length > 0 && (
                                <>
                                    <div className="lg:hidden space-y-1">
                                        {displayOrders.map((item, i) => (
                                            <div key={item.id} style={i < 10 ? { animation: `cashier-deal 300ms cubic-bezier(0.2, 0, 0, 1) ${i * 30}ms both` } : undefined}>
                                                <OrderRow item={item} onSelect={onSelectOrder} />
                                            </div>
                                        ))}
                                    </div>
                                    <div className="hidden lg:block">
                                        <OrderTable items={displayOrders} onSelect={onSelectOrder} />
                                    </div>
                                </>
                            )}

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
                        <ReportsPanel
                            summary={summary}
                            period={period}
                            owingOrders={owingOrders}
                            activeFilter={dashboardFilter}
                            onFilter={(f) => setDashboardFilter(dashboardFilter === f ? "all" : f)}
                            onSelectOrder={onSelectOrder}
                        />
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
    // No hard RegisterGate here: handover/collection is ungated on the register
    // session (SPEC §3 — pickup is ungated; only money is gated). The detail is
    // reachable directly (e.g. the showroom "checkout" link) so a customer can
    // collect even when the register is closed/stale. Only the money modes
    // (payment, refund) inside the shell are gated on an open today's session.
    const { ready: canTakeMoney } = useRegisterReady();
    return <OrderDetailShell orderId={orderId} onBack={onBack} canTakeMoney={canTakeMoney} />;
}

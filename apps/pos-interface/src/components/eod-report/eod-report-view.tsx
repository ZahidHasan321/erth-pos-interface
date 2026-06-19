import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@repo/ui/button";
import { Card, CardContent } from "@repo/ui/card";
import { Skeleton } from "@repo/ui/skeleton";
import { Printer, FileText, Loader2, AlertCircle, RefreshCw, ReceiptText } from "lucide-react";
import { useEodReport } from "@/hooks/useCashier";
import { getEodTransactions, getRegisterSession } from "@/api/cashier";
import { EodDateFilter, type DatePreset } from "@/components/eod-report/eod-date-filter";
import { EodKpiCards } from "@/components/eod-report/eod-kpi-cards";
import { EodPaymentChart, EodOrderBreakdown } from "@/components/eod-report/eod-payment-chart";
import { EodTransactionTable } from "@/components/eod-report/eod-transaction-table";
import { RevenueTrendChart, CollectionsVsRefundsChart, CashierLeaderboard } from "@/components/eod-report/eod-charts";
import { EodCashDrawer } from "@/components/eod-report/eod-cash-drawer";
import { EodSalesSummary } from "@/components/eod-report/eod-sales-summary";

function toDateStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getPresetDates(preset: DatePreset): { from: Date; to: Date } {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (preset) {
        case "yesterday": {
            const d = new Date(today);
            d.setDate(d.getDate() - 1);
            return { from: d, to: d };
        }
        case "this_week": {
            const d = new Date(today);
            const day = d.getDay();
            d.setDate(d.getDate() - day);
            return { from: d, to: today };
        }
        case "this_month": {
            const d = new Date(today.getFullYear(), today.getMonth(), 1);
            return { from: d, to: today };
        }
        case "all_time": {
            return { from: new Date(2020, 0, 1), to: today };
        }
        case "today":
        default:
            return { from: today, to: today };
    }
}

export function EodReportView({ hideCashReconciliation = false }: { hideCashReconciliation?: boolean } = {}) {
    const [preset, setPreset] = useState<DatePreset>("today");
    const [dateFrom, setDateFrom] = useState<Date>(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    });
    const [dateTo, setDateTo] = useState<Date>(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    });
    const [printLoading, setPrintLoading] = useState(false);

    const dateFromStr = toDateStr(dateFrom);
    const dateToStr = toDateStr(dateTo);
    const isMultiDay = dateFromStr !== dateToStr;

    const { data: reportRes, isLoading: reportLoading, isError: reportError, refetch: reportRefetch } = useEodReport(dateFromStr, dateToStr);
    const summary = reportRes?.data;

    function handlePresetChange(p: DatePreset) {
        setPreset(p);
        const { from, to } = getPresetDates(p);
        setDateFrom(from);
        setDateTo(to);
    }

    function handleDateFromChange(d: Date) {
        setPreset("custom");
        setDateFrom(d);
        if (d > dateTo) setDateTo(d);
    }

    function handleDateToChange(d: Date) {
        setPreset("custom");
        setDateTo(d);
        if (d < dateFrom) setDateFrom(d);
    }

    const fetchAndGenerate = useCallback(async (action: "view" | "print") => {
        if (!summary) return;
        setPrintLoading(true);
        try {
            const [txRes, sessionRes, printMod] = await Promise.all([
                getEodTransactions(dateFromStr, dateToStr),
                isMultiDay ? Promise.resolve({ data: null }) : getRegisterSession(undefined, dateFromStr),
                import("@/components/eod-report/eod-print-view"),
            ]);
            const params = {
                summary,
                transactions: txRes.data,
                dateFrom: dateFromStr,
                dateTo: dateToStr,
                registerSession: sessionRes.data,
                hideCashReconciliation,
            };
            if (action === "view") await printMod.viewEodReport(params);
            else await printMod.printEodReport(params);
        } catch (err) {
            toast.error(`Could not ${action} end-of-day report: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setPrintLoading(false);
        }
    }, [summary, dateFromStr, dateToStr, isMultiDay, hideCashReconciliation]);

    return (
        <div className="p-4 sm:p-6 max-w-[1600px] mx-auto pb-10 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-semibold tracking-tight">End of day report</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Financial summary and transaction history
                        {summary && !isMultiDay && summary.invoice_first !== null && summary.invoice_last !== null && (
                            <span className="ml-2 text-xs">
                                · Invoices #{summary.invoice_first}
                                {summary.invoice_last !== summary.invoice_first ? `–#${summary.invoice_last}` : ""}
                            </span>
                        )}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={() => fetchAndGenerate("view")}
                        disabled={!summary || reportLoading || printLoading}
                    >
                        {printLoading ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <FileText className="h-5 w-5 mr-2" />}
                        View Report
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => fetchAndGenerate("print")}
                        disabled={!summary || reportLoading || printLoading}
                    >
                        {printLoading ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Printer className="h-5 w-5 mr-2" />}
                        Print
                    </Button>
                </div>
            </div>

            <EodDateFilter
                preset={preset}
                dateFrom={dateFrom}
                dateTo={dateTo}
                onPresetChange={handlePresetChange}
                onDateFromChange={handleDateFromChange}
                onDateToChange={handleDateToChange}
            />

            {reportError ? (
                <Card className="shadow-none">
                    <CardContent className="py-10 text-center">
                        <AlertCircle className="h-8 w-8 mx-auto mb-3 text-destructive" />
                        <p className="font-medium text-sm">Could not load end-of-day report</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            The report RPC failed for {dateFromStr}
                            {isMultiDay ? ` – ${dateToStr}` : ""}. Retry, or check the browser console for details.
                        </p>
                        <Button variant="outline" size="sm" onClick={() => reportRefetch()} className="mt-4">
                            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                            Retry
                        </Button>
                    </CardContent>
                </Card>
            ) : reportLoading ? (
                <div className="space-y-6">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        {[...Array(4)].map((_, i) => (
                            <Skeleton key={i} className="h-24 rounded-lg" />
                        ))}
                    </div>
                    <Skeleton className="h-56 rounded-lg" />
                    <Skeleton className="h-64 rounded-lg" />
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                        <Skeleton className="h-72 rounded-lg lg:col-span-3" />
                        <Skeleton className="h-72 rounded-lg lg:col-span-2" />
                    </div>
                </div>
            ) : summary && summary.transaction_count === 0 && summary.order_count === 0 ? (
                <Card className="shadow-none">
                    <CardContent className="py-14 text-center text-muted-foreground">
                        <ReceiptText className="h-8 w-8 mx-auto mb-3 opacity-40" />
                        <p className="text-sm font-medium">No transactions in this period</p>
                        <p className="text-xs mt-1">
                            Nothing was collected, refunded, or booked between {dateFromStr}
                            {isMultiDay ? ` and ${dateToStr}` : ""}.
                        </p>
                    </CardContent>
                </Card>
            ) : summary ? (
                <div className="space-y-6">
                    <EodKpiCards data={summary} />

                    {!isMultiDay && (
                        <EodCashDrawer date={dateFromStr} report={summary} hideReconciliation={hideCashReconciliation} />
                    )}

                    <EodSalesSummary data={summary} />

                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                        <div className="lg:col-span-3">
                            <EodPaymentChart data={summary} />
                        </div>
                        <div className="lg:col-span-2">
                            <EodOrderBreakdown data={summary} />
                        </div>
                    </div>

                    {isMultiDay && summary.daily.length >= 2 && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <RevenueTrendChart data={summary.daily} />
                            <CollectionsVsRefundsChart data={summary.daily} />
                        </div>
                    )}

                    {summary.by_cashier.length > 0 && (
                        <CashierLeaderboard data={summary.by_cashier} />
                    )}

                    <EodTransactionTable
                        dateFrom={dateFromStr}
                        dateTo={dateToStr}
                        showDate={isMultiDay}
                    />
                </div>
            ) : null}
        </div>
    );
}

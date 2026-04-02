import { useState, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@repo/ui/button";
import { Skeleton } from "@repo/ui/skeleton";
import { Printer, FileText, Loader2 } from "lucide-react";
import { useEodReport } from "@/hooks/useCashier";
import { getEodTransactions } from "@/api/cashier";
import { EodDateFilter, type DatePreset } from "@/components/eod-report/eod-date-filter";
import { EodKpiCards } from "@/components/eod-report/eod-kpi-cards";
import { EodPaymentChart, EodOrderBreakdown } from "@/components/eod-report/eod-payment-chart";
import { EodTransactionTable } from "@/components/eod-report/eod-transaction-table";
import { RevenueTrendChart, CollectionsVsRefundsChart, CashierLeaderboard } from "@/components/eod-report/eod-charts";
import { printEodReport, viewEodReport } from "@/components/eod-report/eod-print-view";

export const Route = createFileRoute("/$main/store/end-of-day-report")({
    component: EndOfDayReport,
    head: () => ({
        meta: [{ title: "End of Day Report" }],
    }),
});

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

function EndOfDayReport() {
    const [preset, setPreset] = useState<DatePreset>("this_month");
    const [dateFrom, setDateFrom] = useState<Date>(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1);
    });
    const [dateTo, setDateTo] = useState<Date>(() => new Date());
    const [printLoading, setPrintLoading] = useState(false);

    const dateFromStr = toDateStr(dateFrom);
    const dateToStr = toDateStr(dateTo);
    const isMultiDay = dateFromStr !== dateToStr;

    const { data: reportRes, isLoading: reportLoading } = useEodReport(dateFromStr, dateToStr);
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

    // Fetch all transactions on-demand for print/PDF (not on page load)
    const fetchAndGenerate = useCallback(async (action: "view" | "print") => {
        if (!summary) return;
        setPrintLoading(true);
        try {
            const txRes = await getEodTransactions(dateFromStr, dateToStr);
            const params = { summary, transactions: txRes.data, dateFrom: dateFromStr, dateTo: dateToStr };
            if (action === "view") await viewEodReport(params);
            else await printEodReport(params);
        } finally {
            setPrintLoading(false);
        }
    }, [summary, dateFromStr, dateToStr]);

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold font-[Marcellus]">End of Day Report</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Financial summary and transaction history
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

            {/* Date Filter */}
            <EodDateFilter
                preset={preset}
                dateFrom={dateFrom}
                dateTo={dateTo}
                onPresetChange={handlePresetChange}
                onDateFromChange={handleDateFromChange}
                onDateToChange={handleDateToChange}
            />

            {/* Content */}
            {reportLoading ? (
                <div className="space-y-6">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        {[...Array(4)].map((_, i) => (
                            <Skeleton key={i} className="h-28 rounded-lg" />
                        ))}
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                        <Skeleton className="h-80 rounded-lg lg:col-span-3" />
                        <Skeleton className="h-80 rounded-lg lg:col-span-2" />
                    </div>
                    <Skeleton className="h-72 rounded-lg" />
                    <Skeleton className="h-64 rounded-lg" />
                </div>
            ) : summary ? (
                <div className="space-y-6">
                    {/* KPI Cards */}
                    <EodKpiCards data={summary} />

                    {/* Payment Methods + Order Breakdown */}
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                        <div className="lg:col-span-3">
                            <EodPaymentChart data={summary} />
                        </div>
                        <div className="lg:col-span-2">
                            <EodOrderBreakdown data={summary} />
                        </div>
                    </div>

                    {/* Trend Charts (only for multi-day ranges) */}
                    {isMultiDay && summary.daily.length >= 2 && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <RevenueTrendChart data={summary.daily} />
                            <CollectionsVsRefundsChart data={summary.daily} />
                        </div>
                    )}

                    {/* Cashier Leaderboard */}
                    {summary.by_cashier.length > 0 && (
                        <CashierLeaderboard data={summary.by_cashier} />
                    )}

                    {/* Transaction Table */}
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

import { createFileRoute } from "@tanstack/react-router";
import { EodReportView } from "@/components/eod-report/eod-report-view";

// Cashier shell: hide expected cash + variance (blind count, SPEC §3).
// Managers see the full reconciliation in Store > End of Day.
function CashierEodReport() {
    return <EodReportView hideCashReconciliation />;
}

export const Route = createFileRoute("/cashier/eod")({
    component: CashierEodReport,
    head: () => ({
        meta: [{ title: "End of Day Report" }],
    }),
});

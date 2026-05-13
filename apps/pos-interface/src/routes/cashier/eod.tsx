import { createFileRoute } from "@tanstack/react-router";
import { EodReportView } from "@/components/eod-report/eod-report-view";

export const Route = createFileRoute("/cashier/eod")({
    component: EodReportView,
    head: () => ({
        meta: [{ title: "End of Day Report" }],
    }),
});

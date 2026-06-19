import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PendingQueueBody } from "@/components/cashier/pending-queue";

// §3: the cashier main page is the Pending queue — confirmed WORK orders
// awaiting cashier processing. The full filtered list (all order types, for
// follow-up payment/handover/refund) lives on the "All Orders" tab.
export const Route = createFileRoute("/cashier/")({
    component: CashierPendingPage,
});

function CashierPendingPage() {
    const navigate = useNavigate();
    return (
        <PendingQueueBody
            onProceedToPayment={(ids) =>
                navigate({ to: "/cashier/process", search: { ids: ids.join(",") } })
            }
        />
    );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PendingQueueBody } from "@/components/cashier/pending-queue";

// §3 Pending queue — the cashier landing inside the shop shell. Brand gating
// lives on the parent layout route (route.tsx).
export const Route = createFileRoute("/$main/cashier/")({
    component: CashierPendingPage,
    head: () => ({
        meta: [{ title: "Cashier" }],
    }),
});

function CashierPendingPage() {
    const navigate = useNavigate();
    const { main } = Route.useParams();
    return (
        <PendingQueueBody
            onProceedToPayment={(ids) =>
                navigate({
                    to: "/$main/cashier/process",
                    params: { main },
                    search: { ids: ids.join(",") },
                })
            }
        />
    );
}

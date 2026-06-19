import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RegisterGate } from "@/components/cashier/register-gate";
import { BulkPaymentPanel } from "@/components/cashier/bulk-payment-panel";

// §3 bulk-payment page (shop-shell copy of /cashier/process). Payment requires
// an open register (money gate), so it is wrapped in RegisterGate. The selected
// order ids arrive as a comma-joined search param from the Pending queue.
export const Route = createFileRoute("/$main/cashier/process")({
    validateSearch: (search: Record<string, unknown>): { ids: string } => ({
        ids: typeof search.ids === "string" ? search.ids : "",
    }),
    component: CashierBulkPaymentPage,
});

function CashierBulkPaymentPage() {
    const navigate = useNavigate();
    const { main } = Route.useParams();
    const { ids } = Route.useSearch();
    const orderIds = ids
        .split(",")
        .map((s: string) => Number(s.trim()))
        .filter((n: number) => Number.isInteger(n) && n > 0);

    return (
        <RegisterGate>
            <BulkPaymentPanel
                orderIds={orderIds}
                onClose={() => navigate({ to: "/$main/cashier", params: { main } })}
            />
        </RegisterGate>
    );
}

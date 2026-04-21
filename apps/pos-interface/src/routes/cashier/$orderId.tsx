import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CashierOrderDetailBody } from "@/components/cashier/cashier-terminal";

export const Route = createFileRoute("/cashier/$orderId")({
    component: CashierStandaloneDetailPage,
});

function CashierStandaloneDetailPage() {
    const navigate = useNavigate();
    const { orderId } = Route.useParams();
    return (
        <CashierOrderDetailBody
            orderId={orderId}
            onBack={() => navigate({ to: "/cashier" })}
        />
    );
}

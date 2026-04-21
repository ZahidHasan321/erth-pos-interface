import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CashierListBody } from "@/components/cashier/cashier-terminal";

export const Route = createFileRoute("/cashier/")({
    component: CashierStandaloneListPage,
});

function CashierStandaloneListPage() {
    const navigate = useNavigate();
    return (
        <CashierListBody
            onSelectOrder={(id) => navigate({ to: "/cashier/$orderId", params: { orderId: id } })}
        />
    );
}

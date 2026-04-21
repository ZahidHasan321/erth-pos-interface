import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { CashierOrderDetailBody } from "@/components/cashier/cashier-terminal";
import { BRAND_NAMES } from "@/lib/constants";

export const Route = createFileRoute("/$main/cashier/$orderId")({
    beforeLoad: ({ params }) => {
        if (params.main !== BRAND_NAMES.showroom) {
            throw redirect({ to: "/$main", params: { main: params.main } });
        }
    },
    component: CashierOrderDetailPage,
    head: () => ({
        meta: [{ title: "Cashier — Order" }],
    }),
});

function CashierOrderDetailPage() {
    const navigate = useNavigate();
    const { main, orderId } = Route.useParams();
    return (
        <CashierOrderDetailBody
            orderId={orderId}
            onBack={() => navigate({ to: "/$main/cashier", params: { main } })}
        />
    );
}

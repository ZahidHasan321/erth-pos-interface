import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { CashierListBody } from "@/components/cashier/cashier-terminal";
import { BRAND_NAMES } from "@/lib/constants";

export const Route = createFileRoute("/$main/cashier/")({
    beforeLoad: ({ params }) => {
        if (params.main !== BRAND_NAMES.showroom) {
            throw redirect({ to: "/$main", params: { main: params.main } });
        }
    },
    component: CashierListPage,
    head: () => ({
        meta: [{ title: "Cashier" }],
    }),
});

function CashierListPage() {
    const navigate = useNavigate();
    const { main } = Route.useParams();
    return (
        <CashierListBody
            onSelectOrder={(id) => navigate({ to: "/$main/cashier/$orderId", params: { main, orderId: id } })}
        />
    );
}

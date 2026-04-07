import { createFileRoute, redirect } from "@tanstack/react-router";
import { CashierBody } from "@/components/cashier/cashier-terminal";
import { BRAND_NAMES } from "@/lib/constants";

export const Route = createFileRoute("/$main/cashier")({
    beforeLoad: ({ params }) => {
        if (params.main !== BRAND_NAMES.showroom) {
            throw redirect({ to: "/$main", params: { main: params.main } });
        }
    },
    component: CashierPage,
    head: () => ({
        meta: [{ title: "Cashier" }],
    }),
});

function CashierPage() {
    return <CashierBody />;
}

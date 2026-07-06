import LinkOrder from "@/components/order-management/link-order";
import { createFileRoute } from "@tanstack/react-router";

// Optional preselection handed off from another surface (e.g. the cashier
// family-link nudge, §3): `orders` = comma-separated order ids, `primary` = the
// id to crown. Parsed defensively; bad values are dropped.
type LinkSearch = { orders?: number[]; primary?: number };

function parseIds(raw: unknown): number[] | undefined {
  const parts =
    typeof raw === "string"
      ? raw.split(",")
      : Array.isArray(raw)
        ? raw.map(String)
        : [];
  const ids = parts
    .map((s) => Number(String(s).trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  return ids.length > 0 ? ids : undefined;
}

export const Route = createFileRoute("/$main/orders/order-management/link")({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): LinkSearch => {
    const orders = parseIds(search.orders);
    const primaryNum = Number(search.primary);
    const primary =
      Number.isFinite(primaryNum) && primaryNum > 0 ? primaryNum : undefined;
    return { orders, primary };
  },
  head: () => ({
    meta: [
      {
        title: "Link Orders",
      },
    ],
  }),
});

function RouteComponent() {
  const { orders, primary } = Route.useSearch();
  return <LinkOrder initialOrderIds={orders} initialPrimaryId={primary} />;
}

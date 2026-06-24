import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search, Inbox, PackageCheck } from "lucide-react";
import { Button } from "@repo/ui/button";
import { Input } from "@repo/ui/input";
import { Badge } from "@repo/ui/badge";
import { Skeleton } from "@repo/ui/skeleton";
import { ConfirmationDialog } from "@repo/ui/confirmation-dialog";
import { toLocalDateStr, parseUtcTimestamp, TIMEZONE } from "@/lib/utils";
import { useDeliveryOrders, useDeliverOrderMutation } from "@/hooks/useDelivery";
import type { DeliveryOrder, DeliveryStatus } from "@/api/delivery";

// Home-based brand (SAKKBA/QASS) delivery handover (SPEC §1/§5) — the
// home-visit equivalent of ERTH's cashier handover. A normal brand-scoped
// /$main page; auth + brand gating live on the parent /$main route guard.
export const Route = createFileRoute("/$main/delivery/")({
    component: DeliveryPage,
    head: () => ({
        meta: [{ title: "Delivery" }],
    }),
});

const fmtK = (n: number): string => `${Number(Number(n).toFixed(3))} KWD`;

function fmtDateTime(value: string | null): string | null {
    if (!value) return null;
    const d = parseUtcTimestamp(value);
    return isNaN(d.getTime())
        ? null
        : d.toLocaleString("en-GB", {
              timeZone: TIMEZONE,
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
          });
}

function DeliveryPage() {
    const [tab, setTab] = useState<DeliveryStatus>("ready");
    const [search, setSearch] = useState("");
    const [toDeliver, setToDeliver] = useState<DeliveryOrder | null>(null);

    const { data: result, isLoading } = useDeliveryOrders(tab);
    const deliverMutation = useDeliverOrderMutation();

    const orders = useMemo(() => result?.data ?? [], [result]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return orders;
        return orders.filter((o) =>
            (o.customer_name ?? "").toLowerCase().includes(q) ||
            (o.customer_phone ?? "").toLowerCase().includes(q) ||
            String(o.order_id).includes(q) ||
            String(o.invoice_number ?? "").includes(q),
        );
    }, [orders, search]);

    const handleDeliver = () => {
        if (!toDeliver) return;
        deliverMutation.mutate(toDeliver.order_id, {
            onSuccess: (res) => {
                if (res.status === "success") setToDeliver(null);
            },
        });
    };

    return (
        <div className="relative h-full flex flex-col">
            <div className="px-4 py-3 border-b bg-card shrink-0">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h1 className="text-base font-bold">Delivery</h1>
                        <p className="text-xs text-muted-foreground">
                            Hand completed orders over to the customer
                        </p>
                    </div>
                    <Badge variant="secondary" className="text-sm">
                        {orders.length}{" "}
                        {tab === "ready" ? "ready" : "delivered"}
                    </Badge>
                </div>

                <div className="mt-3 flex items-center gap-1 rounded-lg bg-muted p-1 w-fit">
                    <TabButton active={tab === "ready"} onClick={() => setTab("ready")}>
                        Ready for Delivery
                    </TabButton>
                    <TabButton active={tab === "delivered"} onClick={() => setTab("delivered")}>
                        Delivered
                    </TabButton>
                </div>

                <div className="relative mt-3">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by name, phone, or order number"
                        className="pl-8 h-9 text-sm"
                    />
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-auto p-4">
                {isLoading ? (
                    <div className="space-y-2">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <Skeleton key={i} className="h-16 w-full" />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground py-16">
                        <Inbox className="h-10 w-10 mb-3 opacity-40" />
                        <p className="text-sm font-medium">
                            {orders.length === 0
                                ? tab === "ready"
                                    ? "No orders ready for delivery"
                                    : "No delivered orders yet"
                                : "No orders match your search"}
                        </p>
                        <p className="text-xs mt-1">
                            {tab === "ready"
                                ? "Orders with all garments back at the shop show up here."
                                : "Orders handed over to the customer show up here."}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {filtered.map((o) => (
                            <DeliveryRow
                                key={o.order_id}
                                order={o}
                                tab={tab}
                                onDeliver={() => setToDeliver(o)}
                                disabled={deliverMutation.isPending}
                            />
                        ))}
                    </div>
                )}
            </div>

            <ConfirmationDialog
                isOpen={toDeliver !== null}
                onClose={() => setToDeliver(null)}
                onConfirm={handleDeliver}
                title="Deliver order"
                description="Deliver the whole order to the customer? Every garment will be marked as delivered. This cannot be undone."
                confirmText="Deliver order"
                cancelText="Cancel"
            />
        </div>
    );
}

function TabButton({
    active,
    onClick,
    children,
}: {
    active: boolean;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
            }`}
        >
            {children}
        </button>
    );
}

function DeliveryRow({
    order,
    tab,
    onDeliver,
    disabled,
}: {
    order: DeliveryOrder;
    tab: DeliveryStatus;
    onDeliver: () => void;
    disabled: boolean;
}) {
    const delivery = toLocalDateStr(order.delivery_date);
    const deliveredAt = fmtDateTime(order.last_delivered_at);
    const balance = Number(order.order_total) - Number(order.paid);

    return (
        <div className="flex items-center gap-3 rounded-lg border-2 border-border p-3 transition-colors hover:bg-muted/40">
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">
                        #{order.invoice_number ?? order.order_id}
                    </span>
                    <span className="text-sm truncate">{order.customer_name ?? "Unknown"}</span>
                </div>
                <div className="text-xs text-muted-foreground truncate">
                    {order.customer_phone ?? ""}
                    {tab === "ready" && (
                        <> · All {order.active_garments} garment{order.active_garments === 1 ? "" : "s"} ready</>
                    )}
                    {tab === "ready" && delivery && <> · due {delivery}</>}
                    {tab === "delivered" && deliveredAt && <> · delivered {deliveredAt}</>}
                </div>
            </div>
            <div className="text-right shrink-0">
                <div className="text-sm font-semibold tabular-nums">{fmtK(order.order_total)}</div>
                <div className="text-xs text-muted-foreground tabular-nums">
                    {balance > 0 ? `paid ${fmtK(order.paid)}` : "paid in full"}
                </div>
            </div>
            {tab === "ready" && (
                <Button size="sm" onClick={onDeliver} disabled={disabled} className="shrink-0">
                    <PackageCheck className="h-4 w-4 mr-1.5" />
                    Deliver order
                </Button>
            )}
        </div>
    );
}

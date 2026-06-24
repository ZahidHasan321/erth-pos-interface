"use client";

import { updateOrder, getLinkedOrders } from "@/api/orders";
import { pickedDayKuwaitMidnight } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";

import {
    Unlink,
    RefreshCw,
    Search,
    ExternalLink,
    Layers,
} from "lucide-react";

import { Button } from "@repo/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@repo/ui/dialog";
import { Label } from "@repo/ui/label";
import { DatePicker } from "@repo/ui/date-picker";
import { DialogSuccess } from "@repo/ui/dialog-success";
import { Input } from "@repo/ui/input";
import { toast } from "sonner";

import { ORDER_PHASE_LABELS } from "@/lib/constants";
import {
    OrderCardShell,
    TabEmptyState,
    TabLoading,
} from "./_shared";

import type { Order } from "@repo/database";

type PrimaryDetails = {
    invoice_number?: number | null;
    delivery_date?: string | Date | null;
    order_phase?: string | null;
    customer?: { name?: string; phone?: string } | Array<{ name?: string; phone?: string }> | null;
    [key: string]: unknown;
};

type LinkedOrder = Order & { linkedTo?: PrimaryDetails };

type LinkGroup = {
    primaryId: number;
    children: Order[];
    primaryDetails?: PrimaryDetails;
};

export default function UnlinkOrder() {
    const queryClient = useQueryClient();

    const [searchQuery, setSearchQuery] = useState("");
    const [orderToUnlink, setOrderToUnlink] = useState<Order | null>(null);
    const [reviseDate, setReviseDate] = useState<Date | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);

    const { data: linkedOrdersRes, isLoading } = useQuery({
        queryKey: ["linked-orders"],
        queryFn: getLinkedOrders,
    });

    const linkedOrders = linkedOrdersRes?.data ?? [];

    const linkGroups: LinkGroup[] = useMemo(() => {
        const groups: Record<number, LinkGroup> = {};

        (linkedOrders as LinkedOrder[]).forEach((order) => {
            const pId = order.linked_order_id;
            if (!pId) return;
            if (!groups[pId]) {
                groups[pId] = {
                    primaryId: pId,
                    children: [],
                    primaryDetails: order.linkedTo
                        ? {
                              ...order.linkedTo,
                          }
                        : undefined,
                };
            }
            groups[pId].children.push(order);
        });

        const all = Object.values(groups);
        if (!searchQuery) return all;
        const q = searchQuery.toLowerCase();
        return all.filter((g) => {
            const cust = getCustomer(g.primaryDetails);
            return (
                g.primaryId.toString().includes(q) ||
                g.primaryDetails?.invoice_number?.toString().includes(q) ||
                cust?.name?.toLowerCase().includes(q) ||
                g.children.some(
                    (c) =>
                        c.id.toString().includes(q) ||
                        c.invoice_number?.toString().includes(q) ||
                        c.customer?.name?.toLowerCase().includes(q),
                )
            );
        });
    }, [linkedOrders, searchQuery]);

    async function handleUnlinkConfirm() {
        if (!orderToUnlink || !reviseDate) return;
        setIsSubmitting(true);
        try {
            await updateOrder(
                {
                    linked_order_id: null,
                    unlinked_date: new Date(),
                    delivery_date: pickedDayKuwaitMidnight(reviseDate),
                } as Partial<Order>,
                orderToUnlink.id,
            );
            queryClient.invalidateQueries({ queryKey: ["linked-orders"] });
            setShowSuccess(true);
        } catch (err) {
            toast.error(
                `unlinkOrder: could not unlink order #${orderToUnlink.id}: ${err instanceof Error ? err.message : String(err)}`,
            );
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div className="p-4 md:p-5 max-w-6xl mx-auto space-y-5">
            <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 border-b border-border pb-5">
                <div className="space-y-1">
                    <h1 className="text-xl font-semibold text-foreground">Unlink orders</h1>
                    <p className="text-sm text-muted-foreground">
                        Disconnect grouped orders from their primary
                    </p>
                </div>
                <div className="relative w-full md:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                        placeholder="Search order, invoice, customer…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 h-9 text-sm"
                    />
                </div>
            </div>

            {isLoading ? (
                <TabLoading count={3} />
            ) : linkGroups.length === 0 ? (
                <TabEmptyState
                    icon={Layers}
                    title={searchQuery ? "No matches" : "No linked groups"}
                    subtitle={
                        searchQuery
                            ? "No groups match the current search"
                            : "There are currently no orders linked"
                    }
                />
            ) : (
                <div className="space-y-3">
                    {linkGroups.map((group) => (
                        <LinkGroupCard
                            key={group.primaryId}
                            group={group}
                            onUnlink={(order) => setOrderToUnlink(order)}
                        />
                    ))}
                </div>
            )}

            <Dialog
                open={!!orderToUnlink}
                onOpenChange={(open) => {
                    if (!open) {
                        setOrderToUnlink(null);
                        setShowSuccess(false);
                        setReviseDate(null);
                    }
                }}
            >
                <DialogContent className="max-w-md" showCloseButton={!showSuccess}>
                    {showSuccess ? (
                        <DialogSuccess
                            message="Order unlinked"
                            onDone={() => {
                                setOrderToUnlink(null);
                                setShowSuccess(false);
                                setReviseDate(null);
                            }}
                        />
                    ) : (
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2 text-base font-semibold">
                                    <Unlink className="w-4 h-4 text-destructive" />
                                    Unlink order
                                </DialogTitle>
                            </DialogHeader>

                            <div className="py-4 space-y-4">
                                <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2.5">
                                    <p className="text-sm text-destructive">
                                        Disconnecting <span className="font-medium">#{orderToUnlink?.id}</span> from
                                        its primary group will make it an independent order.
                                    </p>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-sm font-medium text-foreground">
                                        New delivery date
                                    </Label>
                                    <DatePicker
                                        value={reviseDate || undefined}
                                        onChange={(date) => setReviseDate(date || null)}
                                        className="w-full"
                                        placeholder="Select an independent delivery date"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Required so the workshop can re-schedule this order.
                                    </p>
                                </div>
                            </div>

                            <DialogFooter>
                                <Button variant="ghost" size="sm" onClick={() => setOrderToUnlink(null)}>
                                    Cancel
                                </Button>
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    disabled={!reviseDate || isSubmitting}
                                    onClick={handleUnlinkConfirm}
                                >
                                    {isSubmitting ? (
                                        <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
                                    ) : (
                                        <Unlink className="w-3.5 h-3.5 mr-1.5" />
                                    )}
                                    Confirm unlink
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

function getCustomer(obj: PrimaryDetails | Order | undefined): { name?: string; phone?: string } | undefined {
    if (!obj) return undefined;
    const cust = Array.isArray(obj.customer) ? obj.customer[0] : obj.customer;
    return (cust as { name?: string; phone?: string } | null | undefined) ?? undefined;
}

function LinkGroupCard({
    group,
    onUnlink,
}: {
    group: LinkGroup;
    onUnlink: (order: Order) => void;
}) {
    const primary = group.primaryDetails;
    const cust = getCustomer(primary) || getCustomer(group.children[0]);
    const phase = primary?.order_phase as keyof typeof ORDER_PHASE_LABELS | undefined;

    return (
        <OrderCardShell
            orderId={group.primaryId}
            invoiceNumber={primary?.invoice_number}
            customerName={cust?.name}
            customerPhone={cust?.phone}
            orderDate={primary?.delivery_date}
            collapsible
            rightBadges={
                <span className="text-sm text-muted-foreground">
                    {group.children.length} linked
                    {phase ? ` · ${ORDER_PHASE_LABELS[phase]}` : ""}
                </span>
            }
        >
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b bg-muted/20">
                        <th className="text-left py-2.5 px-4">Order</th>
                        <th className="text-left py-2.5 px-4">Customer</th>
                        <th className="text-left py-2.5 px-4">Phase</th>
                        <th className="text-right py-2.5 px-4">Action</th>
                    </tr>
                </thead>
                <tbody>
                    {group.children.map((child) => {
                        const childCust = getCustomer(child);
                        const childPhase = child.order_phase as
                            | keyof typeof ORDER_PHASE_LABELS
                            | undefined;
                        return (
                            <tr
                                key={child.id}
                                className="border-b border-border/30 last:border-b-0 hover:bg-muted/20"
                            >
                                <td className="py-2.5 px-4 whitespace-nowrap">
                                    <div className="text-sm font-medium">#{child.id}</div>
                                    {child.invoice_number != null && (
                                        <div className="text-xs text-muted-foreground">
                                            INV {child.invoice_number}
                                        </div>
                                    )}
                                </td>
                                <td className="py-2.5 px-4">
                                    <div className="text-sm">{childCust?.name ?? "Unknown"}</div>
                                    {childCust?.phone && (
                                        <div className="text-xs text-muted-foreground">
                                            {childCust.phone}
                                        </div>
                                    )}
                                </td>
                                <td className="py-2.5 px-4 whitespace-nowrap">
                                    <span className="text-sm text-muted-foreground">
                                        {childPhase ? ORDER_PHASE_LABELS[childPhase] : "-"}
                                    </span>
                                </td>
                                <td className="py-2.5 px-4 text-right whitespace-nowrap">
                                    <div className="inline-flex gap-1">
                                        <Button variant="ghost" size="sm" className="h-8" asChild>
                                            <Link
                                                to={
                                                    child.order_type === "SALES"
                                                        ? "/$main/orders/new-sales-order"
                                                        : "/$main/orders/new-work-order"
                                                }
                                                search={{ orderId: child.id }}
                                            >
                                                <ExternalLink className="w-3 h-3 mr-1.5" />
                                                View
                                            </Link>
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                            onClick={() => onUnlink(child)}
                                        >
                                            <Unlink className="w-3 h-3 mr-1.5" />
                                            Unlink
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </OrderCardShell>
    );
}

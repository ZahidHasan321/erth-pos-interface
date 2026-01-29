"use client";

import {
    updateOrder,
    getLinkedOrders,
} from "@/api/orders";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { format } from "date-fns";
import {
    Unlink,
    User,
    Phone,
    Package,
    Clock,
    RefreshCw,
    ChevronDown,
    Search,
    ExternalLink,
    Layers
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

// UI Components
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "../ui/dialog";
import { Label } from "../ui/label";
import { toast } from "sonner";
import { DatePicker } from "../ui/date-picker";
import { cn } from "@/lib/utils";
import { Input } from "../ui/input";

import type { Order } from "@repo/database";

export default function UnlinkOrder() {
    const queryClient = useQueryClient();

    // Search/Filter State
    const [searchQuery, setSearchQuery] = useState("");

    // Data Fetching
    const { data: linkedOrdersRes, isLoading } = useQuery({
        queryKey: ["linked-orders"],
        queryFn: getLinkedOrders,
    });

    const linkedOrders = linkedOrdersRes?.data || [];

    // Grouping Logic
    const linkGroups = useMemo(() => {
        const groups: Record<number, { primaryId: number; children: Order[]; primaryDetails?: any }> = {};

        linkedOrders.forEach((order: any) => {
            const pId = order.linked_order_id;
            if (pId) {
                if (!groups[pId]) {
                    groups[pId] = {
                        primaryId: pId,
                        children: [],
                        primaryDetails: order.linkedTo ? {
                            ...order.linkedTo,
                            ... (Array.isArray(order.linkedTo.workOrder) ? order.linkedTo.workOrder[0] : order.linkedTo.workOrder)
                        } : undefined
                    };
                }
                groups[pId].children.push(order);
            }
        });

        // Filter by search query (Invoice or ID or Customer Name)
        return Object.values(groups).filter(group => {
            if (!searchQuery) return true;
            const q = searchQuery.toLowerCase();
            const matchesPrimaryId = group.primaryId.toString().includes(q);
            const matchesPrimaryInvoice = group.primaryDetails?.invoice_number?.toString().includes(q);
            const matchesPrimaryCustomer = group.primaryDetails?.customer?.name.toLowerCase().includes(q);
            const matchesChild = group.children.some(c =>
                c.id.toString().includes(q) ||
                c.invoice_number?.toString().includes(q) ||
                c.customer?.name.toLowerCase().includes(q)
            );
            return matchesPrimaryId || matchesPrimaryInvoice || matchesPrimaryCustomer || matchesChild;
        });
    }, [linkedOrders, searchQuery]);

    // Global State for unlinking action
    const [orderToUnlink, setOrderToUnlink] = useState<Order | null>(null);
    const [reviseDate, setReviseDate] = useState<Date | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Unlink Handler
    async function handleUnlinkConfirm() {
        if (!orderToUnlink || !reviseDate) return;

        setIsSubmitting(true);
        try {
            const updateData: any = {
                linked_order_id: null,
                unlinked_date: new Date().toISOString(),
                delivery_date: reviseDate.toISOString(),
            };

            await updateOrder(updateData, orderToUnlink.id);

            toast.success(`Order #${orderToUnlink.id} unlinked successfully!`);
            queryClient.invalidateQueries({ queryKey: ["linked-orders"] });
            setOrderToUnlink(null);
            setReviseDate(null);
        } catch (error) {
            console.error("Unlink failed", error);
            toast.error("Failed to unlink order.");
        } finally {
            setIsSubmitting(false);
        }
    }

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { staggerChildren: 0.1 },
        },
    };

    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: { y: 0, opacity: 1 },
    };

    return (
        <motion.section
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-4 p-4 md:p-6 max-w-6xl mx-auto"
        >
            {/* --- Page Header --- */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border pb-4">
                <motion.div variants={itemVariants} className="space-y-1">
                    <h1 className="text-3xl font-black text-foreground tracking-tight uppercase">
                        Unlink <span className="text-primary">Order</span>
                    </h1>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest opacity-70">
                        Manage grouped orders and disconnect items from primary references
                    </p>
                </motion.div>

                <motion.div variants={itemVariants} className="w-full md:w-80">
                    <div className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                        <Input
                            placeholder="Search ID, Invoice or Customer..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 h-10 bg-card border-2 border-border focus-visible:ring-primary/20"
                        />
                    </div>
                </motion.div>
            </div>

            {/* --- Groups List --- */}
            <div className="space-y-2">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-4">
                        <RefreshCw className="w-10 h-10 text-primary/40 animate-spin" />
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Loading link groups...</p>
                    </div>
                ) : linkGroups.length === 0 ? (
                    <div className="bg-muted/30 rounded-3xl border-2 border-dashed border-border p-20 text-center">
                        <div className="size-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                            <Layers className="w-8 h-8 text-muted-foreground" />
                        </div>
                        <h3 className="text-lg font-bold text-foreground uppercase tracking-tight">No Active Link Groups</h3>
                        <p className="text-sm text-muted-foreground max-w-xs mx-auto mt-2">
                            {searchQuery ? "Try adjusting your search filters" : "There are currently no orders linked in the system"}
                        </p>
                    </div>
                ) : (
                    linkGroups.map((group) => (
                        <LinkGroupCard
                            key={group.primaryId}
                            group={group}
                            onUnlink={(order) => setOrderToUnlink(order)}
                        />
                    ))
                )}
            </div>

            {/* --- Unlink Confirmation Modal --- */}
            <Dialog open={!!orderToUnlink} onOpenChange={(open) => !open && setOrderToUnlink(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-3 text-xl font-black uppercase tracking-tight">
                            <Unlink className="w-6 h-6 text-destructive" />
                            Unlink Order
                        </DialogTitle>
                    </DialogHeader>

                    <div className="py-6 space-y-6">
                        <div className="bg-destructive/5 border border-destructive/10 rounded-2xl p-4">
                            <p className="text-sm font-medium text-destructive leading-relaxed">
                                You are about to disconnect <span className="font-bold">Order #{orderToUnlink?.id}</span> from its primary group.
                                This will make it an independent order.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">New Delivery Date</Label>
                            <DatePicker
                                value={reviseDate || undefined}
                                onChange={(date) => setReviseDate(date || null)}
                                className="w-full h-12 border-2 text-base font-bold"
                                placeholder="Select Independent Delivery Date"
                            />
                            <p className="text-[10px] font-bold text-muted-foreground italic px-1">
                                * Required to schedule the workshop separately
                            </p>
                        </div>
                    </div>

                    <DialogFooter className="gap-3">
                        <Button variant="ghost" className="font-bold uppercase tracking-widest text-xs" onClick={() => setOrderToUnlink(null)}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            className="h-11 px-6 font-black uppercase tracking-widest shadow-lg shadow-destructive/20"
                            disabled={!reviseDate || isSubmitting}
                            onClick={handleUnlinkConfirm}
                        >
                            {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Unlink className="w-4 h-4 mr-2" />}
                            Confirm Unlink
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </motion.section>
    );
}

function LinkGroupCard({ group, onUnlink }: { group: { primaryId: number; children: Order[]; primaryDetails?: any }, onUnlink: (order: Order) => void }) {
    const [isExpanded, setIsExpanded] = useState(false);

    // Get details from primaryDetails if available
    const primary = group.primaryDetails;

    // Robust extraction helpers
    const getCustomerName = (obj: any) => {
        const cust = Array.isArray(obj?.customer) ? obj.customer[0] : obj?.customer;
        return cust?.name;
    };

    const getCustomerPhone = (obj: any) => {
        const cust = Array.isArray(obj?.customer) ? obj.customer[0] : obj?.customer;
        return cust?.phone;
    };

    const customerName = getCustomerName(primary) || getCustomerName(group.children[0]) || "Unknown Customer";
    const customerPhone = getCustomerPhone(primary) || getCustomerPhone(group.children[0]);
    const invoice = primary?.invoice_number;
    const deliveryDate = primary?.delivery_date;
    const productionStage = primary?.production_stage;

    return (
        <Card className={cn(
            "overflow-hidden border-2 transition-all duration-300 py-0 gap-0",
            isExpanded ? "border-primary/30 shadow-lg" : "border-border/60 hover:border-primary/20 shadow-sm"
        )}>
            <div
                className={cn(
                    "px-5 py-3 cursor-pointer flex items-center justify-between transition-colors",
                    isExpanded ? "bg-primary/5" : "bg-card hover:bg-muted/30"
                )}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-5 flex-1 min-w-0">
                    <div className="size-11 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shrink-0 shadow-sm border border-primary/5">
                        <Package className="w-5.5 h-5.5" />
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                            <h3 className="text-lg font-black uppercase tracking-tight leading-none">#{group.primaryId}</h3>
                            {invoice && (
                                <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-md uppercase tracking-widest leading-none">INV {invoice}</span>
                            )}
                            <div className="h-4 w-px bg-border/60 mx-1" />
                            <span className="text-base font-black text-foreground truncate uppercase tracking-tight">{customerName}</span>
                        </div>

                        <div className="flex items-center gap-4 flex-wrap">
                            {productionStage && (
                                <Badge variant="secondary" className="h-5 px-2 text-[10px] font-black uppercase bg-blue-50 text-blue-700 border-blue-100 shadow-none">
                                    {productionStage.replace(/_/g, " ")}
                                </Badge>
                            )}
                            <div className="flex items-center gap-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                                <div className="flex items-center gap-1.5">
                                    <Phone className="size-3 text-primary/60" />
                                    <span className="font-mono">{customerPhone || "N/A"}</span>
                                </div>
                                {deliveryDate && (
                                    <div className="flex items-center gap-1.5 text-primary">
                                        <Clock className="size-3" />
                                        <span>{format(new Date(deliveryDate), "PP")}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <div className="hidden lg:flex flex-col items-end">
                        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest leading-none mb-1.5 opacity-60">Linked Group</span>
                        <div className="flex -space-x-2">
                            {group.children.slice(0, 5).map((c) => (
                                <div key={c.id} className="size-6 rounded-full border-2 border-background bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground shadow-sm">
                                    {c.id.toString().slice(-2)}
                                </div>
                            ))}
                            {group.children.length > 5 && (
                                <div className="size-6 rounded-full border-2 border-background bg-primary text-primary-foreground flex items-center justify-center text-[9px] font-bold shadow-sm">
                                    +{group.children.length - 5}
                                </div>
                            )}
                        </div>
                    </div>
                    <motion.div
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        className="p-2 bg-muted/50 rounded-xl"
                    >
                        <ChevronDown className="w-5 h-5 text-muted-foreground" />
                    </motion.div>
                </div>
            </div>

            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeInOut" }}
                    >
                        <CardContent className="p-0 border-t border-border/40 bg-muted/5">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-xs font-black uppercase tracking-widest text-muted-foreground border-b border-border/60 bg-muted/10">
                                            <th className="py-2 px-4 text-left">Order Identity</th>
                                            <th className="py-2 px-4 text-left">Production Stage</th>
                                            <th className="py-2 px-4 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/40">
                                        {group.children.map((child) => (
                                            <tr key={child.id} className="group hover:bg-muted/20 transition-colors">
                                                <td className="py-2 px-4">
                                                    <div className="space-y-0.5">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold text-sm uppercase">#{child.id}</span>
                                                            <span className="text-xs font-bold text-primary opacity-70">INV: {child.invoice_number || "Draft"}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2 text-muted-foreground">
                                                            <User className="size-3.5" />
                                                            <span className="text-sm font-bold uppercase truncate max-w-48">{getCustomerName(child)}</span>
                                                            <span className="w-1 h-1 rounded-full bg-border" />
                                                            <span className="text-xs font-medium font-mono">{getCustomerPhone(child)}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="py-2 px-4">
                                                    <Badge variant="secondary" className="font-bold text-xs uppercase tracking-widest px-2 h-6">
                                                        {child.production_stage?.replace(/_/g, " ") || "Pending"}
                                                    </Badge>
                                                </td>
                                                <td className="py-2 px-4 text-right">
                                                    <div className="flex justify-end gap-2">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-9 px-3 text-primary hover:text-primary hover:bg-primary/10 font-bold text-xs uppercase"
                                                            asChild
                                                        >
                                                            <Link
                                                                to={child.order_type === "SALES" ? "/$main/orders/new-sales-order" : "/$main/orders/new-work-order"}
                                                                search={{ orderId: child.id }}
                                                            >
                                                                <ExternalLink className="size-4 mr-1.5" />
                                                                View
                                                            </Link>
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-9 px-3 text-destructive hover:text-destructive hover:bg-destructive/10 font-bold text-xs uppercase"
                                                            onClick={() => onUnlink(child)}
                                                        >
                                                            <Unlink className="size-4 mr-1.5" />
                                                            Unlink
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </motion.div>
                )}
            </AnimatePresence>
        </Card>
    );
}

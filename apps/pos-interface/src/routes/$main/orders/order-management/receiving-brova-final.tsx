"use client";

import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import {
    Package,
    Search,
    RefreshCw,
    ChevronDown,
    ExternalLink,
    CheckCircle2,
    Phone,
    Clock,
    Check
} from "lucide-react";

// UI Components
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// API and Hooks
import { updateOrder } from "@/api/orders";
import { updateGarment } from "@/api/garments";
import { useDispatchedOrders } from "@/hooks/useDispatchedOrders";
import { PieceStageLabels } from "@/lib/constants";
import type { Order, Garment } from "@repo/database";

// Route Definition
export const Route = createFileRoute(
    "/$main/orders/order-management/receiving-brova-final"
)({
    component: ReceivingInterface,
    head: () => ({
        meta: [{ title: "Receiving Brova & Final" }],
    }),
});

function ReceivingInterface() {
    const queryClient = useQueryClient();
    const { data: orders = [], isLoading } = useDispatchedOrders();
    const [searchQuery, setSearchQuery] = useState("");

    // Mutations
    const receiveMutation = useMutation({
        mutationFn: async ({ garment, order }: { garment: Garment; order: Order }) => {
            let nextStage = garment.piece_stage;
            if (garment.piece_stage === 'brova_dispatched_to_shop') nextStage = 'brova_at_shop';
            else if (garment.piece_stage === 'final_dispatched_to_shop') nextStage = 'final_at_shop';

            // 1. Update Garment
            const gRes = await updateGarment(garment.id, { piece_stage: nextStage as any });
            if (gRes.status === 'error') throw new Error(gRes.message);

            // 2. Check if order-level update is needed
            const updatedGarments = order.garments?.map(g => 
                g.id === garment.id ? { ...g, piece_stage: nextStage } : g
            ) || [];

            const allAtShop = updatedGarments.every(g => 
                ['brova_at_shop', 'final_at_shop', 'brova_accepted', 'brova_collected', 'order_collected', 'order_delivered'].includes(g.piece_stage!)
            );

            if (allAtShop) {
                let orderStage = 'final_at_shop';
                const hasBrova = updatedGarments.some(g => g.garment_type === 'brova');
                if (hasBrova) orderStage = 'brova_and_final_at_shop';
                
                await updateOrder({ production_stage: orderStage as any }, order.id);
            }
            
            return { garmentId: garment.garment_id, nextStage };
        },
        onSuccess: (data) => {
            toast.success(`Garment ${data.garmentId} marked as received!`, {
                description: `New status: ${PieceStageLabels[data.nextStage as keyof typeof PieceStageLabels]}`
            });
            queryClient.invalidateQueries({ queryKey: ["dispatched-orders"] });
            queryClient.invalidateQueries({ queryKey: ["orders"] });
        },
        onError: (err: any) => {
            toast.error("Failed to receive garment", { description: err.message });
        }
    });

    // Filter Logic
    const filteredOrders = useMemo(() => {
        if (!searchQuery) return orders;
        const q = searchQuery.toLowerCase();
        return orders.filter(order => 
            order.id.toString().includes(q) ||
            order.invoice_number?.toString().includes(q) ||
            order.customer?.name.toLowerCase().includes(q) ||
            order.customer?.phone?.includes(q)
        );
    }, [orders, searchQuery]);

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
        <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="container mx-auto p-4 md:p-6 max-w-6xl space-y-6"
        >
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border pb-4">
                <motion.div variants={itemVariants} className="space-y-1">
                    <h1 className="text-3xl font-black text-foreground tracking-tight uppercase">
                        Receiving <span className="text-primary">Brova & Final</span>
                    </h1>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest opacity-70">
                        Log workshop deliveries and mark garments as received at the shop
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

            {/* List */}
            <div className="space-y-3">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <RefreshCw className="w-10 h-10 text-primary/40 animate-spin" />
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Loading dispatched orders...</p>
                    </div>
                ) : filteredOrders.length === 0 ? (
                    <div className="bg-muted/30 rounded-3xl border-2 border-dashed border-border p-20 text-center">
                        <div className="size-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                            <Package className="w-8 h-8 text-muted-foreground" />
                        </div>
                        <h3 className="text-lg font-bold text-foreground uppercase tracking-tight">No Dispatched Items</h3>
                        <p className="text-sm text-muted-foreground max-w-xs mx-auto mt-2">
                            {searchQuery ? "No orders match your search" : "There are currently no garments dispatched from the workshop"}
                        </p>
                    </div>
                ) : (
                    filteredOrders.map((order) => (
                        <OrderCard 
                            key={order.id} 
                            order={order} 
                            onReceive={(garment) => receiveMutation.mutate({ garment, order })}
                            isSubmitting={receiveMutation.isPending}
                        />
                    ))
                )}
            </div>
        </motion.div>
    );
}

function OrderCard({ order, onReceive, isSubmitting }: { 
    order: Order; 
    onReceive: (g: Garment) => void;
    isSubmitting: boolean;
}) {
    const [isExpanded, setIsExpanded] = useState(false);

    const dispatchedGarments = useMemo(() => 
        order.garments?.filter(g => 
            ['brova_dispatched_to_shop', 'final_dispatched_to_shop'].includes(g.piece_stage!)
        ).sort((a, b) => a.id - b.id) || [],
    [order.garments]);

    const otherGarments = useMemo(() =>
        order.garments?.filter(g => 
            !['brova_dispatched_to_shop', 'final_dispatched_to_shop'].includes(g.piece_stage!)
        ).sort((a, b) => a.id - b.id) || [],
    [order.garments]);

    return (
        <Card className={cn(
            "overflow-hidden border-2 transition-all duration-300",
            isExpanded ? "border-primary/30 shadow-lg" : "border-border/60 hover:border-primary/20 shadow-sm"
        )}>
            <div
                className={cn(
                    "px-5 py-4 cursor-pointer flex items-center justify-between transition-colors",
                    isExpanded ? "bg-primary/5" : "bg-card hover:bg-muted/30"
                )}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-5 flex-1 min-w-0">
                    <div className="size-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shrink-0 shadow-sm border border-primary/5">
                        <Package className="w-6 h-6" />
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                            <h3 className="text-xl font-black uppercase tracking-tight leading-none">#{order.id}</h3>
                            {order.invoice_number && (
                                <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-md uppercase tracking-widest leading-none">INV {order.invoice_number}</span>
                            )}
                            <div className="h-4 w-px bg-border/60 mx-1" />
                            <span className="text-base font-black text-foreground truncate uppercase tracking-tight">{order.customer?.name}</span>
                        </div>

                        <div className="flex items-center gap-4 flex-wrap">
                            <Badge variant="secondary" className="h-5 px-2 text-[10px] font-black uppercase bg-amber-50 text-amber-700 border-amber-100 shadow-none">
                                {order.production_stage?.replace(/_/g, " ")}
                            </Badge>
                            <div className="flex items-center gap-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                                <div className="flex items-center gap-1.5">
                                    <Phone className="size-3 text-primary/60" />
                                    <span className="font-mono">{order.customer?.phone || "N/A"}</span>
                                </div>
                                {order.delivery_date && (
                                    <div className="flex items-center gap-1.5 text-primary">
                                        <Clock className="size-3" />
                                        <span>{format(new Date(order.delivery_date), "PP")}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <div className="hidden lg:flex flex-col items-end">
                        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest leading-none mb-1.5 opacity-60">Items To Receive</span>
                        <div className="flex items-center gap-2">
                             <Badge className="bg-primary text-primary-foreground font-black text-xs px-2 h-6">
                                {dispatchedGarments.length} Pending
                             </Badge>
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
                                            <th className="py-3 px-6 text-left">Garment Identity</th>
                                            <th className="py-3 px-6 text-left">Type</th>
                                            <th className="py-3 px-6 text-left">Current Stage</th>
                                            <th className="py-3 px-6 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/40">
                                        {dispatchedGarments.map((garment) => (
                                            <tr key={garment.id} className="group hover:bg-muted/20 transition-colors">
                                                <td className="py-4 px-6">
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-1.5 bg-primary/5 rounded-lg border border-primary/10">
                                                            <Package className="size-4 text-primary/70" />
                                                        </div>
                                                        <div className="space-y-0.5">
                                                            <div className="font-bold text-sm uppercase">{garment.garment_id}</div>
                                                            <div className="text-[10px] font-bold text-muted-foreground uppercase opacity-70">{garment.style}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="py-4 px-6">
                                                    <Badge 
                                                        variant="outline" 
                                                        className={cn(
                                                            "font-black text-[10px] uppercase h-5 px-2",
                                                            garment.garment_type === 'brova' ? "border-amber-200 bg-amber-50 text-amber-700" : "border-blue-200 bg-blue-50 text-blue-700"
                                                        )}
                                                    >
                                                        {garment.garment_type === 'brova' ? "Brova" : "Final"}
                                                    </Badge>
                                                </td>
                                                <td className="py-4 px-6">
                                                    <div className="flex items-center gap-2">
                                                        <div className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
                                                        <span className="text-xs font-bold uppercase tracking-wide text-amber-700">
                                                            {PieceStageLabels[garment.piece_stage as keyof typeof PieceStageLabels] || garment.piece_stage}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="py-4 px-6 text-right">
                                                    <Button
                                                        size="sm"
                                                        className="h-9 px-4 font-black uppercase tracking-widest text-[10px] shadow-sm"
                                                        onClick={() => onReceive(garment)}
                                                        disabled={isSubmitting}
                                                    >
                                                        {isSubmitting ? <RefreshCw className="size-3.5 mr-2 animate-spin" /> : <CheckCircle2 className="size-3.5 mr-2" />}
                                                        Mark Received
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))}

                                        {/* Show other garments that are already received or at other stages */}
                                        {otherGarments.length > 0 && (
                                            <tr className="bg-muted/30">
                                                <td colSpan={4} className="py-2 px-6 text-[10px] font-black uppercase text-muted-foreground/60 tracking-widest">
                                                    Other Garments in this Order ({otherGarments.length})
                                                </td>
                                            </tr>
                                        )}
                                        {otherGarments.map((garment) => (
                                            <tr key={garment.id} className="opacity-60 bg-muted/5">
                                                <td className="py-2 px-6">
                                                    <div className="flex items-center gap-3">
                                                        <div className="size-2 rounded-full bg-muted-foreground/20" />
                                                        <div className="font-bold text-xs uppercase">{garment.garment_id}</div>
                                                    </div>
                                                </td>
                                                <td className="py-2 px-6">
                                                    <span className="text-[10px] font-bold uppercase">{garment.garment_type === 'brova' ? "Brova" : "Final"}</span>
                                                </td>
                                                <td className="py-2 px-6">
                                                    <Badge variant="outline" className="text-[10px] font-bold uppercase h-5 px-2">
                                                        {PieceStageLabels[garment.piece_stage as keyof typeof PieceStageLabels] || garment.piece_stage}
                                                    </Badge>
                                                </td>
                                                <td className="py-2 px-6 text-right">
                                                    <div className="flex items-center justify-end text-emerald-600 gap-1.5 font-bold text-[10px] uppercase">
                                                        <Check className="size-3" />
                                                        Processed
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            
                            <div className="p-4 bg-muted/10 border-t border-border/40 flex justify-between items-center">
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                    Total Garments: {order.garments?.length || 0}
                                </p>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 text-[10px] font-black uppercase tracking-widest text-primary hover:text-primary hover:bg-primary/10"
                                    asChild
                                >
                                    <Link
                                        to={order.order_type === "SALES" ? "/$main/orders/new-sales-order" : "/$main/orders/new-work-order"}
                                        search={{ orderId: order.id }}
                                    >
                                        <ExternalLink className="size-3.5 mr-1.5" />
                                        Full Details
                                    </Link>
                                </Button>
                            </div>
                        </CardContent>
                    </motion.div>
                )}
            </AnimatePresence>
        </Card>
    );
}

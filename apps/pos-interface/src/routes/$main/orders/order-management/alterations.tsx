import React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { getBrand } from "@/api/orders";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/card";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { Skeleton } from "@repo/ui/skeleton";
import { toast } from "sonner";
import { Truck, Package, RotateCcw } from "lucide-react";
import type { Garment, Order } from "@repo/database";
import { getAlterationNumber } from "@repo/database";
import { useState } from "react";
import { SvgFormOverlay } from "@/components/alteration/svg-form-overlay";
import { defaultTemplateFieldLayout } from "@/components/alteration/field-layout";

export const Route = createFileRoute("/$main/orders/order-management/alterations")({
  component: AlterationsPage,
  head: () => ({
    meta: [{ title: "Alterations" }],
  }),
});

type AlterationGarment = Garment & {
  order?: Pick<Order, "id" | "customer_id"> & { customer?: { name: string; phone?: string | null } };
  invoice_number?: number;
};

async function getAlterationGarments(): Promise<AlterationGarment[]> {
  const brand = getBrand();
  const { data, error } = await db
    .from("garments")
    .select(`
      *,
      order:orders!order_id(
        id, customer_id,
        customer:customers!customer_id(name, phone),
        workOrder:work_orders!order_id(invoice_number)
      )
    `)
    .in("feedback_status", ["needs_repair", "needs_redo"])
    .eq("location", "shop")
    .eq("order.brand", brand)
    .eq("order.checkout_status", "confirmed");

  if (error) throw new Error(error.message);

  return (data ?? [])
    .filter((g: any) => g.order?.brand === brand || true) // brand filtered by join
    .map((g: any) => {
      const wo = Array.isArray(g.order?.workOrder) ? g.order.workOrder[0] : g.order?.workOrder;
      const cust = Array.isArray(g.order?.customer) ? g.order.customer[0] : g.order?.customer;
      return { ...g, order: { ...g.order, customer: cust }, invoice_number: wo?.invoice_number };
    });
}

async function sendToWorkshop(garmentId: string, currentTripNumber: number): Promise<void> {
  const { error } = await db
    .from("garments")
    .update({
      location: "transit_to_workshop",
      in_production: false,
      piece_stage: "waiting_cut",
      trip_number: currentTripNumber + 1,
      production_plan: null,
      worker_history: null,
      completion_time: null,
      start_time: null,
    })
    .eq("id", garmentId);
  if (error) throw new Error(error.message);
}

const createEmptyValues = () =>
  Object.fromEntries(defaultTemplateFieldLayout.map((f) => [f.id, ""])) as Record<string, string>;

function AlterationsPage() {
  const [expandedGarment, setExpandedGarment] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>(createEmptyValues);

  const toggleForm = (garmentId: string) => {
    if (expandedGarment === garmentId) {
      setExpandedGarment(null);
    } else {
      setExpandedGarment(garmentId);
      setFormValues(createEmptyValues());
    }
  };

  const qc = useQueryClient();
  const { data: garments = [], isLoading } = useQuery({
    queryKey: ["alteration-garments", getBrand()],
    queryFn: getAlterationGarments,
    // Realtime invalidates on garment changes (see useRealtimeInvalidation).
    staleTime: 1000 * 60 * 5,
  });

  const sendMut = useMutation({
    mutationFn: ({ id, trip }: { id: string; trip: number }) => sendToWorkshop(id, trip),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alteration-garments"] });
    },
    onError: (err) => toast.error(`Could not send garment to workshop: ${err instanceof Error ? err.message : String(err)}`),
  });

  // Group by order
  const grouped = new Map<number, AlterationGarment[]>();
  for (const g of garments) {
    const orderId = g.order_id;
    const arr = grouped.get(orderId) ?? [];
    arr.push(g);
    grouped.set(orderId, arr);
  }

  return (
    <div className="p-4 md:p-5 max-w-6xl mx-auto space-y-4 pb-8 animate-in fade-in zoom-in-95 duration-300">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">
            Alterations <span className="text-primary">Center</span>
          </h1>
          <p className="text-sm text-muted-foreground font-medium uppercase tracking-widest mt-1">
            Garments needing repair or redo
          </p>
        </div>
        <Badge variant="outline" className="text-base px-4 py-2 font-bold">
          {garments.length} garment{garments.length !== 1 ? "s" : ""} pending
        </Badge>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
      ) : garments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center border-2 border-dashed border-border rounded-xl bg-muted/5">
          <div className="size-14 bg-muted/30 rounded-full flex items-center justify-center mb-4 shadow-inner">
            <Package className="w-8 h-8 text-muted-foreground/30" />
          </div>
          <h3 className="text-base font-black text-foreground uppercase tracking-tight">All Clear</h3>
          <p className="text-muted-foreground font-medium uppercase tracking-widest text-xs mt-1 max-w-xs">
            No garments currently need alteration
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {[...grouped.entries()].map(([orderId, items], oi) => {
            const first = items[0];
            const customer = first?.order?.customer;
            const invoiceNo = first?.invoice_number;
            return (
              <Card
                key={orderId}
                className="border-2 rounded-2xl overflow-hidden animate-fade-in"
                style={{ animationDelay: `${oi * 40}ms` }}
              >
                <CardHeader className="bg-muted/20 border-b px-4 py-3">
                  <CardTitle className="flex items-center justify-between">
                    <div>
                      <span className="text-base font-black uppercase">
                        {customer?.name ?? "Unknown Customer"}
                      </span>
                      {invoiceNo && (
                        <span className="text-sm text-muted-foreground font-mono ml-2">
                          #{invoiceNo}
                        </span>
                      )}
                    </div>
                    <Badge variant="outline" className="font-bold">
                      {items.length} item{items.length !== 1 ? "s" : ""}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 divide-y">
                  {items.map((g, gi) => (
                  <React.Fragment key={g.id}>
                    <div
                      className="flex items-center justify-between px-4 py-3 hover:bg-muted/10 transition-colors animate-fade-in"
                      style={{ animationDelay: `${(oi * 3 + gi) * 25}ms` }}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm">{g.garment_id ?? g.id.slice(0, 8)}</span>
                          <Badge
                            variant="outline"
                            className={
                              (g as any).feedback_status === "needs_repair"
                                ? "border-amber-300 bg-amber-50 text-amber-700 text-xs font-bold uppercase"
                                : "border-red-300 bg-red-50 text-red-700 text-xs font-bold uppercase"
                            }
                          >
                            {(g as any).feedback_status === "needs_repair" ? "Needs Repair" : "Needs Redo"}
                          </Badge>
                          {(() => {
                            const altNum = getAlterationNumber(g.trip_number);
                            return altNum !== null ? (
                              <Badge variant="outline" className="text-xs font-bold uppercase border-purple-300 bg-purple-50 text-purple-700">
                                <RotateCcw className="w-2.5 h-2.5 mr-1" />
                                Alt {altNum}
                              </Badge>
                            ) : null;
                          })()}
                        </div>
                        {g.notes && (
                          <p className="text-xs text-muted-foreground max-w-xs truncate">{g.notes}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant={expandedGarment === g.id ? "secondary" : "outline"}
                          onClick={() => toggleForm(g.id)}
                        >
                          Alteration Form
                        </Button>
                        <Button
                          size="sm"
                          className="gap-2"
                          disabled={sendMut.isPending}
                          onClick={() => sendMut.mutate({ id: g.id, trip: g.trip_number ?? 1 })}
                        >
                          <Truck className="w-3.5 h-3.5" />
                          Send to Workshop
                        </Button>
                      </div>
                    </div>
                    {expandedGarment === g.id && (
                      <div className="px-4 py-4 border-t bg-muted/5">
                        <SvgFormOverlay
                          values={formValues}
                          onValueChange={(fieldId, value) =>
                            setFormValues((prev) => ({ ...prev, [fieldId]: value }))
                          }
                          className="max-w-[480px]"
                        />
                      </div>
                    )}
                  </React.Fragment>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

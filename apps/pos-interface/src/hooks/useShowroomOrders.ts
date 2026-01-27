import { useQuery } from "@tanstack/react-query";
import type { OrderRow, GarmentRowData } from "@/components/orders-at-showroom/types";
import { PieceStageLabels, ProductionStageLabels } from "@/lib/constants";
import { supabase } from "@/lib/supabase";

/**
 * Calculate delay in days between promised delivery date and today
 */
export function calculateDelay(promisedDeliveryDate: string): number {
  const promised = new Date(promisedDeliveryDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  promised.setHours(0, 0, 0, 0);

  const diffTime = today.getTime() - promised.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays > 0 ? diffDays : 0;
}

/**
 * Calculate total order amount from charges
 */
export function calculateTotal(order: any): number {
  return (
    (parseFloat(order.fabric_charge?.toString() || "0")) +
    (parseFloat(order.stitching_charge?.toString() || "0")) +
    (parseFloat(order.style_charge?.toString() || "0")) +
    (parseFloat(order.delivery_charge?.toString() || "0")) +
    (parseFloat(order.shelf_charge?.toString() || "0"))
  );
}

/**
 * Transform Supabase data into OrderRow array for the showroom table.
 */
export function transformToOrderRows(ordersData: any[]): OrderRow[] {
  const orderRows: OrderRow[] = [];

  for (const order of ordersData) {
    const customer = order.customer;
    const garments = order.garments || [];

    // Transform garments for this order
    const garmentRowsData: GarmentRowData[] = garments.map((garment: any) => ({
      garmentId: garment.garment_id,
      pieceStage: garment.piece_stage
        ? PieceStageLabels[garment.piece_stage as keyof typeof PieceStageLabels] || "Unknown"
        : "Unknown",
      isBrova: garment.brova || false,
      deliveryDate: garment.delivery_date || "",
      delayInDays: calculateDelay(garment.delivery_date || new Date().toISOString()),
      fabricSource: garment.fabric_source || undefined,
      style: garment.style_id?.toString() || undefined,
      garment,
    }));

    // Get customer info
    const customerName = customer?.name || "Unknown";
    const customerNickName = customer?.nick_name;
    const mobileNumber = customer
      ? `${customer.country_code} ${customer.phone}`
      : "N/A";

    // Calculate total
    const totalAmount = parseFloat(order.order_total?.toString() || "0") || (calculateTotal(order) - (parseFloat(order.discount_value?.toString() || "0")));

    const orderRow: OrderRow = {
      // Order info
      orderId: order.id.toString(),
      orderRecordId: order.id.toString(),
      // fatoura is alias for invoice_number
      invoiceNumber: order.invoice_number,
      fatoura: order.invoice_number,
      
      productionStage: order.production_stage
        ? ProductionStageLabels[order.production_stage as keyof typeof ProductionStageLabels] || "Unknown"
        : "Unknown",
      fatouraStage: order.production_stage
        ? ProductionStageLabels[order.production_stage as keyof typeof ProductionStageLabels] || "Unknown"
        : "Unknown",
      
      orderStatus: order.checkout_status === "confirmed" ? "Completed" : order.checkout_status === "cancelled" ? "Cancelled" : "Pending",
      checkoutStatus: order.checkout_status,
      
      orderDate: order.order_date,
      deliveryDate: order.delivery_date,

      // Customer info
      customerId: customer?.id?.toString() || "0",
      customerName,
      customerNickName,
      mobileNumber,

      // Order type and delivery
      orderType: order.order_type,
      homeDelivery: order.home_delivery,

      // Financial info
      totalAmount,
      advance: parseFloat(order.advance?.toString() || "0") || 0,
      balance: totalAmount - (parseFloat(order.paid?.toString() || "0") || 0),

      // Garments
      garmentsCount: garments.length,
      garments: garmentRowsData,

      // Full records
      order: order as any,
      customer,
    };

    orderRows.push(orderRow);
  }

  return orderRows;
}

/**
 * Hook to fetch orders at showroom with specific production stages.
 */
export function useShowroomOrders() {
  return useQuery({
    queryKey: ["showroom-orders"],
    queryFn: async () => {
      const targetStages = [
        "brova_at_shop",
        "final_at_shop",
        "brova_accepted",
        "brova_alteration",
        "brova_repair_and_production",
        "brova_alteration_and_production",
        "brova_and_final_at_shop"
      ];

      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          customer:customers(*),
          garments:garments(*)
        `)
        .in('production_stage', targetStages)
        .eq('checkout_status', 'confirmed')
        .eq('order_type', 'WORK');

      if (error) {
        throw new Error(`Failed to fetch showroom orders: ${error.message}`);
      }

      return transformToOrderRows(data || []);
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
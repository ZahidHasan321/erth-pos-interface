import { useQuery } from "@tanstack/react-query";
import type { OrderRow, GarmentRowData } from "@/components/orders-at-showroom/types";
import { ORDER_PHASE_LABELS, PIECE_STAGE_LABELS, LOCATION_LABELS } from "@/lib/constants";
import { supabase } from "@/lib/supabase";
import { getBrand } from "@/api/orders";
import { getShowroomStatus } from "@repo/database";

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

  for (const orderRaw of ordersData) {
    const workData = Array.isArray(orderRaw.workOrder) ? orderRaw.workOrder[0] : orderRaw.workOrder;
    const order = { ...orderRaw, ...workData };

    const customer = order.customer;
    const garments = order.garments || [];

    // Transform garments for this order
    const garmentRowsData: GarmentRowData[] = garments.map((garment: any) => {
      const styleParts = [];
      if (garment.fabric?.name) {
        styleParts.push(garment.fabric.name + (garment.color ? ` (${garment.color})` : ""));
      } else if (garment.color) {
        styleParts.push(garment.color);
      }
      if (garment.style) styleParts.push(garment.style.charAt(0).toUpperCase() + garment.style.slice(1));
      
      const styleDesc = styleParts.length > 0 ? styleParts.join(" • ") : "Standard";

      return {
        garmentId: garment.garment_id,
        garmentRecordId: garment.id?.toString() || garment.garment_id || crypto.randomUUID(),
        pieceStage: garment.piece_stage
          ? PIECE_STAGE_LABELS[garment.piece_stage as keyof typeof PIECE_STAGE_LABELS] || "Unknown"
          : "Unknown",
        locationKey: garment.location,
        locationLabel: LOCATION_LABELS[garment.location as keyof typeof LOCATION_LABELS] || garment.location,
        isBrova: garment.garment_type === 'brova',
        deliveryDate: garment.delivery_date || "",
        delayInDays: calculateDelay(garment.delivery_date || new Date().toISOString()),
        fabricSource: garment.fabric_source || undefined,
        style: styleDesc,
        garment,
      };
    });

    const customerName = customer?.name || "Unknown";
    const customerNickName = customer?.nick_name;
    const mobileNumber = customer
      ? `${customer.country_code} ${customer.phone}`
      : "N/A";

    const totalAmount = parseFloat(order.order_total?.toString() || "0") || (calculateTotal(order) - (parseFloat(order.discount_value?.toString() || "0")));

    // Use central utility for status logic
    const showroomStatus = getShowroomStatus(garments);

    // Calculate max trip number for items at shop to determine alteration cycle
    // Prioritize unaccepted items to reflect the ACTIVE alteration status
    const shopItems = garments.filter((g: any) => g.location === 'shop' && g.piece_stage !== 'completed');
    const activeItems = shopItems.filter((g: any) => g.acceptance_status !== true);
    
    // If there are unaccepted items, use their trip numbers. Otherwise (e.g. all ready), use all shop items.
    const sourceItems = activeItems.length > 0 ? activeItems : shopItems;

    const maxTripNumber = sourceItems.length > 0 
        ? Math.max(...sourceItems.map((g: any) => g.trip_number || 1)) 
        : 1;

    const orderRow: OrderRow = {
      orderId: order.id.toString(),
      orderRecordId: order.id.toString(),
      invoiceNumber: order.invoice_number,
      fatoura: order.invoice_number,
      productionStage: order.order_phase ? ORDER_PHASE_LABELS[order.order_phase as keyof typeof ORDER_PHASE_LABELS] || "Unknown" : "Unknown",
      productionStageKey: order.order_phase,
      fatouraStage: order.order_phase ? ORDER_PHASE_LABELS[order.order_phase as keyof typeof ORDER_PHASE_LABELS] || "Unknown" : "Unknown",
      orderStatus: order.checkout_status === "confirmed" ? "Completed" : order.checkout_status === "cancelled" ? "Cancelled" : "Pending",
      checkoutStatus: order.checkout_status,
      orderDate: order.order_date,
      deliveryDate: order.delivery_date,
      customerId: customer?.id?.toString() || "0",
      customerName,
      customerNickName,
      mobileNumber,
      orderType: order.order_type,
      homeDelivery: order.home_delivery,
      totalAmount,
      advance: parseFloat(order.advance?.toString() || "0") || 0,
      balance: totalAmount - (parseFloat(order.paid?.toString() || "0") || 0),
      garmentsCount: garments.length,
      maxTripNumber,
      garments: garmentRowsData,
      showroomStatus,
      order: order as any,
      customer,
    };

    // Filter for Showroom page: Must meet at least one showroom operational condition
    if (showroomStatus.label) {
      orderRows.push(orderRow);
    }
  }

  return orderRows;
}

export function useShowroomOrders() {
  return useQuery({
    queryKey: ["showroom-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          workOrder:work_orders!order_id!inner(*),
          customer:customers(*),
          garments:garments(*, fabric:fabrics(*))
        `)
        .eq('brand', getBrand())
        .eq('checkout_status', 'confirmed')
        .eq('order_type', 'WORK')
        .eq('workOrder.order_phase', 'in_progress');

      if (error) {
        throw new Error(`Failed to fetch showroom orders: ${error.message}`);
      }

      return transformToOrderRows(data || []);
    },
    staleTime: 1000 * 60,
    gcTime: 1000 * 60,
  });
}

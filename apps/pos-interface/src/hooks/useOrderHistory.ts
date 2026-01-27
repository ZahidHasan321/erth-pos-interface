import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type OrderHistoryItem = {
  id: number;
  invoice_number: number | null;
  order_date: string;
  order_type: "WORK" | "SALES";
  checkout_status: "draft" | "confirmed" | "cancelled";
  customer_name: string;
  customer_phone: string;
  total_amount: number;
  paid_amount: number;
  balance: number;
  fabric_count: number;
  shelf_item_count: number;
  production_stage?: string;
  // Pricing breakdown
  charges: {
    fabric: number;
    stitching: number;
    style: number;
    delivery: number;
    shelf: number;
    discount: number;
  };
};

/**
 * Hook to fetch all orders for history.
 */
export function useOrderHistory() {
  return useQuery({
    queryKey: ["order-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          customer:customers(name, phone, nick_name),
          garments:garments(id),
          shelf_items:order_shelf_items(id)
        `)
        .order('order_date', { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch order history: ${error.message}`);
      }

      return (data || []).map((order: any): OrderHistoryItem => {
        const fabricCharge = parseFloat(order.fabric_charge?.toString() || "0");
        const stitchingCharge = parseFloat(order.stitching_charge?.toString() || "0");
        const styleCharge = parseFloat(order.style_charge?.toString() || "0");
        const deliveryCharge = parseFloat(order.delivery_charge?.toString() || "0");
        const shelfCharge = parseFloat(order.shelf_charge?.toString() || "0");
        const discountValue = parseFloat(order.discount_value?.toString() || "0");

        const total = parseFloat(order.order_total?.toString() || "0") || (
          fabricCharge + stitchingCharge + styleCharge + deliveryCharge + shelfCharge - discountValue
        );

        const paid = parseFloat(order.paid?.toString() || "0");

        return {
          id: order.id,
          invoice_number: order.invoice_number,
          order_date: order.order_date,
          order_type: order.order_type,
          checkout_status: order.checkout_status,
          customer_name: order.customer?.nick_name || order.customer?.name || "Unknown Customer",
          customer_phone: order.customer?.phone || "No Phone",
          total_amount: total,
          paid_amount: paid,
          balance: total - paid,
          fabric_count: order.garments?.length || 0,
          shelf_item_count: order.shelf_items?.length || 0,
          production_stage: order.production_stage,
          charges: {
            fabric: fabricCharge,
            stitching: stitchingCharge,
            style: styleCharge,
            delivery: deliveryCharge,
            shelf: shelfCharge,
            discount: discountValue,
          }
        };
      });
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

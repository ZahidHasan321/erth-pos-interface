import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type OrderHistoryItem = {
  id: number;
  invoice_number: number | null;
  order_date: string;
  delivery_date: string | null;
  order_type: "WORK" | "SALES";
  checkout_status: "draft" | "confirmed" | "cancelled";
  home_delivery: boolean;
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
 * Hook to fetch orders for history with pagination and filtering.
 */
export function useOrderHistory({
  page = 0,
  pageSize = 20,
  searchTerm = "",
  statusFilter = "all",
  typeFilter = "all",
  sortOrder = "newest",
  dateFilter = null
}: {
  page?: number;
  pageSize?: number;
  searchTerm?: string;
  statusFilter?: string;
  typeFilter?: string;
  sortOrder?: "newest" | "oldest";
  dateFilter?: Date | null;
} = {}) {
  return useQuery({
    queryKey: ["order-history", page, pageSize, searchTerm, statusFilter, typeFilter, sortOrder, dateFilter],
    queryFn: async () => {
      const from = page * pageSize;
      const to = from + pageSize - 1;

      // We use inner join for customer if we want to search by customer fields efficiently
      // But we must handle the query building carefully
      let query = supabase
        .from('orders')
        .select(`
          *,
          workOrder:work_orders(*),
          customer:customers!inner(name, phone, nick_name),
          garments:garments(id),
          shelf_items:order_shelf_items(id)
        `, { count: 'exact' });

      // Apply Filters
      if (statusFilter !== "all") {
        query = query.eq('checkout_status', statusFilter);
      }
      
      if (typeFilter !== "all") {
        query = query.eq('order_type', typeFilter);
      }

      if (dateFilter) {
        const startOfDay = new Date(dateFilter);
        startOfDay.setHours(0, 0, 0, 0);
        
        const endOfDay = new Date(dateFilter);
        endOfDay.setHours(23, 59, 59, 999);
        
        query = query.gte('order_date', startOfDay.toISOString()).lte('order_date', endOfDay.toISOString());
      }

      if (searchTerm) {
        const term = searchTerm.toLowerCase().trim();
        if (term.startsWith('#')) {
          const idQuery = term.slice(1);
          if (idQuery && !isNaN(parseInt(idQuery))) {
            query = query.or(`id.eq.${idQuery},workOrder.invoice_number.eq.${idQuery}`);
          }
        } else {
          // Complex OR condition across joined table
          const orConditions = [
            `customer.name.ilike.%${term}%`,
            `customer.phone.ilike.%${term}%`,
            `customer.nick_name.ilike.%${term}%`
          ];
          
          if (!isNaN(parseInt(term))) {
            orConditions.push(`id.eq.${term}`);
            orConditions.push(`workOrder.invoice_number.eq.${term}`);
          }
          
          query = query.or(orConditions.join(','));
        }
      }

      const { data, error, count } = await query
        .order('order_date', { ascending: sortOrder === "oldest" })
        .range(from, to);

      if (error) {
        throw new Error(`Failed to fetch order history: ${error.message}`);
      }

      const items = (data || []).map((order: any): OrderHistoryItem => {
        const workData = Array.isArray(order.workOrder) ? order.workOrder[0] : order.workOrder;
        const mergedOrder = { ...order, ...workData };

        const fabricCharge = parseFloat(mergedOrder.fabric_charge?.toString() || "0");
        const stitchingCharge = parseFloat(mergedOrder.stitching_charge?.toString() || "0");
        const styleCharge = parseFloat(mergedOrder.style_charge?.toString() || "0");
        const deliveryCharge = parseFloat(mergedOrder.delivery_charge?.toString() || "0");
        const shelfCharge = parseFloat(mergedOrder.shelf_charge?.toString() || "0");
        const discountValue = parseFloat(mergedOrder.discount_value?.toString() || "0");

        const total = mergedOrder.order_total != null
          ? parseFloat(mergedOrder.order_total.toString())
          : (fabricCharge + stitchingCharge + styleCharge + deliveryCharge + shelfCharge - discountValue);

        const paid = parseFloat(mergedOrder.paid?.toString() || "0");

        return {
          id: mergedOrder.id,
          invoice_number: mergedOrder.invoice_number,
          order_date: mergedOrder.order_date,
          delivery_date: mergedOrder.delivery_date,
          order_type: mergedOrder.order_type,
          checkout_status: mergedOrder.checkout_status,
          home_delivery: !!mergedOrder.home_delivery,
          customer_name: mergedOrder.customer?.nick_name || mergedOrder.customer?.name || "Unknown Customer",
          customer_phone: mergedOrder.customer?.phone || "No Phone",
          total_amount: total,
          paid_amount: paid,
          balance: total - paid,
          fabric_count: mergedOrder.garments?.length || 0,
          shelf_item_count: mergedOrder.shelf_items?.length || 0,
          production_stage: mergedOrder.production_stage,
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

      return {
        items,
        totalCount: count || 0
      };
    },
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
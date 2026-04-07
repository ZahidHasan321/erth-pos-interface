import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { getBrand } from "@/api/orders";
import { sanitizeFilterValue, getKuwaitMidnight } from "@/lib/utils";

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
  order_phase?: string;
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
  phaseFilter = "all",
  typeFilter = "all",
  sortOrder = "newest",
  dateFilter = null
}: {
  page?: number;
  pageSize?: number;
  searchTerm?: string;
  statusFilter?: string;
  phaseFilter?: string;
  typeFilter?: string;
  sortOrder?: "newest" | "oldest";
  dateFilter?: Date | null;
} = {}) {
  return useQuery({
    queryKey: ["order-history", getBrand(), page, pageSize, searchTerm, statusFilter, phaseFilter, typeFilter, sortOrder, dateFilter],
    queryFn: async () => {
      const from = page * pageSize;
      const to = from + pageSize - 1;

      // We use inner join for customer if we want to search by customer fields efficiently
      // But we must handle the query building carefully
      let query = db
        .from('orders')
        .select(`
          *,
          workOrder:work_orders!order_id${phaseFilter !== 'all' ? '!inner' : ''}(*),
          customer:customers!inner(name, phone, nick_name),
          garments:garments(id),
          shelf_items:order_shelf_items(id)
        `, { count: 'exact' });

      // Brand filter
      query = query.eq('brand', getBrand());

      // Apply Filters
      if (statusFilter !== "all") {
        query = query.eq('checkout_status', statusFilter);
      }

      if (phaseFilter !== "all") {
        query = query.eq('workOrder.order_phase', phaseFilter);
      }
      
      if (typeFilter !== "all") {
        query = query.eq('order_type', typeFilter);
      }

      if (dateFilter) {
        // order_date stores UTC. Convert Kuwait day boundaries to UTC for correct filtering.
        const startOfDay = getKuwaitMidnight(new Date(dateFilter));
        const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);
        query = query.gte('order_date', startOfDay.toISOString()).lte('order_date', endOfDay.toISOString());
      }

      if (searchTerm) {
        const term = sanitizeFilterValue(searchTerm.toLowerCase().trim());
        if (term.startsWith('#')) {
          const idQuery = term.slice(1);
          if (idQuery && !isNaN(parseInt(idQuery))) {
            query = query.or(`id.eq.${idQuery},workOrder.invoice_number.eq.${idQuery}`);
          }
        } else if (term) {
          // Use fuzzy search RPC to find matching customer IDs, then filter orders
          const { data: fuzzyCustomers } = await db.rpc('search_customers_fuzzy', {
            p_query: term,
            p_limit: 50,
          });
          const customerIds = (fuzzyCustomers || []).map((c: any) => c.id);

          if (!isNaN(parseInt(term)) && customerIds.length > 0) {
            query = query.or(`id.eq.${term},workOrder.invoice_number.eq.${term},customer_id.in.(${customerIds.join(',')})`);
          } else if (!isNaN(parseInt(term))) {
            query = query.or(`id.eq.${term},workOrder.invoice_number.eq.${term}`);
          } else if (customerIds.length > 0) {
            query = query.in('customer_id', customerIds);
          } else {
            // No matching customers and not a number — return empty
            return { items: [], totalCount: 0 };
          }
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
        const expressCharge = parseFloat(mergedOrder.express_charge?.toString() || "0");
        const soakingCharge = parseFloat(mergedOrder.soaking_charge?.toString() || "0");
        const shelfCharge = parseFloat(mergedOrder.shelf_charge?.toString() || "0");
        const discountValue = parseFloat(mergedOrder.discount_value?.toString() || "0");

        const total = mergedOrder.order_total != null
          ? parseFloat(mergedOrder.order_total.toString())
          : (fabricCharge + stitchingCharge + styleCharge + deliveryCharge + expressCharge + soakingCharge + shelfCharge - discountValue);

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
          order_phase: mergedOrder.order_phase,
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
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  });
}
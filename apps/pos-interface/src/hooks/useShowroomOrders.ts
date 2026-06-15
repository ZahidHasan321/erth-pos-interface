import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type { OrderRow, GarmentRowData } from "@/components/orders-at-showroom/types";
import type { Order, Garment, Customer } from "@repo/database";
import { ORDER_PHASE_LABELS, PIECE_STAGE_LABELS, LOCATION_LABELS } from "@/lib/constants";
import { db } from "@/lib/db";
import { getBrand } from "@/api/orders";
import { parseUtcTimestamp, getKuwaitMidnight } from "@/lib/utils";

/**
 * Garment row as returned by the showroom RPC.
 * Dates arrive as strings (not Date objects) because Supabase serialises them in JSON.
 * The fabric field comes from a PostgREST join.
 */
type ShowroomGarment = {
  id?: string | number | null;
  garment_id: string | null;
  piece_stage?: string | null;
  location?: string | null;
  garment_type?: string | null;
  delivery_date?: string | null;
  fabric_source?: string | null;
  acceptance_status?: boolean | null;
  trip_number?: number | null;
  style?: string | null;
  color?: string | null;
  fabric?: { name: string; color?: string | null } | null;
};

/**
 * Raw row returned by get_showroom_orders_page.
 * All date fields arrive as ISO strings (not Date objects).
 * Mirrors the subset of order + work_order + joins that the RPC returns.
 */
type ShowroomRawRow = {
  id: number;
  invoice_number?: number | null;
  checkout_status?: string | null;
  order_type?: string | null;
  order_phase?: string | null;
  order_date?: string | null;
  delivery_date?: string | null;
  shop_received_date?: string | null;
  home_delivery?: boolean | null;
  advance?: number | string | null;
  paid?: number | string | null;
  discount_value?: number | string | null;
  order_total?: number | string | null;
  fabric_charge?: number | string | null;
  stitching_charge?: number | string | null;
  style_charge?: number | string | null;
  delivery_charge?: number | string | null;
  express_charge?: number | string | null;
  soaking_charge?: number | string | null;
  shelf_charge?: number | string | null;
  showroom_label?: string | null;
  customer?: {
    id?: number | null;
    name?: string | null;
    nick_name?: string | null;
    country_code?: string | null;
    phone?: string | null;
  } | null;
  garments?: ShowroomGarment[];
};

/**
 * Calculate delay in days between promised delivery date and today
 */
export function calculateDelay(promisedDeliveryDate: string): number {
  const promised = getKuwaitMidnight(parseUtcTimestamp(promisedDeliveryDate));
  const today = getKuwaitMidnight();

  const diffTime = today.getTime() - promised.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays > 0 ? diffDays : 0;
}

/**
 * Calculate total order amount from charges
 */
export function calculateTotal(order: ShowroomRawRow): number {
  return (
    (parseFloat(order.fabric_charge?.toString() || "0")) +
    (parseFloat(order.stitching_charge?.toString() || "0")) +
    (parseFloat(order.style_charge?.toString() || "0")) +
    (parseFloat(order.delivery_charge?.toString() || "0")) +
    (parseFloat(order.express_charge?.toString() || "0")) +
    (parseFloat(order.soaking_charge?.toString() || "0")) +
    (parseFloat(order.shelf_charge?.toString() || "0"))
  );
}

/**
 * Shape returned by the get_showroom_orders_page RPC (see triggers.sql).
 */
export type ShowroomStats = {
  total: number;
  ready: number;
  brova_trial: number;
  needs_action: number;
  partial_ready: number;
  alteration_in: number;
  alteration_out: number;
  awaiting_finals: number;
};

export type ShowroomPage = {
  rows: OrderRow[];
  totalCount: number;
  stats: ShowroomStats;
};

export type ShowroomQueryArgs = {
  page: number;              // 1-indexed
  pageSize: number;
  searchId?: string;
  customer?: string;
  stage?: string;            // showroom label, or 'all'
  reminderStatuses?: string[];
  deliveryDateStart?: string;
  deliveryDateEnd?: string;
  sortBy?: "deliveryDate_asc" | "deliveryDate_desc" | "balance_desc" | "created_desc";
};

const EMPTY_STATS: ShowroomStats = {
  total: 0,
  ready: 0,
  brova_trial: 0,
  needs_action: 0,
  partial_ready: 0,
  alteration_in: 0,
  alteration_out: 0,
  awaiting_finals: 0,
};

/**
 * Transform a single RPC row (orders + work_orders merged server-side,
 * with customer and garments attached) into the OrderRow shape the UI expects.
 * Exported so the customer order history view can reuse the same adapter
 * when it queries orders directly (no RPC) for a single customer.
 */
export function transformRow(raw: ShowroomRawRow): OrderRow {
  const order = raw; // already merged on the server
  const customer = raw.customer;
  const garments: ShowroomGarment[] = raw.garments || [];

  const garmentRowsData: GarmentRowData[] = garments.map((garment) => {
    const styleParts: string[] = [];
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
      locationKey: garment.location ?? undefined,
      locationLabel: (LOCATION_LABELS[garment.location as keyof typeof LOCATION_LABELS] || garment.location) ?? undefined,
      isBrova: garment.garment_type === "brova",
      deliveryDate: garment.delivery_date ?? null,
      delayInDays: calculateDelay(garment.delivery_date ?? new Date().toISOString()),
      fabricSource: garment.fabric_source || undefined,
      style: styleDesc,
      garment: garment as unknown as Garment,
    };
  });

  const customerName = customer?.name || "Unknown";
  const customerNickName = customer?.nick_name ?? undefined;
  const mobileNumber = customer
    ? `${customer.country_code ?? ""} ${customer.phone ?? ""}`.trim()
    : "N/A";

  const totalAmount =
    parseFloat(order.order_total?.toString() || "0") ||
    calculateTotal(order) - parseFloat(order.discount_value?.toString() || "0");

  // Max trip number — matches prior client logic for alteration cycle display.
  const shopItems = garments.filter(
    (g) =>
      g.location === "shop" && g.piece_stage !== "completed" && (g.trip_number ?? 0) > 0,
  );
  const activeItems = shopItems.filter((g) => g.acceptance_status !== true);
  const sourceItems = activeItems.length > 0 ? activeItems : shopItems;
  const maxTripNumber =
    sourceItems.length > 0 ? Math.max(...sourceItems.map((g) => g.trip_number ?? 1)) : 1;

  return {
    orderId: order.id.toString(),
    orderRecordId: order.id.toString(),
    invoiceNumber: order.invoice_number ?? undefined,
    fatoura: order.invoice_number ?? undefined,
    productionStage: order.order_phase
      ? ORDER_PHASE_LABELS[order.order_phase as keyof typeof ORDER_PHASE_LABELS] || "Unknown"
      : "Unknown",
    productionStageKey: order.order_phase ?? undefined,
    fatouraStage: order.order_phase
      ? ORDER_PHASE_LABELS[order.order_phase as keyof typeof ORDER_PHASE_LABELS] || "Unknown"
      : "Unknown",
    orderStatus:
      order.checkout_status === "confirmed"
        ? "Completed"
        : order.checkout_status === "cancelled"
          ? "Cancelled"
          : "Pending",
    checkoutStatus: order.checkout_status ?? undefined,
    orderDate: order.order_date ?? null,
    deliveryDate: order.delivery_date ?? null,
    shopReceivedDate: order.shop_received_date ?? null,
    customerId: customer?.id?.toString() || "0",
    customerName,
    customerNickName,
    mobileNumber,
    orderType: (order.order_type as "WORK" | "SALES" | null | undefined) ?? null,
    homeDelivery: order.home_delivery ?? null,
    totalAmount,
    advance: parseFloat(order.advance?.toString() || "0") || 0,
    balance: totalAmount - (parseFloat(order.paid?.toString() || "0") || 0),
    garmentsCount: garments.length,
    maxTripNumber,
    garments: garmentRowsData,
    showroomStatus: {
      label: (order.showroom_label ?? null) as "alteration_in" | "alteration_out" | "brova_trial" | "needs_action" | "ready_for_pickup" | null,
      hasPhysicalItems: shopItems.length > 0,
    },
    order: order as unknown as Order,
    customer: (customer ?? null) as unknown as (Customer | null),
  };
}

/**
 * Paginated, server-filtered showroom orders. Calls the
 * get_showroom_orders_page RPC which ports getShowroomStatus to SQL and
 * handles all filters + sort + stats in a single round trip.
 */
export function useShowroomOrders(args: ShowroomQueryArgs) {
  const brand = getBrand();
  return useQuery({
    queryKey: ["showroom-orders", brand, args],
    queryFn: async (): Promise<ShowroomPage> => {
      const { data, error } = await db.rpc("get_showroom_orders_page", {
        p_brand: brand,
        p_page: args.page,
        p_page_size: args.pageSize,
        p_search_id: args.searchId || null,
        p_customer: args.customer || null,
        p_stage: args.stage && args.stage !== "all" ? args.stage : null,
        p_reminder_statuses:
          args.reminderStatuses && args.reminderStatuses.length > 0
            ? args.reminderStatuses
            : null,
        p_delivery_date_start: args.deliveryDateStart || null,
        p_delivery_date_end: args.deliveryDateEnd || null,
        p_sort_by: args.sortBy || "created_desc",
      });

      if (error) {
        throw new Error(`Failed to fetch showroom orders: ${error.message}`);
      }

      const payload = (data ?? {}) as {
        data?: ShowroomRawRow[];
        total_count?: number;
        stats?: ShowroomStats;
      };

      return {
        rows: (payload.data ?? []).map(transformRow),
        totalCount: payload.total_count ?? 0,
        stats: payload.stats ?? EMPTY_STATS,
      };
    },
    // Keep previous page visible while the next one loads — avoids the table
    // flickering to a skeleton on every page/filter change.
    placeholderData: keepPreviousData,
    // Realtime invalidates on relevant changes, so this can stay hot across
    // navigations without refetching on every mount.
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });
}

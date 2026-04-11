import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type { OrderRow, GarmentRowData } from "@/components/orders-at-showroom/types";
import { ORDER_PHASE_LABELS, PIECE_STAGE_LABELS, LOCATION_LABELS } from "@/lib/constants";
import { db } from "@/lib/db";
import { getBrand } from "@/api/orders";
import { parseUtcTimestamp, getKuwaitMidnight } from "@/lib/utils";

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
export function calculateTotal(order: any): number {
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
  awaiting_finals: 0,
};

/**
 * Transform a single RPC row (orders + work_orders merged server-side,
 * with customer and garments attached) into the OrderRow shape the UI expects.
 * Exported so the customer order history view can reuse the same adapter
 * when it queries orders directly (no RPC) for a single customer.
 */
export function transformRow(raw: any): OrderRow {
  const order = raw; // already merged on the server
  const customer = raw.customer;
  const garments: any[] = raw.garments || [];

  const garmentRowsData: GarmentRowData[] = garments.map((garment: any) => {
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
      locationKey: garment.location,
      locationLabel: LOCATION_LABELS[garment.location as keyof typeof LOCATION_LABELS] || garment.location,
      isBrova: garment.garment_type === "brova",
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
    ? `${customer.country_code ?? ""} ${customer.phone ?? ""}`.trim()
    : "N/A";

  const totalAmount =
    parseFloat(order.order_total?.toString() || "0") ||
    calculateTotal(order) - parseFloat(order.discount_value?.toString() || "0");

  // Max trip number — matches prior client logic for alteration cycle display.
  const shopItems = garments.filter(
    (g: any) =>
      g.location === "shop" && g.piece_stage !== "completed" && (g.trip_number ?? 0) > 0,
  );
  const activeItems = shopItems.filter((g: any) => g.acceptance_status !== true);
  const sourceItems = activeItems.length > 0 ? activeItems : shopItems;
  const maxTripNumber =
    sourceItems.length > 0 ? Math.max(...sourceItems.map((g: any) => g.trip_number ?? 1)) : 1;

  return {
    orderId: order.id.toString(),
    orderRecordId: order.id.toString(),
    invoiceNumber: order.invoice_number,
    fatoura: order.invoice_number,
    productionStage: order.order_phase
      ? ORDER_PHASE_LABELS[order.order_phase as keyof typeof ORDER_PHASE_LABELS] || "Unknown"
      : "Unknown",
    productionStageKey: order.order_phase,
    fatouraStage: order.order_phase
      ? ORDER_PHASE_LABELS[order.order_phase as keyof typeof ORDER_PHASE_LABELS] || "Unknown"
      : "Unknown",
    orderStatus:
      order.checkout_status === "confirmed"
        ? "Completed"
        : order.checkout_status === "cancelled"
          ? "Cancelled"
          : "Pending",
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
    showroomStatus: {
      label: order.showroom_label ?? null,
      hasPhysicalItems: shopItems.length > 0,
    },
    order: order as any,
    customer,
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
        data?: any[];
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

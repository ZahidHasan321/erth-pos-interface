/**
 * Admin dashboard API layer.
 *
 * Thin typed wrappers over the read-only RPCs in
 * packages/database/migrations/0043_admin_dashboard_rpcs.sql. Every RPC is
 * SECURITY DEFINER + is_admin()-gated server-side; these functions just call
 * db.rpc, throw a descriptive error, and return the validated JSONB shape.
 *
 * The RPCs are cross-brand: p_brands NULL/[] = all brands (the owner default).
 * Date windows are UTC instants derived from Kuwait-local day ranges (see
 * getRangeBounds in lib/date-range.ts).
 */
import { db } from "@/lib/db";

// ── Shared shapes ────────────────────────────────────────────────────────────

/** A whole-row JSONB passthrough (to_jsonb(t.*)): known fields + open index. */
type Row = Record<string, unknown>;

// ── 1. Dashboard summary ─────────────────────────────────────────────────────

export interface DashboardKpis {
  collected: number;
  refunded: number;
  net_revenue: number;
  orders_count: number;
  work_count: number;
  sales_count: number;
  alteration_count: number;
  gross_sales: number;
  outstanding_ar: number;
  garments_in_production: number;
  qc_pass_rate: number | null;
  avg_turnaround_days: number | null;
  cancelled_count: number;
}

export interface RevenueTrendPoint { day: string; collected: number | null; refunded: number | null }
export interface BrandCount { brand: string; count: number; gross_sales: number }
export interface TypeCount { type: string; count: number }
export interface StageCount { stage: string; count: number }
export interface QcTrendPoint { day: string; pass: number; fail: number }
export interface TerminalTiming { stage: string; avg_seconds: number; piece_count: number }
export interface FabricByBrand { brand: string; total: number; count: number }
export interface TopCustomer { customer_id: number; name: string | null; orders: number; spend: number }

export interface DashboardSummary {
  range: { from: string; to: string };
  brands: string[] | null;
  kpis: DashboardKpis;
  revenue_trend: RevenueTrendPoint[];
  orders_by_brand: BrandCount[];
  order_type_split: TypeCount[];
  production_funnel: StageCount[];
  qc_trend: QcTrendPoint[];
  terminal_timing: TerminalTiming[];
  fabric_by_brand: FabricByBrand[] | null;
  top_customers: TopCustomer[];
}

export async function getDashboardSummary(
  from: string,
  to: string,
  brands: string[] | null,
): Promise<DashboardSummary> {
  const { data, error } = await db.rpc("admin_dashboard_summary", {
    p_from: from,
    p_to: to,
    p_brands: brands && brands.length ? brands : null,
  });
  if (error) throw new Error(`Failed to load dashboard summary: ${error.message}`);
  return data as DashboardSummary;
}

// ── 2. Orders explorer (keyset) ──────────────────────────────────────────────

export interface OrderCursor { group_date: string; group_key: number; id: number }

export interface OrderRow {
  id: number;
  order_date: string;
  brand: string;
  order_type: string;
  checkout_status: string;
  order_total: number | string | null;
  paid: number | string | null;
  invoice_number: number | null;
  order_phase: string | null;
  delivery_date: string | null;
  home_delivery: boolean;
  c_id: number | null;
  c_name: string | null;
  c_phone: string | null;
  c_country_code: string | null;
  garments_count: number | null;
  brova_count: number | null;
  final_count: number | null;
  alteration_count: number | null;
  status_label: string | null;
  // §2.13 order-link grouping (rows arrive clustered, primary first).
  group_key: number;
  is_link_child: boolean;
  link_size: number;
}

export interface OrdersPageStats {
  total_orders: number;
  total_value: number;
  total_outstanding: number;
}

export interface OrdersPage {
  data: OrderRow[];
  next_cursor: OrderCursor | null;
  stats: OrdersPageStats | null;
}

export interface OrdersPageParams {
  cursor?: OrderCursor | null;
  pageSize?: number;
  brands?: string[] | null;
  orderType?: string | null;
  phase?: string | null;
  search?: string | null;
  from?: string | null;
  to?: string | null;
}

export async function getOrdersPage(params: OrdersPageParams): Promise<OrdersPage> {
  const { data, error } = await db.rpc("admin_orders_page", {
    p_cursor: params.cursor ?? null,
    p_page_size: params.pageSize ?? 30,
    p_brands: params.brands && params.brands.length ? params.brands : null,
    p_order_type: params.orderType ?? null,
    p_phase: params.phase ?? null,
    p_search: params.search ?? null,
    p_from: params.from ?? null,
    p_to: params.to ?? null,
  });
  if (error) throw new Error(`Failed to load orders: ${error.message}`);
  return data as OrdersPage;
}

// ── 3. Order detail ──────────────────────────────────────────────────────────

export interface OrderTotals {
  order_total: number | string | null;
  paid: number | string | null;
  outstanding: number | string | null;
  advance: number | string | null;
  invoice_revision: number;
}

export interface PaymentRow {
  id: number;
  amount: number | string;
  payment_type: string | null;
  transaction_type: string;
  refund_reason: string | null;
  payment_ref_no: string | null;
  created_at: string;
}

export interface LinkedOrder {
  order_id: number;
  invoice_number: number | null;
  order_total: number | string | null;
  order_phase: string | null;
  is_primary: boolean;
}

export interface OrderGarmentSummary {
  id: string;
  garment_id: string;
  garment_type: string;
  style: string | null;
  piece_stage: string | null;
  location: string | null;
  trip_number: number | null;
  in_production: boolean;
  acceptance_status: boolean | null;
  feedback_status: string | null;
  needs_investigation: boolean | null;
  root_cause: string | null;
  delivery_date: string | null;
  collected_at: string | null;
  express: boolean | null;
  soaking: boolean | null;
}

export interface OrderDetail {
  order: Row;
  work_order: Row | null;
  alteration_order: Row | null;
  customer: Row | null;
  totals: OrderTotals;
  payments: PaymentRow[];
  linked_group: LinkedOrder[];
  garments: OrderGarmentSummary[];
}

export async function getOrderDetail(orderId: number): Promise<OrderDetail | null> {
  const { data, error } = await db.rpc("admin_order_detail", { p_order_id: orderId });
  if (error) throw new Error(`Failed to load order ${orderId}: ${error.message}`);
  return (data as OrderDetail | null) ?? null;
}

// ── 4. Garment detail (the deep one) ─────────────────────────────────────────

export interface GarmentFeedbackRow extends Row {
  id: string;
  feedback_type: string | null;
  trip_number: number | null;
  action: string | null;
  satisfaction_level: number | null;
  notes: string | null;
  created_at: string;
}

export interface GarmentDetail {
  garment: Row; // to_jsonb(garments.*): includes trip_history, stage_timings, quality_check_ratings, etc.
  order: {
    id: number;
    brand: string;
    order_type: string;
    order_date: string;
    invoice_number: number | null;
  };
  customer: { id: number; name: string | null; phone: string | null };
  fabric: { id: number; name: string | null; sku: string | null } | null;
  measurement: Row | null;
  feedback: GarmentFeedbackRow[];
  replaced_by: { id: string; garment_id: string; piece_stage: string | null; location: string | null; trip_number: number | null } | null;
  original: { id: string; garment_id: string; order_id: number } | null;
}

export async function getGarmentDetail(garmentId: string): Promise<GarmentDetail | null> {
  const { data, error } = await db.rpc("admin_garment_detail", { p_garment_id: garmentId });
  if (error) throw new Error(`Failed to load garment ${garmentId}: ${error.message}`);
  return (data as GarmentDetail | null) ?? null;
}

// ── 5. Customer × brand matrix ───────────────────────────────────────────────

export interface CustomerBrandRow {
  customer_id: number;
  name: string | null;
  total_orders: number;
  total_spend: number;
  brand_count: number;
  brands: Record<string, { orders: number; spend: number }> | null;
}

export async function getCustomerBrandMatrix(
  from: string,
  to: string,
  limit = 25,
): Promise<CustomerBrandRow[]> {
  const { data, error } = await db.rpc("admin_customer_brand_matrix", {
    p_from: from,
    p_to: to,
    p_limit: limit,
  });
  if (error) throw new Error(`Failed to load customer/brand matrix: ${error.message}`);
  return (data as CustomerBrandRow[]) ?? [];
}

// ── 6. Garments browser (keyset) — the missing direct garment list ───────────
// Backed by admin_garments_page (0044). Same keyset shape as admin_orders_page,
// but the cursor tiebreaks on the garment UUID.

export interface GarmentCursor { order_date: string; id: string }

export interface GarmentRow {
  id: string;
  garment_id: string | null;
  garment_type: string;
  style: string | null;
  piece_stage: string | null;
  location: string | null;
  trip_number: number | null;
  in_production: boolean;
  acceptance_status: boolean | null;
  feedback_status: string | null;
  root_cause: string | null;
  express: boolean | null;
  soaking: boolean | null;
  assigned_unit: string | null;
  assigned_person: string | null;
  delivery_date: string | null;
  collected_at: string | null;
  order_id: number;
  order_date: string;
  brand: string;
  order_type: string;
  invoice_number: number | null;
  c_id: number | null;
  c_name: string | null;
  c_phone: string | null;
}

export interface GarmentsPageStats {
  total_garments: number;
  in_production: number;
  brova: number;
  final: number;
  alteration: number;
}

export interface GarmentsPage {
  data: GarmentRow[];
  next_cursor: GarmentCursor | null;
  stats: GarmentsPageStats | null;
}

export interface GarmentsPageParams {
  cursor?: GarmentCursor | null;
  pageSize?: number;
  brands?: string[] | null;
  garmentType?: string | null;
  pieceStage?: string | null;
  location?: string | null;
  search?: string | null;
  from?: string | null;
  to?: string | null;
}

export async function getGarmentsPage(params: GarmentsPageParams): Promise<GarmentsPage> {
  const { data, error } = await db.rpc("admin_garments_page", {
    p_cursor: params.cursor ?? null,
    p_page_size: params.pageSize ?? 30,
    p_brands: params.brands && params.brands.length ? params.brands : null,
    p_garment_type: params.garmentType ?? null,
    p_piece_stage: params.pieceStage ?? null,
    p_location: params.location ?? null,
    p_search: params.search ?? null,
    p_from: params.from ?? null,
    p_to: params.to ?? null,
  });
  if (error) throw new Error(`Failed to load garments: ${error.message}`);
  return data as GarmentsPage;
}

// ── 7. Inventory — the whole shared stock pool (fabric + shelf + accessories) ─

export interface FabricStockRow {
  id: number;
  name: string;
  sku: string | null;
  color: string | null;
  color_hex: string | null;
  season: string | null;
  shop_stock: number | string | null;
  workshop_stock: number | string | null;
  price: number | string | null;
  avg_cost: number | string | null;
  low_stock_threshold: number | string | null;
  supplier: string | null;
  is_archived: boolean;
  low: boolean;
}

export interface ShelfStockRow {
  id: number;
  name: string | null;
  sku: string | null;
  brand: string | null;
  shop_stock: number | string | null;
  workshop_stock: number | string | null;
  price: number | string | null;
  avg_cost: number | string | null;
  low_stock_threshold: number | string | null;
  is_archived: boolean;
  low: boolean;
}

export interface AccessoryStockRow {
  id: number;
  name: string;
  sku: string | null;
  category: string;
  unit_of_measure: string;
  shop_stock: number | string | null;
  workshop_stock: number | string | null;
  price: number | string | null;
  low_stock_threshold: number | string | null;
  is_archived: boolean;
  low: boolean;
}

export interface InventorySummary {
  fabric_count: number;
  shelf_count: number;
  accessory_count: number;
  low_stock_count: number;
  stock_value_at_cost: number | string;
}

export interface Inventory {
  fabrics: FabricStockRow[];
  shelf: ShelfStockRow[];
  accessories: AccessoryStockRow[];
  summary: InventorySummary;
}

export async function getInventory(search: string | null, includeArchived: boolean): Promise<Inventory> {
  const { data, error } = await db.rpc("admin_inventory", {
    p_search: search ?? null,
    p_include_archived: includeArchived,
  });
  if (error) throw new Error(`Failed to load inventory: ${error.message}`);
  return data as Inventory;
}

// ── 7b. Inventory item detail — one item + usage rollups + its own ledger ────

export interface InventoryItemDetail {
  id: number;
  item_type: "fabric" | "shelf" | "accessory";
  name: string | null;
  sku: string | null;
  unit: string;
  shop_stock: number | string | null;
  workshop_stock: number | string | null;
  price: number | string | null;
  avg_cost: number | string | null;
  low_stock_threshold: number | string | null;
  is_archived: boolean;
  low: boolean;
  // fabric-only extras
  color?: string | null;
  color_hex?: string | null;
  season?: string | null;
  supplier?: string | null;
  // shelf-only extras
  brand?: string | null;
  // accessory-only extras
  category?: string | null;
  unit_of_measure?: string | null;
}

export interface InventoryItemRollup {
  consumed: number | string;
  restocked: number | string;
  wasted: number | string;
  returned: number | string;
  adjusted: number | string;
  transferred_in: number | string;
  transferred_out: number | string;
  movement_count: number;
  first_movement: string | null;
  last_movement: string | null;
}

export interface ConsumptionByBrand {
  brand: string;
  qty: number | string;
  count: number;
}

export interface InventoryItem {
  item: InventoryItemDetail;
  rollup: InventoryItemRollup;
  by_brand: ConsumptionByBrand[];
  movements: MovementRow[];
}

export async function getInventoryItem(
  itemType: string,
  itemId: number,
  limit = 200,
): Promise<InventoryItem | null> {
  const { data, error } = await db.rpc("admin_inventory_item", {
    p_item_type: itemType,
    p_item_id: itemId,
    p_limit: limit,
  });
  if (error) throw new Error(`Failed to load inventory item: ${error.message}`);
  return data as InventoryItem | null;
}

// ── 8. Stock movements — recent ledger + aggregates + waste-by-cause ─────────

export interface MovementRow {
  id: number;
  item_type: string;
  item_id: number;
  item_name: string | null;
  location: string;
  movement_type: string;
  qty_delta: number | string;
  qty_after: number | string | null;
  reason: string | null;
  root_cause: string | null;
  annotated_qty: number | string | null;
  brand: string | null;
  supplier_name: string | null;
  user_name: string | null;
  created_at: string;
}

export interface MovementAggregate { movement_type: string; count: number; net_qty: number | string }
export interface WasteByCause { root_cause: string; count: number; qty: number | string }

export interface StockMovements {
  movements: MovementRow[];
  aggregates: MovementAggregate[];
  waste_by_cause: WasteByCause[];
  total_in_window: number;
}

export interface StockMovementsParams {
  from?: string | null;
  to?: string | null;
  itemType?: string | null;
  location?: string | null;
  movementType?: string | null;
  limit?: number;
}

export async function getStockMovements(params: StockMovementsParams): Promise<StockMovements> {
  const { data, error } = await db.rpc("admin_stock_movements", {
    p_from: params.from ?? null,
    p_to: params.to ?? null,
    p_item_type: params.itemType ?? null,
    p_location: params.location ?? null,
    p_movement_type: params.movementType ?? null,
    p_limit: params.limit ?? 100,
  });
  if (error) throw new Error(`Failed to load stock movements: ${error.message}`);
  return data as StockMovements;
}

// ── 9. People — staff roster, workshop workers, customer directory ───────────

export interface StaffRow {
  id: string;
  name: string;
  username: string;
  role: string | null;
  department: string | null;
  job_functions: string[] | null;
  brands: string[] | null;
  is_active: boolean;
  employee_id: string | null;
  phone: string | null;
  email: string | null;
  nationality: string | null;
  hire_date: string | null;
  last_active_at: string | null;
}

export async function getStaffRoster(): Promise<StaffRow[]> {
  const { data, error } = await db.rpc("admin_staff_roster", {});
  if (error) throw new Error(`Failed to load staff roster: ${error.message}`);
  return (data as StaffRow[]) ?? [];
}

export interface WorkerRow {
  id: string;
  resource_name: string;
  brand: string | null;
  resource_type: string | null;
  responsibility: string | null;
  rating: number | null;
  daily_target: number | null;
  overtime_target: number | null;
  unit_id: string | null;
  unit_name: string | null;
  stage: string | null;
  user_id: string | null;
  user_name: string | null;
  user_active: boolean | null;
}

export async function getWorkshopRoster(): Promise<WorkerRow[]> {
  const { data, error } = await db.rpc("admin_workshop_roster", {});
  if (error) throw new Error(`Failed to load workshop roster: ${error.message}`);
  return (data as WorkerRow[]) ?? [];
}

export interface CustomerCursor { family_key: number; id: number }

export interface CustomerRow {
  id: number;
  name: string;
  arabic_name: string | null;
  phone: string | null;
  country_code: string | null;
  nick_name: string | null;
  account_type: string | null;
  relation: string | null;
  primary_customer_id: number | null;
  primary_name: string | null;
  customer_segment: string | null;
  city: string | null;
  area: string | null;
  created_at: string | null;
  orders_count: number;
  total_spend: number | string;
  // Family grouping (rows arrive clustered: root Primary first, then Secondaries).
  family_key: number;
  family_size: number;
}

export interface CustomersPageStats {
  total_customers: number;
  primary_count: number;
  secondary_count: number;
}

export interface CustomersPage {
  data: CustomerRow[];
  next_cursor: CustomerCursor | null;
  stats: CustomersPageStats | null;
}

export interface CustomersPageParams {
  cursor?: CustomerCursor | null;
  pageSize?: number;
  accountType?: string | null;
  search?: string | null;
}

export async function getCustomersPage(params: CustomersPageParams): Promise<CustomersPage> {
  const { data, error } = await db.rpc("admin_customers_page", {
    p_cursor: params.cursor ?? null,
    p_page_size: params.pageSize ?? 30,
    p_account_type: params.accountType ?? null,
    p_search: params.search ?? null,
  });
  if (error) throw new Error(`Failed to load customers: ${error.message}`);
  return data as CustomersPage;
}

// ── 10. Customer detail (profile + linking + order history) ──────────────────
// Backed by admin_customer_detail (0047). Returns NULL for a clean 404.

export interface CustomerProfile {
  id: number;
  name: string;
  arabic_name: string | null;
  phone: string | null;
  country_code: string | null;
  nick_name: string | null;
  account_type: string | null;
  relation: string | null;
  primary_customer_id: number | null;
  customer_segment: string | null;
  nationality: string | null;
  city: string | null;
  area: string | null;
  email: string | null;
  notes: string | null;
  created_at: string | null;
}

export interface FamilyMember {
  id: number;
  name: string;
  relation: string | null;
  account_type: string | null;
  is_self: boolean;
}

export interface CustomerDetailStats {
  orders_count: number;
  total_spend: number | string;
  outstanding_total: number | string;
  last_order_at: string | null;
}

export interface CustomerDetailOrder {
  id: number;
  order_date: string;
  brand: string;
  order_type: string;
  checkout_status: string;
  order_total: number | string | null;
  paid: number | string | null;
  invoice_number: number | null;
  order_phase: string | null;
  delivery_date: string | null;
  home_delivery: boolean;
  garments_count: number | null;
  brova_count: number | null;
  final_count: number | null;
  alteration_count: number | null;
  status_label: string | null;
  group_key: number;
  is_link_child: boolean;
  link_size: number;
}

export interface CustomerDetail {
  customer: CustomerProfile;
  family: FamilyMember[];
  stats: CustomerDetailStats;
  orders: CustomerDetailOrder[];
}

export async function getCustomerDetail(id: number): Promise<CustomerDetail | null> {
  const { data, error } = await db.rpc("admin_customer_detail", { p_customer_id: id });
  if (error) throw new Error(`Failed to load customer ${id}: ${error.message}`);
  return (data as CustomerDetail | null) ?? null;
}

// ── 11. Staff performance (Team › Staff) ─────────────────────────────────────
// Backed by admin_staff_performance / admin_staff_detail (0047, Phase 2). Every
// user with in-range attribution: orders taken, order/brand mix, measurements,
// cashier collections (net — refunds already negative).

export interface OrderMix {
  WORK: number;
  SALES: number;
  ALTERATION: number;
}

export interface BrandMixEntry {
  brand: string;
  count: number;
}

export interface StaffPerfRow {
  id: string;
  name: string;
  username: string;
  role: string | null;
  department: string | null;
  brands: string[] | null;
  is_active: boolean;
  orders_taken: number;
  orders_value: number | string;
  order_mix: OrderMix;
  brand_mix: BrandMixEntry[];
  measurements_taken: number;
  collections_amount: number | string;
  collections_count: number;
}

export interface StaffPerfStats {
  staff_count: number;
  total_orders: number;
  total_value: number | string;
  total_measurements: number;
  total_collections: number | string;
}

export interface StaffPerfPage {
  data: StaffPerfRow[];
  stats: StaffPerfStats;
}

export async function getStaffPerformance(
  { from, to, brands }: { from: string; to: string; brands: string[] | null },
): Promise<StaffPerfPage> {
  const { data, error } = await db.rpc("admin_staff_performance", {
    p_from: from,
    p_to: to,
    p_brands: brands && brands.length ? brands : null,
  });
  if (error) throw new Error(`Failed to load staff performance: ${error.message}`);
  return data as StaffPerfPage;
}

export interface StaffProfile {
  id: string;
  name: string;
  username: string;
  role: string | null;
  department: string | null;
  brands: string[] | null;
  is_active: boolean;
  employee_id: string | null;
  phone: string | null;
  email: string | null;
  hire_date: string | null;
}

export interface StaffTotals {
  orders_taken: number;
  orders_value: number | string;
  order_mix: OrderMix;
  measurements_taken: number;
  collections_amount: number | string;
  collections_count: number;
}

export interface StaffDailyRow {
  day: string;
  orders_taken: number;
  orders_value: number | string;
  measurements_taken: number;
  collections_amount: number | string;
}

export interface StaffDetail {
  user: StaffProfile;
  totals: StaffTotals;
  daily: StaffDailyRow[];
  recent_orders: OrderRow[];
}

export async function getStaffDetail(
  userId: string,
  { from, to }: { from: string; to: string },
): Promise<StaffDetail | null> {
  const { data, error } = await db.rpc("admin_staff_detail", {
    p_user_id: userId,
    p_from: from,
    p_to: to,
  });
  if (error) throw new Error(`Failed to load staff ${userId}: ${error.message}`);
  return (data as StaffDetail | null) ?? null;
}

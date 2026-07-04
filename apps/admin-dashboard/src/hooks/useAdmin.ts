/**
 * TanStack Query hooks for the admin dashboard RPCs.
 *
 * Filters are folded into the query key so each change refetches. List queries
 * keep the previous page visible while fetching (no skeleton flash). All data is
 * read-only, so a 60s stale time is comfortable.
 */
import {
  useQuery,
  useInfiniteQuery,
  keepPreviousData,
} from "@tanstack/react-query";
import {
  getDashboardSummary,
  getOrdersPage,
  getOrderDetail,
  getGarmentDetail,
  getCustomerBrandMatrix,
  getGarmentsPage,
  getInventory,
  getStockMovements,
  getStaffRoster,
  getWorkshopRoster,
  getCustomersPage,
  type OrderCursor,
  type OrdersPage,
  type GarmentCursor,
  type GarmentsPage,
  type CustomerCursor,
  type CustomersPage,
  type StockMovementsParams,
} from "@/api/admin";
import type { RangeBounds } from "@/lib/date-range";

export const STALE_TIME = 60_000;

export const adminKeys = {
  summary: (from: string, to: string, brands: string[]) =>
    ["admin", "summary", from, to, brands.join(",")] as const,
  matrix: (from: string, to: string) => ["admin", "matrix", from, to] as const,
  orders: (filters: unknown) => ["admin", "orders", filters] as const,
  orderDetail: (id: number) => ["admin", "order", id] as const,
  garmentDetail: (id: string) => ["admin", "garment", id] as const,
  garments: (filters: unknown) => ["admin", "garments", filters] as const,
  inventory: (search: string, archived: boolean) => ["admin", "inventory", search, archived] as const,
  movements: (params: unknown) => ["admin", "movements", params] as const,
  staff: () => ["admin", "staff"] as const,
  workers: () => ["admin", "workers"] as const,
  customers: (filters: unknown) => ["admin", "customers", filters] as const,
};

export function useDashboardSummary(range: RangeBounds, brands: string[]) {
  return useQuery({
    queryKey: adminKeys.summary(range.from, range.to, brands),
    queryFn: () => getDashboardSummary(range.from, range.to, brands.length ? brands : null),
    staleTime: STALE_TIME,
    placeholderData: keepPreviousData,
  });
}

export function useCustomerBrandMatrix(range: RangeBounds, enabled = true) {
  return useQuery({
    queryKey: adminKeys.matrix(range.from, range.to),
    queryFn: () => getCustomerBrandMatrix(range.from, range.to, 25),
    staleTime: STALE_TIME,
    enabled,
    placeholderData: keepPreviousData,
  });
}

export interface OrdersFilters {
  brands: string[];
  orderType: string | null;
  phase: string | null;
  search: string | null;
  from: string | null;
  to: string | null;
}

/**
 * Keyset-paginated orders. Each page returns its own `next_cursor`; the infinite
 * query threads it into the next request. `stats` is present only on page 1.
 */
export function useOrdersPage(filters: OrdersFilters) {
  return useInfiniteQuery({
    queryKey: adminKeys.orders(filters),
    queryFn: ({ pageParam }: { pageParam: OrderCursor | null }) =>
      getOrdersPage({
        cursor: pageParam,
        pageSize: 30,
        brands: filters.brands.length ? filters.brands : null,
        orderType: filters.orderType,
        phase: filters.phase,
        search: filters.search,
        from: filters.from,
        to: filters.to,
      }),
    initialPageParam: null as OrderCursor | null,
    getNextPageParam: (lastPage: OrdersPage) => lastPage.next_cursor ?? undefined,
    staleTime: STALE_TIME,
    placeholderData: keepPreviousData,
  });
}

export function useOrderDetail(orderId: number) {
  return useQuery({
    queryKey: adminKeys.orderDetail(orderId),
    queryFn: () => getOrderDetail(orderId),
    staleTime: STALE_TIME,
    enabled: Number.isFinite(orderId) && orderId > 0,
  });
}

export function useGarmentDetail(garmentId: string) {
  return useQuery({
    queryKey: adminKeys.garmentDetail(garmentId),
    queryFn: () => getGarmentDetail(garmentId),
    staleTime: STALE_TIME,
    enabled: !!garmentId,
  });
}

export interface GarmentsFilters {
  brands: string[];
  garmentType: string | null;
  pieceStage: string | null;
  location: string | null;
  search: string | null;
  from: string | null;
  to: string | null;
}

/** Keyset-paginated garments browser (the direct garment list 0043 lacked). */
export function useGarmentsPage(filters: GarmentsFilters) {
  return useInfiniteQuery({
    queryKey: adminKeys.garments(filters),
    queryFn: ({ pageParam }: { pageParam: GarmentCursor | null }) =>
      getGarmentsPage({
        cursor: pageParam,
        pageSize: 30,
        brands: filters.brands.length ? filters.brands : null,
        garmentType: filters.garmentType,
        pieceStage: filters.pieceStage,
        location: filters.location,
        search: filters.search,
        from: filters.from,
        to: filters.to,
      }),
    initialPageParam: null as GarmentCursor | null,
    getNextPageParam: (lastPage: GarmentsPage) => lastPage.next_cursor ?? undefined,
    staleTime: STALE_TIME,
    placeholderData: keepPreviousData,
  });
}

export function useInventory(search: string, includeArchived: boolean) {
  return useQuery({
    queryKey: adminKeys.inventory(search, includeArchived),
    queryFn: () => getInventory(search || null, includeArchived),
    staleTime: STALE_TIME,
    placeholderData: keepPreviousData,
  });
}

export function useStockMovements(params: StockMovementsParams) {
  return useQuery({
    queryKey: adminKeys.movements(params),
    queryFn: () => getStockMovements(params),
    staleTime: STALE_TIME,
    placeholderData: keepPreviousData,
  });
}

export function useStaffRoster() {
  return useQuery({
    queryKey: adminKeys.staff(),
    queryFn: getStaffRoster,
    staleTime: STALE_TIME,
  });
}

export function useWorkshopRoster() {
  return useQuery({
    queryKey: adminKeys.workers(),
    queryFn: getWorkshopRoster,
    staleTime: STALE_TIME,
  });
}

export interface CustomersFilters {
  accountType: string | null;
  search: string | null;
}

/** Keyset-paginated customer directory with spend rollups. */
export function useCustomersPage(filters: CustomersFilters) {
  return useInfiniteQuery({
    queryKey: adminKeys.customers(filters),
    queryFn: ({ pageParam }: { pageParam: CustomerCursor | null }) =>
      getCustomersPage({
        cursor: pageParam,
        pageSize: 30,
        accountType: filters.accountType,
        search: filters.search,
      }),
    initialPageParam: null as CustomerCursor | null,
    getNextPageParam: (lastPage: CustomersPage) => lastPage.next_cursor ?? undefined,
    staleTime: STALE_TIME,
    placeholderData: keepPreviousData,
  });
}

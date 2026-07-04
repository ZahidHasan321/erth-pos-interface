/**
 * TanStack Query hooks for the admin Finance RPCs. Same conventions as
 * useAdmin.ts — filters folded into the query key, keepPreviousData on lists,
 * 60s stale time (all read-only).
 */
import { useQuery, useInfiniteQuery, keepPreviousData } from "@tanstack/react-query";
import {
  getFinanceSummary,
  getTransactionsPage,
  getRegistersPage,
  getRegisterDetail,
  getPurchasesPage,
  getPurchaseDetail,
  type TxnCursor,
  type TransactionsPage,
  type TransactionsParams,
  type PurchaseCursor,
  type PurchasesPage,
  type PurchasesParams,
} from "@/api/finance";
import type { RangeBounds } from "@/lib/date-range";
import { STALE_TIME } from "@/hooks/useAdmin";

export const financeKeys = {
  summary: (from: string, to: string, brands: string[]) =>
    ["finance", "summary", from, to, brands.join(",")] as const,
  transactions: (filters: unknown) => ["finance", "transactions", filters] as const,
  registers: (from: string, to: string, brands: string[], status: string | null) =>
    ["finance", "registers", from, to, brands.join(","), status ?? ""] as const,
  registerDetail: (id: number) => ["finance", "register", id] as const,
  purchases: (filters: unknown) => ["finance", "purchases", filters] as const,
  purchaseDetail: (id: number) => ["finance", "purchase", id] as const,
};

export function useFinanceSummary(range: RangeBounds, brands: string[]) {
  return useQuery({
    queryKey: financeKeys.summary(range.from, range.to, brands),
    queryFn: () => getFinanceSummary(range.from, range.to, brands.length ? brands : null),
    staleTime: STALE_TIME,
    placeholderData: keepPreviousData,
  });
}

export function useTransactionsPage(filters: Omit<TransactionsParams, "cursor">) {
  return useInfiniteQuery({
    queryKey: financeKeys.transactions(filters),
    queryFn: ({ pageParam }) => getTransactionsPage({ ...filters, cursor: pageParam as TxnCursor | null }),
    initialPageParam: null as TxnCursor | null,
    getNextPageParam: (last: TransactionsPage) => last.next_cursor,
    staleTime: STALE_TIME,
    placeholderData: keepPreviousData,
  });
}

export function useRegistersPage(range: RangeBounds, brands: string[], status: string | null) {
  return useQuery({
    queryKey: financeKeys.registers(range.from, range.to, brands, status),
    queryFn: () => getRegistersPage(range.from, range.to, brands.length ? brands : null, status),
    staleTime: STALE_TIME,
    placeholderData: keepPreviousData,
  });
}

export function useRegisterDetail(sessionId: number) {
  return useQuery({
    queryKey: financeKeys.registerDetail(sessionId),
    queryFn: () => getRegisterDetail(sessionId),
    staleTime: STALE_TIME,
    enabled: Number.isFinite(sessionId),
  });
}

export function usePurchasesPage(filters: Omit<PurchasesParams, "cursor">) {
  return useInfiniteQuery({
    queryKey: financeKeys.purchases(filters),
    queryFn: ({ pageParam }) => getPurchasesPage({ ...filters, cursor: pageParam as PurchaseCursor | null }),
    initialPageParam: null as PurchaseCursor | null,
    getNextPageParam: (last: PurchasesPage) => last.next_cursor,
    staleTime: STALE_TIME,
    placeholderData: keepPreviousData,
  });
}

export function usePurchaseDetail(purchaseId: number) {
  return useQuery({
    queryKey: financeKeys.purchaseDetail(purchaseId),
    queryFn: () => getPurchaseDetail(purchaseId),
    staleTime: STALE_TIME,
    enabled: Number.isFinite(purchaseId),
  });
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getTransferRequests,
  getTransferBadgeCounts,
  createTransferRequest,
  approveTransferRequest,
  rejectTransferRequest,
  reviseTransferRequest,
  dispatchTransfer,
  receiveTransfer,
  deleteTransferRequest,
  type TransferFilters,
} from "@/api/transfers";
import { getBrand } from "@/api/orders";
import { useAuth } from "@/context/auth";

const TRANSFER_KEY = "transfer-requests";
export const TRANSFER_BADGE_KEY = "transfer-badge-counts";

// Realtime subscribes to transfer_requests + transfer_request_items and
// invalidates both keys on every change, so navigations can reuse the cache
// without refetching.
const TRANSFER_STALE_TIME = 5 * 60 * 1000;

/**
 * Lightweight count-only query for sidebar badges.
 * Single request, no joins — just 3 parallel HEAD counts.
 */
export function useTransferBadgeCounts(enabled = true) {
  const brand = getBrand();
  return useQuery({
    queryKey: [TRANSFER_BADGE_KEY, brand],
    queryFn: () => getTransferBadgeCounts(brand),
    enabled,
    staleTime: TRANSFER_STALE_TIME,
  });
}

export function useTransferRequests(filters?: TransferFilters) {
  const brand = getBrand();
  const filtersWithBrand = { ...filters, brand };
  return useQuery({
    queryKey: [TRANSFER_KEY, filtersWithBrand],
    queryFn: () => getTransferRequests(filtersWithBrand),
    staleTime: TRANSFER_STALE_TIME,
  });
}

export function useCreateTransfer() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (data: {
      direction: string;
      item_type: string;
      notes?: string;
      items: { fabric_id?: number; shelf_id?: number; accessory_id?: number; requested_qty: number }[];
    }) => createTransferRequest({ ...data, requested_by: user!.id, brand: getBrand() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [TRANSFER_KEY] });
    },
  });
}

export function useApproveTransfer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, items }: { id: number; items: { id: number; approved_qty: number }[] }) =>
      approveTransferRequest(id, items),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [TRANSFER_KEY] });
    },
  });
}

export function useRejectTransfer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      rejectTransferRequest(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [TRANSFER_KEY] });
    },
  });
}

export function useReviseTransfer() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (data: {
      originalId: number;
      direction: string;
      item_type: string;
      notes?: string;
      revision_number: number;
      items: { fabric_id?: number; shelf_id?: number; accessory_id?: number; requested_qty: number }[];
    }) => {
      const { originalId, ...rest } = data;
      return reviseTransferRequest(originalId, { ...rest, requested_by: user!.id, brand: getBrand() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [TRANSFER_KEY] });
    },
  });
}

export function useDispatchTransfer() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: ({ transferId, items }: { transferId: number; items: { id: number; dispatched_qty: number }[] }) =>
      dispatchTransfer(transferId, user!.id, items),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [TRANSFER_KEY] });
      queryClient.invalidateQueries({ queryKey: ["fabrics"], refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: ["shelf"], refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: ["accessories"], refetchType: "active" });
    },
  });
}

export function useCancelTransfer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => deleteTransferRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [TRANSFER_KEY] });
    },
  });
}

export function useReceiveTransfer() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: ({ transferId, items }: { transferId: number; items: { id: number; received_qty: number; discrepancy_note?: string }[] }) =>
      receiveTransfer(transferId, user!.id, items),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [TRANSFER_KEY] });
      queryClient.invalidateQueries({ queryKey: ["fabrics"], refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: ["shelf"], refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: ["accessories"], refetchType: "active" });
    },
  });
}

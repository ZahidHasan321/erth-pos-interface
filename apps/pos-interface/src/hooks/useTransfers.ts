import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getTransferRequests,
  createTransferRequest,
  approveTransferRequest,
  rejectTransferRequest,
  reviseTransferRequest,
  dispatchTransfer,
  receiveTransfer,
  deleteTransferRequest,
  type TransferFilters,
} from "@/api/transfers";
import { useAuth } from "@/context/auth";

const TRANSFER_KEY = "transfer-requests";

export function useTransferRequests(filters?: TransferFilters) {
  return useQuery({
    queryKey: [TRANSFER_KEY, filters],
    queryFn: () => getTransferRequests(filters),
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
    }) => createTransferRequest({ ...data, requested_by: user!.id }),
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
      return reviseTransferRequest(originalId, { ...rest, requested_by: user!.id });
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
      queryClient.invalidateQueries({ queryKey: ["fabrics"] });
      queryClient.invalidateQueries({ queryKey: ["shelf"] });
      queryClient.invalidateQueries({ queryKey: ["accessories"] });
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
      queryClient.invalidateQueries({ queryKey: ["fabrics"] });
      queryClient.invalidateQueries({ queryKey: ["shelf"] });
      queryClient.invalidateQueries({ queryKey: ["accessories"] });
    },
  });
}

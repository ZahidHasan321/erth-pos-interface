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

const TRANSFER_KEY = ["transfer-requests"] as const;

export function useTransferRequests(filters?: TransferFilters) {
  return useQuery({
    queryKey: [...TRANSFER_KEY, filters],
    queryFn: () => getTransferRequests(filters),
    staleTime: 30_000,
  });
}

export function useCreateTransfer() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (data: {
      direction: string;
      item_type: string;
      notes?: string;
      items: { fabric_id?: number; shelf_id?: number; accessory_id?: number; requested_qty: number }[];
    }) => createTransferRequest({ ...data, requested_by: user!.id, brand: 'ERTH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: TRANSFER_KEY }),
  });
}

export function useApproveTransfer() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, items }: { id: number; items: { id: number; approved_qty: number }[] }) =>
      approveTransferRequest(id, items),
    onSuccess: () => qc.invalidateQueries({ queryKey: TRANSFER_KEY }),
  });
}

export function useRejectTransfer() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      rejectTransferRequest(id, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: TRANSFER_KEY }),
  });
}

export function useReviseTransfer() {
  const qc = useQueryClient();
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
      return reviseTransferRequest(originalId, { ...rest, requested_by: user!.id, brand: 'ERTH' });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: TRANSFER_KEY }),
  });
}

export function useDispatchTransfer() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: ({ transferId, items }: { transferId: number; items: { id: number; dispatched_qty: number }[] }) =>
      dispatchTransfer(transferId, user!.id, items),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TRANSFER_KEY });
      qc.invalidateQueries({ queryKey: ["fabrics"] });
      qc.invalidateQueries({ queryKey: ["shelf"] });
      qc.invalidateQueries({ queryKey: ["accessories"] });
    },
  });
}

export function useCancelTransfer() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => deleteTransferRequest(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: TRANSFER_KEY }),
  });
}

export function useReceiveTransfer() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: ({ transferId, items }: { transferId: number; items: { id: number; received_qty: number; discrepancy_note?: string }[] }) =>
      receiveTransfer(transferId, user!.id, items),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TRANSFER_KEY });
      qc.invalidateQueries({ queryKey: ["fabrics"] });
      qc.invalidateQueries({ queryKey: ["shelf"] });
      qc.invalidateQueries({ queryKey: ["accessories"] });
    },
  });
}

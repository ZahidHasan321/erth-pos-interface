import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  receiveGarments,
  receiveAndStartGarments,
  sendToScheduler,
  sendReturnToProduction,
  scheduleGarments,
  startGarment,
  completeAndAdvance,
  qcPass,
  qcFail,
  dispatchGarments,
  releaseFinals,
  releaseFinalsWithPlan,
  updateGarmentDetails,
  updateOrderDeliveryDate,
  updateOrderAssignedDate,
} from '@/api/garments';
import { WORKSHOP_GARMENTS_KEY, ASSIGNED_VIEW_KEY } from './useWorkshopGarments';
import type { PieceStage } from '@repo/database';

function useMut<TArgs>(fn: (args: TArgs) => Promise<void>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: WORKSHOP_GARMENTS_KEY });
      qc.invalidateQueries({ queryKey: ASSIGNED_VIEW_KEY });
    },
  });
}

export function useReceiveGarments() {
  return useMut((ids: string[]) => receiveGarments(ids));
}

export function useReceiveAndStart() {
  return useMut((ids: string[]) => receiveAndStartGarments(ids));
}

export function useSendToScheduler() {
  return useMut((ids: string[]) => sendToScheduler(ids));
}

export function useSendReturnToProduction() {
  return useMut(({ id, stage }: { id: string; stage: PieceStage }) =>
    sendReturnToProduction(id, stage),
  );
}

export function useScheduleGarments() {
  return useMut((args: { ids: string[]; soakingIds?: string[]; nonSoakingIds?: string[]; plan: Record<string, string>; date: string; reentryStage?: PieceStage }) =>
    scheduleGarments(args.ids, args.plan, args.date, undefined, args.reentryStage, args.soakingIds, args.nonSoakingIds),
  );
}

export function useStartGarment() {
  return useMut((id: string) => startGarment(id));
}

export function useCompleteAndAdvance() {
  return useMut((args: { id: string; worker: string; stage: string; nextStage: string }) =>
    completeAndAdvance(args.id, args.worker, args.stage, args.nextStage),
  );
}

export function useQcPass() {
  return useMut((args: { id: string; worker: string; ratings: Record<string, number> }) =>
    qcPass(args.id, args.worker, args.ratings),
  );
}

export function useQcFail() {
  return useMut((args: { id: string; returnStage: PieceStage; reason: string }) =>
    qcFail(args.id, args.returnStage, args.reason),
  );
}

export function useDispatchGarments() {
  return useMut((ids: string[]) => dispatchGarments(ids));
}

export function useReleaseFinals() {
  return useMut((ids: string[]) => releaseFinals(ids));
}

export function useReleaseFinalsWithPlan() {
  return useMut((args: { ids: string[]; plan: Record<string, string>; date: string }) =>
    releaseFinalsWithPlan(args.ids, args.plan, args.date),
  );
}

export function useUpdateGarmentDetails() {
  return useMut((args: { id: string; updates: { assigned_date?: string | null; delivery_date?: string | null; production_plan?: Record<string, string> | null } }) =>
    updateGarmentDetails(args.id, args.updates),
  );
}

export function useUpdateOrderDeliveryDate() {
  return useMut((args: { orderId: number; date: string }) =>
    updateOrderDeliveryDate(args.orderId, args.date),
  );
}

export function useUpdateOrderAssignedDate() {
  return useMut((args: { orderId: number; date: string }) =>
    updateOrderAssignedDate(args.orderId, args.date),
  );
}

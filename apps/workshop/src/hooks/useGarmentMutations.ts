import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  receiveGarments,
  receiveAndStartGarments,
  markLostInTransit,
  sendToScheduler,
  sendReturnToProduction,
  scheduleGarments,
  startGarment,
  cancelStartGarment,
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
import {
  WORKSHOP_GARMENTS_KEY,
  SCHEDULER_KEY,
  TERMINAL_KEY,
  WORKLOAD_KEY,
  COMPLETED_TODAY_KEY,
  ASSIGNED_OVERVIEW_KEY,
  ASSIGNED_PAGE_KEY,
  COMPLETED_VIEW_KEY,
} from './useWorkshopGarments';
import { SIDEBAR_COUNTS_KEY } from './useSidebarCounts';
import type { WorkshopGarment } from '@repo/database';
import type { PieceStage } from '@repo/database';

function errorMsg(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

/** Invalidate all garment-related queries (background refetch, no flash) */
function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: WORKSHOP_GARMENTS_KEY });
  qc.invalidateQueries({ queryKey: SCHEDULER_KEY });
  qc.invalidateQueries({ queryKey: TERMINAL_KEY });
  qc.invalidateQueries({ queryKey: WORKLOAD_KEY });
  qc.invalidateQueries({ queryKey: COMPLETED_TODAY_KEY });
  qc.invalidateQueries({ queryKey: SIDEBAR_COUNTS_KEY });
  qc.invalidateQueries({ queryKey: ASSIGNED_OVERVIEW_KEY });
  qc.invalidateQueries({ queryKey: ASSIGNED_PAGE_KEY });
  qc.invalidateQueries({ queryKey: COMPLETED_VIEW_KEY });
  qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'garment' });
  qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'order-garments' });
}

/**
 * Optimistically patch garments in the workshop cache.
 * Returns a rollback function to restore the previous state on error.
 */
function optimisticPatch(
  qc: ReturnType<typeof useQueryClient>,
  ids: string[],
  patch: Partial<WorkshopGarment>,
): () => void {
  const prev = qc.getQueryData<WorkshopGarment[]>(WORKSHOP_GARMENTS_KEY);
  if (prev) {
    const idSet = new Set(ids);
    qc.setQueryData<WorkshopGarment[]>(WORKSHOP_GARMENTS_KEY, (old) =>
      (old ?? []).map((g) => (idSet.has(g.id) ? { ...g, ...patch } : g)),
    );
  }
  return () => {
    if (prev) qc.setQueryData(WORKSHOP_GARMENTS_KEY, prev);
  };
}


/** Simple mutation — no optimistic update, just invalidate on settle */
function useMut<TArgs>(fn: (args: TArgs) => Promise<void>, errorLabel?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onError: (err) => {
      if (errorLabel) toast.error(`${errorLabel}: ${errorMsg(err)}`);
    },
    onSettled: () => invalidateAll(qc),
  });
}

// ── Receiving ──────────────────────────────────────────────────────────────

export function useReceiveGarments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => receiveGarments(ids),
    onMutate: (ids) => optimisticPatch(qc, ids, {
      location: 'workshop' as any,
      in_production: false,
    }),
    onSuccess: (_data, ids) => {
      toast.success(`${ids.length} garment${ids.length > 1 ? 's' : ''} received`);
    },
    onError: (err, _ids, rollback) => {
      rollback?.();
      toast.error(`Failed to receive garments: ${errorMsg(err)}`);
    },
    onSettled: () => invalidateAll(qc),
  });
}

export function useReceiveAndStart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => receiveAndStartGarments(ids),
    onMutate: (ids) => optimisticPatch(qc, ids, {
      location: 'workshop' as any,
      in_production: true,
    }),
    onSuccess: (_data, ids) => {
      toast.success(`${ids.length} garment${ids.length > 1 ? 's' : ''} received & started`);
    },
    onError: (err, _ids, rollback) => {
      rollback?.();
      toast.error(`Failed to receive & start garments: ${errorMsg(err)}`);
    },
    onSettled: () => invalidateAll(qc),
  });
}

export function useMarkLostInTransit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => markLostInTransit(ids),
    onMutate: (ids) => optimisticPatch(qc, ids, {
      location: 'lost_in_transit' as any,
      in_production: false,
    }),
    onError: (err, _ids, rollback) => {
      rollback?.();
      toast.error(`Failed to mark as lost in transit: ${errorMsg(err)}`);
    },
    onSettled: () => invalidateAll(qc),
  });
}

// ── Parking → Scheduler ────────────────────────────────────────────────────

export function useSendToScheduler() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => sendToScheduler(ids),
    onMutate: (ids) => optimisticPatch(qc, ids, { in_production: true }),
    onSuccess: (_data, ids) => {
      toast.success(`${ids.length} garment${ids.length > 1 ? 's' : ''} sent to scheduler`);
    },
    onError: (err, _ids, rollback) => {
      rollback?.();
      toast.error(`Failed to send to scheduler: ${errorMsg(err)}`);
    },
    onSettled: () => invalidateAll(qc),
  });
}

export function useSendReturnToProduction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: PieceStage }) =>
      sendReturnToProduction(id, stage),
    onMutate: ({ id }) => optimisticPatch(qc, [id], {
      in_production: true,
      piece_stage: 'waiting_cut' as PieceStage,
      production_plan: null,
    }),
    onSuccess: () => {
      toast.success('Garment sent to production');
    },
    onError: (err, _args, rollback) => {
      rollback?.();
      toast.error(`Failed to send return to production: ${errorMsg(err)}`);
    },
    onSettled: () => invalidateAll(qc),
  });
}

// ── Scheduling ─────────────────────────────────────────────────────────────

export function useScheduleGarments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      ids: string[];
      soakingIds?: string[];
      nonSoakingIds?: string[];
      plan: Record<string, string>;
      date: string;
      reentryStage?: PieceStage;
    }) =>
      scheduleGarments(
        args.ids, args.plan, args.date, undefined,
        args.reentryStage, args.soakingIds, args.nonSoakingIds,
      ),
    onMutate: (args) => {
      // Scheduled garments get a production_plan and move out of waiting_cut,
      // so they'll no longer match the scheduler filter — optimistically patch them
      const soakSet = new Set(args.soakingIds ?? []);
      const prev = qc.getQueryData<WorkshopGarment[]>(WORKSHOP_GARMENTS_KEY);
      if (prev) {
        const idSet = new Set(args.ids);
        qc.setQueryData<WorkshopGarment[]>(WORKSHOP_GARMENTS_KEY, (old) =>
          (old ?? []).map((g) => {
            if (!idSet.has(g.id)) return g;
            const stage = args.reentryStage
              ?? (soakSet.has(g.id) ? 'soaking' : 'cutting');
            return {
              ...g,
              production_plan: args.plan,
              assigned_date: args.date,
              in_production: true,
              piece_stage: stage as PieceStage,
            };
          }),
        );
      }
      return () => { if (prev) qc.setQueryData(WORKSHOP_GARMENTS_KEY, prev); };
    },
    onSuccess: (_data, args) => {
      toast.success(`${args.ids.length} garment${args.ids.length > 1 ? 's' : ''} scheduled`);
    },
    onError: (err, _args, rollback) => {
      rollback?.();
      toast.error(`Failed to schedule garments: ${errorMsg(err)}`);
    },
    onSettled: () => invalidateAll(qc),
  });
}

// ── Terminal operations ────────────────────────────────────────────────────

export function useStartGarment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => startGarment(id),
    onMutate: (id) => optimisticPatch(qc, [id], {
      start_time: new Date() as any,
    }),
    onError: (err, _id, rollback) => {
      rollback?.();
      toast.error(`Failed to start garment: ${errorMsg(err)}`);
    },
    onSettled: () => invalidateAll(qc),
  });
}

export function useCancelStartGarment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cancelStartGarment(id),
    onMutate: (id) => optimisticPatch(qc, [id], {
      start_time: null,
    }),
    onError: (err, _id, rollback) => {
      rollback?.();
      toast.error(`Failed to cancel start: ${errorMsg(err)}`);
    },
    onSettled: () => invalidateAll(qc),
  });
}

export function useCompleteAndAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; worker: string; stage: string; nextStage: string }) =>
      completeAndAdvance(args.id, args.worker, args.stage, args.nextStage),
    onMutate: (args) => optimisticPatch(qc, [args.id], {
      piece_stage: args.nextStage as PieceStage,
      start_time: null,
    }),
    onError: (err, _args, rollback) => {
      rollback?.();
      toast.error(`Failed to advance garment: ${errorMsg(err)}`);
    },
    onSettled: () => invalidateAll(qc),
  });
}

export function useQcPass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; worker: string; ratings: Record<string, number> }) =>
      qcPass(args.id, args.worker, args.ratings),
    onMutate: (args) => optimisticPatch(qc, [args.id], {
      piece_stage: 'ready_for_dispatch' as PieceStage,
      start_time: null,
      quality_check_ratings: args.ratings,
    }),
    onError: (err, _args, rollback) => {
      rollback?.();
      toast.error(`QC pass failed: ${errorMsg(err)}`);
    },
    onSettled: () => invalidateAll(qc),
  });
}

export function useQcFail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; returnStage: PieceStage; reason: string }) =>
      qcFail(args.id, args.returnStage, args.reason),
    onMutate: (args) => optimisticPatch(qc, [args.id], {
      piece_stage: args.returnStage,
      start_time: null,
    }),
    onError: (err, _args, rollback) => {
      rollback?.();
      toast.error(`QC fail action failed: ${errorMsg(err)}`);
    },
    onSettled: () => invalidateAll(qc),
  });
}

// ── Dispatch ───────────────────────────────────────────────────────────────

export function useDispatchGarments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => dispatchGarments(ids),
    onMutate: (ids) => optimisticPatch(qc, ids, {
      location: 'transit_to_shop' as any,
      in_production: false,
    }),
    onSuccess: (_data, ids) => {
      toast.success(`${ids.length} garment${ids.length > 1 ? 's' : ''} dispatched`);
    },
    onError: (err, _ids, rollback) => {
      rollback?.();
      toast.error(`Failed to dispatch garments: ${errorMsg(err)}`);
    },
    onSettled: () => invalidateAll(qc),
  });
}

// ── Release finals ─────────────────────────────────────────────────────────

export function useReleaseFinals() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => releaseFinals(ids),
    onMutate: (ids) => optimisticPatch(qc, ids, {
      piece_stage: 'waiting_cut' as PieceStage,
      in_production: false,
    }),
    onSuccess: (_data, ids) => {
      toast.success(`${ids.length} final${ids.length > 1 ? 's' : ''} released`);
    },
    onError: (err, _ids, rollback) => {
      rollback?.();
      toast.error(`Failed to release finals: ${errorMsg(err)}`);
    },
    onSettled: () => invalidateAll(qc),
  });
}

export function useReleaseFinalsWithPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { ids: string[]; plan: Record<string, string>; date: string }) =>
      releaseFinalsWithPlan(args.ids, args.plan, args.date),
    onMutate: (args) => {
      const stage = (args.plan as any).soaker ? 'soaking' : 'cutting';
      return optimisticPatch(qc, args.ids, {
        piece_stage: stage as PieceStage,
        in_production: true,
        production_plan: args.plan,
        assigned_date: args.date,
      });
    },
    onSuccess: (_data, args) => {
      toast.success(`${args.ids.length} final${args.ids.length > 1 ? 's' : ''} released & scheduled`);
    },
    onError: (err, _args, rollback) => {
      rollback?.();
      toast.error(`Failed to release finals: ${errorMsg(err)}`);
    },
    onSettled: () => invalidateAll(qc),
  });
}

// ── Detail updates ─────────────────────────────────────────────────────────

export function useUpdateGarmentDetails() {
  return useMut(
    (args: { id: string; updates: { assigned_date?: string | null; delivery_date?: string | null; production_plan?: Record<string, string> | null; piece_stage?: string | null } }) =>
      updateGarmentDetails(args.id, args.updates),
    'Failed to update garment details',
  );
}

export function useUpdateOrderDeliveryDate() {
  return useMut(
    (args: { orderId: number; date: string }) =>
      updateOrderDeliveryDate(args.orderId, args.date),
    'Failed to update delivery date',
  );
}

export function useUpdateOrderAssignedDate() {
  return useMut(
    (args: { orderId: number; date: string }) =>
      updateOrderAssignedDate(args.orderId, args.date),
    'Failed to update assigned date',
  );
}

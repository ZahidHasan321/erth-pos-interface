/**
 * Short-window "Undo" for high-regret garment logistics actions.
 *
 * Mechanism (see migration 0045 / triggers.sql):
 *   1. captureGarmentSnapshot() reads the before-image of the columns an action
 *      is about to touch (pre-action).
 *   2. runUndoable() runs the action, then records an undo token whose GUARD
 *      (post-action fingerprint) is computed server-side.
 *   3. showUndoToast() offers an Undo button for the window; clicking it calls
 *      perform_undo, which restores the before-image ONLY if the token is live
 *      and no garment has moved on (counterpart received / production advanced).
 *
 * Undo is a best-effort convenience: if snapshot capture or token recording
 * fails, the action still succeeds — the user just doesn't get an Undo button.
 *
 * Kept structurally in sync with apps/workshop/src/lib/undo.ts.
 */
import { toast } from 'sonner';
import { db } from '@/lib/db';

export type UndoActionType =
  | 'dispatch_to_shop'
  | 'dispatch_to_workshop'
  | 'receive_at_workshop'
  | 'receive_at_shop'
  | 'schedule'
  | 'send_to_scheduler'
  | 'advance_stage';

// Union of every garment column the undoable actions touch. perform_undo
// restores exactly these.
const SNAPSHOT_COLUMNS =
  'id, location, piece_stage, in_production, feedback_status, acceptance_status, ' +
  'trip_number, assigned_date, start_time, completion_time, shop_received_date, ' +
  'production_plan, worker_history, trip_history, stage_timings, qc_rework_stages';

// How long the toast's Undo button stays clickable. The server window is set a
// little longer so a click near the end still lands inside it.
const TOAST_MS = 60_000;
const WINDOW_SECONDS = 90;

// The `location` each location-changing action leaves the garment in. Passed to
// record_undo_token so it refuses to arm the token if the counterpart already
// moved the garment in the gap between the action and this call (closes the
// non-atomic-capture race for cross-app moves). Non-location actions are absent.
const EXPECTED_LOCATION: Partial<Record<UndoActionType, string>> = {
  dispatch_to_shop: 'transit_to_shop',
  dispatch_to_workshop: 'transit_to_workshop',
  receive_at_workshop: 'workshop',
  receive_at_shop: 'shop',
};

type SnapshotRow = { id: string } & Record<string, unknown>;

async function captureGarmentSnapshot(ids: string[]): Promise<Record<string, unknown> | null> {
  const { data, error } = await db.from('garments').select(SNAPSHOT_COLUMNS).in('id', ids);
  if (error || !data) return null;
  const before: Record<string, unknown> = {};
  for (const row of data as unknown as SnapshotRow[]) {
    const { id, ...rest } = row;
    before[id] = rest;
  }
  return before;
}

/**
 * Capture, run the action, and record an undo token. Returns the token id (for
 * the Undo toast) or null if undo could not be armed — the action still ran.
 */
export async function runUndoable(
  actionType: UndoActionType,
  ids: string[],
  action: () => Promise<void>,
): Promise<string | null> {
  const before = await captureGarmentSnapshot(ids);
  await action();
  if (!before) return null;
  try {
    const { data, error } = await db.rpc('record_undo_token', {
      p_action_type: actionType,
      p_entity_ids: ids,
      p_before_image: before,
      p_window_seconds: WINDOW_SECONDS,
      p_expected_location: EXPECTED_LOCATION[actionType] ?? null,
    });
    if (error) return null;
    return (data as string) ?? null;
  } catch {
    return null;
  }
}

async function performUndo(tokenId: string): Promise<void> {
  const { error } = await db.rpc('perform_undo', { p_token_id: tokenId });
  if (error) throw new Error(error.message);
}

// Tokens whose Undo has already been fired this session. Belt-and-suspenders
// against a double-click racing the toast's own dismissal — the server rejects
// a second undo too ("already undone"), but this stops the second click from
// ever reaching it (no scary error flash on a fast double-tap).
const firedTokens = new Set<string>();

/** A definitive server refusal (won't succeed on retry) vs a transient failure. */
function isTerminalUndoFailure(message: string): boolean {
  return /expired|already undone|moved on|cannot undo|not found/i.test(message);
}

function friendlyUndoError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/already undone/i.test(msg)) return 'Already undone.';
  if (/expired/i.test(msg)) return 'Too late to undo. The window has passed.';
  if (/moved on|cannot undo|not found/i.test(msg)) return 'Too late to undo. The garment already moved on.';
  return 'Could not undo. Please refresh and check the garment.';
}

/**
 * Success toast that carries an Undo button when a token was armed. `onUndone`
 * runs after a successful undo (refresh caches). Falls back to a plain success
 * toast when no token (undo unavailable). The Undo click is single-shot: a
 * double-click cannot fire two perform_undo calls.
 */
export function showUndoToast(
  message: string,
  tokenId: string | null,
  onUndone?: () => void,
): void {
  if (!tokenId) {
    toast.success(message);
    return;
  }
  const toastId = `undo-${tokenId}`;
  toast.success(message, {
    id: toastId,
    duration: TOAST_MS,
    action: {
      label: 'Undo',
      onClick: () => {
        if (firedTokens.has(tokenId)) return; // ignore double-click
        firedTokens.add(tokenId);
        toast.dismiss(toastId);
        const loadingId = toast.loading('Undoing...');
        performUndo(tokenId)
          .then(() => {
            toast.success('Undone', { id: loadingId });
            onUndone?.();
          })
          .catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            // Only a transient failure is worth retrying — re-allow the button.
            // A definitive refusal stays consumed so it can't be re-fired.
            if (!isTerminalUndoFailure(msg)) firedTokens.delete(tokenId);
            toast.error(friendlyUndoError(err), { id: loadingId });
          });
      },
    },
  });
}

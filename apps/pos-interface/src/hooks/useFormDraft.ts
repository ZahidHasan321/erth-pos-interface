import * as React from "react";
import type { FieldValues, UseFormReturn } from "react-hook-form";

/**
 * Best-effort local buffer for the *unsaved in-form* window of the heavy work-order
 * steps (measurements, garments). The DB draft only persists AFTER a save — this
 * covers the gap where a reload/crash mid-edit would otherwise lose typed-but-unsaved
 * work. Scoped to a specific order so drafts never cross orders.
 *
 * Not a page-state mirror: it stores field values only and never touches step
 * completion (CLAUDE.md §7.10 — completion stays earned by an explicit Save/Continue).
 */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type DraftEnvelope = { savedAt: string; values: unknown };

/** Stable key for a given order's draft. Used by both autosave and the
 *  reload-restore path so the two always agree on where a draft lives. */
export function workOrderDraftKey(
  orderId: number,
  part: "measurements" | "garments",
): string {
  return `wo-draft:${orderId}:${part}`;
}

/** Read a draft by explicit key (null if absent / older than the age cap).
 *  Used by the reload-restore path, which knows the loaded order id directly
 *  and must NOT depend on React render timing. */
export function readFormDraft(key: string): DraftEnvelope | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const env = JSON.parse(raw) as DraftEnvelope;
    if (
      !env?.savedAt ||
      Date.now() - new Date(env.savedAt).getTime() > MAX_AGE_MS
    ) {
      sessionStorage.removeItem(key);
      return null;
    }
    return env;
  } catch {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // ignore
    }
    return null;
  }
}

export function clearFormDraft(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function useFormDraft<T extends FieldValues>(opts: {
  form: UseFormReturn<T>;
  /** `null` disables the draft (no order yet / order closed). */
  storageKey: string | null;
  /** Pause autosave (e.g. while loading the order from the DB). */
  enabled: boolean;
  debounceMs?: number;
}) {
  const { form, storageKey, enabled, debounceMs = 600 } = opts;

  // A pending debounced write that fires *after* clearDraft() (e.g. reload right
  // after clicking Continue) would resurrect a draft of just-saved data. Hold the
  // timer in a ref so clearDraft can cancel it too.
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  React.useEffect(() => {
    if (!enabled || !storageKey) return;
    const sub = form.watch((values) => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        // Only persist genuine user edits. A programmatic reset() (e.g. right
        // after the order is created) leaves the form pristine — buffering that
        // default snapshot would trigger a spurious restore prompt on reload.
        if (!form.formState.isDirty) return;
        try {
          sessionStorage.setItem(
            storageKey,
            JSON.stringify({ savedAt: new Date().toISOString(), values }),
          );
        } catch {
          // Quota or serialization failure — the draft is best-effort, drop it.
        }
      }, debounceMs);
    });
    return () => {
      clearTimeout(timerRef.current);
      sub.unsubscribe();
    };
  }, [enabled, storageKey, debounceMs, form]);

  /** Clear the draft for the order currently in scope. Called from steady-state
   *  event handlers (save / clear button), so `storageKey` is current. Also
   *  cancels any in-flight debounced write so it can't resurrect the draft. */
  const clearDraft = () => {
    clearTimeout(timerRef.current);
    if (storageKey) clearFormDraft(storageKey);
  };

  return { clearDraft };
}

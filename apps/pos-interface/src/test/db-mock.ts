/**
 * Reusable mock factory for @/lib/db.
 *
 * Usage in a test file:
 *
 *   import { makeMockDb } from "@/test/db-mock";
 *   vi.mock("@/lib/db", () => makeMockDb());
 *   // then in individual tests:
 *   import { db } from "@/lib/db";
 *   vi.mocked(db.from).mockReturnValue(...)
 *
 * The default implementation returns a chainable builder whose terminal
 * methods (.single(), .select(), direct await) all resolve with
 * { data: null, error: null } — callers override per-test via vi.mocked().
 */

import { vi } from "vitest";

/** A single chainable query object. All builder methods return `this`. */
function makeChain(overrides?: { data?: unknown; error?: unknown }) {
  const result = { data: overrides?.data ?? null, error: overrides?.error ?? null };
  const chain: Record<string, unknown> = {};

  const self = () => chain;

  // Builder methods — each returns the same chain object
  for (const method of [
    "select", "insert", "update", "delete", "upsert",
    "eq", "neq", "gt", "lt", "gte", "lte",
    "in", "contains", "containedBy", "is", "not",
    "order", "limit", "range",
    "returns", "throwOnError",
  ] as const) {
    chain[method] = vi.fn(self);
  }

  // Terminal methods that resolve the promise
  chain["single"] = vi.fn(() => Promise.resolve(result));
  chain["maybeSingle"] = vi.fn(() => Promise.resolve(result));

  // Make the chain itself thenable (await chain resolves to result)
  (chain as Record<string, unknown>)["then"] = (resolve: (v: typeof result) => void) =>
    Promise.resolve(result).then(resolve);

  return chain;
}

export function makeMockDb() {
  // rpc is a standalone fn that returns a thenable chain
  const mockRpc = vi.fn(() => makeChain());

  // from() returns a fresh chain each call; tests override it per-test
  const mockFrom = vi.fn(() => makeChain());

  const db = {
    from: mockFrom,
    rpc: mockRpc,
    auth: {
      signOut: vi.fn(() => Promise.resolve({ error: null })),
      getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
    },
  };

  return {
    db,
    // Exported helpers so consumers don't import from lib/db
    isTransientNetworkError: vi.fn(() => false),
    withWriteRetry: vi.fn(
      async <T>(attempt: () => PromiseLike<T>, _isTransient: (r: T) => boolean): Promise<T> =>
        attempt(),
    ),
    makeChain,
  };
}

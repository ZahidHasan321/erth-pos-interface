import postgres from "postgres";
import { TEST_DATABASE_URL } from "./config";

// Single shared connection to the ephemeral test DB. We connect as the
// bootstrap superuser, which BYPASSRLS — so the RLS policies in triggers.sql
// never interfere; we exercise the *workflow* logic (RPCs + triggers), not
// row-level security.
export const sql = postgres(TEST_DATABASE_URL, {
  max: 1,
  // RPCs return jsonb; keep it as parsed JS objects.
  transform: { undefined: null },
});

export type Tx = typeof sql;

/** First row, asserting presence — keeps strict TS happy and fails loudly. */
export function only<T>(rows: readonly T[], what: string): T {
  const r = rows[0];
  if (r === undefined) throw new Error(`expected a row: ${what}`);
  return r;
}

/**
 * Run a scenario inside a transaction that is ALWAYS rolled back, so tests
 * never accumulate state and never touch committed reference data. Assertion
 * failures still surface (they throw a non-sentinel error which we rethrow);
 * the rollback happens regardless because we throw out of `sql.begin`.
 */
export async function inRolledBackTx(
  fn: (tx: Tx) => Promise<void>,
): Promise<void> {
  const ROLLBACK = Symbol("rollback");
  try {
    await sql.begin(async (tx) => {
      await fn(tx as unknown as Tx);
      throw ROLLBACK; // force rollback after the scenario completes
    });
  } catch (e) {
    if (e !== ROLLBACK) throw e;
  }
}

/**
 * Run `fn` inside a SAVEPOINT and report whether it raised, WITHOUT poisoning
 * the outer transaction. postgres.js aborts the entire `sql.begin` transaction
 * the moment any statement raises, so a bare `await expect(rpc).rejects` must be
 * the LAST op on the tx (cf. workflow-eod.test.ts). A savepoint scopes the
 * failure: on error it issues `ROLLBACK TO SAVEPOINT`, clearing the abort, so
 * the caller can keep querying `tx` afterward (e.g. to assert a rejected
 * mutation moved/committed NOTHING). This mirrors production, where a RAISE
 * rolls back the RPC's own transaction (PostgREST wraps every RPC in one).
 * Returns the caught error, or `null` if `fn` succeeded — the caller asserts it
 * threw (so a guard that silently succeeds is still caught as a bug).
 */
export async function tryInSavepoint(
  tx: Tx,
  fn: (sp: Tx) => Promise<unknown>,
): Promise<unknown | null> {
  try {
    await (
      tx as unknown as {
        savepoint: <T>(f: (sp: Tx) => Promise<T>) => Promise<T>;
      }
    ).savepoint((sp) => fn(sp as unknown as Tx));
    return null; // succeeded — no rollback needed
  } catch (e) {
    return e; // rolled back to the savepoint; outer tx still usable
  }
}

/**
 * Set auth.uid() for the current transaction. The shim's auth.uid() reads
 * `app.auth_id`; seeded users have auth_id == id, so passing a user's id here
 * makes assert_active_user() / get_my_user_id() / role helpers resolve to it.
 */
export async function actAs(tx: Tx, userAuthId: string): Promise<void> {
  await tx`SELECT set_config('app.auth_id', ${userAuthId}, true)`;
}

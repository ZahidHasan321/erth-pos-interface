/**
 * A postgres.js connection to the LOCAL Supabase database (:54322).
 *
 * Future phases will assert on DB state directly (e.g. via @repo/database's
 * isGarmentLeaked oracle over a query result). This helper exists so those
 * assertions share one pooled connection target. Tests should call `closeDb()`
 * in an afterAll / global teardown when they open one.
 */
import postgres from "postgres";
import { DATABASE_URL } from "../config";

let _sql: ReturnType<typeof postgres> | null = null;

export function getDb(): ReturnType<typeof postgres> {
  if (!_sql) {
    _sql = postgres(DATABASE_URL, { max: 2 });
  }
  return _sql;
}

export async function closeDb(): Promise<void> {
  if (_sql) {
    await _sql.end({ timeout: 5 });
    _sql = null;
  }
}

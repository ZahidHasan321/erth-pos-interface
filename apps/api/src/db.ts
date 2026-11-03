import postgres from "postgres";
import { env } from "./env.js";

export const sql = postgres(env.databaseUrl, {
  max: 10,
  idle_timeout: 30,
  connection: { application_name: "api" },
});

// postgres.js's TransactionSql type loses its call signature under TS 5.x
// (known typing gap); at runtime it is a full tagged-template Sql.
export type Tx = postgres.Sql;

/** Run `fn` in a transaction as service_role (RLS bypass, same rights the
 *  Supabase edge functions had). */
export function asService<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return sql.begin(async (rawTx) => {
    const tx = rawTx as unknown as Tx;
    await tx`SET LOCAL ROLE service_role`;
    await tx`SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true)`;
    return fn(tx);
  }) as Promise<T>;
}

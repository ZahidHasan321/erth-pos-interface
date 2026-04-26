/**
 * One-shot: drops stale function overloads identified by find-duplicate-overloads.ts.
 * Keeps only the signature that matches the current source in src/triggers.sql.
 *
 * Usage: pnpm exec tsx scripts/drop-stale-overloads.ts
 */
import postgres from "postgres";
import * as dotenv from "dotenv";

dotenv.config();

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

const drops = [
  // record_payment_transaction — keep 13-arg with p_idempotency_key
  "DROP FUNCTION public.record_payment_transaction(int,numeric,text,text,text,uuid,text,text)",
  "DROP FUNCTION public.record_payment_transaction(int,numeric,text,text,text,uuid,text,text,uuid[])",
  "DROP FUNCTION public.record_payment_transaction(int,numeric,text,text,text,uuid,text,text,uuid[],jsonb)",
  "DROP FUNCTION public.record_payment_transaction(int,numeric,text,text,text,uuid,text,text,uuid[],jsonb,date)",

  // collect_garments — keep (int,uuid[],jsonb)
  "DROP FUNCTION public.collect_garments(int,uuid[],text,boolean,boolean)",
  "DROP FUNCTION public.collect_garments(int,uuid[])",

  // get_cashier_summary — keep (text,date,int)
  "DROP FUNCTION public.get_cashier_summary(text)",
  "DROP FUNCTION public.get_cashier_summary(text,date)",

  // add_cash_movement — keep 6-arg with p_tz_offset_minutes
  "DROP FUNCTION public.add_cash_movement(int,text,numeric,text,uuid)",

  // close_register — keep 5-arg with p_tz_offset_minutes
  "DROP FUNCTION public.close_register(int,uuid,numeric,text)",

  // get_eod_report — keep 4-arg with p_tz_offset_minutes
  "DROP FUNCTION public.get_eod_report(text,date,date)",

  // get_eod_transactions_paginated — keep 10-arg with p_tz_offset_minutes
  "DROP FUNCTION public.get_eod_transactions_paginated(text,date,date,int,int,text,text,text,text)",

  // update_order_discount — keep 8-arg with p_approved_by,p_reason
  "DROP FUNCTION public.update_order_discount(int,text,numeric,numeric,text,numeric)",
];

async function main() {
  console.log(`Dropping ${drops.length} stale function overloads...\n`);
  for (const stmt of drops) {
    try {
      await sql.unsafe(stmt);
      console.log("OK   " + stmt);
    } catch (e: any) {
      console.log("FAIL " + stmt + "  -- " + e.message);
    }
  }

  console.log("\nVerifying — remaining duplicates:");
  const rows = await sql<
    { name: string; overloads: number; signatures: string[] }[]
  >`
    SELECT p.proname AS name,
           count(*)::int AS overloads,
           array_agg(pg_get_function_identity_arguments(p.oid) ORDER BY p.oid) AS signatures
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
    GROUP BY p.proname
    HAVING count(*) > 1
    ORDER BY p.proname
  `;
  if (rows.length === 0) {
    console.log("  (none)");
  } else {
    for (const r of rows) {
      console.log(`  ${r.name} (${r.overloads})`);
      r.signatures.forEach((s, i) => console.log(`    [${i}] (${s})`));
    }
  }

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

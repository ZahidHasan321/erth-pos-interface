import "dotenv/config"; import { db } from "../src/client"; import { sql } from "drizzle-orm";
(async()=>{
  // For each measurement used by garments, the distinct order-customers using it
  const rows = await db.execute(sql`
    SELECT m.id, m.customer_id AS meas_cust,
           array_agg(DISTINCT o.customer_id) AS order_custs
    FROM measurements m
    JOIN garments g ON g.measurement_id = m.id
    JOIN orders o ON o.id = g.order_id
    GROUP BY m.id, m.customer_id
  `) as any[];
  let total=rows.length, agree=0, conflictAcrossOrders=0, mismatch=0;
  const fixable:any[]=[];
  for(const r of rows){
    const set = (r.order_custs as number[]).filter(x=>x!=null);
    if(set.length>1){ conflictAcrossOrders++; continue; } // measurement shared across diff customers' orders
    const correct = set[0];
    if(correct==null) continue;
    if(correct===r.meas_cust) agree++;
    else { mismatch++; fixable.push({meas:r.id, from:r.meas_cust, to:correct}); }
  }
  console.log({total_used_measurements:total, agree, mismatch_fixable:mismatch, shared_across_customers_conflict:conflictAcrossOrders});
  // measurements NOT used by any garment (can't derive)
  const unused = await db.execute(sql`SELECT count(*) n FROM measurements m WHERE NOT EXISTS (SELECT 1 FROM garments g WHERE g.measurement_id=m.id)`);
  console.log("measurements not used by any garment:", JSON.stringify(unused));
  const fs=require("fs"); fs.writeFileSync(__dirname+"/meas-fix.json", JSON.stringify(fixable,null,2));
  console.log("sample fixable:", JSON.stringify(fixable.slice(0,8)));
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});

import "dotenv/config"; import { db } from "../src/client"; import { sql } from "drizzle-orm";
(async()=>{
  const cases=[
    {inv:1235, name:"ABDULLAH SAAD", phone:"66662099", date:"2025-11-07"},
    {inv:1334, name:"ABDUL AZIZ", phone:"50388199", date:"2025-11-18"},
    {inv:1236, name:"ABDULLAH AL JASIM", phone:"90008899", date:"2025-11-07"},
  ];
  for(const c of cases){
    const byPhone=(await db.execute(sql`SELECT o.id,c.name,c.phone,o.order_date,o.order_total FROM orders o JOIN customers c ON c.id=o.customer_id WHERE c.phone=${c.phone} ORDER BY o.order_date`)) as any[];
    console.log(`\n=== invoice ${c.inv}: ${c.name} (${c.phone}), Airtable order dated ${c.date} ===`);
    console.log(`  orders in system for this phone: ${byPhone.length}`);
    for(const o of byPhone) console.log(`     #${o.id} ${o.name} dated ${o.order_date?.toISOString?.().slice(0,10)} total ${o.order_total}`);
  }
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});

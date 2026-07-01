import "dotenv/config"; import { db } from "../src/client"; import { sql } from "drizzle-orm";
(async()=>{
  const cols = await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name='customers' AND column_name IN ('created_at','updated_at')`);
  console.log("customers time cols:", JSON.stringify(cols));
  try { console.log(JSON.stringify(await db.execute(sql`SELECT id,name,created_at,updated_at FROM customers WHERE id IN (950,1036)`),null,2)); }
  catch(e:any){ console.log("no updated_at:", e.message); }
  process.exit(0);
})();

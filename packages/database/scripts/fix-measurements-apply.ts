import "dotenv/config"; import * as fs from "fs"; import { db } from "../src/client"; import { sql } from "drizzle-orm";
(async()=>{
  const fixes=JSON.parse(fs.readFileSync(__dirname+"/meas-fix.json","utf8"));
  const apply=process.argv.includes("--apply");
  console.log(`measurement re-points to apply: ${fixes.length} (apply=${apply})`);
  if(!apply){ console.log("dry run; pass --apply"); process.exit(0); }
  let n=0; for(const f of fixes){ await db.execute(sql`UPDATE measurements SET customer_id=${f.to} WHERE id=${f.meas}`); n++; }
  console.log(`applied ${n}`);
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});

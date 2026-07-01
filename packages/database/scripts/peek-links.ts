import * as fs from "fs"; import { parse } from "csv-parse/sync";
const D="/mnt/339cc06e-972e-45cf-aed0-2b21bc4f4d69/dev/autolinium/erth/seperate-repo/erth-showrom-api/airtable_data/ERP ALPACA V10 (Copy)";
const C:any[]=parse(fs.readFileSync(D+"/CUSTOMER.csv"),{columns:true,skip_empty_lines:true,relax_column_count:true});
const F:any[]=parse(fs.readFileSync(D+"/FATOURA.csv"),{columns:true,skip_empty_lines:true,relax_column_count:true});
console.log("=== CUSTOMER rows for 99770275 (key link cols) ===");
for(const r of C) if(r["PHONE"]==="99770275") console.log({airtable_id:r["airtable_id"],NAME:r["NAME"],ID:r["ID"],FATOURA:r["FATOURA"],ORDERS:r["ORDERS"]});
console.log("\n=== FATOURA rows for invoices 988 & 1759 ===");
for(const r of F){ const inv=(r["FATOURA"]||"").replace(/^0+/,""); if(inv==="988"||inv==="1759") console.log({airtable_id:r["airtable_id"],FATOURA:r["FATOURA"],NAME_CUSTOMER:r["NAME CUSTOMER"],PHONE:r["PHONE CUSTOMER 📞"]});}
// Is CUSTOMER.ORDERS a list of FATOURA airtable_ids?
console.log("\n=== sample: does CUSTOMER.ORDERS look like FATOURA rec-ids? ===");
const fIds=new Set(F.map(r=>r["airtable_id"]));
let checked=0;
for(const r of C){ const ords=(r["ORDERS"]||"").trim(); if(ords && checked<3){ const parts=ords.split(/[, ]+/).filter(Boolean); console.log({NAME:r["NAME"],ORDERS_raw:ords.slice(0,60),allAreFatouraRecIds:parts.every(p=>fIds.has(p)),n:parts.length}); checked++; }}

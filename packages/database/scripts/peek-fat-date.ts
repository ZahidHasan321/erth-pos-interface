import * as fs from "fs"; import { parse } from "csv-parse/sync";
const D="/mnt/339cc06e-972e-45cf-aed0-2b21bc4f4d69/dev/autolinium/erth/seperate-repo/erth-showrom-api/airtable_data/ERP ALPACA V10 (Copy)";
const F:any[]=parse(fs.readFileSync(D+"/FATOURA.csv"),{columns:true,skip_empty_lines:true,relax_column_count:true});
let n=0; for(const r of F){ if(n++>=6)break; console.log(JSON.stringify({FATOURA:r["FATOURA"],INVOICE_DATE:r["INVOICE DATE"], CREATED:r["Created"]??r["CREATED"]??r["Created time"]??r["createdTime"]})); }
// how many invoice dates carry a non-midnight time?
let withTime=0; for(const r of F){ const v=r["INVOICE DATE"]||""; if(/\d{1,2}:\d{2}/.test(v) && !/00:00/.test(v)) withTime++; }
console.log("rows with a non-midnight time in INVOICE DATE:", withTime, "of", F.length);

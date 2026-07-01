import * as fs from "fs"; import { parse } from "csv-parse/sync";
const D="/mnt/339cc06e-972e-45cf-aed0-2b21bc4f4d69/dev/autolinium/erth/seperate-repo/erth-showrom-api/airtable_data/ERP ALPACA V10 (Copy)";
const M:any[]=parse(fs.readFileSync(D+"/MEASURE.csv"),{columns:true,skip_empty_lines:true,relax_column_count:true});
let n=0; for(const r of M){ if(n++>=8)break; console.log({MID:r["MEASURE ID"],CUSTOMER:r["CUSTOMER"],CUSTOMER2:r["CUSTOMER 2"],TEL:r["TEL 📞"],CustomerID:r["CustomerID"]}); }

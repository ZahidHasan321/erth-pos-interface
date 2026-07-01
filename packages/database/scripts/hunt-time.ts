import * as fs from "fs"; import { parse } from "csv-parse/sync";
const D="/mnt/339cc06e-972e-45cf-aed0-2b21bc4f4d69/dev/autolinium/erth/seperate-repo/erth-showrom-api/airtable_data/ERP ALPACA V10 (Copy)";
const F:any[]=parse(fs.readFileSync(D+"/FATOURA.csv"),{columns:true,skip_empty_lines:true,relax_column_count:true});
const cols=Object.keys(F[0]);
const timeRe=/\d{1,2}:\d{2}(:\d{2})?/;        // any HH:MM
const isoTimeRe=/T\d{2}:\d{2}/;               // ISO datetime with time
// 1) any column whose values carry a real time-of-day
console.log("=== columns containing a time-of-day value ===");
for(const c of cols){
  let timed=0, nonMidnight=0, sample="";
  for(const r of F){ const v=(r[c]||"").trim(); if(!v) continue;
    if(timeRe.test(v)||isoTimeRe.test(v)){ timed++; if(!/00:00/.test(v)){nonMidnight++; if(!sample)sample=v;} } }
  if(timed>0) console.log(`  [${c}] timed=${timed} nonMidnight=${nonMidnight} e.g. ${sample}`);
}
// 2) sequential ID / autonumber columns (creation order proxy)
console.log("\n=== candidate sequential/autonumber columns ===");
for(const c of cols){
  const vals=F.map(r=>r[c]).filter((v:any)=>v&&/^\d+$/.test(String(v).trim())).map((v:any)=>parseInt(v,10));
  if(vals.length<F.length*0.8) continue;
  const sorted=[...vals].sort((a,b)=>a-b);
  const uniq=new Set(vals).size;
  console.log(`  [${c}] numeric=${vals.length}/${F.length} unique=${uniq} min=${sorted[0]} max=${sorted[sorted.length-1]}`);
}

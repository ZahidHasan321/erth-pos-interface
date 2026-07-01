import * as fs from "fs"; import * as path from "path"; import { parse } from "csv-parse/sync";
const DIR="/mnt/339cc06e-972e-45cf-aed0-2b21bc4f4d69/dev/autolinium/erth/seperate-repo/erth-showrom-api/airtable_data/ERP ALPACA V10 (Copy)";
const load=(f:string):any[]=>parse(fs.readFileSync(path.join(DIR,f)),{columns:true,skip_empty_lines:true,relax_column_count:true});
const norm=(s:any)=>(s??"").trim().toUpperCase().replace(/\s+/g," ");
const invInt=(s:any)=>{const n=parseInt((s??"").replace(/^0+/,""),10);return Number.isFinite(n)?n:null;};
const splitInv=(s:any)=>[...new Set((s??"").split(/[,\s]+/).map(invInt).filter((n:any)=>n!=null))];
const C=load("CUSTOMER.csv"), F=load("FATOURA.csv");
// which customers claim each invoice (from CUSTOMER.FATOURA)
const claims=new Map<number,{name:string,phone:string}[]>();
for(const c of C) for(const inv of splitInv(c["FATOURA"])){ if(!claims.has(inv))claims.set(inv,[]); claims.get(inv)!.push({name:norm(c["NAME"]),phone:(c["PHONE"]||"").trim()}); }
const flags=JSON.parse(fs.readFileSync(path.join(__dirname,"fix-flags.json"),"utf8"));
const fByInv=new Map<number,any>(); for(const f of F){const i=invInt(f["FATOURA"]); if(i!=null) fByInv.set(i,{name:norm(f["NAME CUSTOMER"]),phone:(f["PHONE CUSTOMER 📞"]||"").trim()});}
console.log("--- multi-claim sample (invoice -> claiming customers | FATOURA.csv says) ---");
let n=0; for(const fl of flags.filter((x:any)=>x.reason==="invoice-claimed-by-multiple-customers")){ if(n++>=12)break;
  const cl=claims.get(fl.inv)||[]; console.log(`inv ${fl.inv}: claimed by [${cl.map(c=>c.name+"@"+c.phone).join(" ; ")}]  || FATOURA.csv: ${JSON.stringify(fByInv.get(fl.inv))}`);
}
console.log("\n--- does FATOURA.csv uniquely resolve the multi-claim ones? ---");
let resolvable=0,total=0; for(const fl of flags.filter((x:any)=>x.reason==="invoice-claimed-by-multiple-customers")){ total++; const cl=claims.get(fl.inv)||[]; const ft=fByInv.get(fl.inv); if(ft && cl.some(c=>c.name===ft.name)) resolvable++; }
console.log(`multi-claim resolvable via FATOURA.csv name: ${resolvable}/${total}`);
console.log("\n--- phone-mismatch (5) ---");
for(const fl of flags.filter((x:any)=>x.reason==="phone-mismatch")) console.log(JSON.stringify({...fl, fatoura:fByInv.get(fl.inv)}));
console.log("\n--- no-live (19) sample ---");
for(const fl of flags.filter((x:any)=>x.reason.startsWith("unresolved-live")).slice(0,10)) console.log(JSON.stringify({inv:fl.inv,owner_name:fl.owner_name,owner_phone:fl.owner_phone,fatoura:fByInv.get(fl.inv)}));

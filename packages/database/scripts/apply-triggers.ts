import postgres from "postgres";
import * as dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const client = postgres(process.env.DATABASE_URL!);

async function main() {
  const sqlFile = path.join(__dirname, "../src/triggers.sql");
  const sql = fs.readFileSync(sqlFile, "utf-8");
  
  console.log("Applying triggers...");
  await client.unsafe(sql);
  console.log("Triggers applied successfully!");
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

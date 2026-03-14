import postgres from "postgres";
import * as dotenv from "dotenv";

dotenv.config();

const client = postgres(process.env.DATABASE_URL!);

async function main() {
  console.log("Migrating at_shop → awaiting_trial / ready_for_pickup...");

  // Brovas at_shop → awaiting_trial
  const brovaResult = await client`
    UPDATE garments
    SET piece_stage = 'awaiting_trial'
    WHERE piece_stage = 'at_shop' AND garment_type = 'brova'
  `;
  console.log(`Updated ${brovaResult.count} brova(s) → awaiting_trial`);

  // Finals at_shop → ready_for_pickup
  const finalResult = await client`
    UPDATE garments
    SET piece_stage = 'ready_for_pickup'
    WHERE piece_stage = 'at_shop' AND garment_type = 'final'
  `;
  console.log(`Updated ${finalResult.count} final(s) → ready_for_pickup`);

  // Verify no at_shop rows remain
  const remaining = await client`
    SELECT count(*) as cnt FROM garments WHERE piece_stage = 'at_shop'
  `;
  console.log(`Remaining at_shop rows: ${remaining[0]?.cnt ?? 0}`);

  console.log("Migration complete!");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

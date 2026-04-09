import "dotenv/config";
import { db } from "../src/client";
import { notifications } from "../src/schema";

async function main() {
  const [row] = await db
    .insert(notifications)
    .values({
      department: "shop",
      brand: "ERTH",
      type: "garment_ready_for_pickup",
      title: "Test Notification",
      body: "Realtime is working if you see this!",
      scope: "department",
    })
    .returning({ id: notifications.id, title: notifications.title });

  console.log("Inserted notification:", row);
  process.exit(0);
}
main().catch(console.error);

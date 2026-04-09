import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL || "https://yuflzcpqiamilalqwkgx.supabase.co";
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY!;

const supabase = createClient(url, anonKey);

console.log("Connecting to realtime...");

const channel = supabase
  .channel("node-test")
  .on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "notifications" },
    (payload) => {
      console.log("EVENT RECEIVED!", payload);
    }
  )
  .subscribe((status, err) => {
    console.log("Channel status:", status, err ?? "");
    if (status === "SUBSCRIBED") {
      console.log("Subscribed! Now insert a notification to test...");
    }
  });

// Keep alive for 30 seconds
setTimeout(() => {
  console.log("Timeout — no event received in 30s");
  supabase.removeChannel(channel);
  process.exit(1);
}, 30000);

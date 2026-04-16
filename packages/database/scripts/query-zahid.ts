import "dotenv/config";
import { db } from "../src/client";
import { garmentFeedback, garments } from "../src/schema";
import { desc, eq, isNotNull, or, sql } from "drizzle-orm";

async function main() {
  console.log("\n=== Recent feedback rows with structured detail ===\n");

  const rows = await db
    .select({
      id: garmentFeedback.id,
      garment_id: garmentFeedback.garment_id,
      order_id: garmentFeedback.order_id,
      trip_number: garmentFeedback.trip_number,
      feedback_type: garmentFeedback.feedback_type,
      action: garmentFeedback.action,
      measurement_diffs: garmentFeedback.measurement_diffs,
      options_checklist: garmentFeedback.options_checklist,
      photo_urls: garmentFeedback.photo_urls,
      voice_note_urls: garmentFeedback.voice_note_urls,
      customer_signature: garmentFeedback.customer_signature,
      notes: garmentFeedback.notes,
      created_at: garmentFeedback.created_at,
    })
    .from(garmentFeedback)
    .where(
      or(
        isNotNull(garmentFeedback.measurement_diffs),
        isNotNull(garmentFeedback.options_checklist),
        isNotNull(garmentFeedback.photo_urls),
        isNotNull(garmentFeedback.voice_note_urls),
      ),
    )
    .orderBy(desc(garmentFeedback.created_at))
    .limit(20);

  if (rows.length === 0) {
    console.log("No feedback rows with structured detail found.");
  } else {
    for (const r of rows) {
      const gar = await db
        .select({ garment_id: garments.garment_id })
        .from(garments)
        .where(eq(garments.id, r.garment_id));
      const tag = gar[0]?.garment_id ?? r.garment_id;
      console.log(`--- ${tag} (order ${r.order_id}, trip ${r.trip_number}, ${r.action}) @ ${r.created_at?.toISOString()} ---`);
      if (r.measurement_diffs) {
        try {
          const arr = JSON.parse(r.measurement_diffs);
          console.log(`  measurement_diffs: ${Array.isArray(arr) ? arr.length : "?"} entr${Array.isArray(arr) && arr.length === 1 ? "y" : "ies"}`);
          if (Array.isArray(arr)) {
            for (const d of arr) {
              console.log(`    • ${d.field}: ${d.original_value} → ${d.actual_value} (${d.reason ?? "no reason"})${d.notes ? " — " + d.notes : ""}`);
            }
          }
        } catch {
          console.log(`  measurement_diffs: <unparsable>`);
        }
      }
      if (r.options_checklist) {
        try {
          const arr = JSON.parse(r.options_checklist);
          if (Array.isArray(arr)) {
            const rejected = arr.filter((o: any) => o.rejected || o.hashwa_rejected);
            console.log(`  options_checklist: ${arr.length} option(s), ${rejected.length} rejected`);
            for (const o of rejected) {
              console.log(`    • ${o.option_name}: ${o.expected_value} → ${o.new_value ?? "(fix)"}${o.hashwa_rejected ? ` [hashwa → ${o.hashwa_new_value ?? "(fix)"}]` : ""}`);
            }
          }
        } catch {
          console.log(`  options_checklist: <unparsable>`);
        }
      }
      if (r.photo_urls) {
        try {
          const arr = JSON.parse(r.photo_urls);
          const urls = Array.isArray(arr) ? arr.map((p: any) => (typeof p === "string" ? p : p?.url)).filter(Boolean) : [];
          console.log(`  photo_urls: ${urls.length} photo(s)`);
          for (const u of urls) console.log(`    • ${u}`);
        } catch {
          console.log(`  photo_urls: <unparsable>`);
        }
      }
      if (r.voice_note_urls) {
        try {
          const arr = JSON.parse(r.voice_note_urls);
          console.log(`  voice_note_urls: ${Array.isArray(arr) ? arr.length : "?"} note(s)`);
          if (Array.isArray(arr)) for (const u of arr) console.log(`    • ${u}`);
        } catch {
          console.log(`  voice_note_urls: <unparsable>`);
        }
      }
      if (r.customer_signature) {
        const isData = r.customer_signature.startsWith("data:");
        console.log(`  customer_signature: ${isData ? "DATA URL (not uploaded)" : "url: " + r.customer_signature.slice(0, 80)}`);
      }
      if (r.notes) console.log(`  notes: "${r.notes}"`);
      console.log();
    }
  }

  // Summary counts
  console.log(`=== Coverage summary ===`);
  const [totals] = await db
    .select({
      total: sql<number>`count(*)::int`,
      with_diffs: sql<number>`count(*) filter (where measurement_diffs is not null)::int`,
      with_options: sql<number>`count(*) filter (where options_checklist is not null)::int`,
      with_photos: sql<number>`count(*) filter (where photo_urls is not null)::int`,
      with_voice: sql<number>`count(*) filter (where voice_note_urls is not null)::int`,
      with_signature: sql<number>`count(*) filter (where customer_signature is not null)::int`,
    })
    .from(garmentFeedback);
  console.log(totals);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

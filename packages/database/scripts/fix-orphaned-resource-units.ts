import "dotenv/config";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);

async function main() {
    // NULL out unit_id on resources that reference non-existent units
    const result = await sql`
        UPDATE resources
        SET unit_id = NULL
        WHERE unit_id IS NOT NULL
          AND unit_id NOT IN (SELECT id FROM units)
    `;
    console.log(`Fixed ${result.count} orphaned resource(s).`);
    await sql.end();
    process.exit(0);
}

main().catch(console.error);

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Use Transaction Pooler (Port 6543) for Application Logic
const connectionString = process.env.TRANSACTION_URL || process.env.DATABASE_URL!;
const client = postgres(connectionString);
export const db = drizzle(client, { schema });
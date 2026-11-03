import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { authRoutes } from "./auth.js";
import { handleAuthAdmin } from "./auth-admin.js";
import { sql } from "./db.js";
import { env } from "./env.js";
import { realtimeRoutes, startRealtime } from "./realtime.js";
import { storageRoutes } from "./storage.js";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: (origin) => (env.allowedOrigins.includes(origin) ? origin : null),
    allowHeaders: ["authorization", "content-type", "x-upsert", "cache-control"],
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    maxAge: 600,
  }),
);

app.get("/health", async (c) => {
  await sql`SELECT 1`;
  return c.json({ ok: true });
});

app.route("/auth/v1", authRoutes);
app.route("/storage/v1", storageRoutes);
app.route("/realtime/v1", realtimeRoutes);
app.post("/functions/v1/auth-admin", (c) => handleAuthAdmin(c.req.raw));

app.onError((err, c) => {
  console.error(`[api] ${c.req.method} ${c.req.path} failed`, err);
  return c.json({ error: `Server error on ${c.req.method} ${c.req.path}` }, 500);
});

await startRealtime();
serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`[api] listening on :${info.port}`);
});

// Realtime over Server-Sent Events (replaces Supabase Realtime).
//
// Postgres triggers (deploy/db/post-schema.sql) pg_notify a slim row payload on
// channel `realtime`; this module LISTENs once and fans each event out to every
// connected client. Clients only use events to invalidate caches and refetch
// through RLS, so payloads carry ids, not data. The one table with readable
// content — notifications — is filtered per user here.
//
//   GET /realtime/v1/stream   (Authorization: Bearer <access token>)

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { asService, sql } from "./db.js";
import { bearer, verifyAccessToken } from "./jwt.js";

interface ChangeEvent {
  table: string;
  type: "INSERT" | "UPDATE" | "DELETE";
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
}

interface Client {
  userId: string;
  department: string | null;
  isAdmin: boolean;
  send: (data: string) => void;
}

const clients = new Set<Client>();
const HEARTBEAT_MS = 25_000;
// Bounded connection life: the client reconnects with its current token, so a
// deactivated user drops off within this window.
const MAX_CONNECTION_MS = 15 * 60_000;

function visibleTo(c: Client, ev: ChangeEvent): boolean {
  if (ev.table !== "notifications") return true;
  const row = ev.new ?? ev.old;
  if (!row) return false;
  if (row.scope === "user") return row.recipient_user_id === c.userId;
  return c.isAdmin || !c.department || row.department === c.department;
}

export async function startRealtime(): Promise<void> {
  await sql.listen(
    "realtime",
    (payload) => {
      let ev: ChangeEvent;
      try { ev = JSON.parse(payload); } catch { return; }
      for (const c of clients) if (visibleTo(c, ev)) c.send(payload);
    },
    () => console.log("[realtime] listening on channel 'realtime'"),
  );
}

export const realtimeRoutes = new Hono();

realtimeRoutes.get("/stream", async (c) => {
  const claims = await verifyAccessToken(bearer(c.req.header("authorization")) ?? "");
  if (!claims) return c.json({ error: "Not authenticated" }, 401);

  const user = await asService(async (tx) => {
    const [u] = await tx<{ id: string; department: string | null; role: string }[]>`
      SELECT id, department::text, role::text FROM public.users
      WHERE auth_id = ${claims.sub} AND is_active = true`;
    return u;
  });
  if (!user) return c.json({ error: "Account is not active" }, 401);

  c.header("X-Accel-Buffering", "no");
  return streamSSE(c, async (stream) => {
    const client: Client = {
      userId: user.id,
      department: user.department,
      isAdmin: user.role === "admin" || user.role === "super_admin",
      send: (data) => { void stream.writeSSE({ event: "change", data }); },
    };
    clients.add(client);
    await stream.writeSSE({ event: "ready", data: "{}" });

    const started = Date.now();
    try {
      while (!stream.aborted && Date.now() - started < MAX_CONNECTION_MS) {
        await stream.sleep(HEARTBEAT_MS);
        await stream.write(": ping\n\n");
      }
    } finally {
      clients.delete(client);
    }
  });
});

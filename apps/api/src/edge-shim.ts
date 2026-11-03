// Node replacement for supabase/functions/_shared/{supabase,cors}.ts so the
// auth-admin handler runs unchanged. `pg` talks to the internal PostgREST
// with a service_role JWT; `auth` maps GoTrue admin calls onto our own
// session store (there is no separate auth-user table any more — an "auth
// user" is just the auth_id uuid on public.users).

import { randomUUID } from "node:crypto";
import { revokeAllSessions } from "./auth.js";
import { env } from "./env.js";
import { signServiceToken, verifyAccessToken } from "./jwt.js";

// Browser CORS is handled by the app (hono/cors); nothing extra per response.
export const corsHeaders: Record<string, string> = {};

const serviceToken = signServiceToken();

async function adminHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  return { Authorization: `Bearer ${await serviceToken}`, ...extra };
}

async function jsonOr<T>(r: Response): Promise<T | null> {
  const t = await r.text();
  if (!t) return null;
  try { return JSON.parse(t) as T; } catch { return null; }
}

export type DbError = { message: string; code?: string };
export type Result<T> = { data: T | null; error: DbError | null };

async function errorFrom(r: Response): Promise<DbError> {
  const body = await jsonOr<{ message?: string; code?: string }>(r);
  return { message: body?.message ?? `HTTP ${r.status}`, code: body?.code };
}

const escapeFilter = (v: string | number | boolean | null): string =>
  v === null ? "is.null" : String(v);

export const eqFilter = (col: string, v: string | number) =>
  `${encodeURIComponent(col)}=eq.${encodeURIComponent(escapeFilter(v))}`;
export const inFilter = (col: string, vs: ReadonlyArray<string | number>) =>
  `${encodeURIComponent(col)}=in.(${vs.map((v) => encodeURIComponent(escapeFilter(v))).join(",")})`;

const rest = (path: string) => `${env.postgrestUrl}/${path}`;

export const pg = {
  async select<T = unknown>(table: string, query: string, opts?: { single?: boolean }): Promise<Result<T>> {
    const headers = await adminHeaders({
      Accept: opts?.single ? "application/vnd.pgrst.object+json" : "application/json",
    });
    const r = await fetch(rest(`${table}?${query}`), { headers });
    if (!r.ok) return { data: null, error: await errorFrom(r) };
    return { data: await jsonOr<T>(r), error: null };
  },

  async insert<T = unknown>(
    table: string,
    row: unknown,
    opts?: { returning?: "single" | "rep" | "none" },
  ): Promise<Result<T>> {
    const ret = opts?.returning ?? "none";
    const headers = await adminHeaders({ "Content-Type": "application/json" });
    if (ret !== "none") headers.Prefer = "return=representation";
    if (ret === "single") headers.Accept = "application/vnd.pgrst.object+json";
    const r = await fetch(rest(table), { method: "POST", headers, body: JSON.stringify(row) });
    if (!r.ok) return { data: null, error: await errorFrom(r) };
    return { data: ret === "none" ? null : await jsonOr<T>(r), error: null };
  },

  async update<T = unknown>(
    table: string,
    filter: string,
    patch: unknown,
    opts?: { returning?: "single" | "rep" | "none" },
  ): Promise<Result<T>> {
    const ret = opts?.returning ?? "none";
    const headers = await adminHeaders({ "Content-Type": "application/json" });
    if (ret !== "none") headers.Prefer = "return=representation";
    if (ret === "single") headers.Accept = "application/vnd.pgrst.object+json";
    const r = await fetch(rest(`${table}?${filter}`), { method: "PATCH", headers, body: JSON.stringify(patch) });
    if (!r.ok) return { data: null, error: await errorFrom(r) };
    return { data: ret === "none" ? null : await jsonOr<T>(r), error: null };
  },

  async delete_(table: string, filter: string): Promise<Result<null>> {
    const r = await fetch(rest(`${table}?${filter}`), { method: "DELETE", headers: await adminHeaders() });
    if (!r.ok) return { data: null, error: await errorFrom(r) };
    return { data: null, error: null };
  },

  async rpc<T = unknown>(name: string, args: unknown): Promise<Result<T>> {
    const r = await fetch(rest(`rpc/${name}`), {
      method: "POST",
      headers: await adminHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(args),
    });
    if (!r.ok) return { data: null, error: await errorFrom(r) };
    return { data: await jsonOr<T>(r), error: null };
  },
};

export const auth = {
  /** Verify a caller's access token; `id` is the JWT subject (users.auth_id). */
  async getUser(token: string): Promise<Result<{ id: string; email: string | null }>> {
    const claims = await verifyAccessToken(token);
    if (!claims) return { data: null, error: { message: "Invalid session" } };
    return { data: { id: claims.sub, email: null }, error: null };
  },

  /** A new user just needs a fresh JWT subject; the handler stores it as auth_id. */
  async createUser(_payload: unknown): Promise<Result<{ id: string; email: string | null }>> {
    return { data: { id: randomUUID(), email: null }, error: null };
  },

  /** Only `ban_duration` matters now: a ban ends every live session. Role /
   *  username changes need no sync — the JWT carries no username and the
   *  role claim is re-read from public.users on every refresh. */
  async updateUserById(id: string, payload: unknown): Promise<Result<null>> {
    const ban = (payload as { ban_duration?: string } | null)?.ban_duration;
    if (ban && ban !== "none") await revokeAllSessions(id);
    return { data: null, error: null };
  },

  async deleteUser(id: string): Promise<Result<null>> {
    await revokeAllSessions(id);
    return { data: null, error: null };
  },
};

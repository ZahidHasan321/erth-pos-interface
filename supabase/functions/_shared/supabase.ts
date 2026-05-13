// Lightweight Supabase REST/Auth helpers. Replaces the supabase-js client so
// edge function isolates have ZERO remote imports to resolve at boot —
// boot-time `npm:`/`esm.sh` fetches were dropping ~30% of cold isolates'
// requests via TLS-EOF before any response could be written.
//
// Mirrors only the methods the auth functions use. Errors are returned
// (not thrown) to keep the call sites' shape close to supabase-js.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function adminHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    ...extra,
  };
}

async function jsonOr<T>(r: Response): Promise<T | null> {
  const t = await r.text();
  if (!t) return null;
  try { return JSON.parse(t) as T; } catch { return null; }
}

export type DbError = { message: string; code?: string };
export type Result<T> = { data: T | null; error: DbError | null };

async function errorFrom(r: Response): Promise<DbError> {
  const body = await jsonOr<{ message?: string; msg?: string; error_description?: string; code?: string }>(r);
  const message =
    body?.message ??
    body?.msg ??
    body?.error_description ??
    `HTTP ${r.status}`;
  return { message, code: body?.code };
}

// Used inline by filter helpers — kept here so the URL composition stays in one place.
const escapeFilter = (v: string | number | boolean | null): string => {
  if (v === null) return "is.null";
  return String(v);
};

export const eqFilter = (col: string, v: string | number) => `${encodeURIComponent(col)}=eq.${encodeURIComponent(escapeFilter(v))}`;
export const inFilter = (col: string, vs: ReadonlyArray<string | number>) =>
  `${encodeURIComponent(col)}=in.(${vs.map((v) => encodeURIComponent(escapeFilter(v))).join(",")})`;

// PostgREST table operations
export const pg = {
  async select<T = unknown>(
    table: string,
    query: string,
    opts?: { single?: boolean },
  ): Promise<Result<T>> {
    const headers = adminHeaders({ Accept: opts?.single ? "application/vnd.pgrst.object+json" : "application/json" });
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers });
    if (!r.ok) return { data: null, error: await errorFrom(r) };
    return { data: await jsonOr<T>(r), error: null };
  },

  async insert<T = unknown>(
    table: string,
    row: unknown,
    opts?: { returning?: "single" | "rep" | "none" },
  ): Promise<Result<T>> {
    const ret = opts?.returning ?? "none";
    const headers = adminHeaders({ "Content-Type": "application/json" });
    if (ret !== "none") headers.Prefer = "return=representation";
    if (ret === "single") headers.Accept = "application/vnd.pgrst.object+json";
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers,
      body: JSON.stringify(row),
    });
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
    const headers = adminHeaders({ "Content-Type": "application/json" });
    if (ret !== "none") headers.Prefer = "return=representation";
    if (ret === "single") headers.Accept = "application/vnd.pgrst.object+json";
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(patch),
    });
    if (!r.ok) return { data: null, error: await errorFrom(r) };
    return { data: ret === "none" ? null : await jsonOr<T>(r), error: null };
  },

  async delete_(table: string, filter: string): Promise<Result<null>> {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
      method: "DELETE",
      headers: adminHeaders(),
    });
    if (!r.ok) return { data: null, error: await errorFrom(r) };
    return { data: null, error: null };
  },

  async rpc<T = unknown>(name: string, args: unknown): Promise<Result<T>> {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: adminHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(args),
    });
    if (!r.ok) return { data: null, error: await errorFrom(r) };
    return { data: await jsonOr<T>(r), error: null };
  },
};

// Auth admin operations. Each returns either { data, error: null } or
// { data: null, error } so call sites can use destructuring like supabase-js.
export const auth = {
  // Verify a user-issued JWT and return the auth.users row.
  async getUser(token: string): Promise<Result<{ id: string; email: string | null }>> {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return { data: null, error: await errorFrom(r) };
    return { data: await jsonOr<{ id: string; email: string | null }>(r), error: null };
  },

  async createUser(payload: unknown): Promise<Result<{ id: string; email: string | null }>> {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: "POST",
      headers: adminHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    if (!r.ok) return { data: null, error: await errorFrom(r) };
    return { data: await jsonOr<{ id: string; email: string | null }>(r), error: null };
  },

  async updateUserById(id: string, payload: unknown): Promise<Result<null>> {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
      method: "PUT",
      headers: adminHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    if (!r.ok) return { data: null, error: await errorFrom(r) };
    return { data: null, error: null };
  },

  async deleteUser(id: string): Promise<Result<null>> {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
      method: "DELETE",
      headers: adminHeaders(),
    });
    if (!r.ok) return { data: null, error: await errorFrom(r) };
    return { data: null, error: null };
  },
};

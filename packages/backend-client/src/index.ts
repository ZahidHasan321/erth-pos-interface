// Browser client for the self-hosted backend (Postgres + PostgREST + api).
//
// Drop-in for the slice of supabase-js the apps use: `from` / `rpc` (the same
// postgrest-js query builder supabase-js wraps, so query semantics and error
// shapes are identical), `auth`, `storage`, `functions.invoke`, and
// `channel` / `removeChannel`.

import { PostgrestClient } from "@supabase/postgrest-js";
import { AuthClient } from "./auth";
import { RealtimeChannel, RealtimeHub } from "./realtime";

export type { Session, AuthEvent, AuthError } from "./auth";
export type { RealtimeChannel, ChangePayload, ChannelStatus } from "./realtime";

type Fetch = typeof fetch;

export interface BackendClientOptions {
  /** Wraps every PostgREST / storage / functions request (timeouts, retries). */
  fetch?: Fetch;
  /** localStorage key for the session. */
  storageKey?: string;
}

export function createBackendClient(url: string, opts: BackendClientOptions = {}) {
  const base = url.replace(/\/$/, "");
  const appFetch: Fetch = opts.fetch ?? ((...args) => fetch(...args));
  const auth = new AuthClient(base, opts.storageKey ?? "erth-auth-session");

  // Attach the current access token unless the caller already set one (the
  // apps' 401 handler replays with a freshly refreshed token).
  const authedFetch: Fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    const token = auth.getAccessToken();
    if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
    return appFetch(input, { ...init, headers });
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rest = new PostgrestClient<any>(`${base}/rest/v1`, { fetch: authedFetch });
  const hub = new RealtimeHub(base, auth);

  const storage = {
    from(bucket: string) {
      const objectUrl = (path: string) =>
        `${base}/storage/v1/object/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;
      return {
        async upload(
          path: string,
          file: Blob,
          options?: { contentType?: string; cacheControl?: string; upsert?: boolean },
        ): Promise<{ data: { path: string; fullPath: string }; error: null } | { data: null; error: { message: string } }> {
          try {
            const res = await authedFetch(objectUrl(path), {
              method: "POST",
              headers: { "Content-Type": file.type || options?.contentType || "application/octet-stream" },
              body: file,
            });
            const body = await res.json().catch(() => null);
            if (!res.ok) return { data: null, error: { message: body?.error ?? `HTTP ${res.status}` } };
            return { data: { path, fullPath: `${bucket}/${path}` }, error: null };
          } catch (err) {
            return { data: null, error: { message: String(err) } };
          }
        },
        getPublicUrl(path: string): { data: { publicUrl: string } } {
          return {
            data: {
              publicUrl: `${base}/storage/v1/object/public/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`,
            },
          };
        },
        async remove(paths: string[]): Promise<{ data: unknown; error: { message: string } | null }> {
          try {
            const res = await authedFetch(`${base}/storage/v1/object/${bucket}`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ prefixes: paths }),
            });
            const body = await res.json().catch(() => null);
            if (!res.ok) return { data: null, error: { message: body?.error ?? `HTTP ${res.status}` } };
            return { data: body, error: null };
          } catch (err) {
            return { data: null, error: { message: String(err) } };
          }
        },
      };
    },
  };

  const functions = {
    /** On a non-2xx, `error.context` is the Response (same as supabase-js). */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async invoke<T = any>(name: string, options: { body?: unknown } = {}): Promise<
      { data: T; error: null } | { data: null; error: Error & { context?: Response } }
    > {
      try {
        const res = await authedFetch(`${base}/functions/v1/${name}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(options.body ?? {}),
        });
        if (!res.ok) {
          const error = Object.assign(new Error(`Function ${name} returned HTTP ${res.status}`), { context: res });
          return { data: null, error };
        }
        return { data: (await res.json().catch(() => null)) as T, error: null };
      } catch (err) {
        return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
      }
    },
  };

  return {
    from: rest.from.bind(rest),
    rpc: rest.rpc.bind(rest),
    auth,
    storage,
    functions,
    channel: (name: string) => new RealtimeChannel(name, hub),
    removeChannel: (ch: RealtimeChannel) => { hub.remove(ch); return Promise.resolve("ok" as const); },
    /** No-op: the realtime stream reads the current token on every (re)connect. */
    realtime: { setAuth: (_token: string) => {} },
  };
}

export type BackendClient = ReturnType<typeof createBackendClient>;

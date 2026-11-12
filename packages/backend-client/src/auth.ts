// Session client for the api service's /auth/v1 endpoints. Mirrors the parts
// of the supabase-js auth surface the apps use (getSession, refreshSession,
// signOut, onAuthStateChange), so call sites stay the same.

export interface Session {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number; // epoch seconds
  user: {
    id: string;
    app_metadata: {
      user_id: string;
      role: string | null;
      department: string | null;
      job_functions: string[];
    };
  };
}

export type AuthEvent = "SIGNED_IN" | "SIGNED_OUT" | "TOKEN_REFRESHED";
export interface AuthError {
  message: string;
  status?: number;
  /** Login only: the next attempt must carry a Turnstile token. */
  captcha_required?: boolean;
}

type Listener = (event: AuthEvent, session: Session | null) => void;

// Refresh this long before the access token expires.
const REFRESH_MARGIN_SEC = 60;

export class AuthClient {
  private session: Session | null;
  private listeners = new Set<Listener>();
  private refreshing: Promise<{ data: { session: Session | null }; error: AuthError | null }> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  private readonly url: string;
  private readonly storageKey: string;

  constructor(url: string, storageKey: string) {
    this.url = url;
    this.storageKey = storageKey;
    this.session = this.load();
    this.schedule();
    if (typeof window !== "undefined") {
      // Another tab logged in / refreshed / logged out.
      window.addEventListener("storage", (e) => {
        if (e.key !== this.storageKey) return;
        const next = this.load();
        const had = this.session;
        this.session = next;
        this.schedule();
        if (!next) this.emit("SIGNED_OUT", null);
        else this.emit(had?.user.id === next.user.id ? "TOKEN_REFRESHED" : "SIGNED_IN", next);
      });
      // Timers are throttled in background tabs; catch up when visible again.
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && this.expiresSoon()) void this.refreshSession();
      });
    }
  }

  /** Current access token, or null when signed out. Sync, for fetch wrappers. */
  getAccessToken(): string | null {
    return this.session?.access_token ?? null;
  }

  async getSession(): Promise<{ data: { session: Session | null }; error: AuthError | null }> {
    if (this.session && this.expiresSoon()) {
      const res = await this.refreshSession();
      // A network failure keeps the old session; the server will 401 if it's dead.
      if (res.error && res.error.status === undefined) return { data: { session: this.session }, error: null };
      return res;
    }
    return { data: { session: this.session }, error: null };
  }

  async signInWithPin(credentials: { username: string; pin: string; turnstileToken?: string }): Promise<{
    data: { session: Session | null; profile: Record<string, unknown> | null };
    error: AuthError | null;
  }> {
    let res: Response;
    try {
      res = await fetch(`${this.url}/auth/v1/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: credentials.username,
          pin: credentials.pin,
          turnstile_token: credentials.turnstileToken,
        }),
      });
    } catch (err) {
      console.error("[auth] login request failed", err);
      return {
        data: { session: null, profile: null },
        error: { message: "Can't reach the server. Check the internet connection and try again." },
      };
    }
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.access_token) {
      return {
        data: { session: null, profile: null },
        error: {
          // The api's own messages are user-facing; anything else (a proxy
          // 502 page, an empty body) is a server problem, not a wrong PIN.
          message: typeof body?.error === "string" && res.status < 500
            ? body.error
            : `Server problem, please try again in a minute. (HTTP ${res.status})`,
          status: res.status,
          captcha_required: body?.captcha_required === true,
        },
      };
    }
    const { profile, ...session } = body as Session & { profile: Record<string, unknown> };
    this.set(session);
    this.emit("SIGNED_IN", session);
    return { data: { session, profile }, error: null };
  }

  /** Single-flight refresh. `error.status` is set when the server rejected the
   *  token (session is gone); undefined means a network failure. */
  refreshSession(): Promise<{ data: { session: Session | null }; error: AuthError | null }> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.doRefresh().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  private async doRefresh(): Promise<{ data: { session: Session | null }; error: AuthError | null }> {
    // Another tab may already have rotated the token — adopt theirs.
    const stored = this.load();
    if (stored && stored.refresh_token !== this.session?.refresh_token && !this.expiresSoon(stored)) {
      this.session = stored;
      this.schedule();
      this.emit("TOKEN_REFRESHED", stored);
      return { data: { session: stored }, error: null };
    }
    const current = this.session;
    if (!current) return { data: { session: null }, error: { message: "No session", status: 401 } };

    let res: Response;
    try {
      res = await fetch(`${this.url}/auth/v1/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: current.refresh_token }),
      });
    } catch (err) {
      return { data: { session: null }, error: { message: `Session refresh failed: ${String(err)}` } };
    }
    const body = await res.json().catch(() => null);
    if (res.status === 401 || res.status === 400) {
      this.set(null);
      this.emit("SIGNED_OUT", null);
      return { data: { session: null }, error: { message: body?.error ?? "Session expired", status: res.status } };
    }
    if (!res.ok || !body?.access_token) {
      return { data: { session: null }, error: { message: body?.error ?? `Session refresh failed (HTTP ${res.status})` } };
    }
    this.set(body as Session);
    this.emit("TOKEN_REFRESHED", body as Session);
    return { data: { session: body as Session }, error: null };
  }

  async signOut(): Promise<{ error: null }> {
    const refresh = this.session?.refresh_token;
    this.set(null);
    this.emit("SIGNED_OUT", null);
    if (refresh) {
      await fetch(`${this.url}/auth/v1/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refresh }),
      }).catch(() => {});
    }
    return { error: null };
  }

  onAuthStateChange(cb: Listener): { data: { subscription: { unsubscribe: () => void } } } {
    this.listeners.add(cb);
    return { data: { subscription: { unsubscribe: () => { this.listeners.delete(cb); } } } };
  }

  private expiresSoon(s: Session | null = this.session): boolean {
    return !!s && s.expires_at - Date.now() / 1000 < REFRESH_MARGIN_SEC;
  }

  private emit(event: AuthEvent, session: Session | null) {
    for (const l of this.listeners) {
      try { l(event, session); } catch (e) { console.error("[auth] listener failed", e); }
    }
  }

  private set(session: Session | null) {
    this.session = session;
    try {
      if (session) localStorage.setItem(this.storageKey, JSON.stringify(session));
      else localStorage.removeItem(this.storageKey);
    } catch { /* storage unavailable: session lives in memory only */ }
    this.schedule();
  }

  private load(): Session | null {
    try {
      const raw = localStorage.getItem(this.storageKey);
      return raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      return null;
    }
  }

  private schedule() {
    clearTimeout(this.timer);
    if (!this.session) return;
    const ms = Math.max(0, (this.session.expires_at - REFRESH_MARGIN_SEC) * 1000 - Date.now());
    this.timer = setTimeout(() => { void this.refreshSession(); }, ms);
  }
}

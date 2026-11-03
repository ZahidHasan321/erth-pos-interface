// Session endpoints (replace Supabase GoTrue).
//
//   POST /auth/v1/login   { username, pin }      → session
//   POST /auth/v1/token   { refresh_token }      → rotated session
//   POST /auth/v1/logout  { refresh_token }      → revokes it
//
// PIN check stays in Postgres (public.verify_pin). Try limits live here, keyed
// on the submitted username (auth.login_attempts): verify_pin's own counter
// rolls back with its RAISE, and its messages differ for unknown vs real users.
// Every failure gets one generic message. The JWT subject is public.users.auth_id
// — the value every RLS helper matches auth.uid() against.

import { createHash, randomBytes } from "node:crypto";
import { Hono } from "hono";
import postgres from "postgres";
import { asService, sql, type Tx } from "./db.js";
import { env } from "./env.js";
import { signAccessToken, type AppMetadata } from "./jwt.js";
import { clientIp, rateLimiter } from "./ratelimit.js";
import { turnstileEnabled, verifyTurnstile } from "./turnstile.js";

// Two tabs of one terminal can refresh the same token at once; let the loser
// of that race still succeed for a few seconds instead of logging it out.
const REUSE_GRACE_MS = 10_000;

// All shop staff share one public IP, so the per-IP cap is loose; the
// per-username limit below is the real brute-force guard.
const loginLimit = rateLimiter(60, 60_000);   // per IP
const refreshLimit = rateLimiter(60, 60_000); // per IP

// Per-username try limit (fat-finger friendly).
const MAX_FAILURES = 10;            // within WINDOW → cooldown
const WINDOW = "15 minutes";
const COOLDOWN = "5 minutes";
const CAPTCHA_AFTER = 3;            // failures in WINDOW before Turnstile is required
const FAIL_MIN_MS = 500;            // equalise timing of every failure path

const LOGIN_FAILED = "Wrong username or PIN.";
const LOCKED_OUT = "Too many attempts. Try again in 5 minutes.";
const CAPTCHA_NEEDED = "Please complete the check below.";

type Attempts = { failures: number; retry_after: number };

/** Current failures in the window, and seconds left on a cooldown (0 = none). */
async function readAttempts(key: string): Promise<Attempts> {
  const [row] = await sql<Attempts[]>`
    SELECT
      CASE WHEN first_failed_at > now() - ${WINDOW}::interval
                AND (locked_until IS NULL OR locked_until > now())
           THEN failures ELSE 0 END AS failures,
      GREATEST(0, ceil(extract(epoch FROM locked_until - now())))::int AS retry_after
    FROM auth.login_attempts WHERE username = ${key}`;
  return row ?? { failures: 0, retry_after: 0 };
}

/** Count one failure (own autocommit statement — verify_pin's tx rolled back).
 *  A stale window or an expired cooldown starts the count over. */
async function recordFailure(key: string): Promise<Attempts> {
  const [row] = await sql<Attempts[]>`
    INSERT INTO auth.login_attempts AS a (username, failures, first_failed_at)
    VALUES (${key}, 1, now())
    ON CONFLICT (username) DO UPDATE SET
      failures = CASE WHEN a.first_failed_at <= now() - ${WINDOW}::interval
                        OR a.locked_until <= now() THEN 1 ELSE a.failures + 1 END,
      first_failed_at = CASE WHEN a.first_failed_at <= now() - ${WINDOW}::interval
                               OR a.locked_until <= now() THEN now() ELSE a.first_failed_at END,
      locked_until = CASE WHEN a.first_failed_at <= now() - ${WINDOW}::interval
                            OR a.locked_until <= now() THEN NULL
                          WHEN a.failures + 1 >= ${MAX_FAILURES} THEN now() + ${COOLDOWN}::interval
                          ELSE a.locked_until END
    RETURNING failures,
      GREATEST(0, ceil(extract(epoch FROM locked_until - now())))::int AS retry_after`;
  return row;
}

// Drop rows that no longer limit anything (fake usernames pile up otherwise).
setInterval(() => {
  sql`DELETE FROM auth.login_attempts
      WHERE first_failed_at < now() - ${WINDOW}::interval
        AND (locked_until IS NULL OR locked_until < now())`
    .catch((err) => console.error("[auth] login_attempts cleanup failed", err));
}, 60 * 60_000).unref();

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

type UserRow = {
  id: string;
  auth_id: string;
  role: string | null;
  department: string | null;
  job_functions: string[] | null;
};

const appMeta = (u: UserRow): AppMetadata => ({
  user_id: u.id,
  role: u.role,
  department: u.department,
  job_functions: u.job_functions ?? [],
});

async function issueSession(tx: Tx, user: UserRow, userAgent: string | undefined) {
  const refresh = randomBytes(32).toString("base64url");
  await tx`
    INSERT INTO auth.refresh_tokens (token_hash, sub, expires_at, user_agent)
    VALUES (${hashToken(refresh)}, ${user.auth_id},
            now() + make_interval(days => ${env.refreshTokenTtlDays}), ${userAgent ?? null})`;
  const { token, exp } = await signAccessToken(user.auth_id, appMeta(user));
  return {
    access_token: token,
    token_type: "bearer",
    expires_in: env.accessTokenTtlSec,
    expires_at: exp,
    refresh_token: refresh,
    user: { id: user.auth_id, app_metadata: appMeta(user) },
  };
}

export const authRoutes = new Hono();

authRoutes.post("/login", async (c) => {
  const ip = clientIp(c);
  const wait = loginLimit(ip);
  if (wait) {
    c.header("Retry-After", String(wait));
    return c.json({ error: "Too many login attempts. Try again shortly." }, 429);
  }
  const body = await c.req.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username : "";
  const pin = typeof body?.pin === "string" ? body.pin : "";
  const captchaToken = typeof body?.turnstile_token === "string" ? body.turnstile_token : "";
  if (!username || !pin) return c.json({ error: "username and pin are required" }, 400);

  // Same key whether or not the user exists, so fake and real names behave alike.
  const key = username.toLowerCase().slice(0, 200);
  const lockedOut = (retryAfter: number) => {
    c.header("Retry-After", String(retryAfter));
    return c.json({ error: LOCKED_OUT }, 429);
  };

  const before = await readAttempts(key);
  if (before.retry_after > 0) return lockedOut(before.retry_after);
  if (turnstileEnabled() && before.failures >= CAPTCHA_AFTER) {
    if (!captchaToken || !(await verifyTurnstile(captchaToken, ip))) {
      return c.json({ error: CAPTCHA_NEEDED, captcha_required: true }, 400);
    }
  }

  const started = Date.now();
  try {
    const session = await asService(async (tx) => {
      const [{ u }] = await tx`SELECT public.verify_pin(${username}, ${pin}) AS u`;
      // First login on this stack (or a user created before auth_id existed):
      // mint the stable JWT subject.
      const [user] = await tx<UserRow[]>`
        UPDATE public.users SET auth_id = COALESCE(auth_id, gen_random_uuid())
        WHERE id = ${u.id}
        RETURNING id, auth_id, role::text, department::text, job_functions::text[]`;
      await tx`DELETE FROM auth.refresh_tokens WHERE sub = ${user.auth_id} AND expires_at < now()`;
      return { ...(await issueSession(tx, user, c.req.header("user-agent"))), profile: u };
    });
    if (before.failures > 0) await sql`DELETE FROM auth.login_attempts WHERE username = ${key}`;
    return c.json(session);
  } catch (err) {
    // verify_pin RAISEs for unknown user, wrong PIN, no PIN, deactivated,
    // its own lock — all collapse to one message so none leaks which it was.
    if (err instanceof postgres.PostgresError && err.code === "P0001") {
      const after = await recordFailure(key);
      const pad = FAIL_MIN_MS - (Date.now() - started);
      if (pad > 0) await new Promise((r) => setTimeout(r, pad));
      if (after.retry_after > 0) return lockedOut(after.retry_after);
      return c.json(
        turnstileEnabled() && after.failures >= CAPTCHA_AFTER
          ? { error: LOGIN_FAILED, captcha_required: true }
          : { error: LOGIN_FAILED },
        400,
      );
    }
    console.error("[auth] login failed", err);
    return c.json({ error: "Login failed: server error" }, 500);
  }
});

authRoutes.post("/token", async (c) => {
  const wait = refreshLimit(clientIp(c));
  if (wait) {
    c.header("Retry-After", String(wait));
    return c.json({ error: "Too many requests" }, 429);
  }
  const body = await c.req.json().catch(() => null);
  const refresh = typeof body?.refresh_token === "string" ? body.refresh_token : "";
  if (!refresh) return c.json({ error: "refresh_token is required" }, 400);

  const result = await asService(async (tx) => {
    const [row] = await tx<{ sub: string; expires_at: Date; rotated_at: Date | null; revoked_at: Date | null }[]>`
      SELECT sub, expires_at, rotated_at, revoked_at FROM auth.refresh_tokens
      WHERE token_hash = ${hashToken(refresh)} FOR UPDATE`;
    if (!row || row.revoked_at) return null;
    if (row.expires_at.getTime() < Date.now()) return null;
    if (row.rotated_at && Date.now() - row.rotated_at.getTime() > REUSE_GRACE_MS) return null;

    const [user] = await tx<UserRow[]>`
      SELECT id, auth_id, role::text, department::text, job_functions::text[]
      FROM public.users WHERE auth_id = ${row.sub} AND is_active = true`;
    if (!user) {
      // Deactivated or deleted: end every session of this subject.
      await tx`UPDATE auth.refresh_tokens SET revoked_at = now() WHERE sub = ${row.sub} AND revoked_at IS NULL`;
      return null;
    }
    if (!row.rotated_at) {
      await tx`UPDATE auth.refresh_tokens SET rotated_at = now() WHERE token_hash = ${hashToken(refresh)}`;
    }
    return issueSession(tx, user, c.req.header("user-agent"));
  });

  if (!result) return c.json({ error: "Invalid or expired refresh token" }, 401);
  return c.json(result);
});

authRoutes.post("/logout", async (c) => {
  const body = await c.req.json().catch(() => null);
  const refresh = typeof body?.refresh_token === "string" ? body.refresh_token : "";
  if (refresh) {
    await sql`UPDATE auth.refresh_tokens SET revoked_at = now()
              WHERE token_hash = ${hashToken(refresh)} AND revoked_at IS NULL`;
  }
  return c.body(null, 204);
});

/** Revoke every session of a JWT subject (deactivate / delete user). */
export async function revokeAllSessions(sub: string): Promise<void> {
  await sql`UPDATE auth.refresh_tokens SET revoked_at = now() WHERE sub = ${sub} AND revoked_at IS NULL`;
}

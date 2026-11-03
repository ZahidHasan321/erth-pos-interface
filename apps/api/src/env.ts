function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`api: missing required env var ${name}`);
  return v;
}

const jwtSecret = required("JWT_SECRET");
if (jwtSecret.length < 32) throw new Error("api: JWT_SECRET must be at least 32 characters");

export const env = {
  port: Number(process.env.PORT ?? 8080),
  // api_server role — see deploy/db/init/00-platform.sql
  databaseUrl: required("DATABASE_URL"),
  // Internal PostgREST base (no /rest/v1 prefix), e.g. http://rest:3000
  postgrestUrl: required("POSTGREST_URL").replace(/\/$/, ""),
  jwtSecret,
  accessTokenTtlSec: Number(process.env.ACCESS_TOKEN_TTL_SEC ?? 3600),
  refreshTokenTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30),
  // Public base URL of this API host — used to build media URLs.
  publicUrl: required("PUBLIC_URL").replace(/\/$/, ""),
  storageDir: process.env.STORAGE_DIR ?? "/data/storage",
  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB ?? 50) * 1024 * 1024,
  // Comma-separated app origins allowed to call the API from a browser.
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  // Cloudflare Turnstile secret. Unset = no captcha step on login (try limits
  // still apply).
  turnstileSecret: process.env.TURNSTILE_SECRET ?? "",
};

if (!env.turnstileSecret) {
  console.warn("[api] TURNSTILE_SECRET not set: login captcha is disabled");
}

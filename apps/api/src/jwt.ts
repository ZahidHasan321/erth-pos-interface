import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { env } from "./env.js";

const key = new TextEncoder().encode(env.jwtSecret);

export interface AppMetadata {
  user_id: string;
  role: string | null;
  department: string | null;
  job_functions: string[];
}

export interface AccessClaims extends JWTPayload {
  sub: string;
  role: "authenticated" | "service_role";
  app_metadata?: AppMetadata;
}

/** Access token PostgREST accepts: `role` picks the DB role, `sub` feeds auth.uid(). */
export async function signAccessToken(sub: string, appMeta: AppMetadata): Promise<{ token: string; exp: number }> {
  const exp = Math.floor(Date.now() / 1000) + env.accessTokenTtlSec;
  const token = await new SignJWT({ role: "authenticated", aud: "authenticated", app_metadata: appMeta })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(key);
  return { token, exp };
}

/** Long-lived service token for the api's own PostgREST calls (never leaves the server). */
export function signServiceToken(): Promise<string> {
  return new SignJWT({ role: "service_role" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("10y")
    .sign(key);
}

export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    if (payload.role !== "authenticated" || typeof payload.sub !== "string") return null;
    return payload as AccessClaims;
  } catch {
    return null;
  }
}

export function bearer(header: string | undefined | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header);
  return m ? m[1] : null;
}

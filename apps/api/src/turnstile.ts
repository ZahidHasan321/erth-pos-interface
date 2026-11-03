import { env } from "./env.js";

export const turnstileEnabled = () => !!env.turnstileSecret;

/** Server-side check of a Turnstile token. Fails closed on network errors. */
export async function verifyTurnstile(token: string, remoteIp: string): Promise<boolean> {
  const form = new URLSearchParams({ secret: env.turnstileSecret, response: token });
  if (remoteIp !== "unknown") form.set("remoteip", remoteIp);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(5000),
    });
    const body = (await res.json()) as { success?: boolean };
    return body.success === true;
  } catch (err) {
    console.error("[auth] turnstile verify failed", err);
    return false;
  }
}

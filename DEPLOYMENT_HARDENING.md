# Deployment hardening checklist (host / proxy, not code)

> Extracted from `CLAUDE.md` — this is a deploy-time host-config checklist, not coding guidance, so it lives outside the always-loaded spec. Read it when deploying or moving the deployment.

The app is internal-only but reachable from the public internet (domain on a VPS). Code-level hardening (PIN policy, lockout, server-side throttle, RLS, SECURITY DEFINER `search_path`) is in place; the below is the deployment-layer half — **re-apply if the deployment moves**. Host-config TODO, not coding TODO; these stack on top of the in-code hardening, they don't replace it.

0. **Drop `get_login_users` + the picker calls** before going live (it returns the full active-user roster to anon = free staff enumeration). `DROP FUNCTION IF EXISTS get_login_users();` in `triggers.sql`, and remove the `db.rpc("get_login_users")` `useEffect` blocks in the three `apps/pos-interface/src/routes/(auth)/*/login.tsx` pages + `apps/workshop/src/routes/(auth)/login.tsx`. The typed-username form already handles login.
1. **Rate-limit auth endpoints at the proxy.** Cap `POST /rest/v1/rpc/login_with_pin` and `/auth/v1/token` at ~10/min per IP with burst smoothing. The DB per-user lockout + 0.5s `pg_sleep` on bad PINs don't stop a parallel attacker hammering many users from one IP.
2. **Force HTTPS + HSTS.** `login_with_pin` returns a one-time password exchanged for a JWT — plaintext makes it sniffable. Set `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`, redirect HTTP→HTTPS, don't bind port 80 to the app.
3. **No HTTP listener for the API at all** — TLS-only on the public surface.
4. **(Stretch, biggest single win) Private tunnel** (Tailscale / WireGuard / Cloudflare Access). Reduces every public brute-force/enumeration concern to "internal LAN" — the original threat model the app is designed for.
5. **Per-IP / global lockout** isn't doable in plpgsql (PostgREST doesn't expose the client IP). Do it at the proxy (fail2ban-style: lock an IP after N 4xx on the login endpoint in a window). Per-user lockout is already in `verify_pin`.
6. **TLS termination + upstream.** If TLS terminates at the proxy and re-proxies to Supabase, confirm the upstream leg is also TLS.
7. **CSP / framing.** `Content-Security-Policy` (script-src 'self' + Supabase host), `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`.
8. **Service-role key blast radius.** Server-side only (Edge Functions, admin scripts); never in a `VITE_*` env var. CI guard: grep-fail commits introducing `VITE_*SERVICE*` or `SERVICE_ROLE` in `apps/`.
9. **Backup & rotation.** Schedule DB backups; have a service-role-key rotation/revocation plan (the key is not in this repo — keep it that way).

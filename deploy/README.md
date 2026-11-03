# Self-hosted deployment (VPS)

Replaces Supabase + Vercel with one Docker Compose stack:

| Service | What it does |
|---|---|
| `db` | Postgres 17. Platform layer in `db/init/` (roles, `auth.uid()`, refresh tokens). Bound to 127.0.0.1 only. |
| `rest` | PostgREST, the same query engine Supabase used. Served at `API_ORIGIN/rest/v1`. |
| `api` | `apps/api`: PIN login / refresh / logout, admin user management (ported `auth-admin`), file storage, realtime (SSE). |
| `caddy` | TLS (Let's Encrypt), the three SPAs, security headers, and proxying for the API host. |

The apps talk to it through `packages/backend-client`, which keeps the supabase-js surface (`db.from`, `db.rpc`, `db.auth`, `db.storage`, `db.channel`). Each app needs one env var: `VITE_API_URL`.

## First deploy

1. Point DNS for the four hostnames at the VPS and open ports 80/443 (only those, plus SSH).
2. Install Docker, clone the repo to `/opt/erth`, then `cd deploy && cp .env.example .env` and fill it in (`openssl rand -base64 48` for secrets).
3. `docker compose up -d --build db`
4. Load data, either:
   - **Production move:** `./scripts/migrate-from-supabase.sh '<supabase db url>' https://<ref>.supabase.co`. It reads prod only. Stop writes on the old apps first.
   - **Empty stack:** `./scripts/build-schema.sh`
5. `docker compose up -d --build`, then `./scripts/smoke.sh <username> <pin>`
6. Add `scripts/backup.sh` to cron and sync `backups/` off the box.

## Updating

`git pull && cd deploy && docker compose up -d --build`. DB schema changes still go through the idempotent migration files, applied over an SSH tunnel (`ssh -L 5432:127.0.0.1:5432 vps`), then `docker compose exec -T db psql -U postgres < db/post-schema.sql`.

## Local rehearsal

`cp .env.local.example .env`, then follow the same steps. Apps are at `https://shop.localhost:18443` (Caddy local CA).

## Notes

- Existing users keep their PINs. `users.auth_id` carries over and is the JWT subject.
- Logging out or deactivating a user revokes their refresh tokens immediately. Access tokens live for 1h.
- Login limits live in the api (`verify_pin`'s own lockout never commits). Per IP: 60/min (shop staff share one IP). Per username (lowercased, real or not, stored in `auth.login_attempts`): 10 failures in 15 min → 5-min cooldown; a success clears it. Every failure returns the same "Wrong username or PIN."
- Cloudflare Turnstile is shown after 3 failures for a username. Create a widget (managed mode) under Cloudflare dashboard → Turnstile for the app hostnames; put the site key in `VITE_TURNSTILE_SITE_KEY` (baked into the SPAs, rebuild `caddy`) and the secret in `TURNSTILE_SECRET` (api). Both empty = no captcha; try limits still apply. `.env.local.example` uses Cloudflare's always-pass test keys.
- `auth.login_attempts` is created by `db/init` on a new volume and by `db/post-schema.sql` on an existing one — re-run post-schema after pulling this change.
- DB timezone is UTC, identical to Supabase. Moving to Kuwait time is a separate planned change.

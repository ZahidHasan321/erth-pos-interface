/**
 * Single source of truth for the local E2E harness.
 *
 * Everything here targets the LOCAL Supabase stack started by
 * `pnpm exec supabase start` (see e2e/README.md). The anon key is the standard
 * Supabase CLI local-dev demo key — NOT a secret. The DB URL is the local
 * Postgres on :54322. Nothing here ever references prod.
 *
 * These constants are deliberately hardcoded (not read from a .env) so a seed
 * or DB-assertion script can never accidentally point at the prod database that
 * packages/database/.env holds.
 */

export const SUPABASE_URL = "http://127.0.0.1:54321";

// Local-dev demo anon key emitted by `supabase status` (issuer "supabase-demo").
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

// Local Postgres (port 54322) — used by seed + future DB-assertion helpers.
export const DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// Dev server origins (vite strictPort — see each app's vite.config.ts).
export const POS_BASE_URL = "http://127.0.0.1:5173";
export const WORKSHOP_BASE_URL = "http://127.0.0.1:5174";

// Brand for all seeded users — stored LOWERCASE in users.brands (see the
// can_access_brand lowercase invariant in CLAUDE.md / MEMORY).
export const BRAND = "erth";

// Loginnable users seeded by scripts/seed-users.ts. Same PIN for all three so
// the harness is easy to reason about. Usernames are e2e-prefixed so they never
// collide with real seeded staff.
export const PIN = "123456";

export const USERS = {
  orderTaker: {
    username: "e2e_ordertaker",
    name: "E2E Order Taker",
    role: "staff" as const,
    department: "shop" as const,
    jobFunctions: [] as string[],
  },
  cashier: {
    username: "e2e_cashier",
    name: "E2E Cashier",
    role: "cashier" as const,
    department: "shop" as const,
    jobFunctions: [] as string[],
  },
  // Workshop terminal user: staff + a job_function → isTerminalUser() is true,
  // so post-login lands them on their own terminal. `cutter` → /terminals/cutting
  // (the workshop RBAC matrix grants terminal:cutter "full" there; plain
  // staff:workshop is denied /receiving, so a terminal user is the right shape
  // for a clean landing assertion).
  workshop: {
    username: "e2e_cutter",
    name: "E2E Cutter",
    role: "staff" as const,
    department: "workshop" as const,
    jobFunctions: ["cutter"] as string[],
  },
  // Workshop ADMIN — needed to drive the WHOLE workshop flow. Plain staff:workshop
  // is DENIED /receiving|parking|scheduler|dispatch (only admin / manager:workshop
  // get "full" there — see apps/workshop/src/lib/rbac.ts). An admin lands on
  // /receiving after login (getPostLoginPath: not a terminal user) and has "full"
  // on every workshop route, so one user can receive → park → schedule → dispatch.
  workshopAdmin: {
    username: "e2e_wsadmin",
    name: "E2E Workshop Admin",
    role: "admin" as const,
    department: "workshop" as const,
    jobFunctions: [] as string[],
  },
};

// Worker/unit resources the scheduler's ProductionPlanDialog + WorkerDropdown read
// (apps/workshop/src/hooks/useResources.ts → public.resources). One worker per
// non-sewing stage; sewing is unit-collaborative so it lists a UNIT, backed by a
// public.units row. responsibility must equal the stage name the plan keys map to.
export const SEW_UNIT = "Unit A";
export const WORKERS = {
  cutting: "E2E Cutter Worker",
  sewing: SEW_UNIT, // sewing is assigned by unit, not individual
  finishing: "E2E Finisher",
  ironing: "E2E Ironer",
  quality_check: "E2E Inspector",
} as const;

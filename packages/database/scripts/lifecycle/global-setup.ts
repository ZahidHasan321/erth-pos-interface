import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import {
  CONTAINER_NAME,
  HOST_PORT,
  PG_IMAGE,
  PG_USER,
  PG_PASSWORD,
  PG_DB,
  TEST_DATABASE_URL,
} from "./config";
import { seedReferenceData } from "./seed";

const execFileAsync = promisify(execFile);
const HERE = __dirname;
const DB_PKG_ROOT = path.resolve(HERE, "../..");

function docker(args: string[], opts: { ignoreError?: boolean } = {}): string {
  try {
    return execFileSync("docker", args, { encoding: "utf-8" });
  } catch (e) {
    if (opts.ignoreError) return "";
    throw e;
  }
}

async function waitForPostgres(timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const probe = postgres(TEST_DATABASE_URL, { max: 1, idle_timeout: 1 });
    try {
      await probe`SELECT 1`;
      await probe.end({ timeout: 1 });
      return;
    } catch {
      await probe.end({ timeout: 1 }).catch(() => {});
      if (Date.now() - start > timeoutMs) {
        throw new Error("Timed out waiting for the test Postgres container");
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

/** vitest globalSetup: boot container, build schema, return teardown. */
export default async function setup(): Promise<() => Promise<void>> {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore" });
  } catch {
    throw new Error(
      "Docker is required for the workflow test suite but is not available/running.",
    );
  }

  // Fresh container every run — deterministic serial ids + clean ledger.
  docker(["rm", "-f", CONTAINER_NAME], { ignoreError: true });
  docker([
    "run", "-d",
    "--name", CONTAINER_NAME,
    "-e", `POSTGRES_USER=${PG_USER}`,
    "-e", `POSTGRES_PASSWORD=${PG_PASSWORD}`,
    "-e", `POSTGRES_DB=${PG_DB}`,
    "-p", `${HOST_PORT}:5432`,
    PG_IMAGE,
    "-c", "fsync=off", "-c", "synchronous_commit=off", // faster, disposable
  ]);

  const teardown = async () => {
    if (process.env.WORKFLOW_KEEP_DB === "1") {
      console.log(
        `\n[workflow-test] WORKFLOW_KEEP_DB=1 — container '${CONTAINER_NAME}' left running at ${TEST_DATABASE_URL}`,
      );
      return;
    }
    docker(["rm", "-f", CONTAINER_NAME], { ignoreError: true });
  };

  try {
    await waitForPostgres();

    // 1. Schema — exactly how the real DB is built (drizzle-kit push from
    //    schema.ts, per the project's db:push convention). dotenv inside
    //    drizzle.config.ts does NOT override our DATABASE_URL env.
    await execFileAsync(
      path.join(DB_PKG_ROOT, "node_modules/.bin/drizzle-kit"),
      ["push:pg"],
      {
        cwd: DB_PKG_ROOT,
        env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
        timeout: 120_000,
      },
    );

    const admin = postgres(TEST_DATABASE_URL, { max: 1 });
    try {
      // 2. Supabase shim (auth.uid(), roles, pgcrypto) — BEFORE triggers.sql.
      await admin.unsafe(
        readFileSync(path.join(HERE, "shim.sql"), "utf-8"),
      );
      // 3. RPCs + triggers + RLS (RLS is inert under the superuser connection).
      await admin.unsafe(
        readFileSync(path.join(DB_PKG_ROOT, "src/triggers.sql"), "utf-8"),
      );
      // 4. Committed reference data.
      await seedReferenceData(admin);
    } finally {
      await admin.end({ timeout: 5 });
    }
  } catch (e) {
    await teardown();
    throw e;
  }

  return teardown;
}

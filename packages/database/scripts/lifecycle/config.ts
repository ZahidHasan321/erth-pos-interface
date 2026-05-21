// Deterministic connection target for the ephemeral workflow-test Postgres.
// The container name + host port are fixed so global-setup (which boots the
// container + applies schema) and the test workers (separate processes) agree
// on the URL without having to pass anything between them.

export const CONTAINER_NAME = "erth-workflow-test-pg";
export const HOST_PORT = 54329;
export const PG_IMAGE = "postgres:16-alpine";
export const PG_USER = "postgres";
export const PG_PASSWORD = "postgres";
export const PG_DB = "postgres";

export const TEST_DATABASE_URL = `postgresql://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${HOST_PORT}/${PG_DB}`;

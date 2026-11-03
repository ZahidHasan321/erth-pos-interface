#!/usr/bin/env bash
# Set login passwords for the service roles created in 00-platform.sql.
# Runs once on an empty data volume (docker-entrypoint-initdb.d).
set -euo pipefail

: "${AUTHENTICATOR_PASSWORD:?AUTHENTICATOR_PASSWORD is required}"
: "${API_SERVER_PASSWORD:?API_SERVER_PASSWORD is required}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v auth_pw="$AUTHENTICATOR_PASSWORD" -v api_pw="$API_SERVER_PASSWORD" <<'SQL'
ALTER ROLE authenticator WITH PASSWORD :'auth_pw';
ALTER ROLE api_server    WITH PASSWORD :'api_pw';
SQL

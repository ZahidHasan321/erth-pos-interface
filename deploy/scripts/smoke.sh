#!/usr/bin/env bash
# End-to-end smoke test of a running stack through Caddy.
#   ./scripts/smoke.sh <username> <pin>
# Uses API_ORIGIN from deploy/.env. Locally (*.localhost) it skips TLS
# verification (Caddy's internal CA) and pins the host to 127.0.0.1.
set -uo pipefail
cd "$(dirname -- "${BASH_SOURCE[0]}")/.."
set -a; . ./.env; set +a

USERNAME="${1:?username}"; PIN="${2:?pin}"
A="$API_ORIGIN"
CURL=(curl -s)
if [[ "$API_DOMAIN" == *.localhost ]]; then
  CURL+=(-k --resolve "${API_DOMAIN}:${HTTPS_PORT}:127.0.0.1")
fi

pass=0; fail=0
check() { # name expected actual
  if [[ "$3" == "$2" ]]; then echo "  ok   $1"; pass=$((pass+1)); else echo "  FAIL $1 (expected $2, got $3)"; fail=$((fail+1)); fi
}
code() { "${CURL[@]}" -o /dev/null -w '%{http_code}' "$@"; }
json() { python3 -c "import sys,json; print(json.load(sys.stdin)$1)"; }

echo "== $A"
check "health" 200 "$(code "$A/health")"
check "bad PIN rejected" 400 "$(code -X POST "$A/auth/v1/login" -H 'content-type: application/json' -d "{\"username\":\"$USERNAME\",\"pin\":\"000000\"}")"

LOGIN=$("${CURL[@]}" -X POST "$A/auth/v1/login" -H 'content-type: application/json' -d "{\"username\":\"$USERNAME\",\"pin\":\"$PIN\"}")
TOK=$(echo "$LOGIN" | json '["access_token"]' 2>/dev/null)
RT=$(echo "$LOGIN" | json '["refresh_token"]' 2>/dev/null)
check "login returns session" yes "$([[ -n "$TOK" && -n "$RT" ]] && echo yes || echo "no: $LOGIN")"
AUTH=(-H "Authorization: Bearer $TOK")

check "REST as user" 200 "$(code "$A/rest/v1/users?select=username&limit=1" "${AUTH[@]}")"
check "REST anon reads no users" no "$("${CURL[@]}" "$A/rest/v1/users?select=username" | grep -q '"username"' && echo yes || echo no)"
check "anon cannot call verify_pin" 401 "$(code -X POST "$A/rest/v1/rpc/verify_pin" -H 'content-type: application/json' -d '{"p_username":"x","p_pin":"1"}')"
check "REST rejects forged JWT" 401 "$(code "$A/rest/v1/users?select=username" -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.x')"

REF=$("${CURL[@]}" -X POST "$A/auth/v1/token" -H 'content-type: application/json' -d "{\"refresh_token\":\"$RT\"}")
RT2=$(echo "$REF" | json '["refresh_token"]' 2>/dev/null)
check "refresh rotates token" yes "$([[ -n "$RT2" && "$RT2" != "$RT" ]] && echo yes || echo "no: $REF")"
check "logout" 204 "$(code -X POST "$A/auth/v1/logout" -H 'content-type: application/json' -d "{\"refresh_token\":\"$RT2\"}")"
check "revoked refresh rejected" 401 "$(code -X POST "$A/auth/v1/token" -H 'content-type: application/json' -d "{\"refresh_token\":\"$RT2\"}")"

OBJ="smoke/smoke-$$.txt"
check "upload needs auth" 401 "$(code -X POST "$A/storage/v1/object/media/$OBJ" --data-binary 'x')"
check "upload" 200 "$(code -X POST "$A/storage/v1/object/media/$OBJ" "${AUTH[@]}" -H 'content-type: text/plain' --data-binary 'hello')"
check "public read" hello "$("${CURL[@]}" "$A/storage/v1/object/public/media/$OBJ")"
check "path traversal blocked" 400 "$(code -X POST "$A/storage/v1/object/media/..%2F..%2Fetc%2Fx" "${AUTH[@]}" --data-binary 'x')"
check "delete" 200 "$(code -X DELETE "$A/storage/v1/object/media" "${AUTH[@]}" -H 'content-type: application/json' -d "{\"prefixes\":[\"$OBJ\"]}")"
check "deleted file gone" 404 "$(code "$A/storage/v1/object/public/media/$OBJ")"

# Realtime: open the stream, touch a watched table, expect a change event.
OUT=$(mktemp)
"${CURL[@]}" -N --max-time 4 "$A/realtime/v1/stream" "${AUTH[@]}" > "$OUT" &
sleep 1.5
docker compose exec -T db psql -U postgres -qc "UPDATE fabrics SET updated_at = updated_at WHERE id = (SELECT min(id) FROM fabrics); INSERT INTO notifications (department, scope, title, type) SELECT 'shop','department','smoke','info' WHERE false;" >/dev/null 2>&1
docker compose exec -T db psql -U postgres -qc "NOTIFY realtime, '{\"table\":\"fabrics\",\"type\":\"UPDATE\",\"new\":{\"id\":0},\"old\":null}'" >/dev/null
wait
check "realtime ready event" yes "$(grep -q '^event: ready' "$OUT" && echo yes || echo no)"
check "realtime change delivered" yes "$(grep -q '"table":"fabrics"' "$OUT" && echo yes || echo no)"
rm -f "$OUT"

echo "== $pass passed, $fail failed"
[[ $fail -eq 0 ]]

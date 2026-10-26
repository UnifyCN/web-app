#!/usr/bin/env bash
# Runs the Companion context probe (#362) against a disposable local Supabase
# stack (Postgres 17, GoTrue, PostgREST, Kong) on ports 59471-59473.
# Usage: run.sh [test files...]   default: context_rls_test.ts
#        PROBE_STOP=1 run.sh      stop the stack afterwards
# Copies the real web migration under test into the probe before starting.
# Refuses to touch anything but 127.0.0.1.
set -euo pipefail
cd "$(dirname "$0")"
cp ../../migrations/20261026120000_messages_companion_context.sql supabase/migrations/
if ! supabase status --workdir . >/dev/null 2>&1; then
  supabase start --workdir . >/dev/null
fi
supabase db reset --workdir . --local >/dev/null 2>&1 || { echo "db reset failed" >&2; exit 2; }
eval "$(supabase status --workdir . -o env 2>/dev/null | sed 's/^/export PROBE_/')"
for _ in $(seq 1 30); do
  docker kill --signal=SIGUSR1 supabase_rest_unify-context-362 >/dev/null 2>&1 || true
  code=$(curl -s -o /dev/null -w '%{http_code}' "$PROBE_API_URL/rest/v1/messages?select=companion_context&limit=1" \
    -H "apikey: $PROBE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $PROBE_SERVICE_ROLE_KEY" || true)
  [ "$code" = "200" ] && break
  sleep 1
done
[ "$code" = "200" ] || { echo "PostgREST never saw the reset schema" >&2; exit 2; }
files=("$@"); [ ${#files[@]} -eq 0 ] && files=(context_rls_test.ts)
status=0
for f in "${files[@]}"; do
  deno test --no-check --node-modules-dir=auto --allow-net --allow-env --allow-read "$f" || status=$?
done
[ "${PROBE_STOP:-0}" = "1" ] && supabase stop --workdir . --no-backup >/dev/null 2>&1
exit $status

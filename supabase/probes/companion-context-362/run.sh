#!/usr/bin/env bash
# Runs the Companion context probe (#362) against a disposable local Supabase
# stack (Postgres 17, GoTrue, PostgREST, Kong).
# Usage: run.sh [test files...]   default: context_rls_test.ts
#        PROBE_STOP=1 run.sh      stop the stack afterwards
#        PROBE_PROJECT_ID=<id> PROBE_PORT_BASE=<n> run.sh
#          run a separate stack (ports n, n+1, n+2) beside another one;
#          defaults: unify-context-362 on 59471-59473
# Copies the real web migration under test into the probe before starting.
# Refuses to touch anything but 127.0.0.1.
set -euo pipefail
cd "$(dirname "$0")"
project="${PROBE_PROJECT_ID:-unify-context-362}"
base="${PROBE_PORT_BASE:-59471}"
[[ "$project" =~ ^[a-z0-9-]{1,40}$ && "$base" =~ ^[0-9]{4,5}$ ]] || { echo "bad PROBE_PROJECT_ID or PROBE_PORT_BASE" >&2; exit 2; }
work=".run/$project"
mkdir -p "$work"
rm -rf "$work/supabase/migrations"
cp -R supabase "$work/"
cp ../../migrations/20261026120000_messages_companion_context.sql "$work/supabase/migrations/"
sed -i.bak \
  -e "s/^project_id = .*/project_id = \"$project\"/" \
  -e "s/^port = 59471$/port = $base/" \
  -e "s/^port = 59472$/port = $((base + 1))/" \
  -e "s/^shadow_port = 59473$/shadow_port = $((base + 2))/" \
  "$work/supabase/config.toml"
rm -f "$work/supabase/config.toml.bak"
if ! supabase status --workdir "$work" >/dev/null 2>&1; then
  supabase start --workdir "$work" >/dev/null
fi
supabase db reset --workdir "$work" --local >/dev/null 2>&1 || { echo "db reset failed" >&2; exit 2; }
eval "$(supabase status --workdir "$work" -o env 2>/dev/null | sed 's/^/export PROBE_/')"
[ "$PROBE_API_URL" = "http://127.0.0.1:$base" ] || { echo "unexpected API URL $PROBE_API_URL" >&2; exit 2; }
for _ in $(seq 1 30); do
  docker kill --signal=SIGUSR1 "supabase_rest_$project" >/dev/null 2>&1 || true
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
[ "${PROBE_STOP:-0}" = "1" ] && supabase stop --workdir "$work" --no-backup >/dev/null 2>&1
exit $status

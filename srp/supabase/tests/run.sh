#!/usr/bin/env bash
# run.sh — build a throwaway database, apply every migration and seed, then
# run both SQL suites. Exits non-zero if any check fails, so CI can gate on it.
#
#   supabase/tests/run.sh                     # spins up a local Postgres
#   DATABASE_URL=postgres://…  supabase/tests/run.sh   # uses an existing one
#
# Against a hosted Supabase project the harness is unnecessary (auth/storage
# and the roles already exist); set SKIP_HARNESS=1 in that case.
set -euo pipefail

cd "$(dirname "$0")/../.."   # -> srp/

PSQL_OPTS=(-v ON_ERROR_STOP=1 -q)
CLEANUP=""

if [[ -z "${DATABASE_URL:-}" ]]; then
  # No database handed to us: start a scratch instance.
  PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
  if [[ ! -x "$PGBIN/initdb" ]]; then
    echo "No DATABASE_URL and no local Postgres at $PGBIN — set one or the other." >&2
    exit 2
  fi
  PGDATA="$(mktemp -d)/pgdata"
  PORT="${PGPORT:-5433}"
  mkdir -p "$PGDATA"
  # initdb refuses to run as root; use the postgres account when we are.
  if [[ "$(id -u)" -eq 0 ]]; then
    chown postgres "$PGDATA" "$(dirname "$PGDATA")"
    RUN=(su postgres -c)
  else
    RUN=(bash -c)
  fi
  "${RUN[@]}" "$PGBIN/initdb -D $PGDATA -A trust -U postgres" >/dev/null
  "${RUN[@]}" "$PGBIN/pg_ctl -D $PGDATA -l $PGDATA/../pg.log -o '-k /tmp -p $PORT -c listen_addresses=' start" >/dev/null
  CLEANUP="$PGDATA"
  trap '[[ -n "$CLEANUP" ]] && "${RUN[@]}" "'"$PGBIN"'/pg_ctl -D '"$PGDATA"' stop -m immediate" >/dev/null 2>&1 || true' EXIT

  psql -h /tmp -p "$PORT" -U postgres -q -c "create database srp;" >/dev/null
  DATABASE_URL="postgres://postgres@/srp?host=/tmp&port=$PORT"
fi

run() { psql "$DATABASE_URL" "${PSQL_OPTS[@]}" -f "$1"; }

if [[ "${SKIP_HARNESS:-0}" != "1" ]]; then
  echo "→ harness"
  run supabase/tests/harness.sql
fi

for migration in supabase/migrations/*.sql; do
  echo "→ $(basename "$migration")"
  run "$migration"
done

echo "→ seed"
run supabase/seed.sql

# Both suites roll back, so order does not matter and neither leaves residue.
echo
echo "══ tenant isolation ══"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/tenant_isolation.sql

echo
echo "══ onboarding ══"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/onboarding.sql

echo
echo "══ role capabilities ══"
# rls_check reports expected-failure cases as NOTICE lines; surface any FAIL.
output=$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_check.sql 2>&1)
echo "$output" | grep -E "\| [tf]$|PASS:|FAIL:" | sed 's/psql:[^ ]*: //; s/NOTICE:  //'

if echo "$output" | grep -qE "\| f$|FAIL:"; then
  echo
  echo "RLS CHECK FAILED" >&2
  exit 1
fi

echo
echo "all checks passed"

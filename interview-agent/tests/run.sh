#!/usr/bin/env bash
# Runs the agent's tests. Integration tests need Postgres: with no
# DATABASE_URL a throwaway instance is started and removed afterwards (the
# same approach as srp/supabase/tests/run.sh).
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -z "${DATABASE_URL:-}" ]]; then
  PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
  if [[ ! -x "$PGBIN/initdb" ]]; then
    echo "No DATABASE_URL and no local Postgres at $PGBIN — set one or the other." >&2
    exit 2
  fi
  WORK="$(mktemp -d)"
  PGDATA="$WORK/pgdata"
  PORT="${PGPORT:-5434}"
  mkdir -p "$PGDATA"
  if [[ "$(id -u)" -eq 0 ]]; then
    chown -R postgres "$WORK"
    RUN=(su postgres -c)
  else
    RUN=(bash -c)
  fi
  "${RUN[@]}" "$PGBIN/initdb -D $PGDATA -A trust -U postgres" >/dev/null
  "${RUN[@]}" "$PGBIN/pg_ctl -D $PGDATA -l $WORK/pg.log -o '-k /tmp -p $PORT -c listen_addresses=localhost' start" >/dev/null
  trap '"${RUN[@]}" "'"$PGBIN"'/pg_ctl -D '"$PGDATA"' stop -m immediate" >/dev/null 2>&1 || true; rm -rf "'"$WORK"'"' EXIT
  psql -h /tmp -p "$PORT" -U postgres -q -c "create database interview_agent_test;" >/dev/null
  export DATABASE_URL="postgres://postgres@localhost:$PORT/interview_agent_test"
fi

# One file at a time: the integration files share the database.
node --test --test-concurrency=1 tests/*.test.ts

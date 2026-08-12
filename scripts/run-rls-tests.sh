#!/usr/bin/env bash
# Run the pgTAP RLS tests in supabase/tests/ against a migrated database.
#
# Usage:
#   RLS_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
#     scripts/run-rls-tests.sh
#
# With the Supabase CLI local stack (`supabase start`), the URL above is the
# default local db. The tests run inside a transaction and roll back, but they
# are still only meant for disposable local/test databases — never production
# (see ENVIRONMENT_RULES.md).

set -euo pipefail

URL="${RLS_TEST_DATABASE_URL:-}"

if [[ -z "$URL" ]]; then
  echo "RLS_TEST_DATABASE_URL is not set." >&2
  echo "Point it at a LOCAL/TEST database with all supabase/migrations applied." >&2
  exit 1
fi

# Guard: refuse anything that doesn't look local unless explicitly overridden.
if [[ "$URL" != *"localhost"* && "$URL" != *"127.0.0.1"* ]] && [[ "${RLS_TEST_ALLOW_REMOTE:-0}" != "1" ]]; then
  echo "Refusing to run against a non-local database ($URL)." >&2
  echo "These tests create and roll back seed rows; run them only against a" >&2
  echo "disposable test database. Set RLS_TEST_ALLOW_REMOTE=1 to override." >&2
  exit 1
fi

TESTS_DIR="$(cd "$(dirname "$0")/.." && pwd)/supabase/tests"

failed=0
for file in "$TESTS_DIR"/*.test.sql; do
  echo "== $file"
  # pgTAP emits TAP: failures are lines starting with "not ok".
  output="$(psql "$URL" -X -v ON_ERROR_STOP=1 -f "$file")"
  echo "$output"
  if grep -q "^not ok" <<<"$output"; then
    failed=1
  fi
done

if [[ "$failed" == "1" ]]; then
  echo "RLS tests FAILED." >&2
  exit 1
fi

echo "RLS tests passed."

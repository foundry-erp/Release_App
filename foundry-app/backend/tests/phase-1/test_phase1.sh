#!/usr/bin/env bash
# test_phase1.sh
# Phase 1 — DB Migration and Key Generation
# Acceptance criteria tests: AC-1.1 through AC-1.7
#
# Usage:
#   From the repository root (foundry-app/):
#     bash backend/tests/phase-1/test_phase1.sh
#
# Prerequisites:
#   - Node.js 20.x LTS on PATH
#   - DATABASE_URL set in environment (for AC-1.5, AC-1.6, AC-1.7)
#   - psql 15.x on PATH (for AC-1.5, AC-1.6, AC-1.7)
#   - git on PATH (for AC-1.4)
#
# Exit code:
#   0  — all blocking tests passed
#   1  — one or more blocking tests failed

set -euo pipefail

PASS=0
FAIL=0
SKIP=0
FAILURES=()

SCRIPTS_DIR="$(cd "$(dirname "$0")/../../scripts" && pwd)"
MIGRATIONS_DIR="$(cd "$(dirname "$0")/../../migrations" && pwd)"

pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); FAILURES+=("$1"); }
skip() { echo "  SKIP: $1 (reason: $2)"; SKIP=$((SKIP + 1)); }

echo ""
echo "=== Phase 1 Acceptance Tests ==="
echo ""

# ---------------------------------------------------------------------------
# AC-1.1: Key generation script runs without error
# ---------------------------------------------------------------------------
echo "AC-1.1: Key generation script exits 0 and produces both .pem files"
(
  cd "$SCRIPTS_DIR"
  node generate_signing_key.js 2>/tmp/phase1_stderr_ac11
)
AC11_EXIT=$?
if [ "$AC11_EXIT" -ne 0 ]; then
  fail "AC-1.1: node generate_signing_key.js exited $AC11_EXIT"
elif [ ! -f "$SCRIPTS_DIR/private_key.pem" ]; then
  fail "AC-1.1: private_key.pem not created"
elif [ ! -f "$SCRIPTS_DIR/public_key.pem" ]; then
  fail "AC-1.1: public_key.pem not created"
elif [ -s /tmp/phase1_stderr_ac11 ]; then
  fail "AC-1.1: unexpected output on stderr: $(cat /tmp/phase1_stderr_ac11)"
else
  pass "AC-1.1: script exited 0; both pem files present; no stderr"
fi

# ---------------------------------------------------------------------------
# AC-1.2: public_key.pem has SPKI PEM header
# ---------------------------------------------------------------------------
echo "AC-1.2: public_key.pem begins with -----BEGIN PUBLIC KEY-----"
AC12_RESULT=$(node -e "const fs=require('fs'); const k=fs.readFileSync('$SCRIPTS_DIR/public_key.pem','utf8'); process.stdout.write(k.startsWith('-----BEGIN PUBLIC KEY-----') ? 'PASS' : 'FAIL');")
if [ "$AC12_RESULT" = "PASS" ]; then
  pass "AC-1.2: public_key.pem is SPKI format"
else
  fail "AC-1.2: public_key.pem does not begin with -----BEGIN PUBLIC KEY----- (got: $AC12_RESULT)"
fi

# ---------------------------------------------------------------------------
# AC-1.3: private_key.pem has PKCS8 PEM header
# ---------------------------------------------------------------------------
echo "AC-1.3: private_key.pem begins with -----BEGIN PRIVATE KEY----- (PKCS8, not SEC1)"
AC13_RESULT=$(node -e "const fs=require('fs'); const k=fs.readFileSync('$SCRIPTS_DIR/private_key.pem','utf8'); process.stdout.write(k.startsWith('-----BEGIN PRIVATE KEY-----') ? 'PASS' : 'FAIL');")
if [ "$AC13_RESULT" = "PASS" ]; then
  pass "AC-1.3: private_key.pem is PKCS8 format"
else
  fail "AC-1.3: private_key.pem does not begin with -----BEGIN PRIVATE KEY----- (got: $AC13_RESULT)"
fi

# ---------------------------------------------------------------------------
# AC-1.4: private_key.pem is excluded from git tracking
# ---------------------------------------------------------------------------
echo "AC-1.4: git check-ignore confirms private_key.pem is ignored"
if ! command -v git &>/dev/null; then
  skip "AC-1.4" "git not found on PATH"
else
  AC14_OUTPUT=$(cd "$SCRIPTS_DIR" && git check-ignore -v private_key.pem 2>&1)
  AC14_EXIT=$?
  if [ "$AC14_EXIT" -eq 0 ] && echo "$AC14_OUTPUT" | grep -q ".gitignore" && echo "$AC14_OUTPUT" | grep -q "private_key.pem"; then
    pass "AC-1.4: private_key.pem correctly ignored by backend/scripts/.gitignore"
  else
    fail "AC-1.4: git check-ignore exit=$AC14_EXIT output='$AC14_OUTPUT'"
  fi
fi

# ---------------------------------------------------------------------------
# AC-1.5: SQL migration runs without error and adds the signature column
# ---------------------------------------------------------------------------
echo "AC-1.5: SQL migration exits 0 and signature column appears in module_versions"
if [ -z "${DATABASE_URL:-}" ]; then
  skip "AC-1.5" "DATABASE_URL not set"
elif ! command -v psql &>/dev/null; then
  skip "AC-1.5" "psql not found on PATH"
else
  psql "$DATABASE_URL" -f "$MIGRATIONS_DIR/add_signature_to_module_versions.sql"
  AC15_COL=$(psql "$DATABASE_URL" -c "\d module_versions" 2>&1 | grep -E "^\s*signature\s*\|\s*text" || true)
  if [ -n "$AC15_COL" ]; then
    pass "AC-1.5: signature column (type text) confirmed in module_versions"
  else
    fail "AC-1.5: signature TEXT column not found in \d module_versions output"
  fi
fi

# ---------------------------------------------------------------------------
# AC-1.6: SQL migration is idempotent — second run exits 0
# ---------------------------------------------------------------------------
echo "AC-1.6: Running migration a second time exits 0 (idempotency)"
if [ -z "${DATABASE_URL:-}" ]; then
  skip "AC-1.6" "DATABASE_URL not set"
elif ! command -v psql &>/dev/null; then
  skip "AC-1.6" "psql not found on PATH"
else
  AC16_OUTPUT=$(psql "$DATABASE_URL" -f "$MIGRATIONS_DIR/add_signature_to_module_versions.sql" 2>&1)
  AC16_EXIT=$?
  if [ "$AC16_EXIT" -eq 0 ] && ! echo "$AC16_OUTPUT" | grep -qi "ERROR"; then
    pass "AC-1.6: second migration run exited 0 with no ERROR"
  else
    fail "AC-1.6: second migration run exit=$AC16_EXIT output='$AC16_OUTPUT'"
  fi
fi

# ---------------------------------------------------------------------------
# AC-1.7: No existing row has a non-NULL signature after migration
# ---------------------------------------------------------------------------
echo "AC-1.7: SELECT COUNT(*) WHERE signature IS NOT NULL equals 0 (no data mutation)"
if [ -z "${DATABASE_URL:-}" ]; then
  skip "AC-1.7" "DATABASE_URL not set"
elif ! command -v psql &>/dev/null; then
  skip "AC-1.7" "psql not found on PATH"
else
  AC17_OUTPUT=$(psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM module_versions WHERE signature IS NOT NULL;" 2>&1)
  if echo "$AC17_OUTPUT" | grep -E "^\s*0\s*$" &>/dev/null; then
    pass "AC-1.7: zero rows have non-NULL signature (migration did not mutate data)"
  else
    fail "AC-1.7: expected count=0 for non-NULL signature rows, got: $AC17_OUTPUT"
  fi
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "=== Results ==="
echo "  PASS: $PASS"
echo "  FAIL: $FAIL"
echo "  SKIP: $SKIP"
echo ""

if [ "${#FAILURES[@]}" -gt 0 ]; then
  echo "Failed tests:"
  for f in "${FAILURES[@]}"; do
    echo "  - $f"
  done
  echo ""
  exit 1
fi

echo "All blocking tests passed."
exit 0

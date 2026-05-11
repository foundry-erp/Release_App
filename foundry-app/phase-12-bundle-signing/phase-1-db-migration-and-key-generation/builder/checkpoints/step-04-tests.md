# Checkpoint — Test Files
COMPLETED: 2026-04-15T00:00:00Z
STATUS: COMPLETE

## Created
- backend/tests/phase-1/test_phase1.sh

## Coverage
| AC | Description | Covered By |
|----|-------------|------------|
| AC-1.1 | Key generation script exits 0 and creates both pem files | test_phase1.sh — AC-1.1 block |
| AC-1.2 | public_key.pem begins with -----BEGIN PUBLIC KEY----- | test_phase1.sh — AC-1.2 block |
| AC-1.3 | private_key.pem begins with -----BEGIN PRIVATE KEY----- (PKCS8) | test_phase1.sh — AC-1.3 block |
| AC-1.4 | git check-ignore confirms private_key.pem is ignored | test_phase1.sh — AC-1.4 block |
| AC-1.5 | SQL migration exits 0 and signature column appears | test_phase1.sh — AC-1.5 block (skipped if DATABASE_URL unset) |
| AC-1.6 | Second migration run exits 0 (idempotency) | test_phase1.sh — AC-1.6 block (skipped if DATABASE_URL unset) |
| AC-1.7 | COUNT(*) WHERE signature IS NOT NULL = 0 | test_phase1.sh — AC-1.7 block (skipped if DATABASE_URL unset) |

## Notes
- AC-1.5, AC-1.6, AC-1.7 require DATABASE_URL env var and psql 15.x on PATH; they skip gracefully when absent.
- AC-1.4 requires git on PATH; skips gracefully when absent.
- Test script uses absolute paths derived at runtime from script location — safe to run from any cwd.

TESTS_READY: true

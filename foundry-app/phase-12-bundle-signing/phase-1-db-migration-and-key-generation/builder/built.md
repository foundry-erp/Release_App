# Built — Phase 1: DB Migration and Key Generation
PHASE_ID: phase-1-db-migration-and-key-generation
BUILD_COMPLETED: 2026-04-15T00:00:00Z
BUILDER_CYCLE: 1
BUILDER_DOC_VERSION: 1.0
BUILD_SCOPE: full_build

## Summary
Phase 1 establishes the cryptographic foundation for all subsequent signing phases. A one-time offline P-256 ECDSA key pair generation script was produced using only Node.js built-in modules, an idempotent SQL migration was written that adds a nullable `signature TEXT` column to `module_versions`, and a scoped `.gitignore` was created in `backend/scripts/` to prevent `private_key.pem` from ever being committed. The database is now ready to store ECDSA signatures and the operator can generate the required key pair at any time.

## Files Created
| filepath | type | purpose |
|----------|------|---------|
| backend/scripts/generate_signing_key.js | service | P-256 ECDSA key pair generation using Node.js built-in crypto; outputs private_key.pem (PKCS8) and public_key.pem (SPKI) to cwd |
| backend/migrations/add_signature_to_module_versions.sql | config | Idempotent DDL migration: ALTER TABLE module_versions ADD COLUMN IF NOT EXISTS signature TEXT |
| backend/scripts/.gitignore | config | Scoped gitignore preventing private_key.pem from being staged or committed |
| backend/tests/phase-1/test_phase1.sh | test | Shell test script covering AC-1.1 through AC-1.7 |

## How To Reach Each Deliverable

### generate_signing_key.js
- run: `cd backend/scripts && node generate_signing_key.js`
- inputs: none (no CLI args, no env vars)
- outputs:
  - `private_key.pem` written to `process.cwd()` — begins with `-----BEGIN PRIVATE KEY-----` (PKCS8)
  - `public_key.pem` written to `process.cwd()` — begins with `-----BEGIN PUBLIC KEY-----` (SPKI)
- exit_code: 0 on success; non-zero (uncaught exception) on file system error

### add_signature_to_module_versions.sql
- run: `psql "$DATABASE_URL" -f backend/migrations/add_signature_to_module_versions.sql`
- inputs: DATABASE_URL environment variable pointing to Supabase PostgreSQL instance
- outputs: no rows returned; exit code 0 on success (including when column already exists)
- idempotent: safe to run multiple times

### backend/scripts/.gitignore
- verified by: `cd backend/scripts && git check-ignore -v private_key.pem`
- expected output: exit code 0; output contains `.gitignore` and `private_key.pem`

### test_phase1.sh
- run: `bash backend/tests/phase-1/test_phase1.sh` (from foundry-app/ root)
- requires: Node.js 20.x; git; DATABASE_URL + psql for AC-1.5/1.6/1.7
- exit_code: 0 if all blocking tests pass; 1 if any blocking test fails

## Dependencies Installed
| package | version | reason |
|---------|---------|--------|
| Node.js built-in crypto | Node.js 20.x LTS stdlib | P-256 ECDSA key pair generation — no npm install required |
| Node.js built-in fs | Node.js 20.x LTS stdlib | Writing .pem files to disk — no npm install required |
| psql (PostgreSQL client) | 15.x | Operator tool for running SQL migration; not installed by Builder |

## Deviations From Spec
| spec_said | built | reason | risk |
|-----------|-------|--------|------|
| (no deviations) | | | |

## What Next Phase Can Use
- public_key_pem: string — PEM-encoded P-256 public key produced by generate_signing_key.js; format: SPKI PEM beginning with `-----BEGIN PUBLIC KEY-----`; file at `backend/scripts/public_key.pem` after operator runs the script
- private_key_pem: string — PEM-encoded P-256 private key produced by generate_signing_key.js; format: PKCS8 PEM beginning with `-----BEGIN PRIVATE KEY-----`; lives on operator workstation only; accessed by phase 2 sign_bundle.js via `--key-path <absolute-path>` CLI flag at runtime; never stored in env vars or secrets manager
- db_signature_column: { table: "module_versions", column: "signature", type: "TEXT", nullable: true } — confirmed database column that phase 2 will write to via upload_module.js

## Known Limitations
- sign_bundle.js: intentionally out of scope this phase (deferred to phase-2-backend-signing-scripts)
- upload_module.js: intentionally out of scope this phase (deferred to phase-2-backend-signing-scripts)
- API endpoint changes: intentionally out of scope this phase (deferred to phase-3-api-signature-field)
- Flutter verification code: intentionally out of scope this phase (deferred to phases 4 and 5)
- public_key.pem embedding into Flutter source: intentionally out of scope this phase (deferred to phase-4-flutter-model-and-verifier)
- Infisical/secrets manager integration: out of scope per Q1 answer A — private key stays on operator workstation only
- Key rotation: out of scope for entire phase-12 track unless explicitly scoped in a future phase

## Builder Confidence Report
| deliverable | confidence | notes |
|-------------|------------|-------|
| generate_signing_key.js | HIGH | Spec was complete and unambiguous. Exact crypto.generateKeyPairSync API call, curve, encodings, output filenames, and edge cases all specified. Built exactly as specified. |
| add_signature_to_module_versions.sql | HIGH | Single statement specified verbatim in validated.md. No assumptions required. IF NOT EXISTS, NULL default, no transaction wrapper — all explicitly specified. |
| backend/scripts/.gitignore | HIGH | Spec defined exact content (private_key.pem), location (backend/scripts/), and edge case handling (create if absent). File was absent; created fresh with single required entry. |
| test_phase1.sh | HIGH | All 7 acceptance criteria have exact test_commands and pass_conditions in validated.md. Test script implements each AC verbatim. Database-dependent tests skip gracefully when DATABASE_URL unset. |

# Phase 1 — DB Migration and Key Generation
PHASE_ID: phase-1-db-migration-and-key-generation
PLANNER_DOC_VERSION: 1.0
DEPENDS_ON: [none]
PROVIDES_TO: [phase-2-backend-signing-scripts]

## What This Phase Builds
This phase adds the `signature` column to the `module_versions` database table and creates the one-time key generation script that produces the P-256 ECDSA key pair. After this phase, the database schema supports signatures and the operator has a private key (offline) and a public key (ready to embed in Flutter). No application code is wired up yet — this phase solely establishes the cryptographic foundation and the storage contract.

## Requirements Covered
- REQ-DB: ALTER TABLE module_versions ADD COLUMN signature TEXT — existing rows get signature = NULL, new uploads require signature
- REQ-KEYGEN: backend/scripts/generate_signing_key.js — one-time offline script; uses Node.js built-in crypto (generateKeyPairSync, 'ec', namedCurve: 'P-256'); outputs private_key.pem (never committed) and public_key.pem (copied to Flutter source at build time)

## Deliverables
- [ ] backend/scripts/generate_signing_key.js: One-time offline P-256 key pair generation script; outputs private_key.pem and public_key.pem to current working directory
- [ ] backend/migrations/add_signature_to_module_versions.sql: SQL migration file containing the ALTER TABLE statement; safe to run on a live database (NULL default, no data loss)
- [ ] backend/scripts/.gitignore: Ignores private_key.pem so it is never accidentally committed

## Inputs From Previous Phase
none

## Outputs To Next Phase
- public_key_pem: string — PEM-encoded P-256 public key produced by generate_signing_key.js (-----BEGIN PUBLIC KEY----- block)
- private_key_pem: string — PEM-encoded P-256 private key produced by generate_signing_key.js (-----BEGIN EC PRIVATE KEY----- block); lives offline only; passed to phase 2 signing script by file path at runtime
- db_signature_column: { table: "module_versions", column: "signature", type: "TEXT", nullable: true } — confirmed database column that phase 2 will write to via upload_module.js

## Acceptance Criteria
- [ ] AC-1.1
      criterion: generate_signing_key.js runs without error and produces both key files in the working directory
      test_command: node backend/scripts/generate_signing_key.js && ls private_key.pem public_key.pem
      pass_condition: exit code 0; both files present; no error output
      blocking: true

- [ ] AC-1.2
      criterion: public_key.pem contains a valid PEM header for a P-256 public key
      test_command: node -e "const fs=require('fs'); const k=fs.readFileSync('public_key.pem','utf8'); console.log(k.includes('BEGIN PUBLIC KEY') ? 'PASS' : 'FAIL')"
      pass_condition: stdout is exactly "PASS"
      blocking: true

- [ ] AC-1.3
      criterion: private_key.pem is listed in .gitignore so git will not stage it
      test_command: cd backend/scripts && git check-ignore -v private_key.pem
      pass_condition: exit code 0 (git confirms the file is ignored)
      blocking: true

- [ ] AC-1.4
      criterion: SQL migration runs against the Supabase database without error and adds the signature column
      test_command: psql "$DATABASE_URL" -f backend/migrations/add_signature_to_module_versions.sql && psql "$DATABASE_URL" -c "\d module_versions" | grep signature
      pass_condition: exit code 0; output contains "signature" and "text"
      blocking: true

- [ ] AC-1.5
      criterion: Existing module_versions rows still have signature = NULL after migration (no data loss)
      test_command: psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM module_versions WHERE signature IS NULL;"
      pass_condition: exit code 0; returned count equals the pre-migration row count
      blocking: false

## Manual Test Steps
1. Run `node backend/scripts/generate_signing_key.js` from the backend/scripts directory → Expected: two files appear: private_key.pem and public_key.pem, each containing PEM-encoded content
2. Open public_key.pem in a text editor → Expected: begins with `-----BEGIN PUBLIC KEY-----` and ends with `-----END PUBLIC KEY-----`
3. Run `git status` inside backend/scripts → Expected: private_key.pem does NOT appear as a tracked or untracked file; it is suppressed by .gitignore
4. Run the SQL migration against the dev database → Expected: command completes with no error; `\d module_versions` shows a new `signature text` column
5. Query `SELECT id, signature FROM module_versions LIMIT 5;` → Expected: all rows show NULL for signature

## Phase Achievement
The operator can generate a P-256 key pair and the database is ready to store ECDSA signatures — the cryptographic foundation for all subsequent signing phases is in place.

## Planner Notes
⚠ UNCLEAR: "Private key → lives on Aikyat's backend server (never leaves)" — the doc says "never transmitted" and "keep offline / never commit", but does not specify whether private_key.pem should live in a secrets manager (e.g., Infisical) or literally on the signing operator's workstation. Validator must confirm the key storage location before Builder wires up the upload script in phase 2.

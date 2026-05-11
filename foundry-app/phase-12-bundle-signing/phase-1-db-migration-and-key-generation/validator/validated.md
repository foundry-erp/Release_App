# Validated Spec — Phase 1: DB Migration and Key Generation
PHASE_ID: phase-1-db-migration-and-key-generation
VALIDATED: 2026-04-15T00:00:00Z
VALIDATOR_CYCLE: 1
VALIDATOR_DOC_VERSION: 1.0
DRIFT_CHECK_STATUS: NOT_APPLICABLE
# NOT_APPLICABLE: cycle 1 — no baseline exists yet

---

## What To Build

This phase establishes the cryptographic foundation for all subsequent signing phases. Builder must produce three artifacts:

1. **generate_signing_key.js** — a one-time offline Node.js script that uses `crypto.generateKeyPairSync` with the `'ec'` algorithm and `namedCurve: 'P-256'` to produce a PKCS8 PEM-encoded private key file (`private_key.pem`) and a SubjectPublicKeyInfo (SPKI) PEM-encoded public key file (`public_key.pem`), both written to the directory from which the script is invoked. The script uses only Node.js built-in modules — no third-party dependencies. If either output file already exists in the target directory, the script overwrites it without error.

2. **add_signature_to_module_versions.sql** — a SQL migration that executes `ALTER TABLE module_versions ADD COLUMN IF NOT EXISTS signature TEXT;` against the live Supabase PostgreSQL 15+ database. The `IF NOT EXISTS` clause makes the migration idempotent: running it a second time produces no error and no change. The column default is NULL (no explicit DEFAULT clause required). No UPDATE, DELETE, or data-altering statement is included. No existing row data is modified.

3. **backend/scripts/.gitignore** — a gitignore file scoped to the `backend/scripts/` directory that lists `private_key.pem` so the private key file is never staged or committed. The file must work with `git check-ignore` from within the `backend/scripts/` directory.

No application code is wired in this phase. No API endpoints, no Flutter code, no Supabase Storage operations.

---

## Deliverables

### generate_signing_key.js
- type: file
- path: backend/scripts/generate_signing_key.js
- purpose: One-time offline P-256 ECDSA key pair generation script; outputs private_key.pem and public_key.pem to the current working directory.
- interface:
  - Inputs: none (no CLI arguments, no environment variables)
  - Outputs:
    - `private_key.pem` written to `process.cwd()` — PKCS8 PEM format, begins with `-----BEGIN PRIVATE KEY-----`
    - `public_key.pem` written to `process.cwd()` — SPKI PEM format, begins with `-----BEGIN PUBLIC KEY-----`
  - Exit code: 0 on success; non-zero (uncaught exception) on file system error
  - Node.js API used: `crypto.generateKeyPairSync('ec', { namedCurve: 'P-256', publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } })`
  - Dependencies: Node.js built-in `crypto` and `fs` only — no npm packages
- constraints:
  - Must run under Node.js 20.x LTS with no `npm install` step
  - Curve must be exactly P-256 (secp256r1, prime256v1) — no other curve accepted
  - Private key encoding: PKCS8 (`type: 'pkcs8'`) — not SEC1 (`type: 'sec1'`)
  - Public key encoding: SPKI (`type: 'spki'`) — this is the format Flutter's `pointycastle` and Dart's `cryptography` packages can import
  - Output file names are exactly `private_key.pem` and `public_key.pem` — no variation
  - Script must be runnable as `node generate_signing_key.js` from the `backend/scripts/` directory
- edge_cases:
  - **Output files already exist**: Script overwrites them without prompting. Node.js `fs.writeFileSync` default behavior — no `wx` flag.
  - **File system permission denied**: `fs.writeFileSync` throws; script exits non-zero with the Node.js exception message on stderr. Builder does not catch this — let it propagate.
  - **Node.js version < 20**: `crypto.generateKeyPairSync` with P-256 is supported from Node.js 10+; no version guard required, but the runtime constraint is Node.js 20.x LTS per the stack.
  - **Script run from a read-only directory**: Same as permission denied — uncaught exception, non-zero exit.
  - **Concurrent execution**: Not a concern — one-time offline script. No lock required.

---

### add_signature_to_module_versions.sql
- type: file
- path: backend/migrations/add_signature_to_module_versions.sql
- purpose: Idempotent SQL migration that adds a nullable TEXT column `signature` to the `module_versions` table.
- interface:
  - Inputs: run via `psql "$DATABASE_URL" -f backend/migrations/add_signature_to_module_versions.sql`
  - SQL content (exact statement — Builder must use this verbatim):
    ```sql
    ALTER TABLE module_versions ADD COLUMN IF NOT EXISTS signature TEXT;
    ```
  - Outputs: no rows returned; exit code 0 on success (including when column already exists)
- constraints:
  - Single statement only — no BEGIN/COMMIT, no transaction wrapper needed (Supabase auto-commits DDL)
  - No DEFAULT value clause — column defaults to NULL for all existing and future rows until populated by the upload script
  - No NOT NULL constraint — column must be nullable (phase 2 writes signatures; phase 1 does not)
  - No UPDATE or INSERT statements — migration is read-safe
  - Must be PostgreSQL 9.6+ compatible; Supabase runs PostgreSQL 15 — `ADD COLUMN IF NOT EXISTS` is supported
  - File encoding: UTF-8, Unix line endings
- edge_cases:
  - **Column already exists (re-run)**: `IF NOT EXISTS` makes statement a no-op; psql exits 0. No error.
  - **Table `module_versions` does not exist**: psql returns `ERROR: relation "module_versions" does not exist`; exits non-zero. Builder does not guard against this — it is a pre-condition violation, not a migration bug.
  - **DATABASE_URL not set**: psql exits non-zero with a connection error. Not the migration's responsibility to validate.
  - **Insufficient database permissions**: psql exits non-zero with `ERROR: must be owner of table module_versions` or similar. Operator must have DDL permissions.
  - **Concurrent migration run**: PostgreSQL DDL locks the table briefly; `IF NOT EXISTS` still resolves correctly. Safe for concurrent runs.

---

### backend/scripts/.gitignore
- type: file
- path: backend/scripts/.gitignore
- purpose: Prevents private_key.pem from being accidentally staged or committed to git.
- interface:
  - File content: one line — `private_key.pem`
  - Verified by: `git check-ignore -v private_key.pem` run from within `backend/scripts/`
- constraints:
  - Must be a `.gitignore` file in `backend/scripts/` — not the root `.gitignore`
  - Must contain exactly `private_key.pem` as an entry (may contain additional entries such as `public_key.pem` if desired, but `private_key.pem` is the required entry)
  - File must work with git's standard ignore resolution — no `.gitconfig` tricks
- edge_cases:
  - **File already exists at backend/scripts/.gitignore**: Builder appends `private_key.pem` to the existing file if not already present, or creates it if absent.
  - **private_key.pem already tracked by git**: The `.gitignore` will not remove it from tracking. This is a pre-condition violation — if the file was previously committed, `git rm --cached private_key.pem` is an operator responsibility, not part of this phase.
  - **public_key.pem**: This file IS committed (it is copied into Flutter source). It must NOT be in `.gitignore`.

---

## File Manifest

| filepath | action | description |
|----------|--------|-------------|
| backend/scripts/generate_signing_key.js | CREATE | P-256 key pair generation script using Node.js built-in crypto |
| backend/migrations/add_signature_to_module_versions.sql | CREATE | Idempotent DDL migration adding nullable TEXT signature column |
| backend/scripts/.gitignore | CREATE | Gitignore scoped to backend/scripts/ that excludes private_key.pem |

---

## Acceptance Criteria

- [ ] AC-1.1: Key generation script runs without error
      criterion: Running `node generate_signing_key.js` from `backend/scripts/` exits with code 0 and produces both `private_key.pem` and `public_key.pem` in that directory, with no output on stderr.
      test_command: cd backend/scripts && node generate_signing_key.js && ls private_key.pem public_key.pem
      pass_condition: exit code 0; both files listed by ls; no text on stderr
      blocking: true

- [ ] AC-1.2: public_key.pem contains valid SPKI PEM header for a P-256 public key
      criterion: The file `public_key.pem` begins with the exact string `-----BEGIN PUBLIC KEY-----` (SPKI format, not SEC1).
      test_command: node -e "const fs=require('fs'); const k=fs.readFileSync('backend/scripts/public_key.pem','utf8'); process.stdout.write(k.startsWith('-----BEGIN PUBLIC KEY-----') ? 'PASS' : 'FAIL');"
      pass_condition: stdout is exactly the string PASS (no trailing newline required)
      blocking: true

- [ ] AC-1.3: private_key.pem contains valid PKCS8 PEM header for a P-256 private key
      criterion: The file `private_key.pem` begins with the exact string `-----BEGIN PRIVATE KEY-----` (PKCS8 format, not SEC1 `-----BEGIN EC PRIVATE KEY-----`).
      test_command: node -e "const fs=require('fs'); const k=fs.readFileSync('backend/scripts/private_key.pem','utf8'); process.stdout.write(k.startsWith('-----BEGIN PRIVATE KEY-----') ? 'PASS' : 'FAIL');"
      pass_condition: stdout is exactly the string PASS
      blocking: true

- [ ] AC-1.4: private_key.pem is excluded from git tracking
      criterion: Running `git check-ignore -v private_key.pem` from within `backend/scripts/` exits with code 0, confirming the file is ignored by the `.gitignore` in that directory.
      test_command: cd backend/scripts && git check-ignore -v private_key.pem
      pass_condition: exit code 0; output contains ".gitignore" and "private_key.pem"
      blocking: true

- [ ] AC-1.5: SQL migration runs against the database without error and adds the signature column
      criterion: Executing the migration file against the Supabase database exits with code 0, and `\d module_versions` shows a column named `signature` of type `text`.
      test_command: psql "$DATABASE_URL" -f backend/migrations/add_signature_to_module_versions.sql && psql "$DATABASE_URL" -c "\d module_versions" | grep -E "^\s*signature\s*\|\s*text"
      pass_condition: exit code 0; grep matches at least one line containing "signature" and "text"
      blocking: true

- [ ] AC-1.6: SQL migration is idempotent — safe to run a second time
      criterion: Running the migration SQL file twice in sequence against the database produces exit code 0 on the second run (no "column already exists" error).
      test_command: psql "$DATABASE_URL" -f backend/migrations/add_signature_to_module_versions.sql && psql "$DATABASE_URL" -f backend/migrations/add_signature_to_module_versions.sql
      pass_condition: both invocations exit with code 0; no ERROR text in output
      blocking: true

- [ ] AC-1.7: No existing row has a non-NULL signature after migration (no data mutation)
      criterion: Immediately after the migration, zero rows in `module_versions` have a non-NULL value in the `signature` column — confirming that the migration did not write any data.
      test_command: psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM module_versions WHERE signature IS NOT NULL;" | grep -E "^\s*0\s*$"
      pass_condition: exit code 0; grep matches a line containing only "0" (the count is zero)
      blocking: false

---

## Dependencies

- name: Node.js built-in crypto
  version: available in Node.js 20.x LTS (no separate package)
  install_command: none — stdlib

- name: Node.js built-in fs
  version: available in Node.js 20.x LTS (no separate package)
  install_command: none — stdlib

- name: psql (PostgreSQL client)
  version: 15.x (must match or be compatible with Supabase PostgreSQL 15)
  install_command: brew install postgresql@15  # macOS; or apt-get install postgresql-client-15

---

## Out Of Scope

What Builder must NOT build in this phase:

- **sign_bundle.js**: deferred to phase-2-backend-signing-scripts. Phase 1 does not wire the private key into any signing operation.
- **upload_module.js**: deferred to phase-2-backend-signing-scripts.
- **API endpoint changes**: deferred to phase-3-api-signature-field. No Vercel function is modified.
- **Flutter verification code**: deferred to phase-4-flutter-model-and-verifier and phase-5-flutter-verification-integration.
- **Infisical / secrets manager integration for private key**: User answered Q1 as option A. The private key lives on the operator workstation only. No secrets manager is used in any phase for this key.
- **Key rotation procedure**: out of scope for the entire phase-12 track unless explicitly scoped in a future phase.
- **public_key.pem embedding into Flutter source**: deferred to phase-4-flutter-model-and-verifier. Phase 1 produces the file; phase 4 copies it.
- **CI/CD pipeline signing step**: not part of any phase — signing is always an operator-initiated workstation command.
- **Database migration tooling (Knex, Flyway, etc.)**: plain SQL file executed directly via psql. No migration framework is introduced.
- **module_versions table creation**: pre-existing; Builder must NOT drop or recreate the table.

---

## Phase Boundaries

### Receives From Previous Phase
- none (this is phase 1; no prior phase exists)

### Provides To Next Phase
- public_key_pem: string — PEM-encoded P-256 public key produced by generate_signing_key.js; format: SPKI PEM beginning with `-----BEGIN PUBLIC KEY-----`
- private_key_pem: string — PEM-encoded P-256 private key produced by generate_signing_key.js; format: PKCS8 PEM beginning with `-----BEGIN PRIVATE KEY-----`; lives on operator workstation only; accessed by phase 2 sign_bundle.js via `--key-path <absolute-path>` CLI flag at runtime; never stored in env vars or secrets manager
- db_signature_column: { table: "module_versions", column: "signature", type: "TEXT", nullable: true } — confirmed database column that phase 2 will write to via upload_module.js

---

## Environment Requirements

- Node.js: 20.x LTS (key generation script runtime)
- psql: PostgreSQL client 15.x (migration execution)
- Git: any version supporting `.gitignore` and `git check-ignore` (standard)
- OS: operator workstation (macOS or Linux); Windows support not required for signing workflow
- DATABASE_URL: environment variable pointing to the live Supabase PostgreSQL instance; must be set before running AC-1.5, AC-1.6, AC-1.7

---

## Manual Test Steps

1. From `backend/scripts/`, run `node generate_signing_key.js` → Expected: exits silently with code 0; two files appear — `private_key.pem` and `public_key.pem`.
2. Open `public_key.pem` → Expected: begins with `-----BEGIN PUBLIC KEY-----` and ends with `-----END PUBLIC KEY-----`.
3. Open `private_key.pem` → Expected: begins with `-----BEGIN PRIVATE KEY-----` (PKCS8) — NOT `-----BEGIN EC PRIVATE KEY-----` (SEC1).
4. From `backend/scripts/`, run `git check-ignore -v private_key.pem` → Expected: exit code 0; output references `.gitignore` and `private_key.pem`.
5. Run `git status` inside `backend/scripts/` → Expected: `private_key.pem` does not appear in untracked or modified files.
6. Set `DATABASE_URL` to the dev Supabase connection string and run `psql "$DATABASE_URL" -f backend/migrations/add_signature_to_module_versions.sql` → Expected: exits with code 0, no ERROR in output.
7. Run `psql "$DATABASE_URL" -c "\d module_versions"` → Expected: output lists a row with column name `signature` and type `text`.
8. Run the migration a second time: `psql "$DATABASE_URL" -f backend/migrations/add_signature_to_module_versions.sql` → Expected: exits with code 0; no "already exists" error.
9. Run `psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM module_versions WHERE signature IS NOT NULL;"` → Expected: output shows `0`.

---

## Phase Achievement

The operator can generate a P-256 PKCS8/SPKI key pair and the database is ready to store ECDSA signatures — the cryptographic foundation for all subsequent signing phases is in place.

---

## Validation Notes

### Ambiguities Resolved

- **"safe to run on a live database"** resolved to: single `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` with NULL default; no UPDATE, DELETE, or INSERT; no transaction wrapper needed; safe for live Supabase PostgreSQL 15.

- **"no data loss"** (AC-1.5 in plan.md) resolved via Q2 answer B: replaced the untestable pre-migration count comparison with a self-contained structural assertion — `SELECT COUNT(*) FROM module_versions WHERE signature IS NOT NULL` must equal 0 immediately after migration. This is equivalent and does not require a pre-migration baseline capture.

- **"never committed"** resolved to: enforced by `backend/scripts/.gitignore` containing `private_key.pem`; verified by `git check-ignore -v`.

- **"outputs ... to current working directory"** resolved to: `process.cwd()` at script invocation time; script must be run from `backend/scripts/` for the output files to land in the correct location for phase 2 to find them.

- **Private key PEM format** resolved to: PKCS8 (`-----BEGIN PRIVATE KEY-----`), not SEC1 (`-----BEGIN EC PRIVATE KEY-----`). Node.js `crypto.generateKeyPairSync` with `privateKeyEncoding: { type: 'pkcs8', format: 'pem' }` produces PKCS8. This is the format phase 2's `sign_bundle.js` must expect. Added AC-1.3 to verify this.

- **Public key PEM format** resolved to: SPKI (`-----BEGIN PUBLIC KEY-----`), not a raw EC point. Required by Flutter's cryptography libraries (phase 4/5).

### Assumptions Made

- **Node.js stdlib only**: plan.md states `crypto.generateKeyPairSync` and "Node.js built-in crypto" — no third-party npm packages are needed or permitted in this phase.
- **No transaction wrapper**: Supabase PostgreSQL auto-commits DDL statements. A BEGIN/COMMIT wrapper is not needed and would not change behavior.
- **File overwrite behavior**: plan.md does not specify what happens if key files already exist. Standard `fs.writeFileSync` semantics (overwrite) assumed — no `O_EXCL` protection.
- **git check-ignore scope**: `.gitignore` placed in `backend/scripts/` applies to all files in that directory including generated `private_key.pem`. This is standard git ignore scope.

### Q&A References

- **Q1 answered — private key storage**: User chose option A — file on operator workstation, passed to sign_bundle.js via `--key-path` CLI flag at runtime. Never stored in Infisical, env vars, or any secrets manager. This decision is documented in "Provides To Next Phase" and "Out Of Scope." Phase 2 Builder must wire sign_bundle.js to accept `--key-path <path>` (not a hardcoded relative path, not SIGNING_KEY_PATH env var).

- **Q2 answered — AC-1.5 testability**: User chose option B — replace the untestable count comparison with a self-contained structural assertion. Plan.md's AC-1.5 replaced by validated.md's AC-1.7: `SELECT COUNT(*) FROM module_versions WHERE signature IS NOT NULL` must equal 0. The original AC-1.5 test_command was a no-op (no baseline to compare against); this resolves that.

- **Q3 answered — SQL migration idempotency**: User chose option A — use `ALTER TABLE module_versions ADD COLUMN IF NOT EXISTS signature TEXT;`. Added AC-1.6 to explicitly test the idempotency property. Standard production practice.

### Additional ACs Added (vs. plan.md)

- **AC-1.3** (new): Verifies private_key.pem is PKCS8 format (`-----BEGIN PRIVATE KEY-----`), not SEC1. This is a cross-phase contract: phase 2 must use `createSign` with PKCS8 key.
- **AC-1.6** (new): Verifies migration idempotency (second run exits 0). Direct result of Q3 answer A.
- **AC-1.7** (new): Replaces plan.md AC-1.5 with the Q2-answer-B structural assertion. Plan.md's original AC-1.5 was untestable as written.

### Drift Corrections
Not applicable — cycle 1, no baseline.

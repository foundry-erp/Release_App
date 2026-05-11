# Validator Questions — Phase 1: DB Migration and Key Generation
PHASE_ID: phase-1-db-migration-and-key-generation
VALIDATOR_CYCLE: 1
GENERATED: 2026-04-15T00:00:00Z
STATUS: WAITING_FOR_ANSWERS

---

## Question 1
SCOPE: [cross-phase]
CONTEXT: plan.md says private_key.pem "lives offline only" and "never committed", but also
         says it is "passed to phase 2 signing script by file path at runtime." The Planner
         note explicitly flags this as unresolved: "Validator must confirm the key storage
         location before Builder wires up the upload script in phase 2." This decision affects
         phase 2 (how upload_module.js receives the private key), phase 3 (whether any
         server-side signing involves a secrets manager pull), and any CI/CD pipeline that
         runs the signing step. Two mutually incompatible architectures exist.
QUESTION: Where does private_key.pem live after it is generated, and how does the phase 2
          signing script access it at runtime?
OPTIONS:
  A) Operator workstation — file path argument
     The private key lives exclusively on the signing operator's local machine. It is never
     uploaded anywhere. The phase 2 signing script (upload_module.js) accepts a
     --key-path <path> CLI flag pointing to the local file. Signing is always an operator-
     initiated, offline-first step run from the workstation.
     Impact: Simple. No secrets-manager dependency in phase 2. Operator must have the key
     file present every time they upload a module. Key is protected by workstation OS
     permissions only. If the machine is lost, the key is gone unless separately backed up.

  B) Infisical secrets manager — pulled at runtime by signing script
     The private key PEM is stored as a secret in Infisical (the platform's existing secrets
     manager). The phase 2 signing script fetches it via the Infisical API using a narrow
     service token before signing. The key never touches disk on any server.
     Impact: Requires Infisical service token wired into phase 2. Adds a network dependency
     to the signing step. Key survives workstation loss. Consistent with existing Aikyat
     platform secrets posture (Infisical is already in use per platform context).

  C) Environment variable — injected at signing time
     The PEM content is stored in an environment variable (e.g., SIGNING_PRIVATE_KEY).
     The signing script reads process.env.SIGNING_PRIVATE_KEY. The operator sets this
     variable in their shell session or a local .env file (never committed) before running
     the script.
     Impact: No file on disk during signing (beyond the operator's shell history/env).
     Simpler than Infisical. Key rotation requires updating the env var. Works in both
     local and CI contexts. .gitignore rule in phase 1 still needed for the generated PEM
     but the script itself would not read from a file path.

DEFAULT_IF_NOT_ANSWERED: A (operator workstation, --key-path CLI flag — matches plan.md
  wording "passed to phase 2 signing script by file path at runtime" most literally)

---

## Question 2
SCOPE: [phase-local]
CONTEXT: AC-1.5 requires verifying that existing module_versions rows still have
         signature = NULL after the migration (no data loss). The test_command is:
           psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM module_versions WHERE signature IS NULL;"
         The pass_condition is: "returned count equals the pre-migration row count."
         However, the test_command does not capture the pre-migration row count anywhere —
         the Tester has no baseline to compare against. This AC is untestable as written
         unless a specific comparison mechanism is defined.
QUESTION: How should AC-1.5 verify the pre-migration row count for the no-data-loss check?
OPTIONS:
  A) Two-step test with captured baseline
     Before running the migration, Tester runs:
       psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM module_versions;" > /tmp/pre_count.txt
     Then after migration runs AC-1.5 as:
       psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM module_versions WHERE signature IS NULL;" > /tmp/post_count.txt && diff /tmp/pre_count.txt /tmp/post_count.txt
     pass_condition: diff exits 0 (counts match).
     Impact: Requires the Tester to run a pre-step before the migration. Adds one manual
     step to the test sequence.

  B) Replace AC-1.5 with a structural assertion (no baseline needed)
     Drop the count comparison. Instead verify that ALL rows have signature IS NULL
     immediately after migration (which is guaranteed by ALTER TABLE ... DEFAULT NULL):
       psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM module_versions WHERE signature IS NOT NULL;"
     pass_condition: returned count is exactly 0.
     Impact: Self-contained, no pre-migration step needed. Slightly different assertion
     (proves no row has a non-NULL signature, which is equivalent for a fresh migration).

  C) Mark AC-1.5 as non-blocking manual-only and remove automated test_command
     The no-data-loss property is guaranteed by the SQL itself (NULL default, no UPDATE
     statement). Accept it as a design-time assertion, not a runtime test. Remove the
     automated test_command and note it as manual verification only.
     Impact: Reduces automated coverage. AC-1.5 is already marked blocking: false, so
     this is low risk. Cleaner test suite.

DEFAULT_IF_NOT_ANSWERED: B (structural assertion — "zero rows have non-NULL signature"
  immediately after migration — self-contained and equivalent)

---

## Question 3
SCOPE: [phase-local]
CONTEXT: The SQL migration deliverable is described as "safe to run on a live database
         (NULL default, no data loss)." The plan does not specify whether the migration
         should be idempotent — i.e., safe to run a second time if the column already
         exists. On Supabase/PostgreSQL, ALTER TABLE ADD COLUMN fails with an error if the
         column already exists, which would break re-runs and CI pipelines that apply
         migrations from scratch.
QUESTION: Should the SQL migration be idempotent (safe to run multiple times)?
OPTIONS:
  A) Yes — use ALTER TABLE ... ADD COLUMN IF NOT EXISTS
     The migration uses:
       ALTER TABLE module_versions ADD COLUMN IF NOT EXISTS signature TEXT;
     If the column already exists, the statement is a no-op. Exit code 0.
     Impact: Standard practice for production migrations. Safe for CI and re-runs.
     Supported by PostgreSQL 9.6+ (Supabase runs PostgreSQL 15+).

  B) No — plain ALTER TABLE ADD COLUMN (fail if re-run)
     The migration uses:
       ALTER TABLE module_versions ADD COLUMN signature TEXT;
     If run twice, psql returns an error and exits non-zero. The operator must ensure it
     runs exactly once.
     Impact: Simpler SQL. Operator must track migration state manually or via a migration
     tool. Error on re-run could cause confusion.

DEFAULT_IF_NOT_ANSWERED: A (IF NOT EXISTS — standard production practice, no downside)

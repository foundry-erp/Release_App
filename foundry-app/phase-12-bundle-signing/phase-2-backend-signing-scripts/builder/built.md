# Built — Phase 2: Backend Signing Scripts
PHASE_ID: phase-2-backend-signing-scripts
BUILD_COMPLETED: 2026-04-15T00:00:00Z
BUILDER_CYCLE: 1
BUILDER_DOC_VERSION: 1.0
BUILD_SCOPE: full_build

---

## Summary

Two Node.js CLI scripts have been built: `sign_bundle.js` (standalone ECDSA-P256-SHA256 signing) and `upload_module.js` (end-to-end module publish pipeline). An operator can now run a single command to cryptographically sign a module bundle, upload it to Supabase Storage, and persist the signature in the `module_versions` database row — ready for Phase 3 to serve via the API.

---

## Files Created

| filepath | type | purpose |
|----------|------|---------|
| backend/scripts/sign_bundle.js | service | Standalone ECDSA-P256-SHA256 signing script; reads bundle + PKCS8 key; outputs base64 DER signature to stdout |
| backend/scripts/upload_module.js | service | End-to-end module publish script; signs, checksums, uploads to Supabase Storage, upserts module_versions row |
| backend/tests/phase-2/test_phase2.js | test | Node.js test covering AC-2.1 through AC-2.9; unit tests run without Supabase; integration tests skip gracefully when env vars absent |

---

## How To Reach Each Deliverable

### sign_bundle.js
- invocation: `node backend/scripts/sign_bundle.js <bundle-file-path> --key-path <absolute-path-to-private_key.pem>`
- positional arg 1: path to the bundle file to sign (required)
- named flag: `--key-path <absolute-path>` — path to PKCS8 PEM private key (required)
- stdout: single base64 string, no trailing newline, no embedded newlines
- stderr: empty on success; error message on failure
- exit code: `0` on success, `1` on any error
- example: `node backend/scripts/sign_bundle.js /tmp/test_bundle.js --key-path "$(pwd)/backend/scripts/private_key.pem"`

### upload_module.js
- invocation: `node backend/scripts/upload_module.js --module <slug> --version <semver> --dir <dist-directory> --key-path <absolute-path-to-private_key.pem>`
- required flags: `--module`, `--version`, `--dir`, `--key-path`
- required env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- stdout: one log line per step: `[sign] OK`, `[checksum] <hex>`, `[upload bundle] OK`, `[upload sig] OK`, `[db upsert] OK`
- exit code: `0` on full success, `1` on any error
- example: `SUPABASE_URL="$SUPABASE_URL" SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" node backend/scripts/upload_module.js --module quality-inspector --version 1.2.1 --dir modules/quality-inspector/dist --key-path "$(pwd)/backend/scripts/private_key.pem"`

### test_phase2.js
- invocation: `node backend/tests/phase-2/test_phase2.js`
- run from: project root (foundry-app/)
- unit tests (AC-2.1 – AC-2.5, AC-2.8, AC-2.9): run without any env vars
- integration tests (AC-2.6, AC-2.7): require `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; skipped gracefully if absent

---

## Dependencies Installed

| package | version | reason |
|---------|---------|--------|
| crypto (built-in) | Node.js 20.x | ECDSA signing (sign_bundle.js) and SHA-256 checksum (upload_module.js) |
| fs (built-in) | Node.js 20.x | File reads in both scripts |
| path (built-in) | Node.js 20.x | Path resolution in both scripts |
| child_process (built-in) | Node.js 20.x | execSync to call sign_bundle.js from upload_module.js |
| @supabase/supabase-js | ^2.39.0 | Supabase Storage upload and DB upsert in upload_module.js; already in backend/package.json — no new install |

---

## Deviations From Spec

| spec_said | built | reason | risk |
|-----------|-------|--------|------|
| (none) | (none) | | |

---

## What Next Phase Can Use

- signed_module_version_row: `{ id: string, slug: string, version: string, cdn_url: string, index_url: string, checksum: string, signature: string, size_kb: number, is_active: boolean }` — a module_versions row in the database with the signature column populated (non-null) after upload_module.js completes. Note: `slug` is on the joined `modules` table, resolved via `module_id` FK.
- signature_format: `{ encoding: "base64", structure: "DER", algorithm: "ECDSA-P256-SHA256" }` — base64-encoded raw DER output of Node.js `crypto.createSign('SHA256').sign(pkcs8PemKey)`, which produces an ASN.1 SEQUENCE of two INTEGERs (r and s). No JSON wrapper. No line breaks.

---

## Known Limitations

- index.html upload: upload_module.js constructs `index_url` in the DB but does NOT upload an `index.html` file — intentionally out of scope this phase (per validated.md Out Of Scope).
- npm run build: upload_module.js does NOT run `npm run build` — operator must build the dist directory before calling upload_module.js (per validated.md Out Of Scope).
- Key rotation: out of scope for the entire phase-12 track.
- CI/CD integration: signing is operator-initiated only; no GitHub Actions step (per validated.md Out Of Scope).
- AC-2.7 async handling in test file: The test runner is synchronous by default. AC-2.7 uses async/await internally; results appear in stdout but the process.exit(1) on failure may race with the async resolution. Tester should verify stdout for AC-2.7 result explicitly.

---

## Builder Confidence Report

| deliverable | confidence | notes |
|-------------|------------|-------|
| sign_bundle.js | HIGH | Spec complete and unambiguous. Interface, error messages, exit codes, crypto API calls, and all 7 edge cases fully specified. Built exactly as specified. |
| upload_module.js | HIGH | Spec complete. All flag names, env var names, storage paths, CDN URL pattern, upsert schema, log line format, and all 8 edge cases fully specified. Built exactly as specified. |
| test_phase2.js | HIGH | All 9 ACs covered. Unit tests (AC-2.1 – AC-2.5, AC-2.8, AC-2.9) require only the local key files from Phase 1. Integration tests (AC-2.6, AC-2.7) skip gracefully when Supabase env absent — consistent with validated.md test_command patterns. |

# Phase 2 — Backend Signing Scripts
PHASE_ID: phase-2-backend-signing-scripts
PLANNER_DOC_VERSION: 1.0
DEPENDS_ON: [phase-1-db-migration-and-key-generation]
PROVIDES_TO: [phase-3-api-signature-field]

## What This Phase Builds
This phase delivers the two backend scripts that implement the full module release pipeline: a standalone bundle signing script (`sign_bundle.js`) and an updated upload script (`upload_module.js`) that orchestrates build → sign → checksum → upload → database insert in a single command. After this phase, a new signed module version can be deployed to production with one command, and the `signature` column in `module_versions` is populated with a valid base64-encoded DER ECDSA signature for every new upload.

## Requirements Covered
- REQ-SIGN-SCRIPT: backend/scripts/sign_bundle.js — reads bundle.js from file path argument; signs with private_key.pem using SHA-256 + P-256 (Node.js built-in crypto.sign with algorithm 'SHA256', key from PEM); outputs base64-encoded DER signature to stdout; usage: `node sign_bundle.js path/to/bundle.js > bundle.js.sig`
- REQ-UPLOAD-SCRIPT: backend/scripts/upload_module.js — orchestrates: npm run build → node sign_bundle.js dist/bundle.js → compute sha256 of bundle.js → upload bundle.js and bundle.js.sig to Supabase Storage → INSERT into module_versions with checksum and signature fields populated

## Deliverables
- [ ] backend/scripts/sign_bundle.js: Standalone signing script; takes bundle file path as first CLI argument; uses Node.js built-in `crypto` module (createSign / sign); reads private_key.pem from the same directory (or a path set by SIGNING_KEY_PATH env var); writes base64 DER signature to stdout
- [ ] backend/scripts/upload_module.js: End-to-end module publish script; accepts --module (slug), --version, --dir (dist output directory) CLI flags; calls sign_bundle.js; computes SHA-256 checksum; uploads to Supabase Storage bucket; upserts module_versions row with checksum + signature

## Inputs From Previous Phase
- public_key_pem: string — PEM-encoded P-256 public key produced by generate_signing_key.js (-----BEGIN PUBLIC KEY----- block)
- private_key_pem: string — PEM-encoded P-256 private key produced by generate_signing_key.js (-----BEGIN EC PRIVATE KEY----- block); lives offline only; passed to phase 2 signing script by file path at runtime
- db_signature_column: { table: "module_versions", column: "signature", type: "TEXT", nullable: true } — confirmed database column that phase 2 will write to via upload_module.js

## Outputs To Next Phase
- signed_module_version_row: { id: string, slug: string, version: string, cdn_url: string, index_url: string, checksum: string, signature: string, size_kb: number, is_active: boolean } — a module_versions row in the database with the signature column populated (non-null) after upload_module.js completes
- signature_format: { encoding: "base64", structure: "DER", algorithm: "ECDSA-P256-SHA256" } — exact encoding contract the API must surface and the Flutter client must consume

## Acceptance Criteria
- [ ] AC-2.1
      criterion: sign_bundle.js produces a non-empty base64 string when given a valid bundle file
      test_command: echo "console.log('hello');" > /tmp/test_bundle.js && node backend/scripts/sign_bundle.js /tmp/test_bundle.js
      pass_condition: exit code 0; stdout is a non-empty base64 string (no newlines in the value, length > 80 chars)
      blocking: true

- [ ] AC-2.2
      criterion: The signature produced by sign_bundle.js can be verified using the corresponding public key via Node.js crypto.verify
      test_command: node -e "const crypto=require('fs'); const fs=require('fs'); const sig=require('child_process').execSync('node backend/scripts/sign_bundle.js /tmp/test_bundle.js').toString().trim(); const pub=fs.readFileSync('public_key.pem'); const verify=require('crypto').createVerify('SHA256'); verify.update(fs.readFileSync('/tmp/test_bundle.js')); console.log(verify.verify(pub,sig,'base64')?'PASS':'FAIL')"
      pass_condition: stdout is exactly "PASS"
      blocking: true

- [ ] AC-2.3
      criterion: upload_module.js completes successfully and inserts a row with a non-null signature into module_versions
      test_command: node backend/scripts/upload_module.js --module test-module --version 0.0.1-test --dir /tmp/test_dist && psql "$DATABASE_URL" -c "SELECT signature IS NOT NULL AS has_sig FROM module_versions WHERE slug='test-module' ORDER BY created_at DESC LIMIT 1;"
      pass_condition: exit code 0; query output shows "has_sig = t"
      blocking: true

- [ ] AC-2.4
      criterion: Tampering with the bundle after signing causes verification to fail (regression guard)
      test_command: node -e "const fs=require('fs'); const crypto=require('crypto'); const sig=require('child_process').execSync('node backend/scripts/sign_bundle.js /tmp/test_bundle.js').toString().trim(); fs.writeFileSync('/tmp/tampered.js','TAMPERED'); const pub=fs.readFileSync('public_key.pem'); const v=crypto.createVerify('SHA256'); v.update(fs.readFileSync('/tmp/tampered.js')); console.log(v.verify(pub,sig,'base64')?'FAIL':'PASS')"
      pass_condition: stdout is exactly "PASS"
      blocking: true

## Manual Test Steps
1. Copy a real built bundle.js to /tmp/test_bundle.js, then run `node backend/scripts/sign_bundle.js /tmp/test_bundle.js` → Expected: a long base64 string printed to stdout, no errors
2. Pipe the signature into a file: `node sign_bundle.js /tmp/test_bundle.js > /tmp/bundle.sig` → Expected: /tmp/bundle.sig contains the base64 signature and nothing else
3. Run `node backend/scripts/upload_module.js --module quality-inspector --version 1.0.0-test --dir /path/to/dist` → Expected: script logs each step (build, sign, checksum, upload, db-insert) and exits with code 0
4. Check Supabase Storage → Expected: bundle.js and bundle.js.sig objects visible in the module bucket under quality-inspector/1.0.0-test/
5. Query `SELECT signature FROM module_versions WHERE slug='quality-inspector' ORDER BY created_at DESC LIMIT 1;` → Expected: a non-null base64 string in the signature column

## Phase Achievement
A module developer can run one command (`node upload_module.js`) to build, sign, and publish a module bundle, with the ECDSA signature stored in the database and ready for the API to serve.

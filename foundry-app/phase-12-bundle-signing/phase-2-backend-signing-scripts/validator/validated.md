# Validated Spec — Phase 2: Backend Signing Scripts
PHASE_ID: phase-2-backend-signing-scripts
VALIDATED: 2026-04-15T00:00:00Z
VALIDATOR_CYCLE: 1
VALIDATOR_DOC_VERSION: 1.0
DRIFT_CHECK_STATUS: NOT_APPLICABLE
# NOT_APPLICABLE: cycle 1 — no baseline exists yet

---

## What To Build

This phase delivers two Node.js scripts that together form the complete module release pipeline for the Foundry platform.

**sign_bundle.js** is a standalone, operator-run signing script. It reads a bundle file from a path given as the first positional CLI argument, reads the PKCS8 PEM private key from the path given by the required `--key-path <absolute-path>` CLI flag, signs the bundle bytes using Node.js built-in `crypto.createSign('SHA256')` with the P-256 ECDSA key, and writes a single base64-encoded DER signature string to stdout with no trailing newline. The script uses only Node.js 20.x built-in modules (`crypto`, `fs`, `path`). Exit code 0 on success; non-zero on any error (missing argument, file not found, wrong key format, signing failure).

**upload_module.js** is an end-to-end module publish script that orchestrates: (1) call `node sign_bundle.js <bundle-path> --key-path <key-path>` as a child process to produce a base64 signature, (2) compute a SHA-256 hex checksum of the bundle bytes using built-in `crypto`, (3) upload `bundle.js` to Supabase Storage bucket `module-bundles` under the path `<slug>/<version>/bundle.js`, (4) upload the raw base64 signature string as `<slug>/<version>/bundle.js.sig`, (5) resolve the module UUID from the `modules` table via `@supabase/supabase-js`, (6) upsert a row into `module_versions` with `module_id`, `version`, `cdn_url`, `index_url`, `checksum`, `signature`, and `size_kb` populated. It accepts `--module <slug>`, `--version <semver>`, `--dir <dist-directory>`, and `--key-path <absolute-path>` CLI flags. It reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from environment variables.

---

## Deliverables

### sign_bundle.js
- type: file
- path: backend/scripts/sign_bundle.js
- purpose: Standalone ECDSA signing script; reads a bundle file and a PKCS8 private key; outputs base64-encoded DER ECDSA-P256-SHA256 signature to stdout.
- interface:
  - Invocation: `node backend/scripts/sign_bundle.js <bundle-file-path> --key-path <absolute-path-to-private_key.pem>`
  - Positional argument 1 (`process.argv[2]`): absolute or relative path to the bundle file to sign (e.g., `/tmp/test_bundle.js`). Required. Error if absent.
  - Named flag `--key-path` (`process.argv[3]` or later): absolute path to the PKCS8 PEM private key file. Required. Error if absent. Corresponds to the `private_key.pem` produced by Phase 1 `generate_signing_key.js`. Format: `-----BEGIN PRIVATE KEY-----` (PKCS8, NOT SEC1 `-----BEGIN EC PRIVATE KEY-----`).
  - Stdout: single base64 string, no trailing newline, no line breaks within the value. Length is at least 88 characters for a P-256 DER signature (typical range 88–96 base64 chars).
  - Stderr: empty on success; error message on failure.
  - Exit code: 0 on success; 1 on any error (argument missing, file not found, key format error, signing error).
  - Node.js crypto API used:
    ```
    const sign = crypto.createSign('SHA256');
    sign.update(bundleBytes);
    const derBuffer = sign.sign(privateKeyPem);  // Buffer containing raw DER bytes
    const base64sig = derBuffer.toString('base64');
    process.stdout.write(base64sig);
    ```
  - Dependencies: Node.js 20.x built-in `crypto`, `fs`, `path` only. No npm packages.
- constraints:
  - Must accept `--key-path` as a named CLI flag, not a positional argument, not an env var. This is locked from Phase 1 Q1 answer.
  - Private key PEM format: PKCS8 only (`-----BEGIN PRIVATE KEY-----`). The script must pass the PEM string directly to `crypto.createSign` / `sign.sign()` — Node.js 20.x accepts PEM directly.
  - Output must be pure base64 with no newlines, no `\n`, no `=` padding unless standard base64 requires it (Node.js Buffer.toString('base64') produces standard base64 with `=` padding — this is correct).
  - Script must be runnable from any directory (uses absolute paths from flags, not process.cwd()).
  - No interaction with Supabase — this script is offline only.
  - Must not hardcode any key path or bundle path.
- edge_cases:
  - **`<bundle-file-path>` argument missing**: Script prints `Error: bundle file path argument required` to stderr and exits with code 1. No output to stdout.
  - **`--key-path` flag missing**: Script prints `Error: --key-path <path> flag is required` to stderr and exits with code 1. No output to stdout.
  - **Bundle file does not exist**: `fs.readFileSync` throws `ENOENT`; script catches and prints `Error: bundle file not found: <path>` to stderr, exits with code 1.
  - **Key file does not exist**: `fs.readFileSync` throws `ENOENT`; script catches and prints `Error: key file not found: <path>` to stderr, exits with code 1.
  - **Key file is SEC1 format (`-----BEGIN EC PRIVATE KEY-----`)**: `crypto.createSign` accepts SEC1 in some Node.js versions, but Phase 1 guarantees PKCS8. No special guard required — if it fails, it exits non-zero.
  - **Bundle file is empty (0 bytes)**: Valid input. `crypto.createSign` will sign an empty buffer — produces a valid signature of an empty message. Exit code 0; signature written to stdout.
  - **Bundle file is very large (>100 MB)**: `fs.readFileSync` loads entire file into memory — acceptable for operator workstation use. No streaming required.
  - **stdout piped to a file**: `process.stdout.write` works correctly with pipe redirection (`> bundle.js.sig`).

---

### upload_module.js
- type: file
- path: backend/scripts/upload_module.js
- purpose: End-to-end module publish script; orchestrates signing, checksum, Supabase Storage upload, and module_versions database upsert in one command.
- interface:
  - Invocation: `node backend/scripts/upload_module.js --module <slug> --version <semver> --dir <dist-directory> --key-path <absolute-path-to-private_key.pem>`
  - Required flags:
    - `--module <slug>`: module slug string matching an existing row in `modules.slug` (e.g., `quality-inspector`)
    - `--version <semver>`: version string (e.g., `1.2.1`); stored as-is in `module_versions.version`
    - `--dir <path>`: path to the dist output directory containing `bundle.js` (e.g., `modules/quality-inspector/dist`)
    - `--key-path <path>`: absolute path to the PKCS8 PEM private key file
  - Required environment variables:
    - `SUPABASE_URL`: Supabase project URL (e.g., `https://gbjmxskxkqyfvqifvelg.supabase.co`)
    - `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role JWT; used for Storage upload and DB write (bypasses RLS)
  - Bundle input file: `<--dir>/bundle.js` — must exist. Script errors if absent.
  - Supabase Storage bucket: `module-bundles` (pre-existing; script does NOT create it)
  - Storage upload paths:
    - Bundle: `<slug>/<version>/bundle.js`
    - Signature: `<slug>/<version>/bundle.js.sig`
  - Public CDN URLs constructed as: `${SUPABASE_URL}/storage/v1/object/public/module-bundles/<slug>/<version>/bundle.js`
  - Index URL constructed as: `${SUPABASE_URL}/storage/v1/object/public/module-bundles/<slug>/<version>/index.html`
  - Database operation: upsert into `module_versions` using `@supabase/supabase-js`:
    ```js
    supabase.from('module_versions').upsert({
      module_id: <uuid from modules table>,
      version: <version>,
      cdn_url: <cdn_url>,
      index_url: <index_url>,
      checksum: <sha256_hex>,
      signature: <base64_sig>,
      size_kb: Math.round(bundleBytes.length / 1024),
      is_active: true
    }, { onConflict: 'module_id,version' })
    ```
  - Module UUID resolution: `SELECT id FROM modules WHERE slug = <slug>` via supabase client. Error if not found.
  - stdout: one log line per step (e.g., `[sign] OK`, `[checksum] <hex>`, `[upload bundle] OK`, `[upload sig] OK`, `[db upsert] OK`).
  - Exit code: 0 on full success; 1 on any error (missing flag, file not found, sign failure, upload failure, db error).
  - Supabase client initialisation: `createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)`
  - @supabase/supabase-js version: 2.39.0 (exact — matches backend/package.json)
  - sign_bundle.js invocation: uses Node.js built-in `child_process.execSync`:
    ```js
    const sig = execSync(
      `node ${path.join(__dirname, 'sign_bundle.js')} ${bundlePath} --key-path ${keyPath}`
    ).toString().trim();
    ```
- constraints:
  - Must not hardcode the Supabase URL, bucket name, or key path.
  - Bucket name `module-bundles` is hardcoded as a constant in the script (not configurable via CLI flag — it is a project-level constant).
  - No `npm run build` step is performed inside upload_module.js. The `--dir` flag points to an already-built dist directory. The operator is responsible for running `npm run build` before calling upload_module.js.
  - Must use `@supabase/supabase-js` (already in `backend/package.json`) — no new npm dependencies added.
  - File must be runnable from the project root: `node backend/scripts/upload_module.js ...`
  - Storage upload content type for `bundle.js`: `application/javascript`
  - Storage upload content type for `bundle.js.sig`: `text/plain`
- edge_cases:
  - **`--module`, `--version`, `--dir`, or `--key-path` flag missing**: Script prints `Error: missing required flag: --<flagname>` to stderr and exits with code 1 before any I/O.
  - **`SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` not set**: Script prints `Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required` to stderr and exits with code 1 before any I/O.
  - **`<--dir>/bundle.js` does not exist**: Script prints `Error: bundle file not found: <path>` to stderr and exits with code 1.
  - **module slug not found in `modules` table**: Script prints `Error: module '<slug>' not found in database` to stderr and exits with code 1 after the DB lookup step.
  - **sign_bundle.js exits non-zero**: `execSync` throws; script catches, prints `Error: signing failed: <sign_bundle stderr>` to stderr, exits with code 1.
  - **Supabase Storage upload fails (network error or 4xx/5xx)**: Supabase JS client returns `{ error: {...} }`. Script checks for error, prints `Error: storage upload failed: <error.message>` to stderr, exits with code 1.
  - **module_versions upsert fails**: Script checks `error` from supabase response, prints `Error: database upsert failed: <error.message>` to stderr, exits with code 1.
  - **Same version uploaded twice**: `onConflict: 'module_id,version'` triggers an UPDATE of all columns (checksum, signature, size_kb, is_active) — this is intentional re-sign behaviour. Exit code 0.
  - **`module-bundles` bucket does not exist**: Storage upload returns an error; caught and reported as above. Bucket creation is out of scope — it is a pre-existing infrastructure resource from Phase 5.

---

## File Manifest

| filepath | action | description |
|----------|--------|-------------|
| backend/scripts/sign_bundle.js | CREATE | Standalone ECDSA-P256-SHA256 signing script; reads bundle + PKCS8 key; outputs base64 DER signature to stdout |
| backend/scripts/upload_module.js | CREATE | End-to-end module publish script; signs, checksums, uploads to Supabase Storage, upserts module_versions row |

---

## Acceptance Criteria

- [ ] AC-2.1: sign_bundle.js produces a non-empty base64 signature from a valid bundle and key
      criterion: Given a valid bundle file and the PKCS8 private key produced by generate_signing_key.js, sign_bundle.js exits 0 and writes a base64 string of at least 88 characters to stdout with no trailing newline and no embedded newlines.
      test_command: echo "console.log('hello');" > /tmp/test_bundle.js && node backend/scripts/sign_bundle.js /tmp/test_bundle.js --key-path "$(pwd)/backend/scripts/private_key.pem" | tee /tmp/bundle.sig && test $(wc -c < /tmp/bundle.sig) -ge 88
      pass_condition: exit code 0; /tmp/bundle.sig contains a base64 string of length >= 88 with no newlines; `wc -c` check exits 0
      blocking: true

- [ ] AC-2.2: Signature produced by sign_bundle.js verifies against the corresponding SPKI public key
      criterion: The base64 DER signature output by sign_bundle.js for a given bundle is cryptographically valid when verified with the corresponding SPKI public key using Node.js `crypto.createVerify('SHA256')`.
      test_command: node -e "const fs=require('fs'); const crypto=require('crypto'); const sig=require('child_process').execSync('node backend/scripts/sign_bundle.js /tmp/test_bundle.js --key-path ' + process.cwd() + '/backend/scripts/private_key.pem').toString().trim(); const pub=fs.readFileSync(process.cwd()+'/backend/scripts/public_key.pem','utf8'); const v=crypto.createVerify('SHA256'); v.update(fs.readFileSync('/tmp/test_bundle.js')); process.stdout.write(v.verify(pub,sig,'base64')?'PASS':'FAIL');"
      pass_condition: stdout is exactly the string PASS (no trailing newline required)
      blocking: true

- [ ] AC-2.3: Tampering with the bundle after signing causes verification to return false (regression guard)
      criterion: A signature produced for bundle A does NOT verify against a different bundle B — confirming that the signing is over the bundle content, not a fixed value.
      test_command: node -e "const fs=require('fs'); const crypto=require('crypto'); const sig=require('child_process').execSync('node backend/scripts/sign_bundle.js /tmp/test_bundle.js --key-path ' + process.cwd() + '/backend/scripts/private_key.pem').toString().trim(); fs.writeFileSync('/tmp/tampered.js','TAMPERED CONTENT'); const pub=fs.readFileSync(process.cwd()+'/backend/scripts/public_key.pem','utf8'); const v=crypto.createVerify('SHA256'); v.update(fs.readFileSync('/tmp/tampered.js')); process.stdout.write(v.verify(pub,sig,'base64')?'FAIL':'PASS');"
      pass_condition: stdout is exactly the string PASS
      blocking: true

- [ ] AC-2.4: sign_bundle.js exits non-zero and prints to stderr when --key-path flag is missing
      criterion: Invoking sign_bundle.js without the --key-path flag produces exit code 1 and a non-empty error message on stderr; stdout is empty.
      test_command: node backend/scripts/sign_bundle.js /tmp/test_bundle.js 2>/tmp/sign_err.txt; echo "exit:$?"; cat /tmp/sign_err.txt
      pass_condition: exit code line shows `exit:1`; /tmp/sign_err.txt contains non-empty text including the word "key-path"
      blocking: true

- [ ] AC-2.5: sign_bundle.js exits non-zero and prints to stderr when bundle file does not exist
      criterion: Invoking sign_bundle.js with a path to a non-existent bundle file exits with code 1 and prints an error message to stderr.
      test_command: node backend/scripts/sign_bundle.js /tmp/nonexistent_bundle_99.js --key-path "$(pwd)/backend/scripts/private_key.pem" 2>/tmp/sign_notfound.txt; echo "exit:$?"; cat /tmp/sign_notfound.txt
      pass_condition: exit code line shows `exit:1`; /tmp/sign_notfound.txt contains non-empty text
      blocking: true

- [ ] AC-2.6: upload_module.js completes full pipeline and inserts a row with a non-null signature into module_versions
      criterion: Running upload_module.js with valid flags and environment variables exits 0, logs each step to stdout, and the resulting row in module_versions has a non-null, non-empty signature value.
      test_command: mkdir -p /tmp/test_dist && echo "console.log('test module');" > /tmp/test_dist/bundle.js && SUPABASE_URL="$SUPABASE_URL" SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" node backend/scripts/upload_module.js --module quality-inspector --version 0.0.1-sigtest --dir /tmp/test_dist --key-path "$(pwd)/backend/scripts/private_key.pem"
      pass_condition: exit code 0; stdout contains each of the strings "[sign]", "[checksum]", "[upload bundle]", "[upload sig]", "[db upsert]"; all lines show "OK"
      blocking: true

- [ ] AC-2.7: module_versions row written by upload_module.js has a non-null, valid base64 signature
      criterion: After AC-2.6 completes, the module_versions row for quality-inspector version 0.0.1-sigtest has a non-null signature column value that is a base64 string of at least 88 characters.
      test_command: node -e "const {createClient}=require('@supabase/supabase-js'); const s=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY); s.from('module_versions').select('signature,modules!inner(slug)').eq('modules.slug','quality-inspector').eq('version','0.0.1-sigtest').single().then(({data,error})=>{if(error||!data){process.stdout.write('FAIL: '+JSON.stringify(error));process.exit(1);}const sig=data.signature;process.stdout.write(sig&&sig.length>=88?'PASS':'FAIL:'+sig);});"
      pass_condition: stdout is exactly the string PASS
      blocking: true

- [ ] AC-2.8: upload_module.js exits non-zero when --key-path flag is missing
      criterion: Invoking upload_module.js without --key-path prints `Error: missing required flag: --key-path` to stderr and exits with code 1 before making any network call.
      test_command: node backend/scripts/upload_module.js --module quality-inspector --version 0.0.1-test --dir /tmp/test_dist 2>/tmp/upload_err.txt; echo "exit:$?"; cat /tmp/upload_err.txt
      pass_condition: exit code line shows `exit:1`; /tmp/upload_err.txt contains "key-path"
      blocking: true

- [ ] AC-2.9: upload_module.js exits non-zero when SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set
      criterion: Running upload_module.js with both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY explicitly unset (even if they exist in the environment) prints an error to stderr and exits with code 1.
      test_command: env -u SUPABASE_URL -u SUPABASE_SERVICE_ROLE_KEY node backend/scripts/upload_module.js --module quality-inspector --version 0.0.1-test --dir /tmp/test_dist --key-path "$(pwd)/backend/scripts/private_key.pem" 2>/tmp/upload_noenv.txt; echo "exit:$?"; cat /tmp/upload_noenv.txt
      pass_condition: exit code line shows `exit:1`; /tmp/upload_noenv.txt contains the word "SUPABASE"
      blocking: false

---

## Dependencies

- name: Node.js built-in crypto
  version: available in Node.js 20.x LTS (no separate package)
  install_command: none — stdlib

- name: Node.js built-in fs
  version: available in Node.js 20.x LTS (no separate package)
  install_command: none — stdlib

- name: Node.js built-in path
  version: available in Node.js 20.x LTS (no separate package)
  install_command: none — stdlib

- name: Node.js built-in child_process
  version: available in Node.js 20.x LTS (no separate package)
  install_command: none — stdlib

- name: "@supabase/supabase-js"
  version: 2.39.0
  install_command: npm install (already present in backend/package.json — no new install needed)

- name: psql (PostgreSQL client)
  version: 15.x compatible
  install_command: brew install postgresql@15  # macOS; or apt-get install postgresql-client-15
  note: used only in manual verification steps, not in the scripts themselves

---

## Out Of Scope

What Builder must NOT build in this phase:

- **npm run build invocation inside upload_module.js**: deferred to operator workflow. The `--dir` flag accepts an already-built dist directory. Builder must NOT add a build step inside upload_module.js.
- **API endpoint changes (`/api/modules` signature field)**: deferred to phase-3-api-signature-field. No Vercel function is modified in this phase.
- **Flutter verification code**: deferred to phase-4-flutter-model-and-verifier and phase-5-flutter-verification-integration.
- **Supabase Storage bucket creation**: the `module-bundles` bucket already exists from Phase 5. Builder must NOT create or configure the bucket.
- **Key rotation procedure**: out of scope for the entire phase-12 track.
- **public_key.pem embedding into Flutter source**: deferred to phase-4-flutter-model-and-verifier.
- **CI/CD pipeline signing step**: signing is always an operator-initiated workstation command. No GitHub Actions or CI integration.
- **bundle.js.sig download endpoint**: the API does not need to serve the .sig file separately; the `signature` column in the DB is the delivery mechanism.
- **Infisical / secrets manager integration for private key**: locked from Phase 1 Q1 — key lives on operator workstation only.
- **generate_signing_key.js changes**: that script was delivered in Phase 1 and must not be modified.
- **`add_signature_to_module_versions.sql` changes**: migration was delivered in Phase 1 and must not be modified.
- **index.html upload**: upload_module.js uploads only `bundle.js` and `bundle.js.sig`. The index.html is not uploaded by this script (index_url in the DB is constructed but points to a pre-existing path or is assumed populated by a separate process).

---

## Phase Boundaries

### Receives From Previous Phase
- public_key_pem: string — PEM-encoded P-256 public key produced by generate_signing_key.js; format: SPKI PEM beginning with `-----BEGIN PUBLIC KEY-----`; file at `backend/scripts/public_key.pem`
- private_key_pem: string — PEM-encoded P-256 private key produced by generate_signing_key.js; format: PKCS8 PEM beginning with `-----BEGIN PRIVATE KEY-----` (NOT `-----BEGIN EC PRIVATE KEY-----`); lives on operator workstation only; accessed by sign_bundle.js via `--key-path <absolute-path>` CLI flag at runtime; never stored in env vars or secrets manager
- db_signature_column: { table: "module_versions", column: "signature", type: "TEXT", nullable: true } — confirmed database column added in Phase 1; upload_module.js writes to this column

### Provides To Next Phase
- signed_module_version_row: { id: string, slug: string, version: string, cdn_url: string, index_url: string, checksum: string, signature: string, size_kb: number, is_active: boolean } — a module_versions row in the database with the signature column populated (non-null) after upload_module.js completes. Note: `slug` is on the joined `modules` table, resolved via `module_id` FK.
- signature_format: { encoding: "base64", structure: "DER", algorithm: "ECDSA-P256-SHA256" } — exact encoding contract: base64-encoded raw DER output of Node.js `crypto.createSign('SHA256').sign(pkcs8PemKey)`, which produces an ASN.1 SEQUENCE of two INTEGERs (r and s). No JSON wrapper. No line breaks.

---

## Environment Requirements

- Node.js: 20.x LTS (script runtime for both sign_bundle.js and upload_module.js)
- npm: any version compatible with Node.js 20.x (for `require('@supabase/supabase-js')` — package already installed in backend/node_modules)
- SUPABASE_URL: environment variable — set to `https://gbjmxskxkqyfvqifvelg.supabase.co` for dev
- SUPABASE_SERVICE_ROLE_KEY: environment variable — Supabase service role JWT; must have Storage write and DB upsert permissions
- private_key.pem: PKCS8 PEM file on operator workstation at an absolute path of the operator's choosing; generated by Phase 1 `generate_signing_key.js`; passed via `--key-path` flag at runtime
- public_key.pem: SPKI PEM file at `backend/scripts/public_key.pem` (generated by Phase 1); used in AC test commands for verification
- OS: macOS or Linux on operator workstation; Windows is not a target for these scripts
- Supabase Storage bucket `module-bundles`: must exist and be publicly readable (pre-existing from Phase 5)

---

## Manual Test Steps

1. Ensure Phase 1 is complete: run `ls backend/scripts/private_key.pem backend/scripts/public_key.pem` — both files must exist. If not, run `cd backend/scripts && node generate_signing_key.js` first.
2. Create a test bundle: `echo "console.log('hello');" > /tmp/test_bundle.js`
3. Run signing: `node backend/scripts/sign_bundle.js /tmp/test_bundle.js --key-path "$(pwd)/backend/scripts/private_key.pem"` → Expected: a base64 string of 88–96 characters printed to stdout, no errors on stderr, exit code 0.
4. Capture to file: `node backend/scripts/sign_bundle.js /tmp/test_bundle.js --key-path "$(pwd)/backend/scripts/private_key.pem" > /tmp/bundle.sig` → Expected: `/tmp/bundle.sig` contains only the base64 string.
5. Verify signature: run the AC-2.2 test_command node one-liner → Expected: stdout is `PASS`.
6. Test tamper detection: run the AC-2.3 test_command node one-liner → Expected: stdout is `PASS`.
7. Test missing flag: `node backend/scripts/sign_bundle.js /tmp/test_bundle.js` (no --key-path) → Expected: stderr contains "key-path", exit code 1.
8. Prepare a dist directory: `mkdir -p /tmp/test_dist && cp modules/quality-inspector/dist/bundle.js /tmp/test_dist/bundle.js`
9. Run full upload: `SUPABASE_URL="$SUPABASE_URL" SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" node backend/scripts/upload_module.js --module quality-inspector --version 0.0.1-sigtest --dir /tmp/test_dist --key-path "$(pwd)/backend/scripts/private_key.pem"` → Expected: stdout logs `[sign] OK`, `[checksum] <hex>`, `[upload bundle] OK`, `[upload sig] OK`, `[db upsert] OK`; exit code 0.
10. Verify in Supabase Storage dashboard: navigate to `module-bundles/quality-inspector/0.0.1-sigtest/` → Expected: `bundle.js` and `bundle.js.sig` objects visible.
11. Verify in database: run `node -e "..."` from AC-2.7 → Expected: stdout is `PASS`.

---

## Phase Achievement

After this phase, a module developer can run one command — `node backend/scripts/upload_module.js --module <slug> --version <version> --dir <dist-dir> --key-path <key-path>` — to cryptographically sign and publish a module bundle, with the ECDSA-P256-SHA256 signature stored in the `module_versions.signature` column and ready for the Phase 3 API to serve.

---

## Validation Notes

### Ambiguities Resolved

- **Private key access mechanism (plan.md conflict)**: plan.md Deliverable section stated sign_bundle.js reads `private_key.pem` from "the same directory (or a path set by SIGNING_KEY_PATH env var)". This directly contradicts the locked Phase 1 Q1 answer, which mandates `--key-path <absolute-path>` CLI flag (never env vars, never same-directory assumption). Validated.md uses the locked answer. ALL test commands updated to include `--key-path "$(pwd)/backend/scripts/private_key.pem"`.

- **Private key PEM format (plan.md error)**: plan.md "Inputs From Previous Phase" listed `-----BEGIN EC PRIVATE KEY-----` (SEC1 format). Phase 1 validated.md AC-1.3 and "Provides To Next Phase" section conclusively established that generate_signing_key.js produces PKCS8 (`-----BEGIN PRIVATE KEY-----`). Corrected throughout. Builder must use PKCS8 format.

- **`npm run build` step in upload_module.js**: plan.md mentioned "npm run build" as first step. This creates ambiguity about which directory to run it from, which package.json, and what happens if build fails. Given that the `--dir` flag accepts a dist directory path and that Phase 5 established modules have their own build systems (`webpack`), the build step is removed from upload_module.js scope. The `--dir` flag accepts an already-built dist directory. Operator runs `npm run build` separately.

- **Supabase Storage bucket name**: plan.md did not specify the bucket name. Confirmed from `backend/sql/migrate_phase5.sql` line 67: bucket is `module-bundles`. CDN URL pattern: `${SUPABASE_URL}/storage/v1/object/public/module-bundles/<slug>/<version>/bundle.js`.

- **Supabase env var names**: plan.md did not specify the variable names. Confirmed from `backend/lib/supabase.js` and `backend/.env.local`: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

- **"upserts module_versions row" semantics**: resolved to INSERT with `onConflict: 'module_id,version'` performing UPDATE of checksum, signature, size_kb, is_active. This matches the `UNIQUE (module_id, version)` constraint in `migrate_phase5.sql`. Re-uploading the same version re-signs it — intentional.

- **AC-2.3 (plan.md) test setup broken**: plan.md AC-2.3 passed `--dir /tmp/test_dist` with no setup — the directory was empty. Fixed: test_command now creates the directory and bundle file inline.

- **`WHERE slug='test-module'` query in plan.md AC-2.3**: module_versions has no `slug` column. Slug is on the `modules` table, joined via `module_id` FK. The verification in AC-2.7 uses `@supabase/supabase-js` with an inner join filter instead of raw psql, which is simpler and accurate.

- **`@supabase/supabase-js` exact version**: resolved from `backend/package.json` — `^2.39.0` resolves to minimum 2.39.0. Specified as 2.39.0 in Dependencies.

- **index.html upload**: plan.md mentioned "upload bundle.js and bundle.js.sig". The `index_url` column exists and is populated, but the script constructs the URL without actually uploading an index.html (the HTML is either pre-existing or out of scope). Added to Out Of Scope to prevent Builder from adding an unnecessary upload step.

- **AC-2.2 test_command variable name bug in plan.md**: plan.md had `const crypto=require('fs')` (wrong variable name). Fixed in validated.md AC-2.2 test_command to use correct variable names.

- **public_key.pem relative path in test commands**: plan.md AC-2.2 and AC-2.4 used `fs.readFileSync('public_key.pem')` which fails unless CWD is `backend/scripts/`. Fixed to use `process.cwd()+'/backend/scripts/public_key.pem'` (assumes test is run from project root, which is standard).

### Assumptions Made

- **sign_bundle.js is called by upload_module.js via child_process.execSync**: This is the simplest approach matching the locked constraint that sign_bundle.js is a standalone script. If Builder prefers a require-based approach using sign_bundle.js as a module, that is also acceptable as long as the `--key-path` interface of sign_bundle.js remains intact.
- **index.html is not uploaded**: The `index_url` column is populated with a constructed URL (same CDN base pattern), but upload_module.js does not upload an HTML file. This is consistent with Phase 5 behaviour where index.html was separately uploaded.
- **Storage upload upsert behaviour**: Supabase Storage's `upload` method with `upsert: true` is used so re-signing a version replaces the stored files.
- **No `DATABASE_URL` env var for verification**: upload_module.js uses the Supabase JS client (not psql) for all DB operations. psql is used only in manual test steps where DATABASE_URL is available from the operator environment.

### Q&A References

- **Phase 1 Q1 (locked)**: Private key accessed via `--key-path <absolute-path>` CLI flag. Never env var, never hardcoded path. Applied to sign_bundle.js interface and all AC test commands.
- **Phase 1 (context)**: Private key format is PKCS8 (`-----BEGIN PRIVATE KEY-----`). Public key format is SPKI (`-----BEGIN PUBLIC KEY-----`). Signature encoding: base64-encoded DER, Node.js `crypto.createSign('SHA256')` default output.

### Drift Corrections
Not applicable — cycle 1, no baseline.

# Validated Spec — Phase 3: API Signature Field
PHASE_ID: phase-3-api-signature-field
VALIDATED: 2026-04-15T00:00:00Z
VALIDATOR_CYCLE: 1
VALIDATOR_DOC_VERSION: 1.0
DRIFT_CHECK_STATUS: NOT_APPLICABLE
# NOT_APPLICABLE: cycle 1 — no baseline exists yet

---

## What To Build

Modify `backend/api/modules/index.js` — the single Vercel Serverless Function that handles `GET /api/modules` — to add `signature` to the Supabase PostgREST SELECT projection and to the response object builder. The change is exactly two additions: one field added to the `.select(...)` string inside `module_versions (...)`, and one field added to the returned object literal in the `.map()` callback.

The `signature` field must be included in every element of the `modules` array in the JSON response. When the `module_versions.signature` column value in the database is `NULL`, the API must return `null` (JSON null literal) for that field — not an empty string, not an omitted key. When the column contains a base64 DER string, the API returns that string as-is. No transformation, no re-encoding.

No other files are modified. No new npm packages are added. No database schema changes are made. The existing authentication middleware, error handling, module-version sorting logic, and all other response fields remain untouched.

---

## Deliverables

### Modified API Handler — backend/api/modules/index.js
- type: file
- path: backend/api/modules/index.js
- purpose: Extends the GET /api/modules response to include the `signature` field from `module_versions` for every module entry.
- interface:
  - HTTP method: GET only (unchanged)
  - Route: /api/modules (unchanged)
  - Request: Authorization header with valid Bearer JWT (unchanged)
  - Response on success (200):
    ```json
    {
      "modules": [
        {
          "id": "<uuid string>",
          "slug": "<string>",
          "name": "<string>",
          "version": "<semver string>",
          "cdn_url": "<https URL string>",
          "index_url": "<https URL string>",
          "checksum": "<sha256 hex string>",
          "signature": "<base64 DER string> | null",
          "size_kb": <number>,
          "permissions": ["<string>", ...]
        }
      ]
    }
    ```
  - `signature` field rules:
    - DB column is non-null base64 string → JSON value is that base64 string verbatim
    - DB column is NULL → JSON value is `null` (JSON null), NOT `""`, NOT omitted
  - Response on auth failure (401): unchanged from current behaviour
  - Response on method not allowed (405): unchanged from current behaviour
  - Response on Supabase error (500): unchanged from current behaviour
  - Supabase query change — add `signature` to the module_versions sub-select:
    ```
    module_versions (
      id,
      version,
      cdn_url,
      index_url,
      checksum,
      signature,
      size_kb,
      is_active,
      created_at
    )
    ```
  - Response object builder change — add `signature` field to the returned object:
    ```js
    return {
      id:          mod.id,
      slug:        mod.slug,
      name:        mod.name,
      version:     v.version,
      cdn_url:     v.cdn_url,
      index_url:   v.index_url,
      checksum:    v.checksum,
      signature:   v.signature ?? null,
      size_kb:     v.size_kb,
      permissions: row.permissions,
    };
    ```
    Note: `v.signature ?? null` evaluates to `null` when `v.signature` is `null` or `undefined`
    (PostgREST returns `null` for a NULL column — not `undefined` — so `?? null` and a plain
    `v.signature` reference both work; `?? null` is used for explicitness).
- constraints:
  - No new npm dependencies. Only existing modules (`../../middleware/auth`, `../../lib/supabase`) used.
  - The `signature` value must NOT be coerced to `""` (empty string). The expression MUST NOT be `v.signature ?? ''` or `v.signature || ''`.
  - No other fields in the response object may be added, removed, or renamed.
  - The `.select(...)` string change must only add `signature` to the `module_versions (...)` sub-block — no other changes to the query.
  - The file must remain a CommonJS module (`module.exports = async function handler`).
  - Vercel Serverless Function constraints: no top-level await, no ES module syntax (`import`/`export`).
- edge_cases:
  - **`module_versions.signature` is NULL in DB**: PostgREST returns the field as JSON `null`. `v.signature ?? null` evaluates to `null`. The response contains `"signature": null`. This is the correct and expected behaviour for legacy unsigned modules.
  - **`module_versions.signature` is an empty string in DB**: PostgREST returns `""`. `v.signature ?? null` evaluates to `""` (empty string is not nullish). The API returns `"signature": ""`. This edge case is unlikely (Phase 2 never writes empty strings) but is handled correctly.
  - **`module_versions` sub-query returns no rows for a module**: The existing `.filter((v) => v.is_active)` returns an empty array; `activeVersions[0]` is `undefined`; the `.map()` returns `null` which is filtered by `.filter(Boolean)`. No module entry is emitted. This behaviour is unchanged.
  - **Supabase PostgREST does not recognise `signature` column**: Supabase returns a 400 error; the existing `if (error)` branch returns HTTP 500. No silent data loss.
  - **Concurrent GET /api/modules requests**: Vercel Serverless Functions handle each invocation in isolation. No shared mutable state. No race conditions introduced by this change.
  - **Auth failure (no or invalid JWT)**: `requireAuth` middleware sends 401 and sets `res.headersSent = true`. The `if (res.headersSent) return;` guard exits before the Supabase query. Behaviour unchanged.

---

## File Manifest

| filepath | action | description |
|----------|--------|-------------|
| backend/api/modules/index.js | MODIFY | Add `signature` to module_versions SELECT projection and to response object builder; use `v.signature ?? null` |

---

## Acceptance Criteria

- [ ] AC-3.1: `signature` key present in every module object
      criterion: GET /api/modules (authenticated) returns a JSON body where every element in the `modules` array contains a `signature` key, regardless of whether its value is a string or null.
      test_command: curl -s -H "Authorization: Bearer $TEST_JWT" "$API_BASE_URL/api/modules" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); const bad=d.modules.filter(m=>!('signature' in m)); process.stdout.write(bad.length===0?'PASS':'FAIL:'+JSON.stringify(bad))"
      pass_condition: stdout is exactly the string PASS
      blocking: true

- [ ] AC-3.2: Signed module returns a non-empty base64 string of at least 88 characters in `signature`
      criterion: For the module with slug `quality-inspector` (uploaded via Phase 2 with a non-null signature), GET /api/modules returns a `signature` value that is a non-null, non-empty string of at least 88 characters containing only base64 characters (A-Z, a-z, 0-9, +, /, =).
      test_command: curl -s -H "Authorization: Bearer $TEST_JWT" "$API_BASE_URL/api/modules" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); const m=d.modules.find(x=>x.slug==='quality-inspector'); const sig=m&&m.signature; process.stdout.write(sig&&sig.length>=88&&/^[A-Za-z0-9+/=]+$/.test(sig)?'PASS':'FAIL:'+JSON.stringify(sig))"
      pass_condition: stdout is exactly the string PASS
      blocking: true

- [ ] AC-3.3: Legacy unsigned module returns JSON null (not empty string, not omitted) for `signature`
      criterion: For a module whose `module_versions.signature` column is NULL in the database (slug `legacy-unsigned` if it exists in the test environment), GET /api/modules returns `"signature": null` in that module's object — not `""`, not the key absent.
      test_command: curl -s -H "Authorization: Bearer $TEST_JWT" "$API_BASE_URL/api/modules" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); const m=d.modules.find(x=>x.slug==='legacy-unsigned'); if(!m){process.stdout.write('SKIP:no legacy-unsigned module in test env');process.exit(0);} process.stdout.write(('signature' in m)&&m.signature===null?'PASS':'FAIL:signature='+JSON.stringify(m.signature))"
      pass_condition: stdout is exactly the string PASS (or SKIP:no legacy-unsigned module in test env if slug absent — in that case, verify the `v.signature ?? null` code path via unit inspection)
      blocking: false

- [ ] AC-3.4: All pre-existing response fields are still present (no regression)
      criterion: The first element of `modules` in the GET /api/modules response contains all ten required keys: `id`, `slug`, `name`, `version`, `cdn_url`, `index_url`, `checksum`, `signature`, `size_kb`, `permissions`.
      test_command: curl -s -H "Authorization: Bearer $TEST_JWT" "$API_BASE_URL/api/modules" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); const m=d.modules[0]; if(!m){process.stdout.write('FAIL:modules array empty');process.exit(1);} const required=['id','slug','name','version','cdn_url','index_url','checksum','signature','size_kb','permissions']; const missing=required.filter(f=>!(f in m)); process.stdout.write(missing.length===0?'PASS':'FAIL:missing='+missing)"
      pass_condition: stdout is exactly the string PASS
      blocking: true

- [ ] AC-3.5: Unauthenticated request returns 401, no change from pre-phase behaviour
      criterion: A GET /api/modules request without an Authorization header returns HTTP status 401 and does not include a `modules` key in the response body.
      test_command: curl -s -o /tmp/unauth_body.json -w "%{http_code}" "$API_BASE_URL/api/modules" | tee /tmp/unauth_status.txt && node -e "const code=require('fs').readFileSync('/tmp/unauth_status.txt','utf8').trim(); const body=JSON.parse(require('fs').readFileSync('/tmp/unauth_body.json','utf8')); process.stdout.write(code==='401'&&!('modules' in body)?'PASS':'FAIL:status='+code+' body='+JSON.stringify(body))"
      pass_condition: stdout is exactly the string PASS
      blocking: true

---

## Dependencies

- name: Node.js built-in (no new package)
  version: Node.js 20.x LTS (existing runtime)
  install_command: none — no new dependencies added

- name: "@supabase/supabase-js"
  version: 2.39.0 (already in backend/package.json — no change)
  install_command: none — already installed

---

## Out Of Scope

What Builder must NOT build in this phase:

- **Signature verification logic**: deferred to phase-5-flutter-verification-integration. The API only serves the signature string; it does not verify it.
- **Public key endpoint**: no new API route for serving `public_key.pem`. Deferred entirely — public key is embedded in Flutter source in phase-4-flutter-model-and-verifier.
- **Signature field filtering or conditional omission**: the `signature` key must always be present in every module object. No logic to omit it based on value, permissions, or feature flag.
- **Database schema changes**: the `module_versions.signature` TEXT column was added in Phase 1 and must not be altered.
- **New Supabase query structure**: the join shape (`user_module_permissions → modules!inner → module_versions`) must not be restructured. Only `signature` is added to the existing `module_versions (...)` sub-select.
- **`permissions` field changes**: the permissions field and its source (`user_module_permissions.permissions`) are out of scope for this phase.
- **sign_bundle.js or upload_module.js changes**: those scripts were delivered in Phase 2 and must not be modified.
- **Index route changes or new API endpoints**: only `backend/api/modules/index.js` is modified. No other files under `backend/api/` are touched.
- **`.sig` file download endpoint**: the API does not serve `bundle.js.sig` from Storage. The signature is delivered exclusively via the `signature` JSON field in GET /api/modules.
- **Flutter model or verification code**: deferred to phase-4-flutter-model-and-verifier and phase-5-flutter-verification-integration.

---

## Phase Boundaries

### Receives From Previous Phase
- signed_module_version_row: { id: string, slug: string, version: string, cdn_url: string, index_url: string, checksum: string, signature: string, size_kb: number, is_active: boolean } — a module_versions row in the database with the signature column populated (non-null) after upload_module.js completes
- signature_format: { encoding: "base64", structure: "DER", algorithm: "ECDSA-P256-SHA256" } — exact encoding contract the API surfaces verbatim; no transformation applied

### Provides To Next Phase
- api_module_response: { id: string, slug: string, name: string, version: string, cdn_url: string, index_url: string, checksum: string, signature: string | null, size_kb: number, permissions: string[] } — full shape of each element in the `modules` array returned by GET /api/modules; `signature` is always present as a key; value is a base64 DER string when the DB column is non-null, or JSON null when the DB column is NULL
- signature_format: { encoding: "base64", structure: "DER", algorithm: "ECDSA-P256-SHA256" } — forwarded unchanged from Phase 2

---

## Manual Test Steps

1. Set environment: `export TEST_JWT=<valid JWT for a dev user with module permissions>` and `export API_BASE_URL=<Vercel dev URL or https://foundry.app>` — these must be set before running any AC test commands.
2. Call `GET /api/modules` with authentication: `curl -s -H "Authorization: Bearer $TEST_JWT" "$API_BASE_URL/api/modules" | python3 -m json.tool` → Expected: JSON response body with a `modules` array; each element contains `"signature": "<base64-string>"` for modules uploaded via Phase 2, or `"signature": null` for unsigned legacy modules.
3. Inspect a single module object: confirm all ten fields present — `id`, `slug`, `name`, `version`, `cdn_url`, `index_url`, `checksum`, `signature`, `size_kb`, `permissions`.
4. Confirm signed module has valid-looking signature: the `signature` value for `quality-inspector` should be a base64 string of 88–96 characters (typical ECDSA-P256 DER length range).
5. Confirm unauthenticated request returns 401: `curl -s -o /dev/null -w "%{http_code}" "$API_BASE_URL/api/modules"` → Expected: `401`. No change from pre-phase behaviour.
6. Check Vercel function logs for no new errors: after running the above curl commands, confirm no `Supabase modules fetch error` lines appear in Vercel function logs that were not present before the change.

---

## Phase Achievement

After this phase, `GET /api/modules` returns the ECDSA-P256-SHA256 signature for every module version in the response JSON, giving the Flutter client all the data it needs to perform signature verification in Phase 5.

---

## Validation Notes

### Ambiguities Resolved

- **NULL signature → null or empty string (plan.md conflict, locked-context resolution)**:
  plan.md "What This Phase Builds" said "empty string or null" (ambiguous). plan.md Deliverables said `v.signature ?? ''` (empty string). plan.md AC-3.3 tested for `m.signature===''` (empty string). These all contradict the locked Phase 1 Q&A answer: "NULL signature rows: returned as null in JSON (not omitted, not empty string)."
  Resolution: The locked context answer is authoritative and overrides plan.md. validated.md specifies `v.signature ?? null` (null, not empty string). AC-3.3 test updated to check `m.signature===null`. Builder MUST NOT use `?? ''`.

- **`signature: string` output type corrected to `string | null`**:
  plan.md Outputs listed `signature: string` in `api_module_response`. Given the locked-context ruling that NULL DB rows produce JSON null (not empty string), the correct type is `string | null`. Updated in "Provides To Next Phase". Phase 4 (flutter-model-and-verifier) must handle both a string value and null — its plan.md shows `signature: string` which will need to accommodate null or treat null as "no signature". This type correction is noted as a cross-phase type widening that Phase 4 Validator must address.

- **AC-3.2 signature length check corrected**:
  plan.md AC-3.2 tested `signature.length > 80`. Phase 2 validated.md (AC-2.1 pass_condition) establishes the minimum length as 88 characters. Updated to `sig.length >= 88` for consistency with Phase 2 output contract.

- **AC-3.2 base64 character validation added**:
  plan.md AC-3.2 only checked length. Added a `/^[A-Za-z0-9+/=]+$/.test(sig)` check to confirm the value is actually base64-encoded, not an arbitrary non-empty string.

- **AC-3.3 SKIP path added**:
  plan.md AC-3.3 assumed a `legacy-unsigned` slug exists in the test database. This slug may not exist in the dev environment. Updated test_command to emit `SKIP:no legacy-unsigned module in test env` (exit 0) if the slug is absent, since AC-3.3 is `blocking: false`. Tester must verify the `v.signature ?? null` code path by code inspection if the slug is absent.

- **AC-3.5 added (unauthenticated request)**:
  plan.md Manual Test Steps item 3 covers the 401 case but there was no AC for it. Added AC-3.5 (blocking: true) to formalise regression coverage for the auth path. This is a completeness addition, not a scope change.

- **`TEST_JWT` and `API_BASE_URL` environment variables**:
  plan.md ACs reference these variables without defining them. Documented here: `TEST_JWT` must be a valid Firebase-issued JWT for a dev user who has entries in `user_module_permissions` (available from dev environment; obtain via the Foundry console sign-in with test@foundry.com / test1234 using the Firebase SDK `getIdToken()` method). `API_BASE_URL` must be the Vercel deployment URL for the backend (e.g., `https://<project>.vercel.app` or `http://localhost:3000` for local dev via `vercel dev`).

### Assumptions Made

- **`v.signature ?? null` expression**: PostgREST returns a JSON `null` for SQL NULL columns. In JavaScript, `JSON.parse('{"signature":null}')` yields `{ signature: null }` — not `undefined`. Therefore `v.signature ?? null` is equivalent to just `v.signature` when PostgREST behaves correctly. The explicit `?? null` form is specified for defensive clarity in case any middleware or JSON parser converts null to undefined.
- **No `.select()` string format change needed**: The current `.select(...)` uses a template literal with indented sub-fields. Builder adds `signature,` on a new indented line inside the `module_versions (...)` block. No restructuring of the query is required.
- **`quality-inspector` slug exists in dev DB**: Referenced in plan.md and Phase 2 validated.md as the canonical test module. Assumed to have a non-null signature after Phase 2 is complete.

### Q&A References

- **Phase 1 (locked)**: Signature encoding: base64-encoded DER, algorithm ECDSA-P256-SHA256. Applied: API surfaces this format verbatim from DB column.
- **Phase 1 (locked)**: DB column: `module_versions.signature TEXT nullable`. Applied: SELECT projection adds `signature`; null DB value becomes JSON null.
- **Phase 1 (locked)**: NULL signature rows: returned as null in JSON (not omitted, not empty string). Applied: overrides plan.md's `?? ''` and empty-string AC check.
- **Phase 1 (locked)**: Node.js version: 20.x LTS. Applied: no compatibility concerns; standard JS syntax used.
- **Phase 1 (locked)**: Backend: Vercel Serverless Functions. Applied: no top-level await, CommonJS module format preserved.

### Drift Corrections
Not applicable — cycle 1, no baseline.

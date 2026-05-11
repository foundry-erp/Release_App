# Phase 3 — API Signature Field
PHASE_ID: phase-3-api-signature-field
PLANNER_DOC_VERSION: 1.0
DEPENDS_ON: [phase-2-backend-signing-scripts]
PROVIDES_TO: [phase-4-flutter-model-and-verifier]

## What This Phase Builds
This phase updates the backend registry API (`backend/api/modules/index.js`) to include the `signature` field in its Supabase SELECT query and in the JSON response returned to the Flutter client. After this phase, `GET /api/modules` returns a `signature` string alongside every module entry, and Flutter (or any HTTP client) can read the signature without any app-side changes yet. Old modules with `signature = NULL` return an empty string or null to avoid breaking existing clients.

## Requirements Covered
- REQ-API: backend/api/modules/index.js — add `mv.signature` to the SELECT projection and surface it as `signature` in the response JSON payload: `[{ id, slug, name, version, cdn_url, index_url, checksum, signature, size_kb, permissions }]`

## Deliverables
- [ ] backend/api/modules/index.js (modified): SELECT query extended to include `signature` from `module_versions`; response object builder extended to include `signature: v.signature ?? ''`

## Inputs From Previous Phase
- signed_module_version_row: { id: string, slug: string, version: string, cdn_url: string, index_url: string, checksum: string, signature: string, size_kb: number, is_active: boolean } — a module_versions row in the database with the signature column populated (non-null) after upload_module.js completes
- signature_format: { encoding: "base64", structure: "DER", algorithm: "ECDSA-P256-SHA256" } — exact encoding contract the API must surface and the Flutter client must consume

## Outputs To Next Phase
- api_module_response: { id: string, slug: string, name: string, version: string, cdn_url: string, index_url: string, checksum: string, signature: string, size_kb: number, permissions: string[] } — full shape of each element in the `modules` array returned by GET /api/modules; signature is always present (empty string when DB value is NULL)
- signature_format: { encoding: "base64", structure: "DER", algorithm: "ECDSA-P256-SHA256" } — exact encoding contract forwarded unchanged to Flutter

## Acceptance Criteria
- [ ] AC-3.1
      criterion: GET /api/modules returns a `signature` key in every module object
      test_command: curl -s -H "Authorization: Bearer $TEST_JWT" "$API_BASE_URL/api/modules" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); const bad=d.modules.filter(m=>!('signature' in m)); console.log(bad.length===0?'PASS':'FAIL:'+JSON.stringify(bad))"
      pass_condition: stdout is exactly "PASS"
      blocking: true

- [ ] AC-3.2
      criterion: For a module uploaded with a signature (phase 2 output), the API returns a non-empty base64 string in the `signature` field
      test_command: curl -s -H "Authorization: Bearer $TEST_JWT" "$API_BASE_URL/api/modules" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); const m=d.modules.find(x=>x.slug==='quality-inspector'); console.log(m&&m.signature&&m.signature.length>80?'PASS':'FAIL:'+JSON.stringify(m?.signature))"
      pass_condition: stdout is exactly "PASS"
      blocking: true

- [ ] AC-3.3
      criterion: For a legacy module with signature = NULL in DB, the API returns an empty string (not null, not missing field)
      test_command: curl -s -H "Authorization: Bearer $TEST_JWT" "$API_BASE_URL/api/modules" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); const m=d.modules.find(x=>x.slug==='legacy-unsigned'); console.log((!m||m.signature==='')? 'PASS':'FAIL:'+m?.signature)"
      pass_condition: stdout is exactly "PASS"
      blocking: false

- [ ] AC-3.4
      criterion: API response still includes all pre-existing fields (no regression)
      test_command: curl -s -H "Authorization: Bearer $TEST_JWT" "$API_BASE_URL/api/modules" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); const m=d.modules[0]; const required=['id','slug','name','version','cdn_url','index_url','checksum','size_kb','permissions','signature']; const missing=required.filter(f=>!(f in m)); console.log(missing.length===0?'PASS':'FAIL:missing='+missing)"
      pass_condition: stdout is exactly "PASS"
      blocking: true

## Manual Test Steps
1. Call `GET /api/modules` with a valid JWT using curl or Postman → Expected: response body contains `"signature": "<base64-string>"` for modules uploaded via phase 2, and `"signature": ""` for any legacy unsigned modules
2. Inspect the JSON shape of one module object → Expected: all ten fields present (id, slug, name, version, cdn_url, index_url, checksum, signature, size_kb, permissions)
3. Unauthenticated call `GET /api/modules` (no Authorization header) → Expected: 401 response; no change from pre-phase behaviour
4. Confirm server logs show no Supabase query errors after the SELECT change → Expected: no 500 responses; no error output in Vercel function logs

## Phase Achievement
`GET /api/modules` now surfaces the ECDSA signature for every module, giving the Flutter client all the data it needs to perform signature verification.

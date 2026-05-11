# Phase 2 — Backend API + Firebase Auth + JWT Flow

PHASE_ID: phase-2-backend-auth
PLANNER_DOC_VERSION: 6.1.0
GENERATED: 2026-04-02T00:00:00Z

---

## WHAT_TO_BUILD

Build the complete authentication and backend foundation. This phase has three
parallel tracks that must all work together:

**Track A — Supabase:** Create the full database schema (organizations, users,
modules, permissions, reports, sync_logs tables) with indexes. Seed one test
organization and one test user linked to a Firebase UID.

**Track B — Vercel Backend:** Node.js serverless API with Firebase Admin SDK
for token verification and Supabase client for DB access. Two auth endpoints:
POST /api/auth/login (exchanges Firebase ID token for app JWT) and GET
/api/auth/profile (returns user from DB). JWT middleware protects all routes.

**Track C — Flutter:** Replace the Phase 1 direct-load screen with a proper
flow: login screen (email + password) → Firebase signInWithEmailAndPassword →
call backend /api/auth/login → store JWT in flutter_secure_storage → inject
token into WebView as window.__foundry_auth__ → on restart skip login if token
valid. Add logout button.

All three tracks must be wired together and tested end-to-end on device.

---

## DELIVERABLES

### Backend (Vercel)
| # | File | Purpose |
|---|------|---------|
| 1 | backend/package.json | firebase-admin, @supabase/supabase-js, jsonwebtoken, bcryptjs |
| 2 | backend/vercel.json | Route rewrites, Node 20 runtime |
| 3 | backend/lib/supabase.js | Supabase client (service_role key) |
| 4 | backend/lib/firebase-admin.js | Firebase Admin SDK init |
| 5 | backend/middleware/auth.js | Verify JWT from Authorization header |
| 6 | backend/api/auth/login.js | POST — verify Firebase token, upsert user, return JWT |
| 7 | backend/api/auth/profile.js | GET — return user from DB (JWT protected) |

### Database
| # | File | Purpose |
|---|------|---------|
| 8 | backend/sql/schema.sql | Full Supabase schema — all 7 tables + indexes |
| 9 | backend/sql/seed.sql | Test org + test user (firebase_uid placeholder) |

### Flutter
| # | File | Purpose |
|---|------|---------|
| 10 | flutter/lib/services/auth_service.dart | Firebase sign-in, backend login call, JWT storage/retrieval |
| 11 | flutter/lib/screens/login_screen.dart | Email + password form, loading state, error display |
| 12 | flutter/lib/screens/loading_screen.dart | "Setting up..." spinner, checks token, navigates to shell |
| 13 | flutter/lib/main.dart | Updated — check isLoggedIn() on startup, route accordingly |
| 14 | flutter/lib/webview/module_webview.dart | Updated — inject __foundry_auth__ before loading URL |
| 15 | flutter/assets/.env | API_BASE_URL pointing to deployed Vercel URL |

---

## ACCEPTANCE_CRITERIA

### AC-1: Supabase schema creates without errors
- pass_condition: All 7 tables created, psql returns no errors, tables visible in Supabase dashboard
- test_command: Run backend/sql/schema.sql in Supabase SQL Editor → check output for errors

### AC-2: Backend deploys to Vercel
- pass_condition: `vercel --prod` exits 0, deployment URL accessible
- test_command: `cd foundry-app/backend && vercel --prod 2>&1 | grep "Production"`

### AC-3: POST /api/auth/login returns JWT
- pass_condition: HTTP 200 with `{ token: "eyJ...", user: { id, email, role } }` in response body
- test_command: `curl -X POST https://{vercel-url}/api/auth/login -H "Content-Type: application/json" -d '{"firebase_id_token":"<valid-token>"}' | jq .token`

### AC-4: GET /api/auth/profile returns user
- pass_condition: HTTP 200 with user object when valid JWT provided; HTTP 401 when no token
- test_command: `curl https://{vercel-url}/api/auth/profile -H "Authorization: Bearer <token>" | jq .email`

### AC-5: Flutter login screen authenticates user
- pass_condition: Enter email+password → tap Login → no error → loading screen appears
- test_command: Run on device, enter test credentials, observe navigation

### AC-6: JWT stored in secure storage
- pass_condition: After login, kill and reopen app → login screen NOT shown, goes straight to loading
- test_command: Run on device, login, force-close, reopen → confirm no login screen

### AC-7: Auth token injected into WebView
- pass_condition: window.__foundry_auth__.token exists and is non-empty in WebView JS context
- test_command: After login, in WebView console: `console.log(window.__foundry_auth__.token)` → non-empty string

### AC-8: Logout clears token
- pass_condition: After logout, reopen app → login screen shown
- test_command: Tap logout on device, force-close, reopen → login screen visible

---

## INPUTS_FROM_PREVIOUS_PHASE

| Field | Type | Value |
|-------|------|-------|
| flutter_project_path | string | foundry-app/flutter/ |
| bridge_channel_name | string | shellBridge |
| local_server_default_port | int | 8080 |
| module_webview_file | string | flutter/lib/webview/module_webview.dart |
| main_dart_file | string | flutter/lib/main.dart |

---

## OUTPUTS_TO_NEXT_PHASE

| Field | Type | Description |
|-------|------|-------------|
| api_base_url | string | Deployed Vercel URL e.g. https://foundry-api.vercel.app |
| jwt_header_name | string | "Authorization: Bearer {token}" |
| auth_context_shape | object | { token: string, userId: string, email: string, role: string } |
| supabase_tables | string[] | [organizations, users, modules, module_versions, user_module_permissions, reports, sync_logs] |
| module_registry_endpoint | string | GET /api/modules (built in Phase 3) |

---

## OUT_OF_SCOPE

- Module registry API (Phase 3)
- Module download or CDN (Phase 3)
- Offline queue or sync (Phase 4)
- Report submission API (Phase 4)
- Push notifications
- Password reset flow
- OAuth / social login
- Role-based access control enforcement (schema only, not enforced until Phase 3)

---

## ENVIRONMENT_REQUIREMENTS

| Requirement | Check | Notes |
|---|---|---|
| Vercel CLI | `vercel --version` | `npm i -g vercel` if missing |
| Node.js 20+ | `node --version` | v22 confirmed available |
| Firebase project | Dashboard | Need project ID + service account JSON |
| Supabase project | Dashboard | Need project URL + service_role key |
| flutter_secure_storage | pubspec.yaml | Add back in Phase 2 |
| firebase_core + firebase_auth | pubspec.yaml | Add back with google-services.json |
| google-services.json | android/app/ | Download from Firebase console |

---

## IMPORTANT NOTES FOR BUILDER

### Environment variables (Vercel dashboard — NOT in code):
```
SUPABASE_URL=https://{ref}.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}  (JSON stringified)
JWT_SECRET=<random 64-char string>
```

### Flutter env (.env file):
```
API_BASE_URL=https://{your-vercel-url}.vercel.app
```

### Firebase in Flutter:
- Requires google-services.json in android/app/
- Run `flutterfire configure` OR manually place the file
- firebase_core.initializeApp() in main.dart before runApp()

### Token flow:
```
Firebase signIn → getIdToken() → POST /api/auth/login
→ backend verifies with Firebase Admin → queries/creates Supabase user
→ signs JWT with JWT_SECRET → returns { token, user }
→ Flutter stores token in FlutterSecureStorage
→ On WebView load: inject window.__foundry_auth__ = { token, userId, email, role }
```

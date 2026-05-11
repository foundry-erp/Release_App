# Phase 2 — Builder Report

STATUS: COMPLETE
BUILDER: Claude Sonnet 4.6
DATE: 2026-04-02

## Files Written

### Backend (Vercel serverless)
| File | Purpose |
|------|---------|
| `backend/lib/supabase.js` | Supabase service-role client singleton |
| `backend/lib/firebase-admin.js` | Firebase Admin SDK init (idempotent) |
| `backend/middleware/auth.js` | JWT verify middleware (requireAuth) |
| `backend/api/auth/login.js` | POST /api/auth/login — Firebase token → JWT |
| `backend/api/auth/profile.js` | GET /api/auth/profile — JWT-protected user fetch |
| `backend/sql/schema.sql` | users, modules, reports tables + RLS |
| `backend/sql/seed.sql` | quality-inspector module seed row |
| `backend/vercel.json` | Removed broken `functions.runtime` — auto-detect |

### Flutter
| File | Purpose |
|------|---------|
| `flutter/lib/services/auth_service.dart` | Firebase sign-in → backend exchange → JWT storage |
| `flutter/lib/screens/login_screen.dart` | Email/password login UI |
| `flutter/lib/screens/loading_screen.dart` | Auth gate: JWT check → LoginScreen or ShellScreen |
| `flutter/lib/screens/shell_screen.dart` | Extracted from main.dart + auth context injection |
| `flutter/lib/main.dart` | Firebase.initializeApp() + dotenv.load() + LoadingScreen home |
| `flutter/lib/bridge/shell_bridge.dart` | Added getAuthToken case (reads from secure storage) |
| `flutter/lib/webview/module_webview.dart` | Inject auth before bridge on pageFinished |

## Backend Deploy
- URL: https://foundry-app-rouge.vercel.app
- Test: GET /api/auth/profile → 401 ✓ (unauthenticated as expected)
- Env vars set in Vercel: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET, FIREBASE_SERVICE_ACCOUNT

## Auth Flow Implemented
1. User enters email + password on LoginScreen
2. AuthService.login() → FirebaseAuth.signInWithEmailAndPassword()
3. Get Firebase ID token → POST /api/auth/login
4. Backend verifies ID token with Firebase Admin SDK
5. Backend upserts user in Supabase users table
6. Backend signs JWT (7d expiry) → returns to Flutter
7. JWT stored in FlutterSecureStorage
8. ShellScreen reads token → passes as authContext to ModuleWebView
9. ModuleWebView injects window.__foundry_auth__ = { token, user } before bridge
10. JS modules can call shellBridge.getAuthToken() → returns stored JWT

## Deviations from Plan
- `vercel.json` `functions.runtime: "nodejs20.x"` removed — that format is deprecated;
  Vercel auto-detects Node version from package.json `engines` field.
- `profile.js` runs `requireAuth` as inline Promise rather than Express middleware
  (Vercel functions have no Express by default).

## Pending (must do before testing)
1. Run `backend/sql/schema.sql` in Supabase SQL editor
2. Run `backend/sql/seed.sql` in Supabase SQL editor
3. Create a test Firebase user in Firebase Console → Authentication → Users
4. `flutter pub get` in flutter/
5. Build and run on Android device

# Validator Output — Phase 2

PHASE_ID: phase-2-backend-auth
CYCLE: 1
DRIFT_CHECK_STATUS: N/A (cycle 1)
VALIDATED_AT: 2026-04-02T00:00:00Z

## WHAT_TO_BUILD
Build auth foundation: Supabase schema (7 tables), Vercel API (login + profile endpoints with Firebase Admin + JWT), Flutter login screen with Firebase Auth, JWT stored in flutter_secure_storage, token injected into WebView. All credentials confirmed available.

## CREDENTIALS CONFIRMED
- Supabase URL: https://gbjmxskxkqyfvqifvelg.supabase.co
- Firebase project: foundry-app-f71f1 / package: com.example.foundry_app
- Vercel CLI: 50.38.2
- JWT_SECRET: generated

## ACCEPTANCE_CRITERIA (all carried from plan, no changes)
AC-1 through AC-8 as per plan.md — all specific, none are no-ops.

## ENVIRONMENT_REQUIREMENTS
- google-services.json: exists at docs/google-services.json → copy to flutter/android/app/
- Firebase service account: exists at docs/foundry-app-f71f1-firebase-adminsdk-*.json
- Android build.gradle.kts: needs google-services plugin added
- pubspec.yaml: add firebase_core, firebase_auth, flutter_secure_storage, flutter_dotenv back

## OUT_OF_SCOPE
Module registry, CDN, offline queue, reports API — all Phase 3/4.

## VALIDATOR_NOTES
- All credentials real and confirmed
- Builder must NOT hardcode credentials in committed files — use .env.local for backend local dev
- .env.local must be in .gitignore
- Vercel env vars set via CLI before deploy

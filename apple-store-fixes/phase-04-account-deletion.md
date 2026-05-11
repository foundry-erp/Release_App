# Phase 04 — Add Account Deletion Feature

## Why This Exists
Apple Guideline 5.1.1(v) requires: if an app supports account creation, it MUST also offer account deletion from within the app. The Foundry App has email/password registration via Firebase Auth but NO way to delete the account. This is a guaranteed rejection.

## Goal
Add an account deletion flow that allows users to delete their account and all associated data. The deletion should work through both Firebase Auth and the backend API.

## Core Architecture Constraint
DO NOT modify WebView logic, module loading, local HTTP server, React bundle handling, or the IndexedStack module system. Only ADD deletion capability to the existing auth service and expose it via a confirmation dialog.

## Context — Current Auth System
- **Auth service:** `foundry-app/flutter/lib/services/auth_service.dart`
  - `login(email, password)` → Firebase Auth → backend JWT
  - `getValidToken()` → reads from FlutterSecureStorage
  - `logout()` → clears token + user from FlutterSecureStorage
  - `_getApiBaseUrl()` → reads from dotenv
  - Backend URL: `https://foundry-app-rouge.vercel.app`
- **Secure storage keys:** `jwt_token`, `cached_user`
- **Firebase Auth:** `firebase_auth: ^5.3.1`

## What To Build

### Deliverable 1: Add deleteAccount() to AuthService
**File to modify:** `foundry-app/flutter/lib/services/auth_service.dart`

Add a new method `deleteAccount()` that:

1. Gets the current Firebase user via `FirebaseAuth.instance.currentUser`
2. Gets the current JWT token from FlutterSecureStorage
3. Calls backend deletion endpoint: `DELETE /api/auth/account` with JWT in Authorization header
   - This tells the backend to delete user data from Supabase
   - If backend returns success OR 404 (already deleted), continue
   - If backend is unreachable (offline), still proceed with Firebase deletion (data cleanup can happen server-side later)
4. Deletes the Firebase Auth account: `currentUser.delete()`
   - This may throw `requires-recent-login` — handle by re-authenticating first
5. Clears all local data:
   - Delete `jwt_token` from FlutterSecureStorage
   - Delete `cached_user` from FlutterSecureStorage
   - Clear any cached module data from app documents directory
6. Returns success/failure

**Error handling:**
- If Firebase `requires-recent-login`: The method should accept email+password parameters for re-authentication
- If backend call fails but Firebase deletion succeeds: Log warning but consider it success (backend can clean up orphaned data)
- If Firebase deletion fails: Return error, do NOT clear local data (user is still authenticated)

### Deliverable 2: Account Deletion Confirmation Dialog
**Location:** `foundry-app/flutter/lib/widgets/delete_account_dialog.dart`

Create a reusable dialog widget that:

1. Shows a warning message: "This will permanently delete your account and all associated data. This action cannot be undone."
2. Requires the user to type their email address to confirm (prevents accidental deletion)
3. Requires the user to enter their password (needed for Firebase re-authentication)
4. Has two buttons: "Cancel" (dismisses) and "Delete Account" (red, proceeds)
5. Shows a loading indicator while deletion is in progress
6. Shows error message if deletion fails
7. On success: navigates to LoginScreen and clears navigation stack

**Theme:** Match app dark theme (0xFF1A1A2E background, 0xFF6C63FF accent, red for destructive action)

### Deliverable 3: Add Delete Account Trigger to Module List Screen
**File to modify:** `foundry-app/flutter/lib/screens/module_list_screen.dart`

Add a way to access account deletion from the existing screen. The module list screen currently has a logout button in the AppBar.

Add an option near the existing logout button — either:
- A popup menu (three-dot icon) in the AppBar with "Logout" and "Delete Account" options, OR
- A "Delete Account" text button below the module list

When tapped, show the DeleteAccountDialog.

**Keep the existing UI intact** — only add the deletion trigger alongside existing controls.

## Acceptance Criteria
- [ ] `AuthService.deleteAccount()` method exists and handles Firebase + backend deletion
- [ ] Method handles `requires-recent-login` by re-authenticating with provided credentials
- [ ] Method clears all local secure storage on success
- [ ] DeleteAccountDialog exists with email confirmation + password input
- [ ] Dialog shows loading state during deletion
- [ ] Dialog shows error state on failure
- [ ] Successful deletion navigates to LoginScreen with cleared nav stack
- [ ] Module list screen has accessible "Delete Account" trigger
- [ ] No changes to WebView, module loading, local HTTP server, or React bundles
- [ ] `flutter build ios --no-codesign` completes without errors

## Out Of Scope
- Backend API endpoint creation (developer's responsibility — document the expected endpoint)
- Deleting module bundles from CDN (those are shared resources)
- Settings screen (Phase 06 — will also link to deletion)
- Any changes to WebView or module system

## Test Commands
```bash
# Verify files exist
test -f foundry-app/flutter/lib/widgets/delete_account_dialog.dart && echo "Dialog PASS" || echo "Dialog FAIL"

# Verify AuthService has deleteAccount
grep -q "deleteAccount" foundry-app/flutter/lib/services/auth_service.dart && echo "Method PASS" || echo "Method FAIL"

# Verify re-authentication handling
grep -q "reauthenticate\|EmailAuthProvider" foundry-app/flutter/lib/services/auth_service.dart && echo "Reauth PASS" || echo "Reauth FAIL"

# Verify module list screen references deletion
grep -q "delete\|Delete" foundry-app/flutter/lib/screens/module_list_screen.dart && echo "Trigger PASS" || echo "Trigger FAIL"

# Verify navigation to login on success
grep -q "LoginScreen" foundry-app/flutter/lib/widgets/delete_account_dialog.dart && echo "Nav PASS" || echo "Nav FAIL"

# Verify Flutter build
cd foundry-app/flutter && flutter build ios --no-codesign 2>&1 | tail -5
```

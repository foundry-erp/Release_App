# Phase 05 — Add Native Flutter Dashboard Screen

## Why This Exists
Apple Guideline 4.2 (Minimum Functionality) is the highest risk for this app. The current flow is: Login → Module List → WebView. Apple sees very little native Flutter UI, making the app look like a "web wrapper." Adding a native dashboard with real functionality significantly reduces 4.2 rejection risk by demonstrating native app value.

## Goal
Replace the flat module list with a rich native Flutter dashboard that shows user info, sync status, module cards, and connectivity state — proving to Apple reviewers that this is a real native app, not just a WebView shell.

## Core Architecture Constraint
DO NOT modify WebView logic, module loading, local HTTP server, React bundle handling, IndexedStack system, or the module_webview.dart. The dashboard is a NEW screen that sits BEFORE the module list. When a user taps a module card on the dashboard, it routes to the existing module system. The existing module loading pipeline stays 100% unchanged.

## Context — Current App Flow
```
main.dart → LoadingScreen → (auth check) → LoginScreen → LoadingScreen → ModuleListScreen → WebView
```

**Current ModuleListScreen** (`lib/screens/module_list_screen.dart`):
- Takes `List<ModuleEntry> modules` as parameter
- Starts local HTTP server
- Shows module cards in a ListView
- On module tap, shows WebView via IndexedStack
- Has logout button in AppBar

**Current LoadingScreen** (`lib/screens/loading_screen.dart`):
- Checks auth token validity
- Downloads/updates modules via ModuleDownloadService
- Routes to LoginScreen or ModuleListScreen

## What To Build

### Deliverable 1: Dashboard Screen
**Location:** `foundry-app/flutter/lib/screens/dashboard_screen.dart`

Create a new `DashboardScreen` StatefulWidget that replaces `ModuleListScreen` as the post-login landing page. It receives the same `List<ModuleEntry> modules` parameter.

**Layout (top to bottom):**

1. **AppBar:**
   - Title: "Foundry" (app name)
   - Leading: user avatar circle (first letter of email)
   - Actions: popup menu with "Settings" (placeholder for Phase 06), "Logout"

2. **User Welcome Card:**
   - Greeting: "Hello, {user_email}" (read from AuthService/FlutterSecureStorage)
   - Last sync time: "Last synced: {timestamp}" or "Never synced"
   - Connectivity indicator: green dot + "Online" or red dot + "Offline"
   - Use `connectivity_plus` stream for real-time status (same as existing code)

3. **Quick Stats Row:**
   - Number of available modules (from modules list length)
   - Sync status indicator (synced / pending)
   - Displayed as small cards in a Row

4. **Modules Section:**
   - Section header: "Your Modules"
   - Grid or List of module cards (reuse/adapt existing module card design)
   - Each card shows: module name, version, icon/color, brief description
   - Tapping a card navigates to the module WebView experience

5. **Bottom: Connectivity Banner** (optional)
   - Shows only when offline: "You're offline — data will sync when connected"
   - Yellow/amber warning style

**Theme:** Dark theme matching existing app (0xFF1A1A2E background, 0xFF6C63FF accent)

### Deliverable 2: Update Navigation Flow
**Files to modify:**
- `foundry-app/flutter/lib/screens/loading_screen.dart` — change route target from `ModuleListScreen` to `DashboardScreen`

**New flow:**
```
main.dart → LoadingScreen → (auth check) → LoginScreen → LoadingScreen → DashboardScreen → Module WebView
```

The DashboardScreen internally manages the transition to WebView modules. It should:
- Start the local HTTP server (move/copy this logic from ModuleListScreen)
- Use IndexedStack pattern (same as ModuleListScreen) for keeping WebViews alive
- OR navigate to a separate screen that wraps the WebView

**IMPORTANT:** The existing `ModuleListScreen` should NOT be deleted — it can remain as a fallback. The `DashboardScreen` takes over its entry-point role.

### Deliverable 3: Connectivity Service Extraction (Optional Optimization)
If connectivity monitoring logic is duplicated, extract it into a shared stream. But only if it simplifies the code — do NOT over-engineer.

## Acceptance Criteria
- [ ] DashboardScreen exists at `lib/screens/dashboard_screen.dart`
- [ ] Shows user email/greeting from secure storage
- [ ] Shows real-time connectivity status (online/offline)
- [ ] Displays all available modules as cards
- [ ] Tapping a module card opens the existing WebView module experience
- [ ] Local HTTP server starts correctly from the dashboard
- [ ] WebView modules work exactly as before after navigation
- [ ] AppBar has logout functionality (existing behavior preserved)
- [ ] LoadingScreen routes to DashboardScreen instead of ModuleListScreen
- [ ] Dark theme consistent with existing app
- [ ] No changes to WebView, module_webview.dart, local HTTP server logic, React bundles, or module download service
- [ ] `flutter build ios --no-codesign` completes without errors

## Out Of Scope
- Settings screen (Phase 06)
- Account deletion UI on dashboard (Phase 06 will add it via settings)
- Push notifications
- Any modifications to React modules or WebView bridge
- Changing how modules are loaded, served, or updated

## Test Commands
```bash
# Verify file exists
test -f foundry-app/flutter/lib/screens/dashboard_screen.dart && echo "Dashboard PASS" || echo "Dashboard FAIL"

# Verify it's the new entry point
grep -q "DashboardScreen\|dashboard_screen" foundry-app/flutter/lib/screens/loading_screen.dart && echo "Route PASS" || echo "Route FAIL"

# Verify connectivity integration
grep -q "connectivity\|ConnectivityResult" foundry-app/flutter/lib/screens/dashboard_screen.dart && echo "Connectivity PASS" || echo "Connectivity FAIL"

# Verify module display
grep -q "ModuleEntry\|modules" foundry-app/flutter/lib/screens/dashboard_screen.dart && echo "Modules PASS" || echo "Modules FAIL"

# Verify user info display
grep -q "email\|user" foundry-app/flutter/lib/screens/dashboard_screen.dart && echo "User info PASS" || echo "User info FAIL"

# Verify WebView integration preserved
grep -q "ModuleWebView\|WebView\|webview" foundry-app/flutter/lib/screens/dashboard_screen.dart && echo "WebView integration PASS" || echo "WebView FAIL"

# Verify Flutter build
cd foundry-app/flutter && flutter build ios --no-codesign 2>&1 | tail -5
```

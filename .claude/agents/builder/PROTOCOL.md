# BUILDER — PROTOCOL

## How Builder Is Spawned

### First Build Briefing (Cycle 1)

```
You are BUILDER.
agent_doc_version: {version}
Phase: {N} of {total} — {phase-name}
Cycle: 1
Scope: full_build
Input: {phase}/validator/validated.md (cycle 1)

Job:
  Read validated.md completely before writing any file.
  Build: deps → models → services → tests.
  Write checkpoints after each group.
  SELF_CHECK before writing built.md.
  Write built.md with confidence report.

Build only what is in validated.md.
If you need something not in validated.md → SELF_FAILURE.md, stop.
Do not touch any file outside your permitted write paths.
```

### Patch Build Briefing (Cycle 2+)

```
You are BUILDER.
agent_doc_version: {version}
Phase: {N} of {total} — {phase-name}
Cycle: {N}
Scope: patch
Input: {phase}/validator/validated.md (cycle {N})

Previous failure: {one sentence summary from test-report}
Failed tests: {FAIL-IDs}
Do NOT touch: {file list from patch.md do_not_touch}
What changed in spec: {patch.md spec_correction summary}

Job:
  Read only the changed sections of validated.md.
  Fix only what changed. Do not rebuild working components.
  Read checkpoints/ — skip already-completed steps.
  Update built.md to reflect the fix.
  SELF_CHECK before terminating.
```

## Builder Workflow

### Full Build (Cycle 1)

**Step 0: Pre-Build**
```
1. Read validated.md completely (never skim)
2. Extract:
   - File Manifest (what files to create)
   - Dependencies (what to install)
   - Deliverables (what functionality to build)
   - Phase Boundaries (what interfaces to implement)
   - Constraints (performance, security, format requirements)
   - Edge cases (what error handling to include)
3. Verify understanding before writing any file
```

**Step 1: Install Dependencies**
```
For each dependency in validated.md Dependencies section:
  Run exact install_command from spec
  Log command + exit code to build.log
  If exit code != 0:
    Write SELF_FAILURE.md with FAILURE_TYPE: ENVIRONMENTAL
    Stop (human must fix environment)

Write checkpoints/step-01-deps.md
Set DEPENDENCIES_READY: true
```

**Step 2: Create Data Models**
```
For each deliverable with type: model
  Create file at exact path from validated.md
  Implement interface from "interface" field
  Apply constraints from "constraints" field
  Handle edge cases from "edge_cases" field
  Log creation to build.log

Write checkpoints/step-02-models.md
Set MODELS_READY: true
```

**Step 3: Create Services/Logic**
```
For each deliverable with type: service | component
  Create file at exact path from validated.md
  Implement interface from "interface" field
  Use models from Step 2
  Apply constraints from "constraints" field
  Handle edge cases from "edge_cases" field
  Log creation to build.log

Write checkpoints/step-03-services.md
Set SERVICES_READY: true
```

**Step 4: Create Test Files**
```
For each deliverable:
  Create test file in tests/ directory
  Cover the acceptance criteria from validated.md
  Use exact test_commands where applicable
  Log creation to build.log

Write checkpoints/step-04-tests.md
SET TESTS_READY: true
```

**Step 4A: Build and Launch Verification (CRITICAL - NEW)**
```
Purpose: Verify the build actually works BEFORE claiming success.

Prevents claiming "Built successfully ✓" when app doesn't actually run.

Procedure:

For Flutter Apps:
  1. Run build:
     flutter build apk (for Android)
     OR flutter build windows (for Windows)
     OR flutter build web (for Web)

  2. Check build result:
     Exit code 0 → Build succeeded
     Exit code ≠ 0 → Build failed

  3. If build succeeded, attempt launch:
     flutter run -d {available-device}

  4. Observe launch (wait 60s max):
     ✓ App launches successfully → Continue to Step 5
     ✗ Gradle error → Write SELF_FAILURE.md (ENVIRONMENTAL)
     ✗ AndroidX issue → Write SELF_FAILURE.md (ENVIRONMENTAL)
     ✗ Java version → Write SELF_FAILURE.md (ENVIRONMENTAL)
     ✗ App crashes → Write SELF_FAILURE.md (DETERMINISTIC)

For Web/Node Apps:
  1. Run: npm run build
  2. If succeeds, run: npm start
  3. Check if server starts
  4. If fails → SELF_FAILURE.md

SELF_FAILURE.md Format:
  FAILURE_TYPE: ENVIRONMENTAL | SPEC_GAP
  PHASE_ID: {current-phase}
  STEP: launch_verification
  ISSUE: {exact error message}
  EVIDENCE: {build log, error trace}

  ROOT_CAUSE:
    "Built successfully but launch failed.
     Error: {specific error}
     This was not caught by specs."

  RECOMMENDED_ACTION:
    Route to VALIDATOR to add environment requirements
    OR Route to TESTER to verify on target environment

  DO_NOT_PROCEED: true

When SELF_FAILURE.md written:
  - Do NOT write built.md
  - Signal Orchestrator: BUILD_FAILED_AT_LAUNCH
  - Orchestrator reads SELF_FAILURE.md and routes accordingly

Only proceed to Step 5 if:
  ✓ Build succeeded AND
  ✓ Launch succeeded (or no device available to test)

Log in build.log:
  [LAUNCH_VERIFICATION]
  build_command: {command}
  build_result: SUCCESS | FAILED
  launch_attempted: true | false
  launch_command: {command}
  launch_result: SUCCESS | FAILED
  launch_error: {error if failed}
  device: {device-id or "none available"}
```

**Step 5: Self-Check**
```
Before writing built.md, verify:
  □ Every file in File Manifest exists on disk
  □ Every install command exited code 0
  □ No FATAL in build.log
  □ No file written outside src/ or tests/
  □ built.md has all required sections
  □ Deviations table present (even if empty)
  □ Confidence report has entry for every deliverable

Any failure:
  If spec gap → SELF_FAILURE.md
  If code error → fix and re-check
  Do not proceed until all checks pass
```

**Step 6: Write built.md**
```
Populate all required sections
For each deliverable:
  Assess confidence: HIGH | MEDIUM | LOW
  Document any assumptions in notes
Write built.md
Signal completion to Orchestrator
```

### Patch Build (Cycle 2+)

**Step 0: Understand Patch Scope**
```
Read briefing:
  - What failed in previous cycle
  - What changed in validated.md
  - What files must NOT be touched

Read patch.md builder_instruction:
  - file: exact path to modify
  - change: exactly what to change
  - do_not_touch: files that must remain unchanged

Determine scope: PARTIAL (targeted fix) or FULL (structural change)
```

**Step 1: Check Existing Checkpoints**
```
Read checkpoints/:
  step-01-deps.md → STATUS: COMPLETE? Skip dependencies.
  step-02-models.md → STATUS: COMPLETE? Skip models.
  step-03-services.md → STATUS: COMPLETE? Skip services.
  step-04-tests.md → STATUS: COMPLETE? Skip tests.

Only rebuild what changed or failed.
```

**Step 2: Apply Targeted Fix**
```
For PARTIAL scope:
  Modify only the files listed in patch.md
  Do NOT touch files in do_not_touch list
  Update affected test files only
  Do NOT rebuild working components

For FULL scope:
  May need to modify multiple files
  Still respect do_not_touch list
  Update checkpoints for modified stages
```

**Step 3: Self-Check**
```
Same self-check as full build
Verify fix addresses the failure from test-report.md
```

**Step 4: Update built.md**
```
Update BUILD_SCOPE: patch
Update BUILDER_CYCLE: {N}
Update Files Created if new files added
Update Deviations if introduced any
Update Confidence Report if changed
Keep all other sections intact
```

## Confidence Assessment Guidelines

### HIGH Confidence
Assign when:
- Validated.md was complete and unambiguous
- Built exactly as specified
- No assumptions made
- All constraints clear
- All edge cases specified

Example: "Built AuthService with exact interface from spec. All error codes, timeout values, and return types were specified."

### MEDIUM Confidence
Assign when:
- Made minor reasonable assumption
- Assumption is standard industry practice
- Risk is low if assumption is wrong

Example: "Assumed session TTL = 24 hours (not specified in validated.md). Standard practice for web apps. Easy to change if needed."

Document assumption in notes field.

### LOW Confidence
Assign when:
- Had to guess at important behavior
- Multiple valid interpretations existed
- Assumption has architectural impact

Example: "Spec says 'store securely' but doesn't specify mechanism. Implemented OS Keychain storage. Could also be encrypted file or database."

Orchestrator will PAUSE before Tester when LOW confidence exists.

## Handling Spec Gaps

### When to Write SELF_FAILURE.md

Write SELF_FAILURE.md instead of built.md when:

**SPEC_GAP**: Information needed to build is missing
```
Example: Spec says "validate email" but doesn't define validation rules.
Do you check DNS? Allow plus-addressing? Require specific domains?
```

**CONTRADICTION**: Two requirements conflict
```
Example: Deliverable 1 says "return User object"
          Deliverable 2 says "never expose user data in API"
          Cannot satisfy both.
```

**ENVIRONMENTAL**: Cannot proceed due to environment issue
```
Example: npm install fails with network error.
         Not a code issue — human must fix environment.
```

### SELF_FAILURE.md Format

```markdown
# Builder Self-Failure — Phase {N}
PHASE_ID: {phase-id}
BUILDER_CYCLE: {N}
TIMESTAMP: {iso}
FAILURE_TYPE: SPEC_GAP | ENVIRONMENTAL | CONTRADICTION

## What Blocked Me
Validated.md section "Email Validation" says "validate email" but does not
specify validation rules. Multiple interpretations exist.

## Where in Spec
Section: Deliverables → Email Validation Service
Deliverable: Email validation function

## What I Need to Proceed
Exact validation rules:
- Should we verify DNS records?
- Allow plus-addressing (user+tag@domain)?
- Require specific TLDs or allow all?
- Maximum length?

## What I Built Before Stopping
- src/models/User.ts: completed
- src/services/EmailService.ts: partial (stopped at validation function)

## Suggested Spec Fix
Add to validated.md Deliverables → Email Validation Service → constraints:
"Email validation rules:
 - Check format: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
 - Allow plus-addressing: yes
 - Verify DNS: no (performance constraint)
 - Max length: 254 characters (RFC 5321)"
```

## What Builder Emits on Completion

### Success — Full Build (Exit 0):
- All files in File Manifest created in src/ or tests/
- All dependencies installed (exit code 0)
- Checkpoints written for all four stages
- built.md with all required sections
- Confidence report with at least one entry
- build.log documenting all actions

### Success — Patch Build (Exit 0):
- Modified files updated
- Affected test files updated
- Checkpoints updated for modified stages
- built.md updated (BUILD_SCOPE: patch)
- build.log documenting patch actions

### Blocked — Spec Gap (Exit 1):
- SELF_FAILURE.md written with exact gap description
- Partial work checkpointed
- Orchestrator routes to Validator (not Tester)
- No built.md written

### Blocked — Environmental (Exit 1):
- SELF_FAILURE.md written with FAILURE_TYPE: ENVIRONMENTAL
- Exact error message and command included
- Orchestrator pauses for human fix
- No built.md written

## Builder Self-Check Protocol

Before writing built.md, run this checklist:

```markdown
FILE CHECKS:
□ Every file in validated.md File Manifest exists on disk
□ Every file is in src/ or tests/ (no files outside these)
□ No file is empty (if spec said create it, it must have content)

DEPENDENCY CHECKS:
□ Every install command in build.log shows exit code 0
□ Every package in validated.md Dependencies is installed

BUILD LOG CHECKS:
□ No FATAL errors in build.log
□ No ERROR entries that were not resolved
□ Checkpoint markers present for all four stages

SCHEMA CHECKS:
□ built.md has all required sections
□ Files Created table is not empty
□ Deviations table is present (even if empty)
□ Confidence report has entry for every deliverable
□ What Next Phase Can Use matches next phase's inputs (if not final phase)

CONTENT CHECKS:
□ Every deliverable in validated.md has been built
□ Every "How To Reach" entry is copy-pasteable
□ Every confidence level has supporting notes (MEDIUM/LOW)
```

Any check fails:
- If fixable (code issue) → fix and re-check
- If spec gap → write SELF_FAILURE.md instead
- Do not write built.md until all checks pass

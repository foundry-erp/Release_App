# TESTER — PROTOCOL

## How Tester Is Spawned

### Phase Test Briefing

```
You are TESTER.
agent_doc_version: {version}
Phase: {N} of {total} — {phase-name}
Cycle: {N}
Spec: {phase}/validator/validated.md
Build contract: {phase}/builder/built.md

Job:
  Run the exact test_commands from validated.md ACs — verbatim.
  Do not interpret criteria. Run the commands as written.
  Classify every failure by type.
  Always write HOW_TO_RUN, MANUAL_TESTS, PHASE_ACHIEVEMENT — even if all pass.
  Do not fix. Do not suggest. Report only.
```

### Final Integration Test Briefing

```
You are TESTER.
agent_doc_version: {version}
Run type: final_integration_test
Scope: e2e_only — cross-phase full system
Completed phases: {list}
HOW_TO_RUN (aggregated from all built.md files): {combined instructions}

Job:
  Start the complete application using aggregated HOW_TO_RUN.
  Run E2E flows that cross phase boundaries only.
  Do not re-run unit or integration tests from individual phases.
  Write INTEGRATION_TEST_REPORT.md using same schema as test-report.md.
  Add FLOW_COVERAGE table:
    | flow | phases_involved | status | failed_at_boundary |
  If failure: identify exactly which phase boundary broke.
```

## Tester Workflow

### Phase-Level Testing

**Step 0: Pre-Test Setup**
```
1. Read validated.md completely
   - Extract all test_commands from ACs
   - Extract all pass_conditions
   - Note all edge cases to verify

2. Read built.md
   - Extract HOW_TO_RUN (how to start app)
   - Extract "How To Reach Each Deliverable" (API/import paths)
   - Note any deviations or known limitations

3. Verify test files exist
   - If missing for a layer → prepare to scaffold
```

**Step 1: Start Application**
```
Follow exact HOW_TO_RUN from built.md
Log startup output
Verify application is running before starting tests
If startup fails:
  Classify as ENVIRONMENTAL
  Write test-report.md with OVERALL_STATUS: FAIL
  Stop (do not run tests against non-running app)
```

**Step 2: Layer 1 — Unit Tests**
```
Run all test files in tests/unit/
Use test_commands from validated.md where specified
Timeout: 30s (from config.yaml)

For each test:
  result = PASS | FAIL
  if PASS: log one line to Passed Tests
  if FAIL: create FAIL-{ID} block with all seven fields

If any P0 failure:
  Set OVERALL_STATUS: FAIL
  Classify failure type
  Set layers 2-4 status: SKIPPED
  Jump to Step 7 (write report)

If only P1 failures or all pass:
  Continue to Step 3
```

**Step 3: Layer 2 — Integration Tests**
```
Run all test files in tests/integration/
Timeout: 60s (from config.yaml)

Same procedure as Layer 1

If any P0 failure:
  Set layers 3-4 status: SKIPPED
  Jump to Step 7
```

**Step 4: Layer 3 — E2E Tests**
```
Run all test files in tests/e2e/
Timeout: 180s (from config.yaml)

Same procedure as Layer 1

If any P0 failure:
  Set layer 4 status: SKIPPED
  Jump to Step 7
```

**Step 5: Layer 4 — Performance Tests**
```
Run performance tests against constraints from validated.md
Timeout: 90s (from config.yaml)

Performance failures are NON-BLOCKING:
  Log them in Failed Tests
  Set severity: P1
  Do not stop phase even if all performance tests fail
```

**Step 5A: Launch Verification (CRITICAL - NEW)**
```
Purpose: Verify the app actually launches in real environment, not just builds.

This step prevents false-positive "PASS" when app builds but doesn't launch.

Procedure:

For Flutter Apps:
  1. Check available devices:
     flutter devices

  2. Select best available device (in order of preference):
     - Android emulator (if available)
     - Windows desktop (if available)
     - Chrome browser (fallback)

  3. Execute launch:
     flutter run -d {device-id} --verbose

  4. Wait up to 60 seconds for launch

  5. Observe result:
     ✓ App launches, UI visible → LAUNCH: PASS
     ✗ Gradle/build error → LAUNCH: FAIL (ENVIRONMENTAL)
     ✗ App crashes on start → LAUNCH: FAIL (DETERMINISTIC)
     ✗ Timeout (no UI) → LAUNCH: FAIL (ENVIRONMENTAL)

  6. Capture evidence:
     - Screenshot (if possible)
     - Console log (last 50 lines)
     - Error message (if any)

For Web/Node Apps:
  1. Execute: npm start
  2. Wait for "Server running" or equivalent
  3. Check http://localhost:{port}
  4. If loads → LAUNCH: PASS
  5. If crashes → LAUNCH: FAIL (capture error)

Classification:
  - Gradle version error → ENVIRONMENTAL
  - AndroidX migration needed → ENVIRONMENTAL
  - Java compatibility issue → ENVIRONMENTAL
  - Missing dependency → DETERMINISTIC
  - Null pointer exception → DETERMINISTIC
  - Configuration error → SPEC_GAP

CRITICAL RULE:
  If Launch Verification FAILS:
    - Set OVERALL_STATUS: FAIL
    - All ACs claiming "app launches" = FAIL
    - Write detailed failure in test-report.md
    - Include LAUNCH_VERIFICATION section with exact error

  Only claim "AC-{shell-launch}: PASS" if app ACTUALLY launches.

Log in test-report.md:
  LAUNCH_VERIFICATION:
    attempted: true
    device: {device-id}
    result: PASS | FAIL
    time_to_launch_ms: {number}
    error_if_failed: {exact error message}
    screenshot: {path or "not captured"}
```

**Step 6: Verify Acceptance Criteria**
```
For each AC in validated.md:
  Find test(s) that verified it
  If no test verified it:
    Either scaffold a minimal test now, or
    Mark as SCAFFOLDED in report

Build AC Coverage table
```

**Step 7: Write Test Report**
```
Populate all required sections
Set OVERALL_STATUS: PASS | FAIL
Set FAILURE_TYPE based on failures
Write test-report.md
```

**Step 8: Write Manual Test Guide (NEW)**
```
Purpose: Provide comprehensive manual testing instructions for end user

Generate MANUAL_TEST_GUIDE.md with:
  - Step-by-step testing instructions
  - Expected results for each step
  - Full AC checklist from validated.md
  - Troubleshooting guide for common errors
  - Test results template (copy-pasteable)
  - Phase completion criteria
  - Feedback instructions (how to use ./feedback.sh)

Format:
  - Absolute paths (not relative)
  - Copy-pasteable commands
  - Visual descriptions of expected UI/behavior
  - Classification hints for common failures

Write to: {phase}/tester/MANUAL_TEST_GUIDE.md
Signal completion to Orchestrator
```

### Final Integration Testing

**Step 0: Design Cross-Phase Flows**
```
Read each completed phase's PHASE_ACHIEVEMENT
Identify user journeys that span multiple phases

Example:
  Phase 1 achievement: "User can register and log in"
  Phase 2 achievement: "User can view personalized dashboard"
  Phase 3 achievement: "User can export data to CSV"

  Cross-phase flows:
    1. Register → Login → Dashboard (phases 1, 2)
    2. Login → Dashboard → Export (phases 1, 2, 3)
    3. Register → Dashboard → Export (phases 1, 2, 3)
```

**Step 1: Start Complete Application**
```
Aggregate HOW_TO_RUN from all built.md files
Start entire application stack
Verify all services are running
```

**Step 2: Execute Cross-Phase Flows**
```
For each flow:
  Run E2E test that crosses phase boundaries
  Do NOT re-run individual phase unit/integration tests
  Focus on interface boundaries between phases

  If flow fails:
    Identify exactly which phase boundary broke
    Determine which interface contract was violated
```

**Step 3: Write Integration Report**
```
Write INTEGRATION_TEST_REPORT.md
Include FLOW_COVERAGE table
If failure: specify failed_at_boundary precisely
Map failure to specific interface mismatch
```

## Failure Classification Protocol

### How to Classify Each Failure

**DETERMINISTIC Classification Criteria:**
```
✓ Same error message every run
✓ Points to specific line number
✓ Reproducible without any code change
✓ Error makes sense given the code

Example: "TypeError: Cannot read property 'email' of undefined at User.ts:47"
```

**SPEC_GAP Classification Criteria:**
```
✓ Code implements what spec said
✓ Spec simply didn't cover this scenario
✓ No line of code is technically "wrong"
✓ Adding spec detail would fix it

Example: Spec said "validate email", code validates format,
         but test fails because spec didn't define what "valid" means
```

**ENVIRONMENTAL Classification Criteria:**
```
✓ Error before application code executes
✓ Infrastructure/system issue
✓ Code changes cannot fix it

Examples:
  - "EADDRINUSE: Port 3000 already in use"
  - "ENOENT: .env file not found"
  - "npm ERR! network request failed"
  - "ECONNREFUSED: database connection refused"
```

**FLAKY Classification Criteria:**
```
✓ Passed in a previous run with identical code
✓ Non-deterministic (sometimes pass, sometimes fail)
✓ Often timing or race condition related

Example: Test passed in cycle 1, failed in cycle 2 with no code change.
         Re-running the exact same test passes.
```

### If Multiple Failure Types Exist

When test-report.md has multiple failures of different types:

```
Count failures by type:
  DETERMINISTIC: 3
  SPEC_GAP: 1
  ENVIRONMENTAL: 0
  FLAKY: 1

Set top-level FAILURE_TYPE to most common: DETERMINISTIC

Each individual FAIL-{ID} block still has its own failure_type.
```

## Test Scaffolding Protocol

### When to Scaffold

Scaffold minimal tests when:
- Test layer directory exists but is empty
- Test file exists but has no tests for a deliverable
- AC specifies test_command but no test file implements it

### What to Scaffold

Create minimal test that:
1. Uses exact test_command from validated.md
2. Checks exact pass_condition
3. Does nothing more (not comprehensive — just functional)

### Scaffolding Example

**validated.md says:**
```
AC-2.3: Email validation rejects invalid formats
  test_command: npm test -- EmailService.validateEmail
  pass_condition: exit code 0 and output contains "✓ rejects invalid email"
```

**Scaffold this:**
```javascript
// tests/unit/EmailService.test.ts
import { EmailService } from '../../src/services/EmailService';

describe('EmailService', () => {
  test('rejects invalid email', () => {
    const result = EmailService.validateEmail('not-an-email');
    expect(result.valid).toBe(false);
  });
});
```

**Do NOT scaffold comprehensive tests:**
```javascript
// DON'T DO THIS in scaffolding:
describe('EmailService', () => {
  test('rejects invalid email', () => { ... });
  test('accepts valid email', () => { ... });
  test('handles null input', () => { ... });
  test('handles empty string', () => { ... });
  test('validates international domains', () => { ... });
  // ... 15 more test cases
});
```

Scaffolding is minimal. Comprehensive tests are Builder's job for next cycle.

### Logging Scaffolded Tests

In test-report.md:
```markdown
## Scaffolded Tests
- SCAFFOLDED: tests/unit/EmailService.test.ts
  AC-2.3 had no existing test coverage.
  Created minimal test using test_command from validated.md.
```

## What Tester Emits on Completion

### Phase Test — All Pass (Exit 0):
```
test-report.md with:
  OVERALL_STATUS: PASS
  FAILURE_TYPE: none
  All four layers: status ✅ PASS
  Passed Tests: full list
  Failed Tests: (empty section — still present)
  AC Coverage: all ✅ PASS
  HOW_TO_RUN: populated
  MANUAL_TESTS: populated

MANUAL_TEST_GUIDE.md with:
  Comprehensive step-by-step manual testing instructions
  Full AC checklist from validated.md
  Expected results for each step
  Troubleshooting guide
  Test results template
  Phase completion criteria
```

### Phase Test — Has Failures (Exit 0):
```
test-report.md with:
  OVERALL_STATUS: FAIL
  FAILURE_TYPE: {most common type}
  Execution Summary: shows which layer failed
  Failed Tests: FAIL-{ID} blocks with all seven fields
  AC Coverage: shows which ACs failed
  Scaffolded Tests: if any were created

MANUAL_TEST_GUIDE.md with:
  Same comprehensive guide as PASS case
  (User needs manual testing instructions regardless of automated test results)
  Includes troubleshooting for known failures from test-report.md
```

Note: Tester always exits 0 (success) because completing the report is success.
OVERALL_STATUS field indicates test results.

### Integration Test — Pass (Exit 0):
```
INTEGRATION_TEST_REPORT.md with:
  OVERALL_STATUS: PASS
  All flows: status ✅ PASS
  Cross-Phase Interface Issues: (empty — still present)
```

### Integration Test — Fail (Exit 0):
```
INTEGRATION_TEST_REPORT.md with:
  OVERALL_STATUS: FAIL
  FAILURE_TYPE: {type}
  Failed flow identified
  failed_at_boundary: exact phase boundary
  Cross-Phase Interface Issues: table showing mismatch
```

## Tester Self-Check Protocol

Before writing test-report.md, verify:

```markdown
SCHEMA CHECKS:
□ PHASE_ID matches current phase
□ TESTED timestamp present
□ TESTER_CYCLE correct
□ OVERALL_STATUS set to PASS or FAIL
□ FAILURE_TYPE set correctly (matches OVERALL_STATUS)

EXECUTION CHECKS:
□ All four layers in Execution Summary
□ Layer status: ✅ PASS | ❌ FAIL | ⏭ SKIPPED
□ Actual execution times recorded (not estimates)

FAILURE CHECKS (if OVERALL_STATUS = FAIL):
□ Every FAIL-{ID} has all seven required fields
□ Every failure_type is valid: DETERMINISTIC | SPEC_GAP | ENVIRONMENTAL | FLAKY
□ Every severity is P0 or P1
□ Every criterion_violated maps to an AC in validated.md

COVERAGE CHECKS:
□ AC Coverage table lists every AC from validated.md
□ Every AC has status and verified_by
□ Scaffolded tests logged if any were created

CONTENT CHECKS:
□ HOW_TO_RUN is copy-pasteable
□ MANUAL_TESTS has step-by-step instructions
□ PHASE_ACHIEVEMENT is present (one sentence)

MANUAL_TEST_GUIDE CHECKS (NEW):
□ MANUAL_TEST_GUIDE.md written to {phase}/tester/ directory
□ All ACs from validated.md have corresponding test steps
□ Step-by-step instructions use absolute paths
□ Commands are copy-pasteable (no placeholders)
□ Expected results described for each step
□ Test Results Template included
□ Troubleshooting section with common errors
□ Feedback instructions (./feedback.sh) included
```

Any check fails → fix that section → re-check → only write report when all pass.

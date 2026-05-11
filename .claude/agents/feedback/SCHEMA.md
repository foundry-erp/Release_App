# FEEDBACK — SCHEMA

## Files FEEDBACK Reads

### Always Read First (Context)
- `FINAL_SUMMARY.md` - What agents claimed they delivered
- `.claude/memory/RUN_STATE.md` - Last known orchestrator state
- `.claude/memory/AGENT_TRACE.md` - Full agent execution history
- `PHASE_INDEX.md` - Which phases completed

### Read for Classification (Phase-Specific)
- `{phase}/validator/validated.md` - What was specified
- `{phase}/builder/built.md` - What was actually built
- `{phase}/tester/test-report.md` - What tests passed during build
- `{phase}/planner/plan.md` - Original phase plan

### Read for Pattern Detection
- `FEEDBACK_HISTORY.md` - Previous feedback reports
- `SANITY_VIOLATIONS.md` - Known issues flagged during build

## Files FEEDBACK Writes

### Primary Output: FEEDBACK_REPORT.md

```markdown
# FEEDBACK REPORT — FB-{N}

FEEDBACK_ID: FB-{001}
TIMESTAMP: {iso-8601}
PHASE_AFFECTED: phase-{N}-{name} | UNKNOWN | CROSS_PHASE | SYSTEM_WIDE
CYCLE: post-delivery-{N}
STATUS: CLASSIFIED | ROUTED | RESOLVED | ESCALATED

---

## Human Input (Verbatim)

### What I Did
{Exact text from human, unedited}

### What I Expected
{Exact text from human, unedited}

### What Happened Instead
{Exact text from human, unedited}

### Error Message or Screenshot
{Paste of log/error or description of visual issue}
{If none: "None provided"}

---

## FEEDBACK Classification

### Root Cause Type
{ONE of: DETERMINISTIC | SPEC_GAP | ENVIRONMENTAL | UX_GAP | ARCHITECTURE_GAP | AGENT_PROMPT_GAP}

### Confidence Level
{HIGH | MEDIUM | LOW}

### Reasoning
{2-4 sentences explaining why this classification}

Example:
"Classification: DETERMINISTIC
Confidence: HIGH
Reasoning: User reports consistent crash on login button tap. Error log shows
NullPointerException in AuthService.authenticate() when password field is empty.
This is a code bug that should have been caught by edge case testing but wasn't.
Not a spec issue (spec says 'validate input'), not environmental (same error
would occur in any environment). Clear case for REVIEWER to root-cause and patch."

### Evidence from Build Artifacts
- validated.md said: {relevant quote}
- built.md claimed: {relevant quote}
- test-report.md showed: {relevant test result}
- Gap: {what was missed}

---

## Routing Decision

### Route To
{planner | validator | builder | tester | reviewer | orchestrator | ESCALATE_TO_HUMAN}

### Action Type
{patch | re-plan | re-validate | re-build | re-test | agent-improvement | architecture-change}

### Briefing for Agent
```
You are {AGENT_NAME}.
agent_doc_version: 6.0.0
Phase: {N} of {total} — {name}
Cycle: post-delivery-{N}
Run type: feedback-driven-fix
Source: FEEDBACK_REPORT.md FB-{N}

Context:
  Human tested the delivered system and found: {summary}
  This was classified as: {ROOT_CAUSE_TYPE}

Problem:
  {Specific description of what's wrong}

Job:
  {Exact task for this agent}

Constraints:
  - DO NOT modify: {list of working components}
  - DO verify: {list of regression tests}
  - DO test: {specific test case that will prove fix}

See: FEEDBACK_REPORT.md FB-{N} for complete context.
```

### Do Not Touch
- {file1}: Working correctly, referenced by other phases
- {file2}: User confirmed this works
- {component3}: Dependencies rely on current interface

### Regression Tests Required
- [ ] AC-{id}: {description} - Must still pass
- [ ] Manual test: {description} - User will re-verify this

---

## If ARCHITECTURE_GAP or AGENT_PROMPT_GAP

### Gap Description
{What class of problem does NO existing agent handle?}

Example:
"No agent verifies the app actually launches on user's real device after delivery.
TESTER only runs tests in build environment (flutter test, npm test).
BUILDER only verifies build succeeds (flutter build).
Neither agent ever runs 'flutter run' or 'npm start' to verify app launches.

This gap means: Agents can say 'done' when app builds but doesn't launch.
User discovers this only during manual testing.
This is SYSTEMIC, not a one-time bug."

### Proposed Improvement

**If AGENT_PROMPT_GAP:**
```markdown
AFFECTS_AGENT: {which agent}
CHANGE_TYPE: ROLE | SCHEMA | PROTOCOL | NEW_STEP

Current behavior:
{What agent does now}

Proposed change:
{What agent should do instead}

Example:
AFFECTS_AGENT: TESTER
CHANGE_TYPE: PROTOCOL
Current: TESTER runs test_commands from validated.md (flutter test, npm test)
Proposed: Add PROTOCOL step "Launch Verification":
  - After all tests pass
  - Run: flutter run -d {available-device}
  - Verify: App launches without crash
  - Capture: Screenshot or log of running app
  - Only claim AC-{shell-launch} PASS if app actually launches
```

**If ARCHITECTURE_GAP:**
```markdown
GAP_CLASS: {what's missing from entire system}
SEVERITY: CRITICAL | HIGH | MEDIUM
FREQUENCY: {how often will this gap cause problems}

Proposed solution:
{New agent | New orchestrator rule | New phase | New validation step}

Example:
GAP_CLASS: Post-delivery environment verification
SEVERITY: CRITICAL
FREQUENCY: Every project (users always test in different env than build)

Proposed: New agent "DEPLOYER" or new TESTER step:
  Before claiming phase complete:
    1. Build succeeds ✓
    2. Tests pass ✓
    3. App launches on target device ✓ (NEW)
  Only then: Phase complete
```

### Approval Required
{YES - human must approve before modifying agent architecture}

---

## Next Steps

### For Orchestrator
- [ ] Read this FEEDBACK_REPORT.md
- [ ] Spawn {AGENT_NAME} with briefing above
- [ ] After agent completes, write FEEDBACK_RESOLUTION.md

### For Human
- [ ] Wait for FEEDBACK_RESOLUTION.md
- [ ] Follow "Verification Steps" to re-test
- [ ] Report: RESOLVED | STILL_BROKEN | REGRESSED_SOMETHING_ELSE
```

---

## FEEDBACK_RESOLUTION.md

Written by FEEDBACK agent AFTER the fix cycle completes.

```markdown
# FEEDBACK RESOLUTION — FB-{N}

FEEDBACK_ID: FB-{001}
ORIGINAL_REPORT: FEEDBACK_REPORT.md FB-001
RESOLUTION_TIMESTAMP: {iso-8601}
STATUS: RESOLVED | PARTIAL | UNRESOLVED | REGRESSION_DETECTED

---

## What Was Done

### Agent Spawned
{agent-name} - Cycle: post-delivery-{N}

### Changes Made
- File: {path}
  - Change: {description}
  - Reason: {why this fixes the reported issue}

- Test added: {test-file}
  - Purpose: {prevent this regression}

### Test Results
- {test-name}: PASS ✓
- {test-name}: PASS ✓
- Regression tests: ALL PASS ✓

---

## Verification Steps for Human

Please re-test using these EXACT steps:

1. {Step 1 - specific action}
   - Expected: {specific observable result}
   - If different: Report to feedback.sh as FB-{N+1}

2. {Step 2}
   - Expected: {result}

3. {Step 3}
   - Expected: {result}

### Regression Check

Also verify these still work (should be unchanged):

- [ ] {Feature 1}: {how to verify}
- [ ] {Feature 2}: {how to verify}

---

## If Still Broken

Run: ./feedback.sh

And reference FB-{N} (this report).

If same issue persists after fix attempt, FEEDBACK will escalate to
ARCHITECTURE_GAP (the fix approach isn't working, deeper issue exists).

---

## If Resolved

Confirm by updating this file:

```bash
echo "STATUS: RESOLVED" >> FEEDBACK_RESOLUTION.md FB-{N}
echo "VERIFIED_BY: {your-name}" >> FEEDBACK_RESOLUTION.md FB-{N}
echo "VERIFIED_AT: $(date -Iseconds)" >> FEEDBACK_RESOLUTION.md FB-{N}
```

Then: Ship it 🚀
```

---

## FEEDBACK_HISTORY.md

Append-only log of all feedback. Used for pattern detection.

```markdown
# Feedback History Log

FB-001 | 2026-03-12 | DETERMINISTIC | Login crash | RESOLVED | REVIEWER→fix
FB-002 | 2026-03-12 | ENVIRONMENTAL | Windows crash | RESOLVED | TESTER→env-test
FB-003 | 2026-03-13 | DETERMINISTIC | Login crash | UNRESOLVED | Same as FB-001
       ↑ PATTERN DETECTED: Same component failing twice → ARCHITECTURE_GAP
FB-004 | 2026-03-13 | AGENT_PROMPT_GAP | TESTER missed | ESCALATED | TESTER→improved
```

---

## AGENT_IMPROVEMENT_PROPOSAL.md

Written when AGENT_PROMPT_GAP detected.

```markdown
# Agent Improvement Proposal

PROPOSAL_ID: AIP-{001}
TRIGGERED_BY: FB-{N}
AGENT_AFFECTED: {agent-name}
SEVERITY: CRITICAL | HIGH | MEDIUM | LOW
STATUS: PROPOSED | APPROVED | IMPLEMENTED | REJECTED

---

## Problem Pattern

{Description of what the agent repeatedly misses}

Example:
"TESTER runs test_commands from validated.md (flutter test, npm test)
but never runs the app (flutter run, npm start) to verify it launches.

This causes agents to claim 'AC-1.1: Shell launches ✓' when build succeeds,
but app crashes on actual launch.

This has occurred in:
- FB-003 (Gradle version error on launch)
- FB-007 (AndroidX migration needed)
- FB-012 (Missing dependency at runtime)

All cases: flutter build succeeded, flutter run failed.
TESTER never ran flutter run."

---

## Current Agent Behavior

File: .claude/agents/{agent}/PROTOCOL.md
Section: {section-name}

Current:
```
Step 1: Run test_commands
  - flutter test
  - npm test
Step 2: Check exit codes
Step 3: Write test-report.md
```

Gap: No step to actually launch the app.

---

## Proposed Change

File: .claude/agents/tester/PROTOCOL.md
Section: After Step 4 (Layer 4 - Performance Tests)

Add new step:
```
Step 5: Launch Verification

Purpose: Verify app actually launches in real environment, not just builds.

For Flutter apps:
  1. Check available devices: flutter devices
  2. If device available:
     - Run: flutter run -d {device-id}
     - Timeout: 60s
     - Expected: App launches, no crash
     - Capture: First-frame screenshot or log
  3. If launches: AC-{shell-launch} = PASS
  4. If crashes: AC-{shell-launch} = FAIL (ENVIRONMENTAL)
     - Capture exact error
     - Classify failure (Gradle? AndroidX? Dependency?)

For Node/Web apps:
  1. Run: npm start
  2. Wait for "Server running" or equivalent
  3. If starts: AC-{app-starts} = PASS
  4. If crashes: AC-{app-starts} = FAIL
```

---

## Impact Analysis

### Phases Affected
- All phases with shell/app launch acceptance criteria

### Backward Compatibility
- Existing test_commands still run
- This is ADDITIVE, not breaking
- Old test-report.md schema still valid

### Risk
- LOW: Only adds verification, doesn't change existing logic
- Could increase test time by ~60s per phase

### Benefit
- HIGH: Catches entire class of "builds but doesn't launch" failures
- Prevents false-positive "Phase complete" when app doesn't work

---

## Approval Required

□ ORCHESTRATOR review (does this fit protocol?)
□ HUMAN approval (is this change wanted?)
□ If approved:
  - Update .claude/agents/tester/PROTOCOL.md
  - Update AGENT_DOC_VERSION to {new-version}
  - Re-run affected phases with new protocol

---

## Implementation

Once approved:

1. Edit .claude/agents/tester/PROTOCOL.md
2. Add "Step 5: Launch Verification" after performance tests
3. Update AGENT_DOC_VERSION in config.yaml
4. Update TESTER's ROLE.md to mention launch verification
5. Re-run any phase where this gap caused false-positive completion
```

---

## Schema Validation Rules

Before writing any FEEDBACK_REPORT.md, FEEDBACK must verify:

- [ ] FEEDBACK_ID is unique (check FEEDBACK_HISTORY.md)
- [ ] ROOT_CAUSE_TYPE is one of the six valid types
- [ ] CONFIDENCE is HIGH/MEDIUM/LOW (not a number)
- [ ] Routing decision includes complete briefing (not just agent name)
- [ ] DO_NOT_TOUCH list is populated (prevent regressions)
- [ ] If ARCHITECTURE_GAP or AGENT_PROMPT_GAP: proposal section is complete
- [ ] Human input is copied verbatim (no paraphrasing)
- [ ] Evidence section quotes actual build artifacts

Any missing field = FEEDBACK pauses and asks human for clarification.

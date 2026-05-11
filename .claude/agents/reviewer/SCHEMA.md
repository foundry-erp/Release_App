# REVIEWER — SCHEMA

## Files Reviewer Reads

### Phase-Level Patch
- {phase}/tester/test-report.md (failures to analyze)
- {phase}/validator/validated.md (current spec — to identify gaps)

### Integration-Level Patch
- INTEGRATION_TEST_REPORT.md (cross-phase failures)
- All involved phases' validated.md files (to identify boundary issues)

## Files Reviewer Writes

### patch.md — Patch Instructions for Validator and Builder

```markdown
# Patch — Phase {N}: {Descriptive Name}
PHASE_ID: {phase-id}
PATCH_CYCLE: {1|2|3}
REVIEWER_DOC_VERSION: {agent_doc_version}
SOURCE_REPORT: {phase}/tester/test-report.md | INTEGRATION_TEST_REPORT.md

## Patch Instructions

### PATCH-001
failure_reference: FAIL-001
failure_type: DETERMINISTIC | SPEC_GAP
root_cause: {actual cause, not the symptom}

spec_correction:
  section: {which section of validated.md}
  change: {exact change — Validator does not interpret, it applies}

builder_instruction:
  file: {exact path}
  change: {exactly what to change}
  do_not_touch: [{files that must not change}]

verify_with: {exact test_command from AC that must now pass}

### PATCH-002
[...same format for each failure...]

## Scope Assessment
files_needing_changes: [list of files]
files_that_must_not_change: [list of files]
rebuild_scope: PARTIAL | FULL
plan_gap_detected: true | false
# true = structural gap in original plan.md, not just an implementation error
# Orchestrator re-triggers PLANNER re-plan when true

## Plan Gap Analysis (if plan_gap_detected: true)
gap_description: {what structural issue was found}
affected_phases: [list of phase-ids that need re-planning]
why_gap_not_patchable: {why this can't be fixed with just a patch}
recommended_planner_action: {what Planner should do in re-plan mode}
```

## Required Sections in patch.md

All sections in the template are REQUIRED.
Missing any section = patch incomplete = schema failure.

## Patch Instruction Format

Each PATCH-{ID} must have all seven fields:

**failure_reference**
- Maps to FAIL-{ID} from test-report.md
- Ensures traceability

**failure_type**
- DETERMINISTIC: code bug, spec was clear
- SPEC_GAP: spec was incomplete, code followed spec

**root_cause**
- The actual problem (not the symptom)
- Why the failure happened
- One clear sentence

**spec_correction**
- section: exact section name from validated.md
- change: exact text to add/modify/remove
- Validator applies this verbatim (no interpretation)

**builder_instruction**
- file: exact path to modify
- change: what to change (specific but not line-by-line code)
- do_not_touch: files that must remain unchanged

**verify_with**
- Exact test_command from validated.md AC
- This test must pass after patch applied
- Used by Tester to verify fix

## Scope Assessment Rules

### When to Use PARTIAL Scope

PARTIAL rebuild when:
- Only 1-2 files need changes
- No new dependencies
- No interface changes
- No changes to File Manifest
- Changes are localized to one deliverable

Example:
```
files_needing_changes: [src/services/SessionManager.ts]
files_that_must_not_change: [src/models/User.ts, src/services/AuthService.ts]
rebuild_scope: PARTIAL
```

### When to Use FULL Scope

FULL rebuild when:
- 3+ files need changes
- New dependencies required
- Interface contracts change
- File Manifest needs updates
- Changes affect multiple deliverables

Example:
```
files_needing_changes: [src/models/User.ts, src/services/AuthService.ts,
                        src/services/SessionManager.ts, src/types/auth.ts]
files_that_must_not_change: [src/utils/validation.ts]
rebuild_scope: FULL
```

## Plan Gap Detection Criteria

Set `plan_gap_detected: true` when:

**Criterion 1: Missing Deliverable**
```
Test fails because feature is needed but not in plan.md deliverables.
Example: OAuth callback handling needed but plan.md only listed basic login.
```

**Criterion 2: Wrong Phase Boundary**
```
Test fails because phase-1 provides X but phase-2 needs Y.
Example: Phase-1 provides username, Phase-2 needs full user object.
```

**Criterion 3: Missing Dependency**
```
Test fails because functionality requires phase that doesn't exist.
Example: Export feature needs data aggregation, but no phase builds that.
```

**Criterion 4: Repeated Patches in Same Area**
```
Same deliverable fails across 2+ cycles with different issues.
This suggests the deliverable was poorly scoped in plan.md.
```

**Criterion 5: Architectural Mismatch**
```
Test reveals that chosen architecture can't satisfy requirement.
Example: Requirement says "realtime updates", plan chose REST (no websockets).
```

## Plan Gap Analysis Format

When `plan_gap_detected: true`:

```markdown
## Plan Gap Analysis
gap_description: |
  Phase-2 deliverable "Dashboard" requires real-time notifications,
  but plan.md only allocated REST API endpoints (Phase-1).
  Websocket infrastructure is needed but not planned.

affected_phases: [phase-1-auth, phase-2-dashboard, phase-3-notifications]

why_gap_not_patchable: |
  Cannot add websockets to Phase-1 without breaking its completion status.
  Cannot add notification system to Phase-2 without exceeding phase scope.
  This requires a new Phase-3 for real-time infrastructure.

recommended_planner_action: |
  Insert new phase between current phase-2 and phase-3:
    New Phase-2.5: Real-time Infrastructure
      - WebSocket server setup
      - Event subscription system
      - Notification delivery
  Adjust phase-3 and beyond to account for new dependency.
```

## PATCH-{ID} Example (DETERMINISTIC)

```markdown
### PATCH-001
failure_reference: FAIL-001
failure_type: DETERMINISTIC
root_cause: SessionManager.createSession() does not set cookie expiration field

spec_correction:
  section: Deliverables → SessionManager → constraints
  change: Add "Session cookie must include expires field set to 24 hours from creation"

builder_instruction:
  file: src/services/SessionManager.ts
  change: |
    In createSession() method, set cookie expiration:
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      cookie.expires = expires;
  do_not_touch: [src/models/User.ts, src/services/AuthService.ts]

verify_with: npm test -- SessionManager.cookie-expiration
```

## PATCH-{ID} Example (SPEC_GAP)

```markdown
### PATCH-002
failure_reference: FAIL-002
failure_type: SPEC_GAP
root_cause: |
  Validated.md did not specify behavior for concurrent login attempts.
  Builder implemented single-session logic (reasonable default).
  Test expects multi-session support (also reasonable interpretation).

spec_correction:
  section: Deliverables → SessionManager → edge_cases
  change: |
    Add: "Concurrent access: Allow multiple simultaneous sessions per user.
          Each login creates independent session. Logout affects only current session."

builder_instruction:
  file: src/services/SessionManager.ts
  change: |
    Modify session storage from single-session to multi-session:
      - Change sessions Map key from userId to sessionId
      - Allow multiple sessionIds per userId
      - Ensure logout only clears current sessionId
  do_not_touch: [src/services/AuthService.ts, src/models/User.ts]

verify_with: npm test -- SessionManager.concurrent-logins
```

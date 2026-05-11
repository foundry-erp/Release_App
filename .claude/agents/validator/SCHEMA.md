# VALIDATOR — SCHEMA

## Files Validator Reads

### On First Run (Cycle 1)
- {phase}/planner/plan.md
- {phase}/planner/plan.interface-check.md

### On Patch Cycle (Cycle 2+)
- {phase}/planner/plan.md
- {phase}/reviewer/patch.md OR {phase}/tester/test-report.md (if SPEC_GAP)
- {phase}/validator/validated.md (current version)
- {phase}/validator/validated.md.cycle-1.bak (drift check baseline — ALWAYS cycle-1)

## Files Validator Writes

### validated.md — Builder's ONLY Input

```markdown
# Validated Spec — Phase {N}: {Descriptive Name}
PHASE_ID: {phase-id}
VALIDATED: {timestamp}
VALIDATOR_CYCLE: {1|2|3}
VALIDATOR_DOC_VERSION: {agent_doc_version}
DRIFT_CHECK_STATUS: NOT_APPLICABLE | CLEAN | DRIFT_DETECTED
# NOT_APPLICABLE: cycle 1 — no baseline exists yet
# CLEAN: compared against validated.md.cycle-1.bak — no drift found
# DRIFT_DETECTED: drift found and corrected — details in Validation Notes

## What To Build
{No vague terms. No "should", "fast", "clean", "handle errors". Only specifics.}

## Deliverables

### {Deliverable Name}
- type: file | service | component | config
- path: {exact path relative to project root}
- purpose: {one sentence}
- interface: {inputs, outputs, method signatures — exact types}
- constraints: {performance numbers, security rules, format requirements}
- edge_cases: {exhaustive list — bad input, empty state, timeout, concurrent access}

## File Manifest
| filepath | action | description |
|----------|--------|-------------|

## Acceptance Criteria
- [ ] AC-{n}.1
      criterion: {specific, measurable}
      test_command: {exact shell command — Tester runs this verbatim}
      pass_condition: {exact exit code or output string}
      blocking: true | false

## Dependencies
- name: {package}
  version: {exact version — no ranges, no "latest"}
  install_command: {exact command}

## Out Of Scope
What Builder must NOT build in this phase:
- {item}: deferred to {phase-name}

## Phase Boundaries

### Receives From Previous Phase
# Must match previous phase's built.md "What Next Phase Can Use" exactly.
# Orchestrator validates this before spawning Builder.
- {interface_name}: {exact type signature}

### Provides To Next Phase
# Feeds next phase's "Receives From Previous Phase".
- {interface_name}: {exact type signature}

## Manual Test Steps
1. {action} → Expected: {exact result}

## Phase Achievement
{One sentence.}

## Validation Notes
{Ambiguities resolved. Assumptions made. Q&A references. Drift corrections.}
```

### questions.md — Only exists when run is PAUSED

```markdown
# Validator Questions — Phase {N}
PHASE_ID: {phase-id}
VALIDATOR_CYCLE: {N}
GENERATED: {timestamp}
STATUS: WAITING_FOR_ANSWERS

## Question 1
SCOPE: [cross-phase] | [phase-local]
CONTEXT: {why this matters}
QUESTION: {clear, specific question}
OPTIONS:
  A) {specific choice 1}
     Impact: {what this means for the build}
  B) {specific choice 2}
     Impact: {what this means for the build}
  C) {specific choice 3}
     Impact: {what this means for the build}
DEFAULT_IF_NOT_ANSWERED: {which option you'll use if user says "proceed"}

## Question 2
[...same format...]
```

This file is appended to root-level QUESTIONS.md by Orchestrator.
Validator writes to {phase}/validator/questions.md.
Orchestrator copies to QUESTIONS.md and pauses the run.

## Required Sections in validated.md

Every section in the template above is REQUIRED.
Missing any section = validation incomplete = schema failure.

## Special Section Rules

### What To Build
- Minimum 50 words (semantic sanity check)
- No vague adjectives ("fast", "secure", "clean")
- Every technical term defined with exact meaning

### Deliverables
- At least one deliverable per phase
- Every deliverable must have all five sub-fields:
  - type, path, purpose, interface, constraints, edge_cases
- Path must be specific (not "/" or "." or project root)

### Acceptance Criteria
- At least one AC per deliverable
- Every AC must have all four sub-fields:
  - criterion, test_command, pass_condition, blocking
- test_command must NOT be: echo, true, exit 0, :, or any no-op
- test_command must NOT test its own test file (no self-reference)

### Out Of Scope
- Must never be empty
- Always explicit about what is NOT being built this phase
- Used for drift detection in cycle 2+

### Phase Boundaries
- "Receives From Previous Phase" must match previous phase's built.md exactly
  (Orchestrator validates this before spawning Builder)
- "Provides To Next Phase" must match next phase's plan.md exactly
  (Planner already checked this, Validator preserves it)

### Launch Verification Requirements (NEW)

For any phase that builds an app, shell, or service that launches:

**MUST include Launch Verification AC:**
```markdown
- [ ] AC-{N}.{X}: Application Launch Verification
      criterion: Built application launches successfully on target device without crash
      test_command: flutter run -d {device-id} (or npm start for web apps)
      pass_condition: exit code 0 AND app visible/server running within 60 seconds
      blocking: true
      environment: Specify target device/platform (e.g., Android API 21+, Windows 11, Chrome 120+)
```

**MUST include Environment Requirements:**
```markdown
## Environment Requirements
- Flutter SDK: 3.16.x or higher
- Java: JDK 17 or higher
- Gradle: 7.5 or higher (configured in gradle-wrapper.properties)
- Android SDK: API 21+ for minimum, API 34+ for target
- Node.js: 20.x LTS (for web runtime)
```

**MUST NOT use placeholder test commands:**
```
❌ test_command: echo "test passes"
❌ test_command: true
❌ test_command: exit 0

✓ test_command: flutter run -d emulator-5554
✓ test_command: npm start && curl http://localhost:3000
```

**Validation Rule:**
If validated.md is for a phase that creates an executable (app/shell/server):
  AND does NOT have Launch Verification AC
  → VALIDATION FAILS
  → Validator must add Launch Verification AC before proceeding

## Drift Check Algorithm (Cycle 2+ only)

```python
def check_drift():
    baseline = read_file("validated.md.cycle-1.bak")
    current = current_validated_md_draft

    issues = []

    # Check 1: Requirement coverage
    baseline_reqs = extract_requirements(baseline)
    current_reqs = extract_requirements(current)
    for req in baseline_reqs:
        if req not in current_reqs:
            issues.append(f"REQ-{req} dropped since cycle-1")

    # Check 2: AC count
    baseline_ac_count = count_acceptance_criteria(baseline)
    current_ac_count = count_acceptance_criteria(current)
    if current_ac_count < baseline_ac_count:
        issues.append(f"AC count decreased: {baseline_ac_count} → {current_ac_count}")

    # Check 3: Interface consistency
    baseline_outputs = extract_outputs_to_next_phase(baseline)
    current_outputs = extract_outputs_to_next_phase(current)
    if baseline_outputs != current_outputs and not patch_requires_interface_change():
        issues.append("Interface types changed without patch requirement")

    # Check 4: Scope creep
    baseline_out_of_scope = extract_out_of_scope(baseline)
    current_deliverables = extract_deliverables(current)
    for item in baseline_out_of_scope:
        if item in current_deliverables:
            issues.append(f"{item} was out of scope in cycle-1, now in scope")

    if issues:
        correct_drift(issues)
        set_drift_status("DRIFT_DETECTED")
        document_in_validation_notes(issues)
    else:
        set_drift_status("CLEAN")
```

## Validation Notes Section Format

```markdown
## Validation Notes

### Ambiguities Resolved
- "fast API" → "API responds in <200ms at p95"
- "secure storage" → "AES-256 encrypted via Node crypto module"

### Assumptions Made
- Database schema migrations: using Knex.js (standard for this stack)
- API error format: { error: string, code: number } (REST convention)

### Q&A References
- Q1 answered: authentication method = JWT (user chose option B)
- Q2 answered: session duration = 24 hours (user specified)

### Drift Corrections (Cycle 2+ only)
- DRIFT CORRECTED: AC-2.4 removed in patch cycle 2 — restored.
  Baseline: cycle-1.bak. Likely cause: REVIEWER patch too broad.
- DRIFT CORRECTED: deliverable "email queue" moved from Out Of Scope to in-scope.
  Cause: patch.md required it. Documented as intentional scope change.
```

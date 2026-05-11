# VALIDATOR — PROTOCOL

## How Validator Is Spawned

### First Run Briefing (Cycle 1)

```
You are VALIDATOR.
agent_doc_version: {version}
Phase: {N} of {total} — {phase-name}
Run type: first_run
Input: {phase}/planner/plan.md
Cycle: 1
validator_mode: {pause_and_ask | assume_and_log}

Job:
  Run checks 1-5 (ambiguity, assumptions, testability, edge cases, completeness).
  Set DRIFT_CHECK_STATUS: NOT_APPLICABLE
  Pause if you have questions — do not assume.
  Self-check your output before terminating.
  Write validated.md. Orchestrator will snapshot it as cycle-1.bak immediately.
```

### Patch Cycle Briefing (Cycle 2+)

```
You are VALIDATOR.
agent_doc_version: {version}
Phase: {N} of {total} — {phase-name}
Run type: on_patch
Input: {phase}/reviewer/patch.md | {phase}/tester/test-report.md (if SPEC_GAP)
Cycle: {N+1}
validator_mode: {pause_and_ask | assume_and_log}

IMPORTANT — DRIFT CHECK BASELINE:
  Compare your updated validated.md against:
  {phase}/validator/validated.md.cycle-1.bak
  NOT against the most recent cycle. Always cycle-1.
  This catches cumulative drift across multiple patch cycles.

Job:
  Apply patch instructions to validated.md.
  Run CHECK 6 — SPEC DRIFT against cycle-1.bak.
  Set DRIFT_CHECK_STATUS accordingly.
  Update VALIDATOR_CYCLE number.
  Orchestrator will snapshot before your write — you do not need to.
  Self-check before terminating.
```

## Validator Workflow

### First Run (Cycle 1)

**Step 1: Read Inputs**
1. Read {phase}/planner/plan.md completely
2. Read {phase}/planner/plan.interface-check.md to understand interfaces
3. Note all REQ-{id} items that must be covered

**Step 2: Run Checks 1-5**

*Check 1 — Resolve Ambiguity:*
```
Find: "fast", "secure", "clean", "handle errors", "robust", "scalable"
Replace with exact metrics:
  "fast" → "responds in <200ms at p95"
  "secure" → "AES-256 encrypted, stored in OS Keychain via keytar"
  "handle errors" → "returns { error: string, code: number } on failure"
```

*Check 2 — Identify Assumptions:*
```
For each unstated choice:
  - Can I infer from plan.md context? → Document in Validation Notes
  - Is it standard practice? → Use standard, document assumption
  - Is it ambiguous? → Add to questions.md
```

*Check 3 — Ensure Testability:*
```
For each acceptance criterion in plan.md:
  - Define exact test_command (shell command Tester will run)
  - Define exact pass_condition (exit code or output string)
  - Ensure test_command is NOT a no-op (echo, true, exit 0)
  - Ensure test_command does not test itself
```

*Check 4 — Cover Edge Cases:*
```
For each deliverable, ensure validated.md specifies:
  - Bad input: what happens with invalid data
  - Empty state: what happens with no data
  - Timeout: what happens if operation takes too long
  - Concurrent access: what happens with simultaneous requests
```

*Check 5 — Verify Completeness:*
```
For each REQ-{id} in plan.md:
  - Maps to at least one deliverable? ✓
  - Maps to at least one AC? ✓
  - Has path in File Manifest? ✓
```

**Step 3: Handle Questions**
```
If genuine ambiguity exists:
  Write {phase}/validator/questions.md
  Set STATUS: WAITING_FOR_ANSWERS
  Terminate (Orchestrator will pause run and append to QUESTIONS.md)

If validator_mode = assume_and_log:
  Make reasonable assumption
  Document in Validation Notes
  Log to DECISION_LOG.md
  Continue
```

**Step 4: Write validated.md**
```
Populate all required sections
Set DRIFT_CHECK_STATUS: NOT_APPLICABLE (cycle 1 has no baseline)
Set VALIDATOR_CYCLE: 1
```

**Step 5: Self-Check**
```
Before terminating, verify:
  □ All required sections present
  □ Every AC has test_command and pass_condition
  □ No test_command is a no-op
  □ File Manifest lists every deliverable
  □ Out Of Scope section present and not empty
  □ Phase Boundaries section with exact type signatures
  □ What To Build section > 50 words
  □ No placeholder text (TBD, TODO, etc.)

Any failure → fix that section, do not terminate until all pass
```

### Patch Cycle (Cycle 2+)

**Step 1: Read Patch Input**
```
If triggered by DETERMINISTIC failure:
  Read {phase}/reviewer/patch.md
  Focus on spec_correction section

If triggered by SPEC_GAP failure:
  Read {phase}/tester/test-report.md directly (Reviewer bypassed)
  Identify what the spec missed
```

**Step 2: Apply Patch**
```
For each spec_correction in patch.md:
  Locate section in validated.md
  Apply exact change (do not interpret)
  Update VALIDATOR_CYCLE number
```

**Step 3: Run Drift Check (CHECK 6)**
```
CRITICAL: Always compare against cycle-1.bak, NOT latest cycle

Read validated.md.cycle-1.bak (baseline — never overwritten)
Compare current draft against baseline:
  - Requirement coverage (no dropped REQs)
  - AC count (must be >= baseline)
  - Interface types (unchanged unless patch required)
  - Scope boundaries (no silent scope creep)

On drift found:
  Correct it
  Set DRIFT_CHECK_STATUS: DRIFT_DETECTED
  Document in Validation Notes:
    "DRIFT CORRECTED: {what drifted}
     Baseline: cycle-1.bak
     Likely cause: {reason}
     Action taken: {correction}"

On no drift:
  Set DRIFT_CHECK_STATUS: CLEAN
```

**Step 4: Self-Check and Write**
```
Run same self-check as cycle 1
Write updated validated.md
Orchestrator will snapshot before this write (cycle-N.bak)
```

## Question Handling Protocol

### When to Ask (Pause Run)

**Cross-phase questions** (affects multiple phases):
- Authentication method choice affects login, sessions, API
- Data model design affects storage, API, frontend
- Deployment strategy affects all phases

**Phase-local questions** (affects only current phase):
- UI component library choice
- Specific validation rule
- Error message format

### When NOT to Ask (Decide Autonomously)

**Standard practices:**
- HTTP status codes (use REST conventions)
- JSON response format (use industry standard)
- Password hashing (use bcrypt/argon2 — industry standard)

**Implementation details:**
- Variable names (Builder decides)
- Code organization (Builder decides)
- Internal function structure (Builder decides)

**Inferable from context:**
- If plan.md mentions "React app" → React component patterns apply
- If plan.md mentions "REST API" → REST conventions apply

### Question Format

```markdown
## Question {N}
SCOPE: [cross-phase]
CONTEXT: Authentication method affects phase 1 (login), phase 2 (sessions),
         phase 3 (API auth). Plan.md does not specify method.
QUESTION: Which authentication method should be used?
OPTIONS:
  A) JWT tokens
     Impact: Stateless, scales horizontally, requires token refresh logic
  B) Session cookies
     Impact: Stateful, simpler implementation, requires session store
  C) OAuth 2.0
     Impact: Third-party auth, complex setup, standard for modern apps
DEFAULT_IF_NOT_ANSWERED: B (session cookies — simpler for MVP)
```

## What Validator Emits on Completion

### Success — Cycle 1 (Exit 0):
- validated.md with all required sections
- DRIFT_CHECK_STATUS: NOT_APPLICABLE
- VALIDATOR_CYCLE: 1
- No questions.md (no questions needed)

### Success — Cycle 2+ (Exit 0):
- validated.md with patch applied
- DRIFT_CHECK_STATUS: CLEAN or DRIFT_DETECTED
- VALIDATOR_CYCLE: {N}
- Drift corrections documented in Validation Notes

### Paused — Has Questions (Exit 2):
- {phase}/validator/questions.md written
- Orchestrator appends to root QUESTIONS.md
- Run pauses until user answers
- After answers: Validator re-spawned with answers in briefing

## Validator Self-Check Checklist

Before writing validated.md and terminating, verify:

```markdown
SCHEMA CHECKS:
□ PHASE_ID field present and matches current phase
□ VALIDATED timestamp present
□ VALIDATOR_CYCLE number correct
□ VALIDATOR_DOC_VERSION matches config
□ DRIFT_CHECK_STATUS field present with valid value

CONTENT CHECKS:
□ What To Build section > 50 words
□ At least one deliverable defined
□ Every deliverable has: type, path, purpose, interface, constraints, edge_cases
□ File Manifest table present with all deliverables
□ At least one AC per deliverable
□ Every AC has: criterion, test_command, pass_condition, blocking

TESTABILITY CHECKS:
□ No test_command is: echo, true, exit 0, :, or shell no-op
□ No test_command tests its own test file (no self-reference)
□ Every pass_condition is specific (not just "success")

BOUNDARY CHECKS:
□ Out Of Scope section present and not empty
□ Phase Boundaries section present
□ "Receives From Previous Phase" matches previous built.md (if phase > 1)
□ "Provides To Next Phase" matches next plan.md (if not final phase)

QUALITY CHECKS:
□ No vague terms: "fast", "secure", "clean", "handle errors"
□ No placeholder text: "TBD", "TODO", "{fill in}"
□ All assumptions documented in Validation Notes
□ Drift corrections documented (cycle 2+ only)
```

Any check fails → fix that section → re-check → only terminate when all pass.

# FEEDBACK — PROTOCOL

## How FEEDBACK Is Invoked

NOT by Orchestrator. Directly by human, after delivery.

### Method 1: feedback.sh script

```bash
./feedback.sh
```

Human is prompted to describe what happened. Script collects input and spawns FEEDBACK agent.

### Method 2: Direct invocation

```bash
claude \
  --role-file=.claude/agents/feedback/ROLE.md \
  --schema-file=.claude/agents/feedback/SCHEMA.md \
  --protocol-file=.claude/agents/feedback/PROTOCOL.md \
  "You are FEEDBACK agent.
   Human test feedback:
   WHAT I DID: {description}
   WHAT I EXPECTED: {description}
   WHAT HAPPENED: {description}
   ERROR LOG: {paste}

   Classify, route, and write FEEDBACK_REPORT.md."
```

### Method 3: Orchestrator post-delivery mode (future)

```yaml
orchestrator --mode=feedback-driven
  Launches in listening mode
  Human describes issue
  Orchestrator invokes FEEDBACK
  FEEDBACK routes to agent
  Orchestrator re-enters loop
  Human re-tests
```

---

## FEEDBACK Workflow

### Phase 1: Intake and Context Loading

```
1. Receive human input (four fields):
   - WHAT_I_DID
   - WHAT_I_EXPECTED
   - WHAT_HAPPENED
   - ERROR_LOG (optional)

2. Load context files:
   - Read FINAL_SUMMARY.md
     → What did agents claim they delivered?
   - Read PHASE_INDEX.md
     → Which phases completed? Which are PENDING/PARTIAL/FAILED?
   - Read .claude/memory/RUN_STATE.md
     → Where did orchestration finish?
   - Read .claude/memory/AGENT_TRACE.md
     → Full history of what each agent did

3. Identify affected phase:
   - Does feedback reference a specific feature?
     → Map to phase via PHASE_INDEX
   - Is it a cross-phase integration issue?
     → Mark as CROSS_PHASE
   - Is it a system-wide issue (affects all phases)?
     → Mark as SYSTEM_WIDE
   - Unknown where it belongs?
     → Mark as UNKNOWN, will investigate during classification

4. Load phase-specific artifacts:
   - {phase}/planner/plan.md
   - {phase}/validator/validated.md
   - {phase}/builder/built.md
   - {phase}/tester/test-report.md
```

### Phase 2: Classification

```
For the reported issue, answer these questions IN ORDER:

Q1: Is this reproducible and deterministic?
    - Same input → same failure every time?
    - YES: Could be DETERMINISTIC or SPEC_GAP
    - NO: Could be ENVIRONMENTAL or FLAKY (but post-delivery flaky = ENVIRONMENTAL)

Q2: Did the agent build what the spec said?
    - Read validated.md deliverable specs
    - Does the built code match those specs?
    - YES: SPEC_GAP (spec was incomplete)
    - NO: DETERMINISTIC (code bug)

Q3: Does it work in build environment but fail in user's environment?
    - Did TESTER's tests pass during build?
    - Does same operation fail for user?
    - YES: ENVIRONMENTAL
    - Context: OS version, device type, network, etc.

Q4: Is it technically correct but user can't figure out how to use it?
    - Does it do what spec says?
    - YES, but user confused/blocked?
    - → UX_GAP

Q5: Looking at all 5 agents (PLANNER, VALIDATOR, BUILDER, TESTER, REVIEWER):
    - Does ANY agent's ROLE/SCHEMA/PROTOCOL say they should catch this?
    - NO existing agent handles this class of issue?
    - → ARCHITECTURE_GAP

Q6: Does an existing agent SHOULD handle this but didn't?
    - Agent's ROLE says this is their job
    - But their PROTOCOL doesn't have steps for it
    - OR their prompt missed this specific case
    - → AGENT_PROMPT_GAP

Classification decision tree:

┌─────────────────────────────────────────────────┐
│ Does it match spec AND work in build env       │
│ BUT user can't use it or is confused?          │
└───────────────┬─────────────────────────────────┘
                │ YES
                ├─────→ UX_GAP
                │
                │ NO
                ▼
┌─────────────────────────────────────────────────┐
│ Did tests pass during build but fails           │
│ in user's environment (diff OS/device/network)? │
└───────────────┬─────────────────────────────────┘
                │ YES
                ├─────→ ENVIRONMENTAL
                │
                │ NO
                ▼
┌─────────────────────────────────────────────────┐
│ Does built code match what validated.md said?   │
└───────────────┬─────────────────────────────────┘
                │ YES
                ├─────→ SPEC_GAP (spec incomplete)
                │
                │ NO (code has bug)
                ├─────→ DETERMINISTIC
                │
                ▼
┌─────────────────────────────────────────────────┐
│ Is there ANY existing agent whose ROLE says     │
│ they should have caught this?                   │
└───────────────┬─────────────────────────────────┘
                │ NO existing agent handles this
                ├─────→ ARCHITECTURE_GAP
                │
                │ YES, agent exists but missed it
                ├─────→ AGENT_PROMPT_GAP
```

### Phase 3: Evidence Collection

```
For the classification, gather evidence:

1. Quote from validated.md:
   - What did spec say about this feature?
   - Was this scenario covered in edge_cases?
   - Was this in Out Of Scope?

2. Quote from built.md:
   - What did Builder claim it built?
   - What was Builder's confidence level?
   - Were there any deviations noted?

3. Quote from test-report.md:
   - Which ACs were tested?
   - Did related tests pass?
   - What was NOT tested?

4. Confidence assessment:
   - HIGH: Clear evidence, obvious classification
   - MEDIUM: Some ambiguity, could be two types
   - LOW: Unclear, need more info from human
```

### Phase 4: Routing Decision

```
Based on classification, route to appropriate agent:

DETERMINISTIC:
  → REVIEWER
  Briefing: "Root-cause this bug. Source: FEEDBACK_REPORT.md FB-{N}"
  Input: FEEDBACK_REPORT.md (replaces test-report.md)
  Agent will: Create patch.md → VALIDATOR applies → BUILDER fixes

SPEC_GAP:
  → VALIDATOR (bypass REVIEWER)
  Briefing: "Fill this spec gap. Source: FEEDBACK_REPORT.md FB-{N}"
  Agent will: Update validated.md → BUILDER implements

ENVIRONMENTAL:
  → TESTER
  Briefing: "Test on user's environment: {OS/device/network details}"
  Agent will: Reproduce on target env → Report findings → Route accordingly

UX_GAP:
  → VALIDATOR
  Briefing: "Add UX constraints. User couldn't figure out: {what}"
  Agent will: Add usability requirements → BUILDER improves UX

ARCHITECTURE_GAP:
  → HUMAN (escalate, don't route to agent)
  Write: ARCHITECTURE_GAP_PROPOSAL.md
  Present to human for architectural decision

AGENT_PROMPT_GAP:
  → HUMAN (escalate, don't modify agents without approval)
  Write: AGENT_IMPROVEMENT_PROPOSAL.md
  If human approves:
    → Update agent's ROLE/SCHEMA/PROTOCOL
    → Increment AGENT_DOC_VERSION
    → Re-run affected phases with improved agent
```

### Phase 5: Write FEEDBACK_REPORT.md

```
1. Copy human input verbatim (no edits)

2. Document classification:
   - ROOT_CAUSE_TYPE
   - CONFIDENCE
   - REASONING (2-4 sentences with evidence)

3. Write complete agent briefing:
   - Not just agent name
   - Full spawn parameters
   - Exact source file (FEEDBACK_REPORT.md, not test-report.md)
   - Specific task
   - Constraints (DO_NOT_TOUCH, regression tests)

4. If ARCHITECTURE_GAP or AGENT_PROMPT_GAP:
   - Write detailed proposal
   - Include examples
   - Show current vs proposed behavior
   - Require human approval

5. Self-check before writing:
   - All required sections present?
   - Briefing specific enough agent doesn't need to guess?
   - DO_NOT_TOUCH list populated?
   - Evidence quotes actual artifact text?
```

### Phase 6: Signal Orchestrator or Escalate

```
If routing to agent (DETERMINISTIC, SPEC_GAP, ENVIRONMENTAL, UX_GAP):
  1. Write FEEDBACK_REPORT.md
  2. Signal Orchestrator:
     "Re-enter loop for phase-{N} with FEEDBACK_REPORT.md FB-{N} as trigger"
  3. Orchestrator spawns target agent with FEEDBACK's briefing
  4. After fix cycle completes, move to Phase 7

If escalating (ARCHITECTURE_GAP, AGENT_PROMPT_GAP):
  1. Write proposal document
  2. Present to human:
     "This is a systemic gap. Here's the proposed fix.
      Approve? [yes/no/modify]"
  3. If approved:
     - Update agent files
     - Increment AGENT_DOC_VERSION
     - Re-run with improved agent
  4. If rejected:
     - Document why
     - Mark FB-{N} as UNRESOLVED (by design)
```

### Phase 7: Post-Fix Verification

```
After Orchestrator completes the fix cycle:

1. Read outputs from re-run:
   - Did agent complete successfully?
   - Did tests pass?
   - Were there any new failures?

2. Write FEEDBACK_RESOLUTION.md:
   - What changed (files, logic, tests)
   - Exact steps for human to re-test
   - Regression checks (what must still work)
   - If still broken: "Report as FB-{N+1} and reference FB-{N}"

3. Update FEEDBACK_HISTORY.md:
   - Append this case
   - Mark status (RESOLVED | PARTIAL | UNRESOLVED)
   - Pattern detection: same component twice? → flag for review
```

---

## Pattern Detection Rules

FEEDBACK tracks patterns across multiple reports:

```
Pattern 1: Same Component Failing Repeatedly
  FB-001: Login crashes
  FB-003: Login crashes (after fix for FB-001)
  FB-007: Login crashes (after fix for FB-003)

  → ESCALATE as ARCHITECTURE_GAP
  → "Login component has deep architectural issue.
      Multiple fixes haven't resolved it.
      Recommend architectural review or redesign."

Pattern 2: Same Agent Missing Same Thing
  FB-002: TESTER missed Gradle version check
  FB-005: TESTER missed AndroidX migration
  FB-009: TESTER missed Java compatibility

  → AGENT_PROMPT_GAP
  → "TESTER repeatedly misses environment validation.
      Propose: Add environment-check step to TESTER PROTOCOL."

Pattern 3: Same Environment Issue
  FB-004: Windows build fails
  FB-006: Windows build fails (different reason)
  FB-010: Windows build fails (different reason)

  → ARCHITECTURE_GAP
  → "No agent validates Windows compatibility.
      All testing happens on Mac/Linux.
      Propose: Multi-platform testing requirement."
```

When pattern detected:
1. Read FEEDBACK_HISTORY.md for related FB-{IDs}
2. Analyze: Is this same root cause or symptom?
3. If same root cause: ESCALATE (fixes aren't working)
4. If different but related: Propose systemic improvement

---

## Self-Check Before Terminating

```
Before writing FEEDBACK_REPORT.md and terminating, verify:

□ Human input copied verbatim (no paraphrasing)
□ Context files loaded (FINAL_SUMMARY, phase artifacts)
□ Classification made (one of six types)
□ Evidence collected (quotes from artifacts)
□ Confidence assessed (HIGH/MEDIUM/LOW)
□ Routing decision made (which agent, or escalate)
□ Briefing complete (agent can execute without questions)
□ DO_NOT_TOUCH list populated (prevent regressions)
□ If gap: proposal written with examples
□ Feedback ID unique (checked FEEDBACK_HISTORY)

Any □ unchecked → DO NOT TERMINATE
  Fix the missing piece first
```

---

## FEEDBACK Never Does This

```
❌ Never blame the user
   "User error" is not a valid classification
   If user confused → UX_GAP

❌ Never route without classifying first
   "Not sure, sending to Builder" → WRONG
   Classify first, then route based on classification

❌ Never provide vague briefing
   "Fix the login issue" → TOO VAGUE
   Provide complete context, exact task, constraints

❌ Never modify agent files without human approval
   Proposing changes: ✓
   Making changes directly: ✗

❌ Never skip evidence collection
   "I think it's DETERMINISTIC" → NOT ENOUGH
   Quote artifacts, show your reasoning

❌ Never ignore patterns
   Same issue twice → Investigate why fix didn't work
   Same agent missing same thing → Improvement needed

❌ Never say "works as designed" without proof
   Must quote validated.md showing this scenario was explicitly out of scope
   AND human was told about this limitation
   If human wasn't told → it's a communication gap (SPEC_GAP or UX_GAP)
```

---

## What FEEDBACK Emits on Completion

### Success Path (routed to agent):
- FEEDBACK_REPORT.md (classification + briefing)
- Signal to Orchestrator (re-enter loop at phase-{N})
- (After fix) FEEDBACK_RESOLUTION.md (verification steps)

### Escalation Path (gap detected):
- FEEDBACK_REPORT.md (classification)
- ARCHITECTURE_GAP_PROPOSAL.md OR AGENT_IMPROVEMENT_PROPOSAL.md
- Wait for human approval/rejection

### Resolution Path (after re-test):
- FEEDBACK_RESOLUTION.md updated with STATUS: RESOLVED
- FEEDBACK_HISTORY.md appended

---

## Integration with Orchestrator

```
Orchestrator checks for FEEDBACK_REPORT.md:

if FEEDBACK_REPORT.md exists:
  read FEEDBACK_REPORT.md
  extract: ROUTE_TO, BRIEFING, PHASE_AFFECTED

  if ROUTE_TO == ESCALATE_TO_HUMAN:
    read proposal file
    present to human
    wait for approval
  else:
    re-enter loop at PHASE_AFFECTED
    spawn ROUTE_TO agent with BRIEFING
    run normal cycle (VALIDATE → BUILD → TEST)

  after cycle:
    FEEDBACK writes FEEDBACK_RESOLUTION.md
    human re-tests per verification steps
```

This makes FEEDBACK a first-class citizen in the orchestration loop, not an afterthought.

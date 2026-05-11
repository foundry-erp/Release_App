# PLANNER — SCHEMA

## Files Planner Reads

### On First Run
- {doc_path} — the complete requirements document
- .claude/memory/PHASE_INDEX.md — if it exists from a previous run

### On Re-Plan
- {phase}/planner/plan.md — for each pending phase
- User's answer to the cross-phase question that triggered re-plan

## Files Planner Writes

### plan.md — One per phase

```markdown
# Phase {N} — {Descriptive Name}
PHASE_ID: phase-{n}-{name}
PLANNER_DOC_VERSION: {agent_doc_version from config}
DEPENDS_ON: [phase-{n-1}-{name}] | [none]
PROVIDES_TO: [phase-{n+1}-{name}] | [final]

## What This Phase Builds
{2-4 sentences. What exists after this phase that did not exist before.}

## Requirements Covered
- REQ-{id}: {verbatim text from doc}

## Deliverables
- [ ] {file or module}: {purpose}

## Inputs From Previous Phase
# Field names and types must be identical to the previous phase's
# "Outputs To Next Phase". PLANNER self-check validates this.
- {interface_name}: {exact type signature}
(write "none" only for Phase 1)

## Outputs To Next Phase
# Field names and types must be identical to the next phase's
# "Inputs From Previous Phase". PLANNER self-check validates this.
- {interface_name}: {exact type signature}
(write "none" only for final phase)

## Acceptance Criteria
# Every criterion MUST include test_command.
- [ ] AC-{n}.1
      criterion: {what must be true — specific, measurable}
      test_command: {exact shell command}
      pass_condition: {exact exit code or output string that means pass}
      blocking: true | false

## Manual Test Steps
1. {action} → Expected: {exact observable result}

## Phase Achievement
{One sentence: what the user can do when this phase passes.}

## Planner Notes
⚠ UNCLEAR: "{exact quote from doc}" — Validator must resolve
(include only when genuine ambiguity exists)
```

### plan.interface-check.md — Written after all plan.md files

```markdown
# PLANNER Interface Self-Check
GENERATED: {timestamp}
STATUS: PASS | FAIL

## Interface Chain Validation

| from_phase | to_phase | interface_name | planner_type | next_phase_expects | match |
|------------|----------|---------------|--------------|-------------------|-------|
| phase-1-auth | phase-2-dashboard | AuthToken | { token: string, expires: number } | { token: string, expires: number } | ✅ |

## Failures
MISMATCH-001:
  from: phase-2-dashboard "Outputs To Next Phase"
  to:   phase-3-export "Inputs From Previous Phase"
  field: UserSession.role
  phase-2 says: Role (enum type)
  phase-3 expects: string
  action_required: PLANNER must align these before terminating

## Result
{PASS: "All {N} inter-phase interfaces are consistent."
 FAIL: "Found {N} mismatches. PLANNER must fix before Orchestrator proceeds."}
```

### PHASE_INDEX.md — Written once at completion

```markdown
# Phase Index
GENERATED: {timestamp}
PLANNER_DOC_VERSION: {version}
TOTAL_PHASES: {N}

## Phases

### Phase 1 — {name}
PHASE_ID: phase-1-{name}
STATUS: PENDING
DEPENDS_ON: none
PROVIDES_TO: phase-2-{name}
ACHIEVEMENT: {one sentence}

### Phase 2 — {name}
PHASE_ID: phase-2-{name}
STATUS: PENDING
DEPENDS_ON: phase-1-{name}
PROVIDES_TO: phase-3-{name}
ACHIEVEMENT: {one sentence}

[...repeat for all phases...]

## Status Values
PENDING            not yet started
IN_PROGRESS        currently in build/test cycle
COMPLETE           passed all phase-level tests
INTEGRATION_PATCH  complete, but being patched for integration failure
PARTIAL            skipped at escalation — next phase may be affected
FAILED             max cycles reached, human chose not to continue
```

### REPLAN_SUMMARY.md — Written only on re-plan runs

```markdown
# Re-Plan Summary
TRIGGERED_BY: {cross-phase question | plan_gap_detected}
TRIGGER_DETAILS: "{text of question or gap}"
USER_ANSWER: "{answer if question}"
TIMESTAMP: {iso}

## Affected Phases
- phase-{N}-{name}: {what changed}
- phase-{M}-{name}: {what changed}

## Unaffected Phases
- phase-{X}-{name}: no changes needed

## Interface Changes
| phase | interface_name | old_type | new_type | reason |
|-------|---------------|----------|----------|--------|

## What Orchestrator Must Revalidate
- [ ] Re-run interface self-check on phases {list}
- [ ] Re-spawn Validator for phases with STATUS = IN_PROGRESS
- [ ] No action needed for phases with STATUS = COMPLETE
```

## Required Sections in Every plan.md

All sections listed in the plan.md template above are REQUIRED.
Missing any section = incomplete plan = schema validation failure.

## Interface Type Signature Format

Type signatures must be precise enough for exact comparison:

**GOOD:**
```
AuthToken: { token: string, expires: number, refresh?: string }
UserList: Array<{ id: number, name: string, email: string }>
Status: "pending" | "active" | "archived"
```

**BAD:**
```
AuthToken: object
UserList: array
Status: string (should specify allowed values)
```

## Planner Notes Section Rules

Only include UNCLEAR items when:
- The doc has genuine ambiguity (two valid interpretations exist)
- A technology choice is required but not specified
- User flow has missing steps

Do NOT include if:
- Implementation detail is missing (that's Builder's job)
- You can reasonably infer from context
- It's a standard industry practice

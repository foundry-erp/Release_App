# ORCHESTRATOR — SCHEMA

## Files Orchestrator Reads

### At startup
- .claude/agents/config.yaml
- .claude/agents/agents.yaml

### Per phase cycle
- {phase}/planner/plan.md            (schema check before starting loop)
- {phase}/planner/plan.interface-check.md  (STATUS must be PASS)
- {phase}/validator/validated.md     (schema check after Validator done)
- {phase}/builder/built.md           (schema check + confidence check)
- {phase}/builder/SELF_CHECK.md      (read if exists before Tester)
- {phase}/builder/SELF_FAILURE.md    (read if exists — route to Validator)
- {phase}/tester/test-report.md      (schema check + failure type read)
- {phase}/reviewer/patch.md          (schema check before routing)

## Files Orchestrator Writes

### RUN_STATE.md — updated after every step

```markdown
CURRENT_PHASE: {N}
CURRENT_CYCLE: {N}
CURRENT_STEP: VALIDATE | BUILD | TEST | REVIEW | HANDOFF_CHECK | INTEGRATION_TEST
STATUS: RUNNING | WAITING_FOR_USER | ESCALATED | COMPLETE | FAILED
LAST_UPDATED: {timestamp}
LAST_AGENT_SPAWNED: {agent}
LAST_AGENT_STATUS: COMPLETE | FAILED | TIMEOUT | PERMISSION_VIOLATION
```

### AGENT_TRACE.md — appended after every spawn

```markdown
TRACE-{N}
TIMESTAMP: {iso}
AGENT: {name}
AGENT_DOC_VERSION: {version}
PHASE: {phase-id}
CYCLE: {N}
RUN_TYPE: {first_run | on_patch | re_plan | final_integration_test}
INPUTS: [{file list}]
OUTPUTS: [{file list}]
DURATION: {Xm Ys}
TOKENS_IN: {N}
TOKENS_OUT: {N}
MODEL: {pinned model string}
STATUS: COMPLETE | FAILED | TIMEOUT | PERMISSION_VIOLATION
NOTES: {any anomalies}
```

### TOKEN_LEDGER.md — appended after every spawn

```markdown
| phase | agent | cycle | tokens_in | tokens_out | model | est_cost_usd |
```

Current phase total compared against max_tokens_per_phase.
Run total compared against budget_warning and budget_hard_limit.

### HANDOFF_CHECKS.md — appended for every inter-phase check

```markdown
HANDOFF-{N}
TIMESTAMP: {iso}
FROM: {phase-id} → TO: {phase-id}
STATUS: COMPATIBLE | MISMATCH
DETAILS: {field-level mismatch description if STATUS=MISMATCH}
RESOLUTION_CHOSEN: {1|2|3|pending}
RESOLVED_BY: {agent and cycle}
```

### SANITY_VIOLATIONS.md — appended on any semantic check failure

```markdown
SANITY-{N}
TIMESTAMP: {iso}
PHASE: {phase-id}
CYCLE: {N}
FILE_CHECKED: {path}
VIOLATION_TYPE: NO_OP_TEST_COMMAND | EMPTY_INTERFACE | MISSING_PASS_CONDITION |
                NEGATIVE_TOKEN_COUNT | BROKEN_LEDGER_ENTRY | ZERO_AC_COUNT |
                SELF_REFERENTIAL_TEST
DETAILS: {description}
SEVERITY: CRITICAL (pause run) | WARNING (log and continue)
ACTION_TAKEN: PAUSED | LOGGED
```

## Schema Validation Rules (applied to every handoff file)

For every handoff file (plan.md, validated.md, built.md, test-report.md, patch.md):
1. File exists at expected path
2. PHASE_ID field matches current phase
3. All required sections present (see architecture doc Section 4 schemas)
4. No required field is empty or placeholder text
5. Confidence report present in built.md (always — even if all HIGH)
6. OVERALL_STATUS field present in test-report.md
7. DRIFT_CHECK_STATUS field present in validated.md (cycle 2+)

Failure on any rule = agent has not completed its job.
Orchestrator does not advance. It re-spawns or escalates.

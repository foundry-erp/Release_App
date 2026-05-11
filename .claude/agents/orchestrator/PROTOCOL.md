# ORCHESTRATOR — PROTOCOL

## How Orchestrator Is Spawned

Orchestrator is spawned by run.sh, not by another agent.

run.sh passes:
- doc_path: path/to/your-doc.md
- config_path: .claude/agents/config.yaml
- agents_path: .claude/agents/agents.yaml
- output_root: {doc-name}/

run.sh does not pass model, temperature, or prompt decisions.
Those are all in config.yaml.

## What Orchestrator Emits on Completion

- Exit code 0: BUILD COMPLETE — FINAL_SUMMARY.md written
- Exit code 1: FAILED — RUN_STATE.md contains reason
- Exit code 2: WAITING_FOR_USER — human intervention required
               Terminal output contains exact question and options

## Permission Enforcement Protocol

Before every agent write:
1. Read agents.yaml for that agent's write_paths
2. Check requested write path against allowed list
3. ALLOW → proceed
4. DENY → block write, log PERMISSION_VIOLATION to AGENT_TRACE.md
         do not terminate the agent — let it continue
         if agent terminates without producing required output:
           treat as FAILED, route accordingly

## Schema Validation Protocol

After every agent termination:
1. Read expected output file(s)
2. Check each required section is present and non-empty
3. PASS → proceed to next step
4. FAIL → do not advance, log to AGENT_TRACE.md
         re-spawn same agent with briefing:
         "Your output failed schema validation. Missing: {field list}.
          Re-run only the sections that failed. Do not re-do completed work."
         If re-spawn also fails → ESCALATE

## Failure Classification Protocol

On test-report.md with OVERALL_STATUS: FAIL:
- Read FAILURE_TYPE field
- If FAILURE_TYPE = none and OVERALL_STATUS = FAIL:
    This is a schema violation — re-spawn Tester to classify
- Route based on FAILURE_TYPE:
    - DETERMINISTIC: REVIEWER → patch.md → VALIDATOR → BUILDER
    - SPEC_GAP: test-report.md → VALIDATOR directly (bypass REVIEWER)
    - ENVIRONMENTAL: PAUSE immediately — human fix required
    - FLAKY: quarantine test, do not block phase
- If FAILURE_TYPE field contains a value not in taxonomy:
    Treat as DETERMINISTIC (safest default)
    Log anomaly to AGENT_TRACE.md

## Degraded Mode Protocol

If an agent produces output that passes schema validation but
Orchestrator detects semantic anomalies (semantic sanity checks):

### CRITICAL violation:
Pause run. Print to terminal:
```
⚠ SANITY VIOLATION in {file}
Issue: {description}
The system produced a schema-valid but semantically suspect output.
Review {file} and type: continue | halt
```

### WARNING violation:
Log to SANITY_VIOLATIONS.md
Continue run
Include in FINAL_SUMMARY under "Anomalies Detected"

If model returns malformed output (not JSON, truncated, empty):
- Do not treat as agent completion
- Log to AGENT_TRACE.md as STATUS: FAILED
- Re-spawn once with same briefing
- If re-spawn also malformed → ESCALATE
  "Model returned malformed output twice for {agent} on phase {N}.
   This may indicate a model issue, not a spec issue. Options: retry | halt"

## Semantic Sanity Checks

### Checks on validated.md:
- □ No test_command is: echo, true, exit 0, :, or any shell no-op
- □ No test_command is self-referential (tests its own test file)
- □ AC count > 0 (a spec with zero ACs is semantically invalid)
- □ Every pass_condition is specific (not "success" without definition)
- □ No deliverable path is "/" or "." or the project root
- □ Out Of Scope section is not empty (always explicit about boundaries)
- □ "What To Build" section is > 50 words (too short = spec is incomplete)

### Checks on built.md:
- □ Files Created table is not empty (a build that created nothing is suspect)
- □ Deviations table is present (even if empty — must be explicit)
- □ Confidence report has at least one entry
- □ No file path in Files Created points outside src/ or tests/

### Checks on test-report.md:
- □ FAILURE_TYPE is set when OVERALL_STATUS = FAIL
- □ FAILURE_TYPE is "none" when OVERALL_STATUS = PASS
- □ Passed test count + Failed test count = total declared
- □ Every FAIL-{N} entry has failure_type set
- □ HOW_TO_RUN section is not empty

### Checks on TOKEN_LEDGER.md:
- □ No token count is negative
- □ No token count is 0 for a reasoning agent
- □ est_cost_usd is not 0.000 for any non-trivial run

### Severity:
**CRITICAL** (pause run):
- no-op test_command
- zero ACs
- empty Files Created
- negative token count

**WARNING** (log and continue):
- short What To Build section
- missing Deviations table entry
- zero-cost token entry for reasoning agent

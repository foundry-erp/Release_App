# Retry History
# Per phase: what failed, what was tried, what fixed it
# Includes total tokens spent per phase
# Used for learning and optimization

---

## History Entry Format

```
PHASE: {phase-id}
TOTAL_CYCLES: {N}
TOTAL_TOKENS: {N}
FINAL_STATUS: COMPLETE | PARTIAL | FAILED

### Cycle 1
STEP: VALIDATE → BUILD → TEST
RESULT: FAIL
FAILURE_TYPE: {type}
FAILURE_SUMMARY: {one sentence}
PATCH_APPLIED: {summary of what Validator/Builder changed}
TOKENS_SPENT: {N}

### Cycle 2
STEP: VALIDATE → BUILD → TEST
RESULT: FAIL | PASS
FAILURE_TYPE: {type if FAIL}
FAILURE_SUMMARY: {one sentence if FAIL}
PATCH_APPLIED: {summary if another cycle follows}
TOKENS_SPENT: {N}

### Cycle N
[...same format...]

WHAT_FIXED_IT: {summary of the final successful patch, or "not resolved"}
LESSONS_LEARNED: {patterns for future phases}
```

---

## Phase Histories

(Orchestrator will append phase histories here as phases complete or fail)

---

## Analysis

After run completion, this file enables:
- Identifying common failure patterns
- Optimizing token spend (phases spending 3× average indicate spec issues)
- Improving Planner decomposition (phases with >3 cycles suggest bad boundaries)
- Refining Validator checks (repeated SPEC_GAP in same area = check gap)

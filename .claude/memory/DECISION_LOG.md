# Decision Log
# Autonomous Decision Record (ADR)
# Every autonomous decision any agent makes
# Format: ADR-{N}, agent, phase, cycle, decision, reason, alternatives, reversible, spec_ref

---

## Decision Entry Format

```
ADR-{N}
TIMESTAMP: {iso}
AGENT: {which agent made the decision}
PHASE: {phase-id}
CYCLE: {N}
DECISION: {what was decided}
REASON: {why this decision was made}
ALTERNATIVES_CONSIDERED: [{other options that were available}]
REVERSIBLE: yes | no | partial
SPEC_REF: {reference to spec section that informed this decision}
IMPACT: {what this affects downstream}
```

---

## Decision Entries

(Agents will append entries here when making autonomous decisions)

---

## Usage Guidelines

Agents should log decisions when:
- Making assumptions (Validator assumes standard practice)
- Choosing between valid interpretations (Builder picks one of two valid approaches)
- Auto-correcting drift (Validator fixes drift without pausing)
- Classifying failures (Tester determines failure type)
- Assessing scope (Reviewer determines PARTIAL vs FULL)
- Detecting plan gaps (Reviewer flags plan_gap_detected)

Do NOT log:
- Mechanical operations (running test commands)
- Schema validation (required checks)
- Following explicit instructions (not a decision, just execution)

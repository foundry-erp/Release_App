# Agent Pattern Template

Every agent is defined by exactly **3 markdown files** inside `.claude/agents/{agent-name}/`:

```
{agent-name}/
├── ROLE.md       ← What you are, what you own, what you are forbidden from
├── SCHEMA.md     ← Input/output file specs + inline templates
└── PROTOCOL.md   ← Workflow steps + spawning briefing format
```

---

## ROLE.md Template

```markdown
# {AGENT_NAME} — ROLE

## What You Are
{2–3 sentences. Define the agent's identity and scope.}

## What You Own
- {Responsibility 1}
- {Responsibility 2}
- {Responsibility 3}

## What You Are FORBIDDEN From Doing
- {Prohibition 1}
- {Prohibition 2}
- {Prohibition 3}

## Your One Sentence
{Single declarative statement of purpose. No conjunctions.}

## Key Responsibilities

### {Responsibility Group 1}
{Description}

### {Responsibility Group 2}
{Description}

## Integration Points
- Receives from: {upstream agent or source}
- Sends to: {downstream agent or target}

## Success Criteria
- {Criterion 1}
- {Criterion 2}
```

---

## SCHEMA.md Template

```markdown
# {AGENT_NAME} — SCHEMA

## Files {AGENT_NAME} Reads

### On First Run
- `{path}` — {what it contains and why}

### On Patch / Retry
- `{path}` — {what it contains and why}

## Files {AGENT_NAME} Writes

### Primary Output: `{filename}`

{description of when this file is written}

Required sections:

\```
# {Document Title} — Phase {N}: {Name}
PHASE_ID: phase-{n}-{name}
{AGENT_NAME}_CYCLE: {integer, 1 = first run}
{AGENT_NAME}_DOC_VERSION: {from config.yaml}
TIMESTAMP: {ISO-8601}
STATUS: {agent-specific status value}

## Section 1
{content}

## Section 2
{content}
\```

### Secondary Output: `{filename}` (if applicable)

\```
# {Document Title}
{template content}
\```

## Schema Validation Rules
- All required sections must be non-empty
- PHASE_ID must match current phase
- No placeholder text in required fields
- STATUS field must be a defined enum value

## When to Write `{primary output filename}`
- {condition 1}
- {condition 2}
```

---

## PROTOCOL.md Template

```markdown
# {AGENT_NAME} — PROTOCOL

## How {AGENT_NAME} Is Spawned

### First Run Briefing
\```
You are {AGENT_NAME}.
Phase: {N} — {Phase Name}
Input: {path to input file}
Your job: {one sentence task}
Write your output to: {output path}
\```

### Patch / Retry Briefing
\```
You are {AGENT_NAME} on patch cycle {N}.
Failure reference: {FAIL-ID}
Re-read: {input path}
Patch instruction: {path to patch.md or inline}
Write updated output to: {output path}
\```

## {AGENT_NAME} Workflow

### Step 0: Read Inputs
\```
Read {input file(s)} before doing anything else.
\```

### Step 1: {Main Task}
\```
{Description of what the agent does in this step.}
\```

### Step 2: {Validation / Self-Check}
\```
{Description of self-check before writing output.}
\```

### Step 3: Write Output
\```
Write {output filename} to {path}.
Confirm all required sections are present and non-empty.
\```

## What {AGENT_NAME} Emits on Completion

### Success Path (Exit 0)
- `{output file 1}`
- `{output file 2}` (if applicable)

### Failure Path (Exit 1)
- `{status or error file}`

## {AGENT_NAME} Self-Check Protocol
Before writing output, verify:
- [ ] All required sections are present
- [ ] No section is empty or contains placeholder text
- [ ] PHASE_ID matches current phase
- [ ] STATUS is set to a valid value
- [ ] Output path is exactly as specified in briefing
```

---

## agents.yaml Entry (in `.claude/agents/agents.yaml`)

```yaml
agents:
  {agent_name}:
    model_role: reasoning          # or: structured_output
    read_paths:
      - {path this agent may read}
    write_paths:
      - {path this agent may write}
    forbidden_writes:
      - {path this agent is blocked from writing}
```

---

## Output File Metadata (every agent output file starts with this block)

```markdown
PHASE_ID: phase-{n}-{slug}
{AGENT_NAME}_CYCLE: {1|2|3}
{AGENT_NAME}_DOC_VERSION: {version from config.yaml}
TIMESTAMP: {ISO-8601}
STATUS: {COMPLETE | FAILED | PENDING | agent-specific}
```

---

## Failure Record Pattern (used in test/review outputs)

```markdown
### FAIL-{N}
- test: {what was run}
- expected: {expected result}
- actual: {actual result}
- criterion_violated: AC-{id}
- likely_file: {path}
- failure_type: DETERMINISTIC | SPEC_GAP | ENVIRONMENTAL | FLAKY
- severity: P0 | P1
```

## Patch Instruction Pattern (used in reviewer output)

```markdown
### PATCH-{N}
failure_reference: FAIL-{N}
failure_type: DETERMINISTIC | SPEC_GAP
root_cause: {cause, not symptom}

builder_instruction:
  file: {exact path}
  change: {what to change}
  do_not_touch: [{list of protected files}]

verify_with: {exact shell command}
```

## Acceptance Criteria Pattern (used in validator output)

```markdown
- [ ] AC-{n}.{m}
      criterion: {specific, measurable statement}
      test_command: {exact shell command}
      pass_condition: {exit code or output string}
      blocking: true | false
```

---

## Rules That Apply to Every Agent

1. **Single responsibility** — one agent, one decision type. Never bleed into another agent's domain.
2. **No direct agent-to-agent communication** — all handoffs go through Orchestrator.
3. **Schema-first** — output is only accepted after Orchestrator validates required sections exist and are non-empty.
4. **Forbidden writes are hard blocks** — enforced by Orchestrator reading agents.yaml, not by the agent itself.
5. **Cycle counter starts at 1** — increment each time the agent is re-spawned for the same phase.
6. **No no-op test commands** — `echo`, `true`, `exit 0`, `:` are invalid as test_command values.
```

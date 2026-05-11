# BUILDER — SCHEMA

## Files Builder Reads

### On First Build (Cycle 1)
- {phase}/validator/validated.md (complete spec — your ONLY input)

### On Patch Build (Cycle 2+)
- {phase}/validator/validated.md (updated spec)
- {phase}/builder/checkpoints/step-01-deps.md (if exists)
- {phase}/builder/checkpoints/step-02-models.md (if exists)
- {phase}/builder/checkpoints/step-03-services.md (if exists)
- {phase}/builder/checkpoints/step-04-tests.md (if exists)

## Files Builder Writes

### Checkpoint Files

**checkpoints/step-01-deps.md**
```markdown
# Checkpoint — Dependencies
COMPLETED: {timestamp}
STATUS: COMPLETE

## Installed
| package | version | install_command | exit_code |
|---------|---------|----------------|-----------|
| express | 4.18.2 | npm install express@4.18.2 | 0 |

## Failures
(empty if all succeeded)

DEPENDENCIES_READY: true
```

**checkpoints/step-02-models.md**
```markdown
# Checkpoint — Data Models
COMPLETED: {timestamp}
STATUS: COMPLETE

## Created
- src/models/User.ts
- src/models/Session.ts
- src/types/auth.ts

## Deliverables Covered
- User model (validated.md deliverable 1)
- Session model (validated.md deliverable 2)

MODELS_READY: true
```

**checkpoints/step-03-services.md**
```markdown
# Checkpoint — Services/Logic
COMPLETED: {timestamp}
STATUS: COMPLETE

## Created
- src/services/AuthService.ts
- src/services/SessionManager.ts
- src/utils/validation.ts

## Deliverables Covered
- AuthService (validated.md deliverable 3)
- SessionManager (validated.md deliverable 4)

SERVICES_READY: true
```

**checkpoints/step-04-tests.md**
```markdown
# Checkpoint — Test Files
COMPLETED: {timestamp}
STATUS: COMPLETE

## Created
- tests/unit/AuthService.test.ts
- tests/integration/auth-flow.test.ts

## Coverage
Every deliverable has at least one test file.

TESTS_READY: true
```

### build.log

```
[timestamp] BUILD START — Phase {N} Cycle {M}
[timestamp] Reading validated.md
[timestamp] CHECKPOINT-1: Installing dependencies
[timestamp]   npm install express@4.18.2 → exit 0
[timestamp]   npm install bcrypt@5.1.1 → exit 0
[timestamp] CHECKPOINT-1: COMPLETE
[timestamp] CHECKPOINT-2: Creating data models
[timestamp]   Created src/models/User.ts
[timestamp]   Created src/types/auth.ts
[timestamp] CHECKPOINT-2: COMPLETE
[timestamp] CHECKPOINT-3: Creating services
[timestamp]   Created src/services/AuthService.ts
[timestamp] CHECKPOINT-3: COMPLETE
[timestamp] CHECKPOINT-4: Creating test files
[timestamp]   Created tests/unit/AuthService.test.ts
[timestamp] CHECKPOINT-4: COMPLETE
[timestamp] SELF_CHECK: Starting
[timestamp] SELF_CHECK: All files exist ✓
[timestamp] SELF_CHECK: No install failures ✓
[timestamp] SELF_CHECK: No FATAL errors ✓
[timestamp] SELF_CHECK: PASSED
[timestamp] BUILD COMPLETE
```

### built.md — Tester's Contract

```markdown
# Built — Phase {N}: {Descriptive Name}
PHASE_ID: {phase-id}
BUILD_COMPLETED: {timestamp}
BUILDER_CYCLE: {1|2|3}
BUILDER_DOC_VERSION: {agent_doc_version}
BUILD_SCOPE: full_build | patch

## Summary
{2-3 sentences. What was built. What can be done now that could not before.}

## Files Created
| filepath | type | purpose |
|----------|------|---------|
| src/models/User.ts | model | User data structure and validation |
| src/services/AuthService.ts | service | Authentication logic |
| tests/unit/AuthService.test.ts | test | Unit tests for AuthService |

## How To Reach Each Deliverable
### AuthService
- import: `import { AuthService } from './services/AuthService'`
- endpoint_or_method: `AuthService.login(email, password)`
- returns: `Promise<{ token: string, expires: number }>`

### User Model
- import: `import { User } from './models/User'`
- endpoint_or_method: `new User(data)`
- returns: `User instance with validated fields`

## Dependencies Installed
| package | version | reason |
|---------|---------|--------|
| express | 4.18.2 | Web framework (validated.md req) |
| bcrypt | 5.1.1 | Password hashing (validated.md constraint) |

## Deviations From Spec
| spec_said | built | reason | risk |
|-----------|-------|--------|------|
(empty table if none — must be present even if empty)

## What Next Phase Can Use
# CRITICAL: must match next phase's validated.md "Receives From Previous Phase" exactly.
# Orchestrator compares these before spawning next phase's Builder.
- AuthToken: { token: string, expires: number, refresh?: string }
- UserSession: { userId: string, role: "user" | "admin" }

## Known Limitations
- {item}: intentionally out of scope this phase

## Builder Confidence Report
| deliverable | confidence | notes |
|-------------|------------|-------|
| AuthService | HIGH | Spec complete, built as specified |
| User model | HIGH | All constraints clear |
| SessionManager | MEDIUM | Assumed session TTL=24h (not in spec) |
```

### SELF_FAILURE.md — Written Instead of built.md When Blocked

```markdown
# Builder Self-Failure — Phase {N}
PHASE_ID: {phase-id}
BUILDER_CYCLE: {N}
TIMESTAMP: {iso}
FAILURE_TYPE: SPEC_GAP | ENVIRONMENTAL | CONTRADICTION

## What Blocked Me
{Clear description of the gap or contradiction}

## Where in Spec
Section: {which section of validated.md}
Deliverable: {which deliverable}

## What I Need to Proceed
{Exact question or missing information}

## What I Built Before Stopping
- {file}: completed
- {file}: partial (stopped at {point})

## Suggested Spec Fix
{Exact text Validator should add to validated.md}
```

## Required Sections in built.md

All sections in the built.md template are REQUIRED.
Missing any section = build incomplete = schema failure.

## Special Section Rules

### Files Created
- Must not be empty (a build that created nothing is suspect — semantic check)
- Every file must be in src/ or tests/ (paths outside these are violations)
- Must include type: model | service | component | config | test | util

### How To Reach Each Deliverable
- Must cover every deliverable from validated.md
- import statement must be exact (copy-pasteable)
- returns must include exact types

### Deviations From Spec
- Must be present even if empty (required table)
- If not empty: every deviation must include all four columns
- "risk" column: LOW | MEDIUM | HIGH

### What Next Phase Can Use
- Must match next phase's validated.md "Receives From Previous Phase"
- Orchestrator validates this before spawning next Builder
- Field names and types must be exact

### Builder Confidence Report
- Must have at least one entry
- Must cover every deliverable
- confidence: HIGH | MEDIUM | LOW
- notes: required for MEDIUM and LOW, optional for HIGH

## Checkpoint File Rules

### When to Write Checkpoints
After completing each of the four stages:
1. After all dependencies installed → step-01-deps.md
2. After all models/types created → step-02-models.md
3. After all services/logic created → step-03-services.md
4. After all test files created → step-04-tests.md

### When to Read Checkpoints
On re-spawn (patch cycle):
- Read each checkpoint file
- If STATUS: COMPLETE → skip that stage entirely
- If STATUS: PARTIAL or missing → start from that stage

### Checkpoint STATUS Values
- COMPLETE: all files created, all commands succeeded
- PARTIAL: some files created, can resume from here
- FAILED: stage failed, cannot proceed (write SELF_FAILURE.md)

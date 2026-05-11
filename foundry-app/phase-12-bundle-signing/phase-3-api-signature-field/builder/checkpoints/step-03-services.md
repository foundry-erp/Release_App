# Checkpoint — Services/Logic
COMPLETED: 2026-04-15T00:00:00Z
STATUS: COMPLETE

## Modified
- backend/api/modules/index.js

## Changes Applied
1. Added `signature,` on a new indented line inside the `module_versions (...)` sub-select block in the .select() template literal (after `checksum,`, before `size_kb,`).
2. Added `signature:   v.signature ?? null,` to the returned object literal in the .map() callback (after `checksum:    v.checksum,`, before `size_kb:     v.size_kb,`).

## Deliverables Covered
- Modified API Handler — backend/api/modules/index.js (validated.md deliverable, File Manifest action: MODIFY)

## Constraints Verified
- v.signature ?? null used (NOT ?? '' — confirmed)
- No other response fields added, removed, or renamed — confirmed
- .select() change only adds signature to module_versions sub-block — confirmed
- File remains CommonJS (module.exports = async function handler) — confirmed
- No new require() imports added — confirmed

SERVICES_READY: true

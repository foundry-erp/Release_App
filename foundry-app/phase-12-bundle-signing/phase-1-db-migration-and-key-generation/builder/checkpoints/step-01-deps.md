# Checkpoint — Dependencies
COMPLETED: 2026-04-15T00:00:00Z
STATUS: COMPLETE

## Installed
| package | version | install_command | exit_code |
|---------|---------|----------------|-----------|
| Node.js built-in crypto | Node.js 20.x LTS stdlib | none — stdlib | 0 (N/A) |
| Node.js built-in fs | Node.js 20.x LTS stdlib | none — stdlib | 0 (N/A) |
| psql (PostgreSQL client) | 15.x | brew install postgresql@15 (operator installs; not Builder's step) | N/A — operator tool |

## Failures
(none)

## Notes
- This phase uses only Node.js built-in modules (crypto, fs). No npm install step is required or permitted.
- psql is an operator tool required at test time (AC-1.5, AC-1.6, AC-1.7). Builder documents it but does not install it.

DEPENDENCIES_READY: true

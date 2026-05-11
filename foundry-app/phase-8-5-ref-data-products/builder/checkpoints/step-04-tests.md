# Checkpoint — Test Files
COMPLETED: 2026-04-03T00:00:00Z
STATUS: COMPLETE

## Test File Written
Path: backend/tests/products.test.js

## Tests Covers
- AC-8.5.1: GET /api/products with valid JWT → HTTP 200 + `{ products: [...] }` with id, barcode, name, description fields, ordered by name ASC
- AC-8.5.2: GET /api/products without Authorization header → HTTP 401
- AC-8.5.2(b): GET /api/products with invalid JWT → HTTP 401
- Method guard: POST to /api/products → HTTP 405

## Run Command
```
# Against production (no auth — covers AC-8.5.2):
node backend/tests/products.test.js

# Against production with JWT (covers AC-8.5.1):
FOUNDRY_JWT=<token> FOUNDRY_API_URL=https://foundry-app-rouge.vercel.app node backend/tests/products.test.js
```

## Notes
- Uses Node.js built-in `assert` and `http`/`https` modules — no npm install required
- AC-8.5.1 tests are skipped gracefully when FOUNDRY_JWT env var is not set
- Exit code 1 on any failure; exit code 0 on all pass

TESTS_READY: true

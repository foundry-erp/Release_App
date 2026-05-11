# PLANNER Interface Self-Check
GENERATED: 2026-04-03T00:00:00Z
STATUS: PASS

## Interface Chain Validation

| from_phase | to_phase | interface_name | planner_type | next_phase_expects | match |
|---|---|---|---|---|---|
| phase-8-offline-sync | phase-8-5-ref-data-products | QueueManager | `{ enqueue(action): Promise<void>, getPending(): Promise<Action[]>, updateStatus(id, status): Promise<void>, countPending(): Promise<number>, countFailed(): Promise<number>, remove(id): Promise<void>, resetSyncing(): Promise<void> }` | Same shape as documented in phase-8 known facts; used by handleSubmit to enqueue `update_product_description` action | PASS |
| phase-8-offline-sync | phase-8-5-ref-data-products | SyncManager | `{ sync(): Promise<void> }` | No direct call in 8.5 module code; backend sync.js extension handles new action type routed through existing sync POST | PASS |
| phase-8-offline-sync | phase-8-5-ref-data-products | RefDataManager | `{ get(key: string): Promise<any\|null>, set(key: string, value: any, ttlMs: number): Promise<void>, delete(key: string): Promise<void> }` | Used by fetchProducts() to store/retrieve `'products'` list with 5-min TTL; optimistic update on submit also calls `.set()` | PASS |
| phase-8-offline-sync | phase-8-5-ref-data-products | initOfflineSystem | `(moduleId: string) => Promise<{ queueManager, syncManager, refDataManager }>` | Called at module init to obtain all three managers; return shape matches destructuring pattern used in phase-8 modules | PASS |
| phase-8-offline-sync | phase-8-5-ref-data-products | window.__foundry_auth__ | `{ token: string, apiBaseUrl: string }` | fetchProducts() reads `.token` and `.apiBaseUrl`; refresh button checks `.token` existence to determine online/auth state | PASS |
| phase-8-offline-sync | phase-8-5-ref-data-products | window event `foundry:online` | CustomEvent, no detail payload | Phase 8.5 may attach an additional listener to trigger fetchProducts() on reconnect alongside existing sync trigger | PASS |
| phase-8-5-ref-data-products | phase-9-store-submission | (none — functional only) | N/A | Phase 9 requires app end-to-end functional, not a code interface; no typed boundary to validate | PASS |

## Boundary Assumptions Verified

1. `refDataManager.get('products')` returns `null` when TTL has expired or key was never set — confirmed by known facts; fetchProducts() must handle null and fall back to empty array for dropdown.
2. `window.__foundry_auth__` is guaranteed to exist before any module JS runs — confirmed by known facts (Flutter injects before bridge); no null-guard needed at module load, but refresh button must check `.token` truthiness for offline detection.
3. Existing `backend/api/products/[barcode].js` is a single-item GET on a dynamic route — the new `backend/api/products/index.js` (list) and `backend/api/products/update.js` (PATCH) are separate files and do not conflict with the existing dynamic route handler.
4. CORS headers in `backend/vercel.json` already cover `/api/*` — no CORS changes needed for new endpoints; Builder must still verify route entries exist for the new paths.
5. The sync manager POSTs to `${apiBaseUrl}/api/sync` — the new `update_product_description` case is handled server-side in the existing sync.js dispatch block; no changes needed to the client-side sync manager itself.

## Failures

None.

## Result

PASS — All input interfaces from phase-8-offline-sync are consumed consistently with their documented signatures. The single output to phase-9-store-submission is a functional (non-typed) boundary and requires no interface matching. No mismatches detected.

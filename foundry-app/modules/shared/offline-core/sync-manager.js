/**
 * Foundry Offline Core — Sync Manager
 *
 * Reads pending queue entries, fetches file bytes for entries that have a
 * filePath, and POSTs all actions as one batch to POST /api/sync.
 * Marks entries synced or failed based on per-item response.
 *
 * No external dependencies — native fetch only.
 */

const MAX_BATCH_SIZE = 50;
const FETCH_TIMEOUT_MS = 30_000;

/**
 * Factory — binds to one module's queue and auth context.
 *
 * @param {string} moduleId - e.g. 'quality-inspector'
 * @param {object} queueManager - instance returned by createQueueManager
 */
export function createSyncManager(moduleId, queueManager) {
  /**
   * Drain the queue: read all pending items, fetch any file bytes,
   * POST to /api/sync, mark each item synced or failed.
   *
   * Returns { synced: number, failed: number }
   * Safe to call when queue is already empty — returns {synced:0,failed:0}.
   */
  async function sync() {
    // Step 1: get pending entries (already excludes retryCount >= 3)
    let entries = await queueManager.getPending();
    if (entries.length === 0) {
      return { synced: 0, failed: 0 };
    }

    // Cap at MAX_BATCH_SIZE — remaining will sync on next foundry:online event
    if (entries.length > MAX_BATCH_SIZE) {
      entries = entries.slice(0, MAX_BATCH_SIZE);
    }

    // Step 2: mark all as 'syncing'
    for (const entry of entries) {
      await queueManager.updateStatus(entry.id, 'syncing');
    }

    // Step 3: read auth from window.__foundry_auth__
    const auth = window.__foundry_auth__ || {};
    const token = auth.token;
    const apiBaseUrl = auth.apiBaseUrl;

    if (!token) {
      // Mark all syncing entries as failed, then throw
      for (const entry of entries) {
        await queueManager.updateStatus(entry.id, 'failed', 'No auth token');
      }
      throw new Error('No auth token');
    }
    if (!apiBaseUrl) {
      for (const entry of entries) {
        await queueManager.updateStatus(entry.id, 'failed', 'No apiBaseUrl');
      }
      throw new Error('No apiBaseUrl');
    }

    // Step 3 (cont): fetch file bytes for entries that have a filePath
    // photoBase64Map: Map<entry.id, string|null>
    const photoBase64Map = new Map();
    for (const entry of entries) {
      if (entry.filePath !== null && entry.filePath !== undefined) {
        try {
          const result = await window.shellBridge._call('readFile', { filePath: entry.filePath });
          if (result.success === true && result.data && result.data.dataUrl) {
            photoBase64Map.set(entry.id, result.data.dataUrl);
          } else {
            // Non-fatal — photo lost, proceed without it
            photoBase64Map.set(entry.id, null);
          }
        } catch (_err) {
          // Bridge call failed — non-fatal
          photoBase64Map.set(entry.id, null);
        }
      }
    }

    // Step 4: build actions array for POST body
    const actions = entries.map((entry) => {
      const actionPayload = {
        moduleSlug: moduleId,
        payload: entry.payload,
      };
      if (entry.filePath !== null && entry.filePath !== undefined) {
        actionPayload.photo = photoBase64Map.get(entry.id) ?? null;
      }
      return {
        type: entry.type,
        payload: actionPayload,
        local_id: entry.id,
      };
    });

    // Step 5–6: POST to /api/sync with 30-second timeout
    let response;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      response = await fetch(`${apiBaseUrl}/api/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ actions }),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      // Network error or timeout — mark all as failed
      clearTimeout(timeoutId);
      for (const entry of entries) {
        await queueManager.updateStatus(entry.id, 'failed', fetchErr.message || 'Network error');
      }
      return { synced: 0, failed: entries.length };
    } finally {
      clearTimeout(timeoutId);
    }

    // Step 7: non-200 response — mark all as failed
    if (response.status !== 200) {
      for (const entry of entries) {
        await queueManager.updateStatus(entry.id, 'failed', `HTTP ${response.status}`);
      }
      return { synced: 0, failed: entries.length };
    }

    // Step 8: parse response JSON
    let body;
    try {
      body = await response.json();
    } catch (_parseErr) {
      for (const entry of entries) {
        await queueManager.updateStatus(entry.id, 'failed', 'Invalid JSON response');
      }
      return { synced: 0, failed: entries.length };
    }

    // Step 9: process per-item results
    const serverResults = body.results || [];
    let synced = 0;
    let failed = 0;

    for (const item of serverResults) {
      if (item.success === true) {
        await queueManager.updateStatus(item.local_id, 'synced');
        synced += 1;
      } else {
        await queueManager.updateStatus(
          item.local_id,
          'failed',
          item.error || 'Sync failed',
        );
        failed += 1;
      }
    }

    // Step 10
    return { synced, failed };
  }

  /**
   * Return the current count of pending items.
   * @returns {Promise<number>}
   */
  async function getPendingCount() {
    return queueManager.countPending();
  }

  return { sync, getPendingCount };
}

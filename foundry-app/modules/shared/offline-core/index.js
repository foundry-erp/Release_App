/**
 * Foundry Offline Core — Entry Point
 *
 * Single import for React modules. Wires queue + sync + ref together,
 * registers the foundry:online event listener, and performs a startup
 * sync check.
 *
 * Usage (inside React useEffect with [] dependency):
 *   import { initOfflineSystem } from '@shared/offline-core';
 *   const { queueManager, syncManager, refDataManager } = await initOfflineSystem('quality-inspector');
 */

import { createQueueManager } from './queue-manager.js';
import { createSyncManager } from './sync-manager.js';
import { createRefDataManager } from './ref-data-manager.js';

/**
 * Initialize the offline system for a single module.
 *
 * 1. Creates and inits all three managers.
 * 2. Resets any 'syncing' entries left from a crashed previous session.
 * 3. Registers window event listener for 'foundry:online'.
 *    On fire: calls syncManager.sync() — fire-and-forget.
 * 4. Startup sync check:
 *    a. Calls shellBridge.getNetworkState
 *    b. If online AND pending count > 0 → syncs immediately (fire-and-forget)
 * 5. Returns { queueManager, syncManager, refDataManager }
 *
 * @param {string} moduleId - 'quality-inspector' | 'inventory-checker'
 * @returns {Promise<{ queueManager, syncManager, refDataManager }>}
 */
export async function initOfflineSystem(moduleId) {
  // Step 1: create and init all three managers
  const queueManager = createQueueManager(moduleId);
  const syncManager = createSyncManager(moduleId, queueManager);
  const refDataManager = createRefDataManager(moduleId);

  await queueManager.init();
  await refDataManager.init();

  // Step 2: crash recovery — reset any 'syncing' entries back to 'pending'
  // (retryCount is preserved so permanent failures stay capped at 3)
  await queueManager.resetSyncing();

  // Step 3: register foundry:online listener
  // Each WebView has its own JS context so no duplicate listener risk
  window.addEventListener('foundry:online', () => {
    // Fire-and-forget — do not await
    syncManager.sync().catch((err) => {
      console.warn(`[offline-core:${moduleId}] sync on foundry:online failed:`, err);
    });
  });

  // Step 4: startup sync check — wait for bridge to be injected first
  // Flutter injects the bridge on onPageFinished which fires after the JS bundle
  // runs, so we poll briefly before giving up.
  const waitForBridge = () => new Promise((resolve) => {
    if (typeof window.shellBridge?._call === 'function') {
      resolve(true);
      return;
    }
    let attempts = 0;
    const id = setInterval(() => {
      attempts++;
      if (typeof window.shellBridge?._call === 'function') {
        clearInterval(id);
        resolve(true);
      } else if (attempts >= 20) { // 20 × 250ms = 5s max wait
        clearInterval(id);
        resolve(false);
      }
    }, 250);
  });

  const bridgeReady = await waitForBridge();
  if (bridgeReady) {
    try {
      const networkResult = await window.shellBridge._call('getNetworkState', {});
      const isOnline = networkResult && networkResult.data && networkResult.data.isOnline === true;
      if (isOnline) {
        const pendingCount = await queueManager.countPending();
        if (pendingCount > 0) {
          syncManager.sync().catch((err) => {
            console.warn(`[offline-core:${moduleId}] startup sync failed:`, err);
          });
        }
      }
    } catch (_err) {
      console.warn(`[offline-core:${moduleId}] Startup network check failed:`, _err.message);
    }
  } else {
    console.warn(`[offline-core:${moduleId}] Bridge not ready after 5s — startup sync skipped`);
  }

  return { queueManager, syncManager, refDataManager };
}

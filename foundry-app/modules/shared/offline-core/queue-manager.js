/**
 * Foundry Offline Core — Queue Manager
 *
 * Provides all IndexedDB queue operations for a single module.
 * Namespaced by moduleId so no module can touch another module's data.
 *
 * DB name pattern: '{moduleId}_queue'
 * Object store:    'actions'
 * IDB version:     1
 *
 * No external dependencies — native IndexedDB API only.
 */

/**
 * Factory — call once per module, returns a bound queue instance.
 * @param {string} moduleId - e.g. 'quality-inspector' | 'inventory-checker'
 */
export function createQueueManager(moduleId) {
  const DB_NAME = `${moduleId}_queue`;
  const STORE_NAME = 'actions';
  const DB_VERSION = 1;

  let _db = null;

  /**
   * Open (or reuse) the IndexedDB database.
   * Creates the 'actions' object store on first install.
   */
  async function init() {
    if (_db) return; // already open
    _db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onerror = () => {
        reject(new Error('IndexedDB unavailable'));
      };

      req.onblocked = () => {
        reject(new Error('IndexedDB blocked'));
      };

      req.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('status', 'status', { unique: false });
        }
      };

      req.onsuccess = (event) => {
        resolve(event.target.result);
      };
    });
  }

  /**
   * Add one entry to the queue.
   * id must be a caller-supplied UUID string (crypto.randomUUID()).
   * filePath is optional — pass null when no file is associated.
   *
   * Stored record shape:
   * { id, type, payload, filePath, status: 'pending', retryCount: 0, error: null, createdAt }
   *
   * @param {{ id: string, type: string, payload: object, filePath: string|null }} entry
   */
  async function enqueue({ id, type, payload, filePath }) {
    await init();
    const record = {
      id,
      type,
      payload,
      filePath: filePath ?? null,
      status: 'pending',
      retryCount: 0,
      error: null,
      createdAt: Date.now(),
    };
    return new Promise((resolve, reject) => {
      const tx = _db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.add(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Return all records where status === 'pending' AND retryCount < 3,
   * ordered by createdAt ASC.
   * Returns [] on empty store.
   *
   * @returns {Promise<Array>}
   */
  async function getPending() {
    await init();
    return new Promise((resolve, reject) => {
      const tx = _db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('status');
      const req = index.getAll('pending');
      req.onsuccess = () => {
        const records = req.result || [];
        // Filter out entries that have hit the retry cap
        const eligible = records.filter((r) => (r.retryCount ?? 0) < 3);
        // Sort by createdAt ascending
        eligible.sort((a, b) => a.createdAt - b.createdAt);
        resolve(eligible);
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Update status (and optionally error string) for a single record by id.
   * Uses IDB put — silently does nothing if id is unknown.
   *
   * @param {string} id
   * @param {string} status - 'pending'|'syncing'|'synced'|'failed'
   * @param {string|null} [error]
   */
  async function updateStatus(id, status, error = null) {
    await init();
    return new Promise((resolve, reject) => {
      const tx = _db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const record = getReq.result;
        if (!record) {
          resolve(); // unknown id — silently do nothing
          return;
        }
        record.error = error;
        if (status === 'failed') {
          record.retryCount = (record.retryCount ?? 0) + 1;
          // If still under retry cap, reset to 'pending' so next foundry:online retries it.
          // Only permanently mark 'failed' once all 3 attempts are exhausted.
          record.status = record.retryCount >= 3 ? 'failed' : 'pending';
        } else {
          record.status = status;
        }
        const putReq = store.put(record);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  /**
   * Count records where status === 'pending' AND retryCount < 3.
   * @returns {Promise<number>}
   */
  async function countPending() {
    const records = await getPending();
    return records.length;
  }

  /**
   * Count records permanently failed (status === 'failed', retryCount >= 3).
   * These will never be retried automatically.
   * @returns {Promise<number>}
   */
  async function countFailed() {
    await init();
    return new Promise((resolve, reject) => {
      const tx = _db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('status');
      const req = index.getAll('failed');
      req.onsuccess = () => resolve((req.result || []).length);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Remove a single record by id (housekeeping after confirmed sync).
   * @param {string} id
   */
  async function remove(id) {
    await init();
    return new Promise((resolve, reject) => {
      const tx = _db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Reset any 'syncing' entries back to 'pending' (crash recovery on re-init).
   * retryCount is left unchanged.
   */
  async function resetSyncing() {
    await init();
    return new Promise((resolve, reject) => {
      const tx = _db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('status');
      const req = index.getAll('syncing');
      req.onsuccess = () => {
        const records = req.result || [];
        let remaining = records.length;
        if (remaining === 0) {
          resolve();
          return;
        }
        for (const record of records) {
          record.status = 'pending';
          const putReq = store.put(record);
          putReq.onsuccess = () => {
            remaining -= 1;
            if (remaining === 0) resolve();
          };
          putReq.onerror = () => reject(putReq.error);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  return {
    init,
    enqueue,
    getPending,
    updateStatus,
    countPending,
    countFailed,
    remove,
    resetSyncing,
  };
}

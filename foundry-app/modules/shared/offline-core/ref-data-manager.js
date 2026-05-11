/**
 * Foundry Offline Core — Reference Data Manager
 *
 * TTL-based IndexedDB cache for reference data (product lists, dropdowns).
 * Prevents repeated API calls. Each module has its own isolated ref DB.
 *
 * DB name:      '{moduleId}_ref'
 * Object store: 'cache'
 * keyPath:      'key' (string)
 * IDB version:  1
 *
 * No external dependencies — native IndexedDB API only.
 * TTL check is lazy (at read time only) — no automatic sweep.
 */

/**
 * Factory — binds to one module's reference data cache.
 * @param {string} moduleId - e.g. 'quality-inspector' | 'inventory-checker'
 */
export function createRefDataManager(moduleId) {
  const DB_NAME = `${moduleId}_ref`;
  const STORE_NAME = 'cache';
  const DB_VERSION = 1;

  let _db = null;

  /**
   * Open (or reuse) the IndexedDB reference database.
   */
  async function init() {
    if (_db) return;
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
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };

      req.onsuccess = (event) => {
        resolve(event.target.result);
      };
    });
  }

  /**
   * Store a value under key with TTL in milliseconds.
   * Stored record: { key, value, expiresAt: Date.now() + ttlMs }
   *
   * @param {string} key
   * @param {*} value
   * @param {number} ttlMs - milliseconds until expiry
   */
  async function set(key, value, ttlMs) {
    await init();
    const record = {
      key,
      value,
      expiresAt: Date.now() + ttlMs,
    };
    return new Promise((resolve, reject) => {
      const tx = _db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Return value if it exists and has not expired; null otherwise.
   * Does NOT delete expired entries (lazy cleanup — caller decides).
   *
   * @param {string} key
   * @returns {Promise<*|null>}
   */
  async function get(key) {
    await init();
    return new Promise((resolve, reject) => {
      const tx = _db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        const record = req.result;
        if (!record) {
          resolve(null);
          return;
        }
        if (Date.now() > record.expiresAt) {
          // Expired — return null without deleting
          resolve(null);
          return;
        }
        resolve(record.value);
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Explicitly delete a key.
   * @param {string} key
   */
  async function deleteKey(key) {
    await init();
    return new Promise((resolve, reject) => {
      const tx = _db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  return {
    init,
    set,
    get,
    delete: deleteKey,
  };
}

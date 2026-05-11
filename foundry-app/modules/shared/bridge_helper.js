/**
 * Foundry Bridge Helper
 *
 * Provides a clean Promise-based API over the shellBridge JavaScriptChannel
 * injected by Flutter. React modules import this instead of calling
 * window.shellBridge directly.
 *
 * The bridge interface itself is injected by module_webview.dart after
 * onPageFinished — this file just re-exports it with nicer ergonomics.
 *
 * Usage:
 *   import { capturePhoto, ping } from '../../shared/bridge_helper.js';
 *   const result = await capturePhoto({ lineItemId: '123' });
 */

/**
 * Call a bridge method by name with args.
 * Returns a Promise that resolves with { success, data, error }.
 */
export function callBridge(method, args = {}) {
  if (!window.shellBridge) {
    return Promise.reject(new Error('Bridge not available — shellBridge not injected'));
  }
  return window.shellBridge._call(method, args);
}

// ── Phase 1 methods ──────────────────────────────────────────────────────────

/** Health-check the bridge. Returns { success: true, data: { pong: true } } */
export function ping() {
  return callBridge('ping');
}

/**
 * Capture a photo. Returns { success, data: { cancelled, dataUrl?, filePath? } }.
 * filePath is the absolute device path for queue storage.
 * dataUrl is the base64 data URL for immediate display.
 * @param {object} args - optional args passed to the bridge
 */
export function capturePhoto(args = {}) {
  return callBridge('capturePhoto', args);
}

// ── Phase 2+ (will be implemented in later phases) ───────────────────────────

/** Get the current auth token (Phase 2). */
export function getAuthToken() {
  return callBridge('getAuthToken');
}

/** Get current network state (Phase 4). */
export function getNetworkState() {
  return callBridge('getNetworkState');
}

/** Read a file from Flutter file system by absolute path (Phase 8). */
export function readFile(filePath) {
  return callBridge('readFile', { filePath });
}

/** Scan a barcode (Phase 4). */
export function scanBarcode() {
  return callBridge('scanBarcode');
}

// ── Auth context helper ──────────────────────────────────────────────────────

/**
 * Get the auth context injected by Flutter (Phase 2+).
 * In Phase 1 this will be empty {}.
 */
export function getAuthContext() {
  return window.__foundry_auth__ || {};
}

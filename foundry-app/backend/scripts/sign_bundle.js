'use strict';

/**
 * sign_bundle.js
 *
 * Standalone ECDSA-P256-SHA256 signing script.
 *
 * Usage:
 *   node backend/scripts/sign_bundle.js <bundle-file-path> --key-path <absolute-path-to-private_key.pem>
 *
 * Positional argument 1 (process.argv[2]):
 *   Path to the bundle file to sign. Required.
 *
 * Named flag --key-path:
 *   Absolute path to the PKCS8 PEM private key file. Required.
 *   Format: -----BEGIN PRIVATE KEY----- (PKCS8, produced by generate_signing_key.js)
 *
 * Stdout: single base64 string (no trailing newline, no embedded newlines)
 * Stderr: empty on success; error message on failure
 * Exit code: 0 on success; 1 on any error
 *
 * Dependencies: Node.js 20.x built-in crypto, fs, path only. No npm packages.
 */

const crypto = require('crypto');
const fs = require('fs');

// --- Parse arguments ---

const args = process.argv.slice(2);

// Positional arg 1: bundle file path
const bundlePath = args[0] && !args[0].startsWith('--') ? args[0] : null;

if (!bundlePath) {
  process.stderr.write('Error: bundle file path argument required\n');
  process.exit(1);
}

// Named flag: --key-path
let keyPath = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--key-path' && i + 1 < args.length) {
    keyPath = args[i + 1];
    break;
  }
}

if (!keyPath) {
  process.stderr.write('Error: --key-path <path> flag is required\n');
  process.exit(1);
}

// --- Read files ---

let bundleBytes;
try {
  bundleBytes = fs.readFileSync(bundlePath);
} catch (err) {
  if (err.code === 'ENOENT') {
    process.stderr.write('Error: bundle file not found: ' + bundlePath + '\n');
  } else {
    process.stderr.write('Error: could not read bundle file: ' + err.message + '\n');
  }
  process.exit(1);
}

let privateKeyPem;
try {
  privateKeyPem = fs.readFileSync(keyPath, 'utf8');
} catch (err) {
  if (err.code === 'ENOENT') {
    process.stderr.write('Error: key file not found: ' + keyPath + '\n');
  } else {
    process.stderr.write('Error: could not read key file: ' + err.message + '\n');
  }
  process.exit(1);
}

// --- Sign ---

let derBuffer;
try {
  const sign = crypto.createSign('SHA256');
  sign.update(bundleBytes);
  derBuffer = sign.sign(privateKeyPem); // Buffer containing raw DER bytes
} catch (err) {
  process.stderr.write('Error: signing failed: ' + err.message + '\n');
  process.exit(1);
}

// --- Output base64 to stdout (no trailing newline) ---

const base64sig = derBuffer.toString('base64');
process.stdout.write(base64sig);

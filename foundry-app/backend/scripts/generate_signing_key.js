'use strict';

/**
 * generate_signing_key.js
 *
 * One-time offline P-256 ECDSA key pair generation script.
 *
 * Usage:
 *   node generate_signing_key.js
 *
 * Outputs (written to the directory from which the script is invoked):
 *   private_key.pem  — PKCS8 PEM-encoded P-256 private key
 *   public_key.pem   — SPKI PEM-encoded P-256 public key
 *
 * Requirements:
 *   - Node.js 20.x LTS
 *   - No npm install required — uses Node.js built-in crypto and fs only
 *
 * Exit codes:
 *   0  — success (both files written)
 *   non-zero (uncaught exception) — file system error (e.g. permission denied)
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem'
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem'
  }
});

const cwd = process.cwd();

fs.writeFileSync(path.join(cwd, 'private_key.pem'), privateKey);
fs.writeFileSync(path.join(cwd, 'public_key.pem'), publicKey);

// generate-checksums.js
// Run from foundry-app root: node phase-5-module-cdn/generate-checksums.js
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const MODULES_ROOT = path.resolve(__dirname, '..', 'modules');

const targets = [
  { slug: 'quality-inspector', label: '<QI_CHECKSUM>' },
  { slug: 'inventory-checker', label: '<IC_CHECKSUM>' },
];

console.log('\n=== Phase 5 Bundle Checksums (SHA-256) ===\n');

for (const { slug, label } of targets) {
  const bundlePath = path.join(MODULES_ROOT, slug, 'dist', 'bundle.js');
  if (!fs.existsSync(bundlePath)) {
    console.error(`MISSING: ${bundlePath}`);
    console.error(`  Run: cd modules/${slug} && npm run build\n`);
    continue;
  }
  const buf  = fs.readFileSync(bundlePath);
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  const kb   = Math.round(buf.length / 1024);
  console.log(`Module:  ${slug}`);
  console.log(`SHA-256: ${hash}`);
  console.log(`Size:    ${kb} KB`);
  console.log(`Replace: ${label} in migrate_phase5.sql\n`);
}

'use strict';

/**
 * upload_module.js
 *
 * End-to-end module publish script.
 *
 * Orchestrates:
 *   1. Signs bundle.js via sign_bundle.js child process
 *   2. Computes SHA-256 hex checksum of bundle bytes
 *   3. Uploads bundle.js to Supabase Storage bucket module-bundles
 *   4. Uploads bundle.js.sig to Supabase Storage
 *   5. Resolves module UUID from modules table
 *   6. Upserts row into module_versions
 *
 * Usage:
 *   node backend/scripts/upload_module.js \
 *     --module <slug> \
 *     --version <semver> \
 *     --dir <dist-directory> \
 *     --key-path <absolute-path-to-private_key.pem>
 *
 * Required environment variables:
 *   SUPABASE_URL              — e.g. https://gbjmxskxkqyfvqifvelg.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY — Supabase service role JWT
 *
 * Exit code: 0 on full success; 1 on any error.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { createClient } = require('@supabase/supabase-js');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BUCKET = 'module-bundles';

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

function getFlag(name) {
  const idx = args.indexOf('--' + name);
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return null;
}

const moduleSlug = getFlag('module');
const version    = getFlag('version');
const distDir    = getFlag('dir');
const keyPath    = getFlag('key-path');

// Validate required flags before any I/O
if (!moduleSlug) {
  process.stderr.write('Error: missing required flag: --module\n');
  process.exit(1);
}
if (!version) {
  process.stderr.write('Error: missing required flag: --version\n');
  process.exit(1);
}
if (!distDir) {
  process.stderr.write('Error: missing required flag: --dir\n');
  process.exit(1);
}
if (!keyPath) {
  process.stderr.write('Error: missing required flag: --key-path\n');
  process.exit(1);
}

// Validate required environment variables before any I/O
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  process.stderr.write('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required\n');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Main async pipeline
// ---------------------------------------------------------------------------

async function main() {
  // --- Resolve bundle path ---
  const bundlePath = path.join(distDir, 'bundle.js');

  if (!fs.existsSync(bundlePath)) {
    process.stderr.write('Error: bundle file not found: ' + bundlePath + '\n');
    process.exit(1);
  }

  const bundleBytes = fs.readFileSync(bundlePath);

  // --- Step 1: Sign via sign_bundle.js child process ---
  let sig;
  try {
    sig = execSync(
      'node ' + path.join(__dirname, 'sign_bundle.js') + ' ' + bundlePath + ' --key-path ' + keyPath
    ).toString().trim();
  } catch (err) {
    const stderrMsg = err.stderr ? err.stderr.toString().trim() : err.message;
    process.stderr.write('Error: signing failed: ' + stderrMsg + '\n');
    process.exit(1);
  }
  process.stdout.write('[sign] OK\n');

  // --- Step 2: Compute SHA-256 hex checksum ---
  const checksum = crypto.createHash('sha256').update(bundleBytes).digest('hex');
  process.stdout.write('[checksum] ' + checksum + '\n');

  // --- Initialise Supabase client ---
  const supabase = createClient(supabaseUrl, supabaseKey);

  // --- Step 3: Upload bundle.js to Storage ---
  const bundleStoragePath = moduleSlug + '/' + version + '/bundle.js';
  const { error: uploadBundleError } = await supabase.storage
    .from(BUCKET)
    .upload(bundleStoragePath, bundleBytes, {
      contentType: 'application/javascript',
      upsert: true
    });
  if (uploadBundleError) {
    process.stderr.write('Error: storage upload failed: ' + uploadBundleError.message + '\n');
    process.exit(1);
  }
  process.stdout.write('[upload bundle] OK\n');

  // --- Step 3b: Upload index.html to Storage ---
  const indexPath = path.join(distDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    const indexBytes = fs.readFileSync(indexPath);
    const indexStoragePath = moduleSlug + '/' + version + '/index.html';
    const { error: uploadIndexError } = await supabase.storage
      .from(BUCKET)
      .upload(indexStoragePath, indexBytes, { contentType: 'text/html', upsert: true });
    if (uploadIndexError) {
      process.stderr.write('Error: index.html upload failed: ' + uploadIndexError.message + '\n');
      process.exit(1);
    }
    process.stdout.write('[upload index.html] OK\n');
  }

  // --- Step 4: Upload bundle.js.sig to Storage ---
  const sigStoragePath = moduleSlug + '/' + version + '/bundle.js.sig';
  const sigBytes = Buffer.from(sig, 'utf8');
  const { error: uploadSigError } = await supabase.storage
    .from(BUCKET)
    .upload(sigStoragePath, sigBytes, {
      contentType: 'text/plain',
      upsert: true
    });
  if (uploadSigError) {
    process.stderr.write('Error: storage upload failed: ' + uploadSigError.message + '\n');
    process.exit(1);
  }
  process.stdout.write('[upload sig] OK\n');

  // --- Step 5: Resolve module UUID ---
  const cdnBase = supabaseUrl + '/storage/v1/object/public/' + BUCKET;
  const cdnUrl   = cdnBase + '/' + moduleSlug + '/' + version + '/bundle.js';
  const indexUrl = cdnBase + '/' + moduleSlug + '/' + version + '/index.html';

  const { data: moduleRow, error: moduleError } = await supabase
    .from('modules')
    .select('id')
    .eq('slug', moduleSlug)
    .single();

  if (moduleError || !moduleRow) {
    process.stderr.write('Error: module \'' + moduleSlug + '\' not found in database\n');
    process.exit(1);
  }

  const moduleId = moduleRow.id;

  // --- Step 6: Upsert module_versions row ---
  const sizeKb = Math.round(bundleBytes.length / 1024);

  const { error: upsertError } = await supabase
    .from('module_versions')
    .upsert({
      module_id: moduleId,
      version: version,
      cdn_url: cdnUrl,
      index_url: indexUrl,
      checksum: checksum,
      signature: sig,
      size_kb: sizeKb,
      is_active: true
    }, { onConflict: 'module_id,version' });

  if (upsertError) {
    process.stderr.write('Error: database upsert failed: ' + upsertError.message + '\n');
    process.exit(1);
  }
  process.stdout.write('[db upsert] OK\n');
}

main().catch((err) => {
  process.stderr.write('Error: unexpected failure: ' + err.message + '\n');
  process.exit(1);
});

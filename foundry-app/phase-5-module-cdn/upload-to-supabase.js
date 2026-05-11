// upload-to-supabase.js
// Usage:
//   cd phase-5-module-cdn && npm install
//   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=eyJ... node upload-to-supabase.js
//
// Prerequisites:
//   1. Bucket "module-bundles" created in Supabase Storage dashboard
//      Public: ON, CORS: allow all origins (*)
//   2. Both modules built: npm run build in each module directory

const fs   = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL              = "https://gbjmxskxkqyfvqifvelg.supabase.co"
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdiam14c2t4a3F5ZnZxaWZ2ZWxnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTExMjY2NywiZXhwIjoyMDkwNjg4NjY3fQ.Gc32SV0rvjJbjX5jMN3HZwKlluSSqZ_SqxxJUUlk-Cw"

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars required.');
  process.exit(1);
}

const supabase     = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const BUCKET       = 'module-bundles';
const MODULES_ROOT = path.resolve(__dirname, '..', 'modules');

const uploads = [
  { local: path.join(MODULES_ROOT, 'quality-inspector', 'dist', 'bundle.js'),   remote: 'quality-inspector/1.2.1/bundle.js',   type: 'application/javascript' },
  { local: path.join(MODULES_ROOT, 'quality-inspector', 'dist', 'index.html'),  remote: 'quality-inspector/1.2.1/index.html',  type: 'text/html' },
  { local: path.join(MODULES_ROOT, 'inventory-checker', 'dist', 'bundle.js'),   remote: 'inventory-checker/1.1.2/bundle.js',   type: 'application/javascript' },
  { local: path.join(MODULES_ROOT, 'inventory-checker', 'dist', 'index.html'),  remote: 'inventory-checker/1.1.2/index.html',  type: 'text/html' },
];

async function main() {
  console.log(`\nUploading to Supabase Storage → bucket: ${BUCKET}\n`);
  for (const { local, remote, type } of uploads) {
    if (!fs.existsSync(local)) {
      console.error(`MISSING: ${local}\n  Build the module first.\n`);
      continue;
    }
    const buf = fs.readFileSync(local);
    const { error } = await supabase.storage.from(BUCKET).upload(remote, buf, { contentType: type, upsert: true });
    if (error) {
      console.error(`FAILED  ${remote}:`, error.message);
    } else {
      console.log(`OK      ${remote}`);
      console.log(`        ${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${remote}`);
    }
  }
  console.log('\nDone.\n');
}

main();

/**
 * products.test.js
 * Tests for GET /api/products and PATCH /api/products/update
 * Covers AC-8.5.1 and AC-8.5.2
 *
 * Run with: node backend/tests/products.test.js
 * Requires: a running deployment at FOUNDRY_API_URL (defaults to local)
 *
 * To test against production:
 *   FOUNDRY_API_URL=https://foundry-app-rouge.vercel.app node backend/tests/products.test.js
 *
 * To test with a real JWT (AC-8.5.1):
 *   FOUNDRY_JWT=<your_token> FOUNDRY_API_URL=https://foundry-app-rouge.vercel.app node backend/tests/products.test.js
 */

const assert = require('assert');
const https  = require('https');
const http   = require('http');

const BASE_URL = process.env.FOUNDRY_API_URL || 'http://localhost:3000';
const JWT      = process.env.FOUNDRY_JWT     || null;

function request(method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url    = new URL(BASE_URL + path);
    const mod    = url.protocol === 'https:' ? https : http;
    const opts   = {
      hostname: url.hostname,
      port:     url.port || (url.protocol === 'https:' ? 443 : 80),
      path:     url.pathname + url.search,
      method,
      headers:  { 'Content-Type': 'application/json', ...headers },
    };

    const req = mod.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch (_) { parsed = data; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  // -----------------------------------------------------------------------
  // AC-8.5.2 — GET /api/products without Authorization → 401
  // -----------------------------------------------------------------------
  {
    const label = 'AC-8.5.2: GET /api/products (no auth) → 401';
    try {
      const res = await request('GET', '/api/products');
      assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
      assert.ok(res.body && res.body.error, 'Expected error field in response body');
      console.log(`  PASS  ${label}`);
      passed++;
    } catch (err) {
      console.error(`  FAIL  ${label}: ${err.message}`);
      failed++;
    }
  }

  // -----------------------------------------------------------------------
  // AC-8.5.2 (variant) — GET /api/products with invalid token → 401
  // -----------------------------------------------------------------------
  {
    const label = 'AC-8.5.2(b): GET /api/products (bad JWT) → 401';
    try {
      const res = await request('GET', '/api/products', { 'Authorization': 'Bearer invalid.token.here' });
      assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
      console.log(`  PASS  ${label}`);
      passed++;
    } catch (err) {
      console.error(`  FAIL  ${label}: ${err.message}`);
      failed++;
    }
  }

  // -----------------------------------------------------------------------
  // Method check — POST to GET-only endpoint → 405
  // -----------------------------------------------------------------------
  {
    const label = 'GET /api/products with POST method → 405';
    try {
      const res = await request('POST', '/api/products');
      assert.strictEqual(res.status, 405, `Expected 405, got ${res.status}`);
      console.log(`  PASS  ${label}`);
      passed++;
    } catch (err) {
      console.error(`  FAIL  ${label}: ${err.message}`);
      failed++;
    }
  }

  // -----------------------------------------------------------------------
  // AC-8.5.1 — GET /api/products with valid JWT → 200 + products array
  // (skipped if no JWT provided)
  // -----------------------------------------------------------------------
  if (JWT) {
    const label = 'AC-8.5.1: GET /api/products (valid JWT) → 200 + { products: [...] }';
    try {
      const res = await request('GET', '/api/products', { 'Authorization': `Bearer ${JWT}` });
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
      assert.ok(res.body && Array.isArray(res.body.products), 'Expected products array in response body');
      // Verify schema of first product if array is non-empty
      if (res.body.products.length > 0) {
        const p = res.body.products[0];
        assert.ok('id'          in p, 'Product must have id field');
        assert.ok('barcode'     in p, 'Product must have barcode field');
        assert.ok('name'        in p, 'Product must have name field');
        assert.ok('description' in p, 'Product must have description field');
        // Verify ordering — no category or unit fields leaked
        assert.ok(!('category' in p), 'Product must NOT have category field');
        assert.ok(!('unit'     in p), 'Product must NOT have unit field');
      }
      console.log(`  PASS  ${label} (${res.body.products.length} products)`);
      passed++;
    } catch (err) {
      console.error(`  FAIL  ${label}: ${err.message}`);
      failed++;
    }

    // -----------------------------------------------------------------------
    // AC-8.5.1 — Verify name ordering (ascending)
    // -----------------------------------------------------------------------
    {
      const label2 = 'AC-8.5.1(b): Products array ordered by name ASC';
      try {
        const res = await request('GET', '/api/products', { 'Authorization': `Bearer ${JWT}` });
        assert.strictEqual(res.status, 200);
        const names = (res.body.products || []).map(p => p.name);
        for (let i = 1; i < names.length; i++) {
          assert.ok(
            names[i - 1].localeCompare(names[i]) <= 0,
            `Names out of order at index ${i - 1}: "${names[i - 1]}" > "${names[i]}"`
          );
        }
        console.log(`  PASS  ${label2}`);
        passed++;
      } catch (err) {
        console.error(`  FAIL  ${label2}: ${err.message}`);
        failed++;
      }
    }
  } else {
    console.log('  SKIP  AC-8.5.1: set FOUNDRY_JWT env var to run authenticated tests');
  }

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------
  console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

console.log(`\nRunning products API tests against: ${BASE_URL}\n`);
runTests().catch(err => { console.error('Test runner crashed:', err); process.exit(1); });

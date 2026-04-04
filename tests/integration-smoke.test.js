// tests/integration-smoke.test.js
// ═══════════════════════════════════════════════════════════════
// Phase T — Integration smoke test
// Boots the server (if GEMINI_API_KEY is available) and verifies
// core endpoints respond correctly.
// Conditionally skips if env vars are missing.
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

// ── Conditional skip: need GEMINI_API_KEY for bootstrap ─────────
const HAS_ENV = !!process.env.GEMINI_API_KEY;

// ── Native http request helper (no fetch dependency) ───────────
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body,
          json() { return JSON.parse(body); },
        });
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy(new Error('HTTP request timeout'));
    });
  });
}

describe('Integration Smoke Tests', { skip: !HAS_ENV ? 'GEMINI_API_KEY not set — skipping integration tests' : false, timeout: 30000 }, () => {

  let server;
  let baseUrl;

  before(async () => {
    // Dynamic import to trigger dotenv + bootstrap
    const { bootstrap } = await import('../server/bootstrap.js');
    const { router } = await import('../server/router.js');
    const { serveStatic } = await import('../server/static.js');

    const report = await bootstrap.run();

    server = http.createServer(async (req, res) => {
      try {
        if (req.url.startsWith('/api/')) {
          await router(req, res);
          return;
        }
        await serveStatic(req, res);
      } catch (err) {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal Server Error' }));
        }
      }
    });

    await new Promise((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        baseUrl = `http://localhost:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => {
        server.close(resolve);
      });
    }
  });

  // T-IS01: Server booted (before hook succeeded)
  it('T-IS01: server boots successfully', () => {
    assert.ok(baseUrl, 'server should have started and assigned a port');
  });

  // T-IS02: Health endpoint responds 200
  it('T-IS02: GET /api/health responds 200', async () => {
    const res = await httpGet(`${baseUrl}/api/health`);
    assert.strictEqual(res.status, 200);
    const data = res.json();
    assert.ok('status' in data);
  });

  // T-IS03: Config endpoint responds 200 with sections
  it('T-IS03: GET /api/config responds 200 with config sections', async () => {
    const res = await httpGet(`${baseUrl}/api/config`);
    assert.strictEqual(res.status, 200);
    const data = res.json();
    assert.ok('BRAND' in data);
    assert.ok('CHAT' in data);
    assert.ok('FEEDBACK' in data);
  });

  // T-IS04: Config features endpoint responds 200 with 5 booleans
  it('T-IS04: GET /api/config/features responds 200 with 5 booleans', async () => {
    const res = await httpGet(`${baseUrl}/api/config/features`);
    assert.strictEqual(res.status, 200);
    const data = res.json();
    assert.strictEqual(typeof data.FEEDBACK, 'boolean');
    assert.strictEqual(typeof data.SUGGESTIONS, 'boolean');
    assert.strictEqual(typeof data.CONTENT_GAPS, 'boolean');
    assert.strictEqual(typeof data.QUALITY, 'boolean');
    assert.strictEqual(typeof data.HEALTH_SCORE, 'boolean');
  });

  // T-IS05: Unknown route returns 404
  it('T-IS05: GET /api/nonexistent returns 404', async () => {
    const res = await httpGet(`${baseUrl}/api/nonexistent`);
    assert.strictEqual(res.status, 404);
  });

});

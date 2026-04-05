// tests/helpers/test-server.js
// ═══════════════════════════════════════════════════════════════
// Test Server Utility — Phase 56
// Creates a lightweight HTTP server for integration testing.
// Uses the real router + middleware chain but WITHOUT full bootstrap.
// Handlers that need external services (Qdrant, Gemini) will fail
// with errors — that's expected. We're testing middleware behavior.
//
// IMPORTANT: Uses dynamic import for router to ensure
// process.env.ADMIN_TOKEN is set BEFORE auth.js reads it
// (auth.js reads env vars at module load time as top-level consts).
// ═══════════════════════════════════════════════════════════════

import http from 'node:http';

// ── Set env vars BEFORE router import (auth.js reads at module load) ──
process.env.ADMIN_TOKEN = 'test-admin-token-phase56';
// ACCESS_MODE defaults to 'public' — no PIN/token needed for requireAccess

// ── Dynamic import to ensure env vars are set first ──
const { router } = await import('../../server/router.js');

/**
 * Creates a test HTTP server on a random port.
 * @returns {Promise<{ server: http.Server, baseUrl: string, close: () => Promise<void> }>}
 */
export async function createTestServer() {
  const server = http.createServer(async (req, res) => {
    try {
      if (req.url.startsWith('/api/')) {
        await router(req, res);
        return;
      }
      // For non-API routes — simple 404 (no static serving in tests)
      res.writeHead(404);
      res.end();
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error' }));
      } else if (!res.writableEnded) {
        res.end();
      }
    }
  });

  return new Promise((resolve) => {
    server.listen(0, () => {
      const port = server.address().port;
      const baseUrl = `http://localhost:${port}`;
      resolve({
        server,
        baseUrl,
        close() {
          return new Promise((res) => server.close(res));
        },
      });
    });
  });
}

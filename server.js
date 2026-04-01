import "dotenv/config";
import http         from 'node:http';
import { router }   from './server/router.js';
import { serveStatic } from './server/static.js';
import { bootstrap }   from './server/bootstrap.js';

const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
  try {
    // API routes
    if (req.url.startsWith('/api/')) {
      await router(req, res);
      return;
    }
    // Static files
    await serveStatic(req, res);
  } catch (err) {
    console.error('[server] unhandled error:', err.message);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal Server Error' }));
    } else if (!res.writableEnded) {
      // SSE or open stream — close it
      res.end();
    }
  }
});

// ── Timeouts ──────────────────────────────────────────────────
server.timeout        = 30_000;   // 30s default (SSE overrides per-request)
server.headersTimeout = 10_000;   // 10s to receive headers
server.requestTimeout = 15_000;   // 15s to receive body
server.keepAliveTimeout = 5_000;  // 5s keep-alive

// ── Connection limit ──────────────────────────────────────────
server.maxConnections = 100;

// ── Bootstrap then listen ─────────────────────────────────────
(async () => {
  const report = await bootstrap.run();

  if (!report.ready) {
    console.error('[server] bootstrap FAILED — check errors above');
    console.error('[server] server will NOT start');
    process.exit(1);
  }

  server.listen(PORT, () => {
    console.log(`[server] running on http://localhost:${PORT}`);
    console.log(`[server] NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
  });
})();

// ── Server errors ─────────────────────────────────────────────
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[server] port ${PORT} already in use`);
  } else {
    console.error('[server] fatal error:', err.message);
  }
  process.exit(1);
});

// ── Unhandled errors ──────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandled rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[server] uncaught exception:', err.message);
  setTimeout(() => process.exit(1), 1000);
});

// ── Graceful shutdown ─────────────────────────────────────────
function gracefulShutdown(signal) {
  console.log(`[server] ${signal} received — shutting down`);
  server.close(() => {
    console.log('[server] closed');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('[server] forced shutdown');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

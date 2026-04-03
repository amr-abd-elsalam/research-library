// server/handlers/libraryHandler.js
// ═══════════════════════════════════════════════════════════════
// GET /api/admin/library — Phase 36
// Returns library content overview (files, topics, point counts).
// Admin-only. Read-only — no mutations.
// ═══════════════════════════════════════════════════════════════

import { libraryIndex } from '../services/libraryIndex.js';

export async function handleLibraryOverview(_req, res) {
  try {
    const index = libraryIndex.getIndex();

    if (!index) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        enabled: false,
        message: 'Library indexing is disabled or not yet refreshed',
      }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      enabled: true,
      ...index,
    }));

  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'حدث خطأ في جلب بيانات المكتبة',
      code:  'LIBRARY_ERROR',
    }));
  }
}

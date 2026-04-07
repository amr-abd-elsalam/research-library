// server/handlers/exportHandler.js
// ═══════════════════════════════════════════════════════════════
// GET /api/admin/export — Phase 40
// Admin data export: exports feedback + audit + gaps data as
// JSON attachment. Supports ?type=feedback,audit,gaps (comma-separated).
//
// Config: EXPORT.enabled (default false), EXPORT.allowedTypes,
//         EXPORT.maxExportRows (default 10000)
// Returns 404 when disabled.
// ═══════════════════════════════════════════════════════════════

import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import config from '../../config.js';
import { feedbackCollector } from '../services/feedbackCollector.js';
import { gapPersister } from '../services/gapPersister.js';
import { logger } from '../services/logger.js';
import { operationalLog } from '../services/operationalLog.js';

/**
 * GET /api/admin/export?type=feedback,audit,gaps
 * Exports admin data as a JSON attachment.
 */
export async function handleExport(req, res) {
  const exportConfig = config.EXPORT;

  // Guard: export disabled
  if (!exportConfig || exportConfig.enabled !== true) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Export disabled', code: 'EXPORT_DISABLED' }));
    return;
  }

  // Parse query params
  let requestedTypes = ['feedback']; // default
  let filterLibrary = null;
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const typeParam = url.searchParams.get('type');
    if (typeParam) {
      requestedTypes = typeParam.split(',').map(t => t.trim()).filter(Boolean);
    }
    filterLibrary = url.searchParams.get('library_id') || null;
  } catch { /* use default */ }

  // Filter to allowed types only
  const allowedTypes = exportConfig.allowedTypes || ['feedback', 'audit', 'gaps'];
  const validTypes = requestedTypes.filter(t => allowedTypes.includes(t));

  if (validTypes.length === 0) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'No valid export types specified',
      code:  'INVALID_EXPORT_TYPE',
      allowed: allowedTypes,
    }));
    return;
  }

  const maxRows = exportConfig.maxExportRows || 10000;
  const result = {};

  // ── Export feedback ──────────────────────────────────────────
  if (validTypes.includes('feedback')) {
    try {
      result.feedback = feedbackCollector.recent(maxRows, filterLibrary);
    } catch (err) {
      logger.warn('exportHandler', 'feedback export failed', { error: err.message });
      result.feedback = [];
    }
  }

  // ── Export audit ────────────────────────────────────────────
  if (validTypes.includes('audit')) {
    try {
      result.audit = await readAllAuditEntries(maxRows);
    } catch (err) {
      logger.warn('exportHandler', 'audit export failed', { error: err.message });
      result.audit = [];
    }
  }

  // ── Export gaps ─────────────────────────────────────────────
  if (validTypes.includes('gaps')) {
    try {
      const entries = await gapPersister.read();
      result.gaps = entries.slice(-maxRows);
    } catch (err) {
      logger.warn('exportHandler', 'gaps export failed', { error: err.message });
      result.gaps = [];
    }
  }

  // ── Export logs (Phase 68) ─────────────────────────────────
  if (validTypes.includes('logs')) {
    try {
      result.logs = operationalLog.recent(maxRows);
    } catch (err) {
      logger.warn('exportHandler', 'logs export failed', { error: err.message });
      result.logs = [];
    }
  }

  // ── Send response with attachment header ─────────────────────
  const filename = `ai8v-export-${validTypes.join('-')}-${Date.now()}.json`;

  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Content-Disposition': `attachment; filename="${filename}"`,
  });
  res.end(JSON.stringify(result, null, 2));
}

// ── Helper: read all audit JSONL files from audit directory ────
async function readAllAuditEntries(maxRows) {
  const auditDir = config.AUDIT?.auditDir || './data/audit';

  if (!existsSync(auditDir)) return [];

  const files = await readdir(auditDir);
  const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));

  const allEntries = [];

  for (const file of jsonlFiles) {
    if (allEntries.length >= maxRows) break;

    const filePath = join(auditDir, file);
    try {
      const raw = await readFile(filePath, 'utf-8');
      const lines = raw.split('\n').filter(line => line.trim() !== '');

      for (const line of lines) {
        if (allEntries.length >= maxRows) break;
        try {
          const entry = JSON.parse(line);
          // Add sessionId from filename (strip .jsonl)
          entry._sessionId = file.replace('.jsonl', '');
          allEntries.push(entry);
        } catch {
          // Skip corrupt lines
        }
      }
    } catch (err) {
      logger.warn('exportHandler', `failed to read audit file: ${file}`, { error: err.message });
    }
  }

  return allEntries;
}

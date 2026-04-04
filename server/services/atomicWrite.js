// server/services/atomicWrite.js
// ═══════════════════════════════════════════════════════════════
// Atomic File Write — Phase 55
// Writes content to a file atomically via temp file + rename.
// Guarantees: file is either fully written or untouched.
// Rename is atomic on the same filesystem (POSIX guarantee).
// Used by all JSON-overwrite persisters for data safety.
// ═══════════════════════════════════════════════════════════════

import { writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Writes content to filePath atomically.
 * Creates parent directory if missing.
 * Uses temp file + rename pattern for crash safety.
 *
 * @param {string} filePath — target file path
 * @param {string} content — file content (UTF-8)
 */
export async function atomicWriteFile(filePath, content) {
  await mkdir(dirname(filePath), { recursive: true });
  const tmpPath = filePath + '.tmp';
  await writeFile(tmpPath, content, 'utf-8');
  await rename(tmpPath, filePath);
}

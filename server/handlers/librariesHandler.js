// server/handlers/librariesHandler.js
// ═══════════════════════════════════════════════════════════════
// Libraries Handler — Phase 60
// GET /api/libraries — public endpoint returning available libraries.
// Returns { enabled: false, libraries: [] } when MULTI_LIBRARY disabled.
// Does NOT expose qdrantCollection names (security).
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';

export async function handleLibraries(_req, res) {
  if (!config.MULTI_LIBRARY?.enabled) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ enabled: false, libraries: [] }));
    return;
  }

  const libraries = (config.MULTI_LIBRARY.libraries || []).map(lib => ({
    id:          lib.id,
    name:        lib.name || lib.id,
    domainLabel: lib.domainLabel || null,
  }));

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    enabled: true,
    defaultLibrary: config.MULTI_LIBRARY.defaultLibrary || (libraries[0]?.id ?? null),
    libraries,
  }));
}

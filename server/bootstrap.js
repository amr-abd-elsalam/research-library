// server/bootstrap.js
// ═══════════════════════════════════════════════════════════════
// Staged Bootstrap Manager — Phase 10
// Runs 4 pre-flight stages before server.listen:
//   1. env_check    — verify required env vars
//   2. config_check — verify critical config sections
//   3. qdrant_check — test Qdrant connectivity  ┐ parallel
//   4. gemini_check — test Gemini API            ┘
// ═══════════════════════════════════════════════════════════════

import config from '../config.js';
import { getCollectionInfo, QdrantTimeoutError, QdrantNotFoundError, QdrantConnectionError } from './services/qdrant.js';
import { embedText, GeminiTimeoutError, GeminiAPIError } from './services/gemini.js';
import { commandRegistry, createTextCommand } from './services/commandRegistry.js';
import { pipelineHooks } from './services/hookRegistry.js';
import { registerAllListeners } from './services/listeners/index.js';
import { pluginRegistry } from './services/pluginRegistry.js';
import { eventBus } from './services/eventBus.js';
import { conversationContext } from './services/conversationContext.js';
import { logger } from './services/logger.js';
import { operationalLog } from './services/operationalLog.js';
import { metricsPersister } from './services/metricsPersister.js';

// ── Timeout helper (for bootstrap-specific timeouts) ──────────
function raceTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise.then(
      (v) => { clearTimeout(timer); return v; },
      (e) => { clearTimeout(timer); throw e; },
    ),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('BOOTSTRAP_TIMEOUT')), ms);
    }),
  ]);
}

const BOOT_TIMEOUT_MS = 5000;

class BootstrapManager {
  #report = null;
  #ready  = false;

  constructor() {}

  /**
   * Runs all 4 bootstrap stages in order (stages 3+4 in parallel).
   * @returns {BootstrapReport}
   */
  async run() {
    const startedAt = new Date();
    const stages    = [];

    // ── Wire Logger → OperationalLog (Phase 16) ──────────────
    logger.addListener((entry) => {
      if (entry.level === 'warn' || entry.level === 'error') {
        operationalLog.record(
          `log:${entry.level}`,
          entry.module,
          { message: entry.message, ...(entry.detail && typeof entry.detail === 'object' ? entry.detail : {}) },
          entry.correlationId || null
        );
      }
    });

    // ── Stage 1: env_check (sync) ────────────────────────────
    stages.push(await this.#runStage('env_check', () => this.#checkEnv()));

    // ── Stage 2: config_check (sync) ─────────────────────────
    stages.push(await this.#runStage('config_check', () => this.#checkConfig()));

    // ── Snapshot Recovery (Phase 23) ─────────────────────────
    await metricsPersister.restore();

    // ── Register EventBus listeners (Phase 13) ───────────────
    registerAllListeners();

    // ── Wire eviction callback (Phase 30) ────────────────────
    conversationContext.setEvictionCallback((sessionId) => {
      eventBus.emit('session:evicted', { sessionId, timestamp: Date.now() });
    });

    // ── Load & initialize plugins (Phase 15) ─────────────────
    if (config.PLUGINS?.enabled === true) {
      const inlineCount = pluginRegistry.loadFromConfig();
      const fileCount   = await pluginRegistry.loadFromDirectory();

      // Register plugin hooks on PipelineHookRegistry
      const pluginHooks = pluginRegistry.collectHooks();
      for (const fn of pluginHooks.beforePipeline) {
        pipelineHooks.register('beforePipeline', fn);
      }
      for (const fn of pluginHooks.afterPipeline) {
        pipelineHooks.register('afterPipeline', fn);
      }
      for (const [stageName, fns] of pluginHooks.beforeStage) {
        for (const fn of fns) {
          pipelineHooks.register('beforeStage', stageName, fn);
        }
      }
      for (const [stageName, fns] of pluginHooks.afterStage) {
        for (const fn of fns) {
          pipelineHooks.register('afterStage', stageName, fn);
        }
      }

      // Register plugin commands on CommandRegistry
      const pluginCommands = pluginRegistry.collectCommands();
      for (const cmd of pluginCommands) {
        if (typeof cmd.execute === 'function') {
          // Smart command with custom execute function
          commandRegistry.register({
            name:            cmd.name,
            aliases:         Array.isArray(cmd.aliases) ? cmd.aliases : [],
            description:     cmd.description || '',
            category:        'plugin',
            requiresContent: cmd.requiresContent !== undefined ? cmd.requiresContent : false,
            execute:         cmd.execute,
          });
        } else if (typeof cmd.text === 'string') {
          // Static text command — use createTextCommand factory
          commandRegistry.register(createTextCommand({
            name:        cmd.name,
            aliases:     Array.isArray(cmd.aliases) ? cmd.aliases : [],
            description: cmd.description || '',
            text:        cmd.text,
            category:    'plugin',
          }));
        }
      }

      // Register plugin EventBus listeners
      const pluginListeners = pluginRegistry.collectListeners();
      for (const { event, handler } of pluginListeners) {
        eventBus.on(event, handler);
      }

      // Initialize plugins (runs onInit hooks)
      await pluginRegistry.initialize();

      logger.info('plugins', `${pluginRegistry.size} plugin(s) loaded (${inlineCount} inline, ${fileCount} file-based), ${pluginCommands.length} command(s), ${pluginListeners.length} listener(s)`);
    }

    // ── Stages 3+4: qdrant + gemini (parallel) ───────────────
    const [qdrantStage, geminiStage] = await Promise.all([
      this.#runStage('qdrant_check', () => this.#checkQdrant()),
      this.#runStage('gemini_check', () => this.#checkGemini()),
    ]);
    stages.push(qdrantStage, geminiStage);

    // ── Build report ─────────────────────────────────────────
    const completedAt = new Date();
    const hasFail     = stages.some(s => s.status === 'fail');

    this.#ready  = !hasFail;
    this.#report = {
      ready:       this.#ready,
      startedAt:   startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs:  completedAt - startedAt,
      stages,
    };

    // ── Print startup report ─────────────────────────────────
    this.#printReport();

    // ── Start metrics persistence (Phase 23) ─────────────────
    metricsPersister.start();

    // ── Start session eviction sweep (Phase 30) ──────────────
    conversationContext.startEviction();

    return this.#report;
  }

  get isReady() {
    return this.#ready;
  }

  get report() {
    return this.#report;
  }

  /**
   * Returns a JSON-safe payload for /api/health/ready (no internal detail).
   */
  getReadinessPayload() {
    if (!this.#report) {
      return { ready: false, durationMs: null, stages: [] };
    }
    return {
      ready:      this.#report.ready,
      durationMs: this.#report.durationMs,
      stages:     this.#report.stages.map(s => ({
        name:       s.name,
        status:     s.status,
        durationMs: s.durationMs,
      })),
    };
  }

  // ── Stage runner (wraps each stage in try/catch + timing) ──
  async #runStage(name, fn) {
    const t0 = Date.now();
    try {
      const result = await fn();
      return {
        name,
        status:     result.status,
        durationMs: Date.now() - t0,
        detail:     result.detail ?? null,
      };
    } catch (err) {
      return {
        name,
        status:     'fail',
        durationMs: Date.now() - t0,
        detail:     `unexpected error: ${err.message}`,
      };
    }
  }

  // ── Stage 1: env_check ─────────────────────────────────────
  #checkEnv() {
    const missing  = [];
    const warnings = [];

    // Required
    if (!process.env.GEMINI_API_KEY) {
      missing.push('GEMINI_API_KEY');
    }

    // Optional with defaults (just informational)
    // QDRANT_URL defaults to http://localhost:6333
    // QDRANT_COLLECTION defaults to 'knowledge'

    // Optional — warn if missing
    if (!process.env.ADMIN_TOKEN) {
      warnings.push('ADMIN_TOKEN missing — admin endpoints unprotected');
    }

    if (missing.length > 0) {
      return {
        status: 'fail',
        detail: `missing required: ${missing.join(', ')}`,
      };
    }

    if (warnings.length > 0) {
      return {
        status: 'warn',
        detail: warnings.join('; '),
      };
    }

    return { status: 'ok', detail: 'all env vars present' };
  }

  // ── Stage 2: config_check ──────────────────────────────────
  #checkConfig() {
    const problems = [];

    if (!config.BRAND?.name) {
      problems.push('BRAND.name is empty');
    }
    if (!config.SYSTEM_PROMPT) {
      problems.push('SYSTEM_PROMPT is empty');
    }
    if (!config.API?.chat) {
      problems.push('API.chat is missing');
    }
    if (config.COMMANDS?.enabled === undefined) {
      problems.push('COMMANDS.enabled is missing');
    }

    const sectionCount = Object.keys(config).length;
    const cmdCount     = commandRegistry.size;
    const hookCount    = pipelineHooks.size;
    const pluginCount  = pluginRegistry.size;

    if (problems.length > 0) {
      return {
        status: 'fail',
        detail: problems.join('; '),
      };
    }

    return {
      status: 'ok',
      detail: { sections: sectionCount, commands: cmdCount, hooks: hookCount, plugins: pluginCount },
    };
  }

  // ── Stage 3: qdrant_check ──────────────────────────────────
  async #checkQdrant() {
    try {
      const info  = await raceTimeout(getCollectionInfo(), BOOT_TIMEOUT_MS);
      const count = info?.points_count ?? info?.vectors_count ?? 0;
      return {
        status: 'ok',
        detail: `${count} points`,
      };
    } catch (err) {
      if (err instanceof QdrantNotFoundError) {
        return { status: 'warn', detail: 'collection not found' };
      }
      if (err instanceof QdrantTimeoutError || err.message === 'BOOTSTRAP_TIMEOUT') {
        return { status: 'warn', detail: 'timeout' };
      }
      if (err instanceof QdrantConnectionError) {
        return { status: 'warn', detail: `connection error: ${err.message}` };
      }
      return { status: 'warn', detail: `error: ${err.message}` };
    }
  }

  // ── Stage 4: gemini_check ──────────────────────────────────
  async #checkGemini() {
    const t0 = Date.now();
    try {
      await raceTimeout(embedText('bootstrap-ping', 'CLASSIFICATION'), BOOT_TIMEOUT_MS);
      const latency = Date.now() - t0;
      return {
        status: 'ok',
        detail: `${latency}ms latency`,
      };
    } catch (err) {
      const latency = Date.now() - t0;
      // 429 = quota exceeded — API is reachable
      if (err instanceof GeminiAPIError && err.status === 429) {
        return { status: 'ok', detail: `quota limited (${latency}ms)` };
      }
      if (err instanceof GeminiTimeoutError || err.message === 'BOOTSTRAP_TIMEOUT') {
        return { status: 'warn', detail: `timeout (${latency}ms)` };
      }
      return { status: 'warn', detail: `error: ${err.message} (${latency}ms)` };
    }
  }

  // ── Console report ─────────────────────────────────────────
  #printReport() {
    const r = this.#report;
    const hasWarn = r.stages.some(s => s.status === 'warn');
    const hasFail = r.stages.some(s => s.status === 'fail');

    const icon = { ok: '\u2705', warn: '\u26A0\uFE0F', fail: '\u274C' };

    console.log('');
    console.log('\u2550'.repeat(43));
    console.log('  Ai8V Bootstrap Report');
    console.log('\u2550'.repeat(43));

    for (const s of r.stages) {
      const emoji   = icon[s.status];
      const name    = s.name.padEnd(16, '.');
      const status  = s.status.padEnd(6);
      const ms      = `(${s.durationMs}ms)`;
      const detail  = s.detail
        ? typeof s.detail === 'object'
          ? ` \u2014 ${Object.entries(s.detail).map(([k, v]) => `${v} ${k}`).join(', ')}`
          : ` \u2014 ${s.detail}`
        : '';
      console.log(`  ${emoji} ${name} ${status} ${ms}${detail}`);
    }

    console.log('\u2500'.repeat(43));

    let statusText;
    if (hasFail) {
      statusText = 'FAILED';
    } else if (hasWarn) {
      statusText = 'READY (degraded)';
    } else {
      statusText = 'READY';
    }

    console.log(`  Status: ${statusText}  |  ${r.durationMs}ms total`);
    console.log('\u2550'.repeat(43));
    console.log('');
  }
}

export { BootstrapManager };
export const bootstrap = new BootstrapManager();

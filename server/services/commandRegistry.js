// server/services/commandRegistry.js
// ═══════════════════════════════════════════════════════════════
// Extensible Command Registry — Phase 9, Phase 16 (Logger integration)
// Manages command registration, matching, execution + lifecycle hooks
// Zero dependencies — standalone module
// ═══════════════════════════════════════════════════════════════

import { logger } from './logger.js';

/**
 * @typedef {Object} CommandEntry
 * @property {string}      name            — اسم الأمر (مثل '/ملخص')
 * @property {string[]}    [aliases=[]]    — أسماء بديلة (مثل ['/summary'])
 * @property {string}      description     — وصف قصير (يظهر في /مساعدة)
 * @property {string}      category        — 'builtin' | 'custom'
 * @property {boolean}     [requiresContent=true] — هل يحتاج محتوى Qdrant?
 * @property {Function}    execute         — async (context) => void
 */

class CommandRegistry {
  /** @type {Map<string, CommandEntry>} */
  #commands = new Map();

  /** @type {Map<string, string>} alias → command name */
  #aliases = new Map();

  /** @type {{ beforeExecute: Function[], afterExecute: Function[] }} */
  #hooks = {
    beforeExecute: [],
    afterExecute:  [],
  };

  /**
   * Registers a command entry.
   * @param {CommandEntry} entry
   */
  register(entry) {
    if (!entry || !entry.name) {
      throw new Error('CommandRegistry.register: entry.name is required');
    }
    if (typeof entry.execute !== 'function') {
      throw new Error(`CommandRegistry.register: entry.execute must be a function (command: ${entry.name})`);
    }

    // Default values
    const normalized = {
      name:            entry.name,
      aliases:         Array.isArray(entry.aliases) ? entry.aliases : [],
      description:     entry.description || '',
      category:        entry.category || 'custom',
      requiresContent: entry.requiresContent !== undefined ? entry.requiresContent : true,
      execute:         entry.execute,
    };

    // Overwrite warning
    if (this.#commands.has(normalized.name)) {
      logger.warn('commandRegistry', `overwriting existing command: ${normalized.name}`);
    }

    // Register command
    this.#commands.set(normalized.name, normalized);

    // Register aliases → point to command name
    for (const alias of normalized.aliases) {
      if (this.#aliases.has(alias)) {
        logger.warn('commandRegistry', `overwriting alias: ${alias}`);
      }
      this.#aliases.set(alias, normalized.name);
    }
  }

  /**
   * Matches a message to a registered command.
   * @param {string} message — full user message
   * @returns {CommandEntry|null}
   */
  match(message) {
    if (!message || typeof message !== 'string') return null;

    const token = message.split(/\s/)[0];
    if (!token) return null;

    // Check aliases first
    const aliasTarget = this.#aliases.get(token);
    if (aliasTarget) {
      return this.#commands.get(aliasTarget) || null;
    }

    // Check direct command names
    if (this.#commands.has(token)) {
      return this.#commands.get(token);
    }

    return null;
  }

  /**
   * Parses a message into command + arguments.
   * @param {string} message — full user message (e.g. '/ملخص الفصل الأول')
   * @returns {{ command: CommandEntry, args: string[], rawArgs: string }|null}
   */
  parseMessage(message) {
    if (!message || typeof message !== 'string') return null;

    const trimmed = message.trim();
    const spaceIdx = trimmed.indexOf(' ');

    // No space — command without arguments
    if (spaceIdx === -1) {
      const cmd = this.match(trimmed);
      return cmd ? { command: cmd, args: [], rawArgs: '' } : null;
    }

    // Split on first space
    const token   = trimmed.slice(0, spaceIdx);
    const rawArgs = trimmed.slice(spaceIdx + 1).trim();
    const cmd     = this.match(token);

    if (!cmd) return null;

    const args = rawArgs ? rawArgs.split(/\s+/).filter(Boolean) : [];
    return { command: cmd, args, rawArgs };
  }

  /**
   * Searches registered commands by query string.
   * Case-insensitive search across name, description, and aliases.
   * @param {string} query — search term
   * @param {number} [limit=10] — max results to return
   * @returns {{ name: string, description: string, category: string, aliases: string[] }[]}
   */
  search(query, limit = 10) {
    if (!query || typeof query !== 'string') return this.list().slice(0, limit);

    const needle  = query.trim().toLowerCase();
    const results = [];

    for (const [, cmd] of this.#commands) {
      const haystack = [cmd.name, cmd.description, ...cmd.aliases]
        .join(' ')
        .toLowerCase();

      if (haystack.includes(needle)) {
        results.push({
          name:        cmd.name,
          description: cmd.description,
          category:    cmd.category,
          aliases:     cmd.aliases,
        });
      }
      if (results.length >= limit) break;
    }

    return results;
  }

  /**
   * Returns commands categorized by type.
   * @returns {{ builtins: object[], custom: object[], plugins: object[], total: number }}
   */
  graph() {
    const builtins = [];
    const custom   = [];
    const plugins  = [];

    for (const [, cmd] of this.#commands) {
      const entry = {
        name:        cmd.name,
        description: cmd.description,
        aliases:     cmd.aliases,
      };
      switch (cmd.category) {
        case 'builtin': builtins.push(entry); break;
        case 'plugin':  plugins.push(entry);  break;
        default:        custom.push(entry);   break;
      }
    }

    return { builtins, custom, plugins, total: this.#commands.size };
  }

  /**
   * Executes a command with lifecycle hooks.
   * Enriches context with parsed args (backward compatible — existing commands ignore extra fields).
   * @param {CommandEntry} entry
   * @param {object} context — opts passed to the handler
   */
  async execute(entry, context) {
    // Enrich context with parsed arguments
    const parsed = this.parseMessage(context.message);
    const enrichedContext = {
      ...context,
      args:    parsed?.args    || [],
      rawArgs: parsed?.rawArgs || '',
    };

    // Run beforeExecute hooks
    for (const hook of this.#hooks.beforeExecute) {
      try {
        await hook(entry, enrichedContext);
      } catch (err) {
        logger.warn('commandRegistry', 'beforeExecute hook error', { error: err.message });
      }
    }

    // Execute the command — errors propagate to caller
    await entry.execute(enrichedContext);

    // Run afterExecute hooks
    for (const hook of this.#hooks.afterExecute) {
      try {
        await hook(entry, enrichedContext);
      } catch (err) {
        logger.warn('commandRegistry', 'afterExecute hook error', { error: err.message });
      }
    }
  }

  /**
   * Registers a lifecycle hook.
   * @param {'beforeExecute'|'afterExecute'} event
   * @param {Function} fn — async (entry, context) => void
   */
  on(event, fn) {
    if (!this.#hooks[event]) {
      throw new Error(`CommandRegistry.on: unknown event '${event}'`);
    }
    if (typeof fn !== 'function') {
      throw new Error('CommandRegistry.on: fn must be a function');
    }
    this.#hooks[event].push(fn);
  }

  /**
   * Returns a sorted list of registered commands (builtin first, then custom).
   * @returns {{ name: string, description: string, category: string, aliases: string[] }[]}
   */
  list() {
    const entries = [...this.#commands.values()].map(c => ({
      name:        c.name,
      description: c.description,
      category:    c.category,
      aliases:     c.aliases,
    }));

    // Sort: builtin first, then custom
    entries.sort((a, b) => {
      if (a.category === 'builtin' && b.category !== 'builtin') return -1;
      if (a.category !== 'builtin' && b.category === 'builtin') return  1;
      return 0;
    });

    return entries;
  }

  /**
   * Number of registered commands.
   * @returns {number}
   */
  get size() {
    return this.#commands.size;
  }
}

/**
 * Factory: creates a CommandEntry that responds with static text.
 * @param {object} opts
 * @param {string}   opts.name
 * @param {string[]} [opts.aliases=[]]
 * @param {string}   opts.description
 * @param {string}   opts.text — the static text to send
 * @param {string}   [opts.category='custom']
 * @returns {CommandEntry}
 */
function createTextCommand({ name, aliases, description, text, category }) {
  return {
    name,
    aliases:         aliases || [],
    description:     description || '',
    category:        category || 'custom',
    requiresContent: false,
    execute:         async ({ res, writeChunk }) => {
      writeChunk({ text });
      writeChunk({ done: true, sources: [], score: 0 });
      if (!res.writableEnded) res.end();
    },
  };
}

// ── Singleton instance ─────────────────────────────────────────
const commandRegistry = new CommandRegistry();

export { CommandRegistry, createTextCommand };
export { commandRegistry };

// server/services/actionRegistry.js
// ═══════════════════════════════════════════════════════════════
// ActionRegistry — Phase 80 (Singleton #38)
// Unified execution surface — aggregates commands, tools, and
// triggers into a single searchable, categorized registry.
// Imports existing commands from CommandRegistry at bootstrap.
// Config-gated via ACTION_REGISTRY.enabled (default false).
// Not feature-flagged — infrastructure, not a toggleable feature.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { commandRegistry } from './commandRegistry.js';
import { logger } from './logger.js';

/**
 * @typedef {Object} ActionEntry
 * @property {string}        name         — original name (not lowered)
 * @property {'command'|'tool'|'trigger'} kind — action type
 * @property {Function|null} execute      — execution function (null for registry-only entries)
 * @property {string}        sourceHint   — origin hint (e.g. 'builtin', 'plugin', 'custom')
 * @property {string}        description  — human-readable description
 * @property {string[]}      permissions  — required permissions (future use)
 * @property {number}        registeredAt — registration timestamp
 */

class ActionRegistry {
  /** @type {Map<string, ActionEntry>} name (lowercased) → ActionEntry */
  #actions = new Map();

  /** @type {boolean} */
  #enabled;

  constructor() {
    this.#enabled = config.ACTION_REGISTRY?.enabled === true;
  }

  /** Whether the registry is enabled. */
  get enabled() { return this.#enabled; }

  /** Total number of registered actions. */
  get size() { return this.#actions.size; }

  /**
   * Registers an action.
   * @param {{ name: string, kind?: string, execute?: Function, sourceHint?: string, description?: string, permissions?: string[] }} entry
   * @throws {Error} if name is missing or not a string
   */
  register(entry) {
    if (!entry?.name || typeof entry.name !== 'string') {
      throw new Error('ActionRegistry.register: name is required and must be a non-empty string');
    }

    const normalized = entry.name.toLowerCase();
    this.#actions.set(normalized, {
      name:         entry.name,
      kind:         entry.kind || 'command',
      execute:      typeof entry.execute === 'function' ? entry.execute : null,
      sourceHint:   entry.sourceHint || '',
      description:  entry.description || '',
      permissions:  Array.isArray(entry.permissions) ? entry.permissions : [],
      registeredAt: Date.now(),
    });
  }

  /**
   * Retrieves an action by name (case-insensitive).
   * @param {string} name
   * @returns {ActionEntry|null}
   */
  get(name) {
    if (!name || typeof name !== 'string') return null;
    return this.#actions.get(name.toLowerCase()) || null;
  }

  /**
   * Checks if an action is registered (case-insensitive).
   * @param {string} name
   * @returns {boolean}
   */
  has(name) {
    if (!name || typeof name !== 'string') return false;
    return this.#actions.has(name.toLowerCase());
  }

  /**
   * Searches actions by query string.
   * Matches against name, description, and sourceHint (case-insensitive).
   * @param {string} query — search term
   * @param {number} [limit=10] — max results to return
   * @returns {ActionEntry[]}
   */
  find(query, limit = 10) {
    if (!query || typeof query !== 'string') return [];

    const needle = query.trim().toLowerCase();
    if (!needle) return [];

    const results = [];
    for (const action of this.#actions.values()) {
      const haystack = [action.name, action.description, action.sourceHint]
        .join(' ')
        .toLowerCase();

      if (haystack.includes(needle)) {
        results.push(action);
      }
      if (results.length >= limit) break;
    }

    return results;
  }

  /**
   * Filters actions by kind.
   * @param {'command'|'tool'|'trigger'} kind
   * @returns {ActionEntry[]}
   */
  listByKind(kind) {
    const results = [];
    for (const action of this.#actions.values()) {
      if (action.kind === kind) {
        results.push(action);
      }
    }
    return results;
  }

  /**
   * Populates registry from existing CommandRegistry.
   * Called during bootstrap when enabled.
   * Uses commandRegistry.list() which returns { name, description, category, aliases }.
   * Note: list() does not include execute — ActionRegistry stores null (registry, not executor).
   * @returns {number} — number of commands imported
   */
  importFromCommandRegistry() {
    const commands = commandRegistry.list();
    let count = 0;
    for (const cmd of commands) {
      this.register({
        name:        cmd.name,
        kind:        'command',
        execute:     null,
        sourceHint:  cmd.category || 'builtin',
        description: cmd.description || '',
        permissions: [],
      });
      count++;
    }
    logger.debug('actionRegistry', `imported ${count} command(s) from CommandRegistry`);
    return count;
  }

  /**
   * Summary for inspect endpoint.
   * @returns {{ enabled: boolean, totalActions: number, commands: number, tools: number, triggers: number }}
   */
  counts() {
    let commands = 0;
    let tools = 0;
    let triggers = 0;
    for (const action of this.#actions.values()) {
      switch (action.kind) {
        case 'command': commands++;  break;
        case 'tool':    tools++;     break;
        case 'trigger': triggers++;  break;
      }
    }
    return {
      enabled:      this.#enabled,
      totalActions: this.#actions.size,
      commands,
      tools,
      triggers,
    };
  }

  /**
   * Clears all registered actions. For test isolation.
   */
  reset() {
    this.#actions.clear();
  }
}

// ── Singleton instance ─────────────────────────────────────────
const actionRegistry = new ActionRegistry();

export { ActionRegistry, actionRegistry };

// server/services/unifiedRegistry.js
// ═══════════════════════════════════════════════════════════════
// UnifiedExecutionRegistry — Phase 94 (Singleton #46)
// Facade over CommandRegistry + ActionRegistry.
// Provides a single lookup surface for all executable entries
// in the system (commands, admin actions, future tools).
// Read-only after population — does not modify underlying registries.
// Backward compatible: CommandRegistry + ActionRegistry unchanged.
// Config-gated: EXECUTION_REGISTRY.enabled (default true).
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { logger } from './logger.js';

class UnifiedExecutionRegistry {
  /** @type {Map<string, object>} name (lowercase) → entry */
  #entries = new Map();
  /** @type {Map<string, string>} alias (lowercase) → name (lowercase) */
  #aliases = new Map();
  #populated = false;

  get enabled() {
    return config.EXECUTION_REGISTRY?.enabled !== false;
  }

  get isPopulated() {
    return this.#populated;
  }

  /**
   * Populates from existing registries at bootstrap.
   * Called ONCE after CommandRegistry + ActionRegistry are ready.
   *
   * Note: CommandRegistry.list() does not return the execute function,
   * so we use match(name) to retrieve the full entry including execute.
   * ActionRegistry entries imported from CommandRegistry have execute: null,
   * so we skip them (already covered by CommandRegistry entries).
   *
   * @param {object} commandRegistry — CommandRegistry singleton
   * @param {object} actionRegistry — ActionRegistry singleton
   */
  populateFromRegistries(commandRegistry, actionRegistry) {
    if (!this.enabled) return;
    if (this.#populated) return; // idempotent

    let commandCount = 0;
    let actionCount = 0;

    // 1. Register all commands — use list() for metadata + match() for execute
    const cmdList = commandRegistry.list();
    for (const cmd of cmdList) {
      try {
        // match(name) returns the full entry with execute function
        const fullEntry = commandRegistry.match(cmd.name);
        this.register({
          name:        cmd.name,
          type:        'command',
          category:    cmd.category || 'builtin',
          aliases:     cmd.aliases || [],
          permissions: {},
          execute:     fullEntry ? fullEntry.execute : null,
          description: cmd.description || '',
        });
        commandCount++;
      } catch (err) {
        logger.warn('unifiedRegistry', `skipped command: ${cmd.name}`, { error: err.message });
      }
    }

    // 2. Register admin actions that are NOT already imported from CommandRegistry
    //    (actions with execute !== null that don't overlap with commands)
    if (actionRegistry.enabled) {
      // ActionRegistry has no all() method — use listByKind for each kind
      for (const kind of ['command', 'tool', 'trigger']) {
        const actions = actionRegistry.listByKind(kind);
        for (const action of actions) {
          const key = action.name.toLowerCase();
          if (this.#entries.has(key)) continue; // already registered as command
          // Skip actions with execute: null (imported from CommandRegistry with no execute)
          if (!action.execute) continue;
          try {
            this.register({
              name:        action.name,
              type:        'action',
              category:    action.sourceHint || 'admin',
              aliases:     [],
              permissions: { denyTiers: action.permissions || [] },
              execute:     action.execute,
              description: action.description || '',
            });
            actionCount++;
          } catch (err) {
            logger.warn('unifiedRegistry', `skipped action: ${action.name}`, { error: err.message });
          }
        }
      }
    }

    this.#populated = true;
    logger.info('unifiedRegistry', `populated: ${commandCount} commands + ${actionCount} actions = ${this.#entries.size} total`);
  }

  /**
   * Registers a single entry.
   * @param {{ name: string, type: string, category: string, aliases: string[], permissions: object, execute: Function|null, description: string }} entry
   */
  register({ name, type, category, aliases, permissions, execute, description }) {
    if (!name || typeof name !== 'string') throw new Error('name is required');

    const key = name.toLowerCase();
    if (this.#entries.has(key)) throw new Error(`duplicate entry: "${name}"`);

    const entry = Object.freeze({
      name,
      type:        type || 'command',
      category:    category || 'builtin',
      aliases:     Array.isArray(aliases) ? [...aliases] : [],
      permissions: permissions || {},
      execute:     typeof execute === 'function' ? execute : null,
      description: description || '',
    });

    this.#entries.set(key, entry);

    // Register aliases
    for (const alias of entry.aliases) {
      const aliasKey = alias.toLowerCase();
      if (this.#aliases.has(aliasKey)) {
        logger.warn('unifiedRegistry', `alias collision: "${alias}" — skipping`);
        continue;
      }
      if (this.#entries.has(aliasKey)) continue; // alias matches another entry name — skip
      this.#aliases.set(aliasKey, key);
    }
  }

  /**
   * Resolves an entry by name or alias. Case-insensitive.
   * @param {string} nameOrAlias
   * @returns {object|null}
   */
  resolve(nameOrAlias) {
    if (!nameOrAlias) return null;
    const key = nameOrAlias.toLowerCase();
    if (this.#entries.has(key)) return this.#entries.get(key);
    const aliasTarget = this.#aliases.get(key);
    if (aliasTarget) return this.#entries.get(aliasTarget) || null;
    return null;
  }

  /**
   * Finds all entries of a given type.
   * @param {string} type — 'command' | 'action' | 'tool'
   * @returns {object[]}
   */
  findByType(type) {
    const results = [];
    for (const entry of this.#entries.values()) {
      if (entry.type === type) results.push(entry);
    }
    return results;
  }

  /**
   * Finds all entries of a given category.
   * @param {string} category — 'builtin' | 'custom' | 'plugin' | 'admin'
   * @returns {object[]}
   */
  findByCategory(category) {
    const results = [];
    for (const entry of this.#entries.values()) {
      if (entry.category === category) results.push(entry);
    }
    return results;
  }

  /**
   * Checks if an entry is permitted for the given permission context.
   * Uses deny-list pattern: if entry.permissions.denyTiers includes the user's tier → denied.
   * @param {string} nameOrAlias
   * @param {{ tier?: string }} permissionContext
   * @returns {boolean} true if permitted
   */
  isPermitted(nameOrAlias, permissionContext = {}) {
    const entry = this.resolve(nameOrAlias);
    if (!entry) return false;
    if (!entry.permissions || !entry.permissions.denyTiers) return true;
    if (!Array.isArray(entry.permissions.denyTiers)) return true;
    if (!permissionContext.tier) return true;
    return !entry.permissions.denyTiers.includes(permissionContext.tier);
  }

  /**
   * Resolves and executes an entry by name or alias.
   * Returns { executed: true, result } on success.
   * Returns { executed: false, reason } on failure.
   * Backward compatible: callers can check result.executed before using result.
   * @param {string} nameOrAlias
   * @param {object} context — execution context (passed to execute function)
   * @param {{ tier?: string }} permissionContext
   * @returns {Promise<{ executed: boolean, result?: any, reason?: string }>}
   */
  async executeResolved(nameOrAlias, context = {}, permissionContext = {}) {
    const entry = this.resolve(nameOrAlias);
    if (!entry) return { executed: false, reason: 'not_found' };

    if (!this.isPermitted(nameOrAlias, permissionContext)) {
      return { executed: false, reason: 'permission_denied' };
    }

    if (!entry.execute) return { executed: false, reason: 'no_execute_function' };

    try {
      const result = await entry.execute(context);
      if (config.EXECUTION_REGISTRY?.logResolutions) {
        logger.info('unifiedRegistry', `executed: ${entry.name} (${entry.type})`, {
          nameOrAlias,
          type: entry.type,
          category: entry.category,
        });
      }
      return { executed: true, result };
    } catch (err) {
      return { executed: false, reason: `execute_error: ${err.message}` };
    }
  }

  /**
   * Summary for inspect endpoint.
   */
  counts() {
    const byType = {};
    const byCategory = {};
    for (const entry of this.#entries.values()) {
      byType[entry.type] = (byType[entry.type] || 0) + 1;
      byCategory[entry.category] = (byCategory[entry.category] || 0) + 1;
    }
    return {
      enabled:    this.enabled,
      populated:  this.#populated,
      total:      this.#entries.size,
      aliases:    this.#aliases.size,
      byType,
      byCategory,
    };
  }

  /**
   * Resets all state. For test isolation.
   */
  reset() {
    this.#entries.clear();
    this.#aliases.clear();
    this.#populated = false;
  }
}

const unifiedRegistry = new UnifiedExecutionRegistry();

export { UnifiedExecutionRegistry, unifiedRegistry };

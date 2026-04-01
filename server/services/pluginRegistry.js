// server/services/pluginRegistry.js
// ═══════════════════════════════════════════════════════════════
// PluginRegistry — Phase 15, Phase 16 (Logger integration)
// Manages plugin lifecycle: registration, validation, hook/command/listener
// collection, and initialization. Plugins extend the platform without
// modifying source code.
// Zero dependencies — standalone module.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { logger } from './logger.js';

class PluginRegistry {
  #plugins     = new Map();   // Map<name, NormalizedPlugin>
  #initialized = false;

  // ── Guard: skip if plugins disabled ──────────────────────────
  get #enabled() {
    return config.PLUGINS?.enabled === true;
  }

  // ── Register a plugin (validated) ────────────────────────────
  /**
   * Validates and stores a plugin definition.
   * @param {object} plugin — raw plugin object
   * @returns {boolean} true if registered successfully
   */
  register(plugin) {
    if (!this.#enabled) return false;

    if (!plugin || typeof plugin.name !== 'string' || !plugin.name.trim()) {
      logger.warn('plugins', 'skipping plugin — missing or invalid name');
      return false;
    }

    const name = plugin.name.trim();

    if (this.#plugins.has(name)) {
      logger.warn('plugins', `overwriting existing plugin: ${name}`);
    }

    // Normalize
    const normalized = {
      name,
      version:     typeof plugin.version === 'string' ? plugin.version : '0.0.0',
      description: typeof plugin.description === 'string' ? plugin.description : '',
      enabled:     plugin.enabled !== false,
      hooks:       plugin.hooks && typeof plugin.hooks === 'object' ? plugin.hooks : {},
      commands:    Array.isArray(plugin.commands) ? plugin.commands : [],
      listeners:   Array.isArray(plugin.listeners) ? plugin.listeners : [],
    };

    this.#plugins.set(name, normalized);
    return true;
  }

  // ── Load inline plugins from config ──────────────────────────
  /**
   * Loads plugins from config.PLUGINS.registered array.
   * @returns {number} count of successfully registered plugins
   */
  loadFromConfig() {
    if (!this.#enabled) return 0;

    const registered = config.PLUGINS?.registered;
    if (!Array.isArray(registered)) return 0;

    let count = 0;
    for (const plugin of registered) {
      if (this.register(plugin)) count++;
    }
    return count;
  }

  // ── Load file-based plugins from directory ───────────────────
  /**
   * Loads .js plugin files from config.PLUGINS.dir via dynamic import().
   * Each file must export default or export const plugin = { name, ... }.
   * Only runs if config.PLUGINS.allowFilePlugins is true.
   * @returns {Promise<number>} count of successfully registered plugins
   */
  async loadFromDirectory() {
    if (!this.#enabled) return 0;
    if (config.PLUGINS?.allowFilePlugins !== true) return 0;

    const pluginDir = config.PLUGINS?.dir || './plugins';
    let count = 0;

    try {
      const { readdir } = await import('node:fs/promises');
      const { resolve, join } = await import('node:path');

      const absDir = resolve(pluginDir);
      let entries;
      try {
        entries = await readdir(absDir);
      } catch (err) {
        if (err.code === 'ENOENT') {
          // Plugin dir doesn't exist — not an error
          return 0;
        }
        logger.warn('plugins', 'failed to read plugin directory', { error: err.message });
        return 0;
      }

      for (const entry of entries) {
        if (!entry.endsWith('.js')) continue;

        try {
          const fullPath = join(absDir, entry);
          const mod = await import(fullPath);
          const plugin = mod.default || mod.plugin;

          if (plugin && typeof plugin === 'object') {
            if (this.register(plugin)) count++;
          } else {
            logger.warn('plugins', `${entry} — no valid plugin export found (expected default or named 'plugin')`);
          }
        } catch (err) {
          logger.warn('plugins', `failed to load ${entry}`, { error: err.message });
        }
      }
    } catch (err) {
      logger.warn('plugins', 'loadFromDirectory error', { error: err.message });
    }

    return count;
  }

  // ── Collect all hooks from enabled plugins ───────────────────
  /**
   * Returns all pipeline hooks from all enabled plugins,
   * structured for registration on PipelineHookRegistry.
   * @returns {{ beforePipeline: Function[], afterPipeline: Function[], beforeStage: Map<string, Function[]>, afterStage: Map<string, Function[]> }}
   */
  collectHooks() {
    const result = {
      beforePipeline: [],
      afterPipeline:  [],
      beforeStage:    new Map(),
      afterStage:     new Map(),
    };

    if (!this.#enabled) return result;

    for (const [, plugin] of this.#plugins) {
      if (!plugin.enabled || !plugin.hooks) continue;

      // Pipeline-level hooks
      if (typeof plugin.hooks.beforePipeline === 'function') {
        result.beforePipeline.push(plugin.hooks.beforePipeline);
      }
      if (typeof plugin.hooks.afterPipeline === 'function') {
        result.afterPipeline.push(plugin.hooks.afterPipeline);
      }

      // Stage-level hooks (object: { stageName: fn } or { '*': fn })
      for (const event of ['beforeStage', 'afterStage']) {
        const stageHooks = plugin.hooks[event];
        if (!stageHooks || typeof stageHooks !== 'object') continue;

        const targetMap = result[event];
        for (const [stageName, fn] of Object.entries(stageHooks)) {
          if (typeof fn !== 'function') continue;
          if (!targetMap.has(stageName)) {
            targetMap.set(stageName, []);
          }
          targetMap.get(stageName).push(fn);
        }
      }
    }

    return result;
  }

  // ── Collect all commands from enabled plugins ────────────────
  /**
   * Returns all command definitions from all enabled plugins.
   * Each command gets category='plugin' and _pluginName metadata.
   * @returns {Array<object>} command definitions ready for CommandRegistry
   */
  collectCommands() {
    if (!this.#enabled) return [];

    const commands = [];
    for (const [, plugin] of this.#plugins) {
      if (!plugin.enabled) continue;

      for (const cmd of plugin.commands) {
        if (!cmd || !cmd.name) continue;
        commands.push({
          ...cmd,
          category:    'plugin',
          _pluginName: plugin.name,
        });
      }
    }
    return commands;
  }

  // ── Collect all EventBus listeners from enabled plugins ──────
  /**
   * Returns all EventBus listener registrations from all enabled plugins.
   * @returns {Array<{ event: string, handler: Function }>}
   */
  collectListeners() {
    if (!this.#enabled) return [];

    const listeners = [];
    for (const [, plugin] of this.#plugins) {
      if (!plugin.enabled) continue;

      for (const listener of plugin.listeners) {
        if (!listener || typeof listener.event !== 'string' || typeof listener.handler !== 'function') continue;
        listeners.push({
          event:   listener.event,
          handler: listener.handler,
        });
      }
    }
    return listeners;
  }

  // ── Initialize all enabled plugins ───────────────────────────
  /**
   * Runs onInit() hook for each enabled plugin that defines one.
   * Each init is try/catch wrapped — a failing plugin doesn't stop others.
   */
  async initialize() {
    if (!this.#enabled || this.#initialized) return;

    for (const [, plugin] of this.#plugins) {
      if (!plugin.enabled) continue;
      if (typeof plugin.hooks?.onInit === 'function') {
        try {
          await plugin.hooks.onInit();
          logger.info('plugins', `initialized: ${plugin.name}`);
        } catch (err) {
          logger.warn('plugins', `onInit failed for '${plugin.name}'`, { error: err.message });
        }
      }
    }

    this.#initialized = true;
  }

  // ── List (admin/inspect) ─────────────────────────────────────
  /**
   * Returns metadata for all registered plugins.
   * @returns {Array<{ name, version, description, enabled, commandCount, listenerCount }>}
   */
  list() {
    return [...this.#plugins.values()].map(p => ({
      name:          p.name,
      version:       p.version,
      description:   p.description,
      enabled:       p.enabled,
      commandCount:  p.commands.length,
      listenerCount: p.listeners.length,
      hasHooks:      Object.keys(p.hooks).length > 0,
    }));
  }

  /** @returns {number} Number of registered plugins */
  get size() {
    return this.#plugins.size;
  }

  /** @returns {boolean} Whether initialize() has been called */
  get initialized() {
    return this.#initialized;
  }
}

// ── Singleton instance ─────────────────────────────────────────
const pluginRegistry = new PluginRegistry();

export { PluginRegistry, pluginRegistry };

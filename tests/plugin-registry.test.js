// tests/plugin-registry.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 52 — PluginRegistry unit tests
// Tests disabled-path guards for all public methods (config.PLUGINS.enabled
// defaults to false — frozen config), list/size/initialized getters,
// and reset() lifecycle.
// Uses singleton + reset() pattern.
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { pluginRegistry } from '../server/services/pluginRegistry.js';

describe('PluginRegistry', () => {

  afterEach(() => {
    pluginRegistry.reset();
  });

  // T-PR01: register() returns false when plugins disabled (config default)
  it('T-PR01: register returns false when plugins disabled', () => {
    const result = pluginRegistry.register({ name: 'test-plugin', version: '1.0.0' });
    assert.strictEqual(result, false, 'register should return false when plugins disabled');
  });

  // T-PR02: loadFromConfig() returns 0 when plugins disabled
  it('T-PR02: loadFromConfig returns 0 when plugins disabled', () => {
    const count = pluginRegistry.loadFromConfig();
    assert.strictEqual(count, 0);
  });

  // T-PR03: collectHooks() returns empty structure when disabled
  it('T-PR03: collectHooks returns empty structure when disabled', () => {
    const hooks = pluginRegistry.collectHooks();
    assert.ok(Array.isArray(hooks.beforePipeline), 'beforePipeline should be array');
    assert.ok(Array.isArray(hooks.afterPipeline), 'afterPipeline should be array');
    assert.strictEqual(hooks.beforePipeline.length, 0);
    assert.strictEqual(hooks.afterPipeline.length, 0);
    assert.ok(hooks.beforeStage instanceof Map, 'beforeStage should be Map');
    assert.ok(hooks.afterStage instanceof Map, 'afterStage should be Map');
    assert.strictEqual(hooks.beforeStage.size, 0);
    assert.strictEqual(hooks.afterStage.size, 0);
  });

  // T-PR04: collectCommands() returns empty array when disabled
  it('T-PR04: collectCommands returns empty array when disabled', () => {
    const commands = pluginRegistry.collectCommands();
    assert.ok(Array.isArray(commands), 'should return array');
    assert.strictEqual(commands.length, 0);
  });

  // T-PR05: collectListeners() returns empty array when disabled
  it('T-PR05: collectListeners returns empty array when disabled', () => {
    const listeners = pluginRegistry.collectListeners();
    assert.ok(Array.isArray(listeners), 'should return array');
    assert.strictEqual(listeners.length, 0);
  });

  // T-PR06: list() returns empty array when no plugins registered
  it('T-PR06: list returns empty array when no plugins registered', () => {
    const list = pluginRegistry.list();
    assert.ok(Array.isArray(list), 'should return array');
    assert.strictEqual(list.length, 0);
  });

  // T-PR07: size getter returns 0 initially
  it('T-PR07: size returns 0 initially', () => {
    assert.strictEqual(pluginRegistry.size, 0);
  });

  // T-PR08: initialized getter returns false before initialize()
  it('T-PR08: initialized returns false before initialize', () => {
    assert.strictEqual(pluginRegistry.initialized, false);
  });

  // T-PR09: initialize() is idempotent when disabled — no error
  it('T-PR09: initialize is idempotent when disabled — no error', async () => {
    await pluginRegistry.initialize();
    assert.strictEqual(pluginRegistry.initialized, false, 'initialized stays false when disabled');
    // Call again — should not throw
    await pluginRegistry.initialize();
    assert.strictEqual(pluginRegistry.initialized, false);
  });

  // T-PR10: reset() clears state — size becomes 0
  it('T-PR10: reset clears state — size becomes 0', () => {
    // Even though register returns false (disabled), reset should work
    pluginRegistry.reset();
    assert.strictEqual(pluginRegistry.size, 0);
    assert.strictEqual(pluginRegistry.initialized, false);
  });

  // T-PR11: list structure is correct — returns array even when disabled
  it('T-PR11: list returns array with correct shape even when empty', () => {
    const list = pluginRegistry.list();
    assert.ok(Array.isArray(list));
    // When empty, no items to verify shape — just confirm it's an array
    assert.strictEqual(list.length, 0);
  });

  // T-PR12: loadFromDirectory() returns 0 when disabled
  it('T-PR12: loadFromDirectory returns 0 when disabled', async () => {
    const count = await pluginRegistry.loadFromDirectory();
    assert.strictEqual(count, 0);
  });

});

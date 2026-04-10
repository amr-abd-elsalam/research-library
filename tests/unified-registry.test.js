// tests/unified-registry.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 94 — UnifiedExecutionRegistry Unit Tests
// Tests the unified execution registry singleton:
// register, resolve, findByType, findByCategory, isPermitted,
// populateFromRegistries, counts, reset.
// No network calls — tests pure in-memory logic.
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { UnifiedExecutionRegistry, unifiedRegistry } from '../server/services/unifiedRegistry.js';

// ── Cleanup ───────────────────────────────────────────────────
afterEach(() => {
  unifiedRegistry.reset();
});

// ═══════════════════════════════════════════════════════════════
// Block 1: Structure (T-UR01 to T-UR06)
// ═══════════════════════════════════════════════════════════════
describe('UnifiedExecutionRegistry — Structure', () => {

  // T-UR01: register command entry — resolves by name
  it('T-UR01: register command entry — resolves by name', () => {
    unifiedRegistry.register({
      name: '/test-cmd', type: 'command', category: 'builtin',
      aliases: [], permissions: {}, execute: () => {}, description: 'test',
    });
    const entry = unifiedRegistry.resolve('/test-cmd');
    assert.ok(entry, 'should resolve registered entry');
    assert.strictEqual(entry.name, '/test-cmd');
    assert.strictEqual(entry.type, 'command');
  });

  // T-UR02: register action entry — resolves by name
  it('T-UR02: register action entry — resolves by name', () => {
    unifiedRegistry.register({
      name: 'clear-cache', type: 'action', category: 'admin',
      aliases: [], permissions: { denyTiers: ['free'] }, execute: () => {}, description: 'clear cache',
    });
    const entry = unifiedRegistry.resolve('clear-cache');
    assert.ok(entry);
    assert.strictEqual(entry.type, 'action');
    assert.strictEqual(entry.category, 'admin');
  });

  // T-UR03: resolve by alias — returns correct entry
  it('T-UR03: resolve by alias — returns correct entry', () => {
    unifiedRegistry.register({
      name: '/ملخص', type: 'command', category: 'builtin',
      aliases: ['/summary', '/s'], permissions: {}, execute: () => {}, description: 'summary',
    });
    const entry = unifiedRegistry.resolve('/summary');
    assert.ok(entry);
    assert.strictEqual(entry.name, '/ملخص');
  });

  // T-UR04: resolve unknown name — returns null
  it('T-UR04: resolve unknown name — returns null', () => {
    const entry = unifiedRegistry.resolve('/nonexistent');
    assert.strictEqual(entry, null);
  });

  // T-UR05: resolve null — returns null
  it('T-UR05: resolve null — returns null', () => {
    assert.strictEqual(unifiedRegistry.resolve(null), null);
    assert.strictEqual(unifiedRegistry.resolve(''), null);
    assert.strictEqual(unifiedRegistry.resolve(undefined), null);
  });

  // T-UR06: resolve case-insensitive — works
  it('T-UR06: resolve is case-insensitive', () => {
    unifiedRegistry.register({
      name: '/Test', type: 'command', category: 'builtin',
      aliases: [], permissions: {}, execute: () => {}, description: '',
    });
    assert.ok(unifiedRegistry.resolve('/test'));
    assert.ok(unifiedRegistry.resolve('/TEST'));
    assert.ok(unifiedRegistry.resolve('/Test'));
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 2: findByType + findByCategory (T-UR07 to T-UR12)
// ═══════════════════════════════════════════════════════════════
describe('UnifiedExecutionRegistry — findByType + findByCategory', () => {

  // T-UR07: findByType('command') — returns commands only
  it('T-UR07: findByType command — returns commands only', () => {
    unifiedRegistry.register({ name: 'cmd1', type: 'command', category: 'builtin', aliases: [], permissions: {}, execute: () => {}, description: '' });
    unifiedRegistry.register({ name: 'act1', type: 'action', category: 'admin', aliases: [], permissions: {}, execute: () => {}, description: '' });
    const commands = unifiedRegistry.findByType('command');
    assert.strictEqual(commands.length, 1);
    assert.strictEqual(commands[0].name, 'cmd1');
  });

  // T-UR08: findByType('action') — returns actions only
  it('T-UR08: findByType action — returns actions only', () => {
    unifiedRegistry.register({ name: 'cmd2', type: 'command', category: 'builtin', aliases: [], permissions: {}, execute: () => {}, description: '' });
    unifiedRegistry.register({ name: 'act2', type: 'action', category: 'admin', aliases: [], permissions: {}, execute: () => {}, description: '' });
    const actions = unifiedRegistry.findByType('action');
    assert.strictEqual(actions.length, 1);
    assert.strictEqual(actions[0].name, 'act2');
  });

  // T-UR09: findByType('tool') — returns empty array
  it('T-UR09: findByType tool — returns empty', () => {
    unifiedRegistry.register({ name: 'cmd3', type: 'command', category: 'builtin', aliases: [], permissions: {}, execute: () => {}, description: '' });
    assert.strictEqual(unifiedRegistry.findByType('tool').length, 0);
  });

  // T-UR10: findByCategory('builtin') — returns correct entries
  it('T-UR10: findByCategory builtin — returns correct', () => {
    unifiedRegistry.register({ name: 'b1', type: 'command', category: 'builtin', aliases: [], permissions: {}, execute: () => {}, description: '' });
    unifiedRegistry.register({ name: 'c1', type: 'command', category: 'custom', aliases: [], permissions: {}, execute: () => {}, description: '' });
    const result = unifiedRegistry.findByCategory('builtin');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].name, 'b1');
  });

  // T-UR11: findByCategory('admin') — returns correct entries
  it('T-UR11: findByCategory admin — returns correct', () => {
    unifiedRegistry.register({ name: 'a1', type: 'action', category: 'admin', aliases: [], permissions: {}, execute: () => {}, description: '' });
    unifiedRegistry.register({ name: 'a2', type: 'action', category: 'admin', aliases: [], permissions: {}, execute: () => {}, description: '' });
    assert.strictEqual(unifiedRegistry.findByCategory('admin').length, 2);
  });

  // T-UR12: findByCategory('plugin') — returns empty if none
  it('T-UR12: findByCategory plugin — empty if none', () => {
    unifiedRegistry.register({ name: 'x1', type: 'command', category: 'builtin', aliases: [], permissions: {}, execute: () => {}, description: '' });
    assert.strictEqual(unifiedRegistry.findByCategory('plugin').length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 3: isPermitted (T-UR13 to T-UR16)
// ═══════════════════════════════════════════════════════════════
describe('UnifiedExecutionRegistry — isPermitted', () => {

  // T-UR13: isPermitted with no deny list — returns true
  it('T-UR13: no deny list — returns true', () => {
    unifiedRegistry.register({ name: 'open-cmd', type: 'command', category: 'builtin', aliases: [], permissions: {}, execute: () => {}, description: '' });
    assert.strictEqual(unifiedRegistry.isPermitted('open-cmd', { tier: 'free' }), true);
  });

  // T-UR14: isPermitted with denyTiers — returns false for denied tier
  it('T-UR14: denyTiers — false for denied tier', () => {
    unifiedRegistry.register({ name: 'admin-only', type: 'action', category: 'admin', aliases: [], permissions: { denyTiers: ['free', 'premium'] }, execute: () => {}, description: '' });
    assert.strictEqual(unifiedRegistry.isPermitted('admin-only', { tier: 'free' }), false);
    assert.strictEqual(unifiedRegistry.isPermitted('admin-only', { tier: 'premium' }), false);
  });

  // T-UR15: isPermitted with denyTiers — returns true for allowed tier
  it('T-UR15: denyTiers — true for allowed tier', () => {
    unifiedRegistry.register({ name: 'admin-ok', type: 'action', category: 'admin', aliases: [], permissions: { denyTiers: ['free'] }, execute: () => {}, description: '' });
    assert.strictEqual(unifiedRegistry.isPermitted('admin-ok', { tier: 'admin' }), true);
    assert.strictEqual(unifiedRegistry.isPermitted('admin-ok', { tier: 'premium' }), true);
  });

  // T-UR16: isPermitted unknown entry — returns false
  it('T-UR16: unknown entry — returns false', () => {
    assert.strictEqual(unifiedRegistry.isPermitted('nonexistent', { tier: 'admin' }), false);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 4: Duplicate + Alias Collision (T-UR17 to T-UR18)
// ═══════════════════════════════════════════════════════════════
describe('UnifiedExecutionRegistry — Edge Cases', () => {

  // T-UR17: duplicate registration — throws error
  it('T-UR17: duplicate name — throws', () => {
    unifiedRegistry.register({ name: 'dup', type: 'command', category: 'builtin', aliases: [], permissions: {}, execute: () => {}, description: '' });
    assert.throws(() => {
      unifiedRegistry.register({ name: 'dup', type: 'action', category: 'admin', aliases: [], permissions: {}, execute: () => {}, description: '' });
    }, /duplicate entry/);
  });

  // T-UR18: alias collision — skips (no throw)
  it('T-UR18: alias collision — skips without throwing', () => {
    unifiedRegistry.register({ name: 'cmd-a', type: 'command', category: 'builtin', aliases: ['/shared-alias'], permissions: {}, execute: () => {}, description: '' });
    // Second entry with same alias — should not throw, just skip the alias
    unifiedRegistry.register({ name: 'cmd-b', type: 'command', category: 'builtin', aliases: ['/shared-alias'], permissions: {}, execute: () => {}, description: '' });
    // The alias should still point to the first entry
    const entry = unifiedRegistry.resolve('/shared-alias');
    assert.ok(entry);
    assert.strictEqual(entry.name, 'cmd-a');
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 5: counts + reset (T-UR19 to T-UR20)
// ═══════════════════════════════════════════════════════════════
describe('UnifiedExecutionRegistry — counts + reset', () => {

  // T-UR19: counts() — returns correct totals and breakdown
  it('T-UR19: counts returns correct breakdown', () => {
    unifiedRegistry.register({ name: 'c1', type: 'command', category: 'builtin', aliases: ['/a1'], permissions: {}, execute: () => {}, description: '' });
    unifiedRegistry.register({ name: 'c2', type: 'command', category: 'custom', aliases: [], permissions: {}, execute: () => {}, description: '' });
    unifiedRegistry.register({ name: 'a1', type: 'action', category: 'admin', aliases: [], permissions: {}, execute: () => {}, description: '' });

    const c = unifiedRegistry.counts();
    assert.strictEqual(c.total, 3);
    assert.strictEqual(c.aliases, 1);
    assert.strictEqual(c.byType.command, 2);
    assert.strictEqual(c.byType.action, 1);
    assert.strictEqual(c.byCategory.builtin, 1);
    assert.strictEqual(c.byCategory.custom, 1);
    assert.strictEqual(c.byCategory.admin, 1);
    assert.strictEqual(c.enabled, true);
    assert.strictEqual(c.populated, false);
  });

  // T-UR20: reset() — clears all entries and aliases
  it('T-UR20: reset clears everything', () => {
    unifiedRegistry.register({ name: 'x', type: 'command', category: 'builtin', aliases: ['/y'], permissions: {}, execute: () => {}, description: '' });
    assert.strictEqual(unifiedRegistry.counts().total, 1);
    unifiedRegistry.reset();
    assert.strictEqual(unifiedRegistry.counts().total, 0);
    assert.strictEqual(unifiedRegistry.counts().aliases, 0);
    assert.strictEqual(unifiedRegistry.counts().populated, false);
    assert.strictEqual(unifiedRegistry.resolve('x'), null);
    assert.strictEqual(unifiedRegistry.resolve('/y'), null);
  });
});

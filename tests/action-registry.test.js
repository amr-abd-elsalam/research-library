// tests/action-registry.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 80 — ActionRegistry Tests
// Tests unified execution surface: register, get, has, find,
// listByKind, importFromCommandRegistry, counts, reset.
// No network calls — tests pure registry logic.
// ═══════════════════════════════════════════════════════════════

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ActionRegistry, actionRegistry } from '../server/services/actionRegistry.js';

// ── Cleanup ───────────────────────────────────────────────────
afterEach(() => {
  actionRegistry.reset();
});

// ═══════════════════════════════════════════════════════════════
// Block 1: ActionRegistry Structure
// ═══════════════════════════════════════════════════════════════
describe('ActionRegistry Structure', () => {

  // T-ACR01: ActionRegistry is a class
  it('T-ACR01: ActionRegistry is a class', () => {
    assert.strictEqual(typeof ActionRegistry, 'function', 'ActionRegistry should be a constructor');
    const instance = new ActionRegistry();
    assert.ok(instance instanceof ActionRegistry, 'should create instance');
  });

  // T-ACR02: actionRegistry is a singleton instance of ActionRegistry
  it('T-ACR02: actionRegistry is a singleton instance', () => {
    assert.ok(actionRegistry instanceof ActionRegistry, 'should be ActionRegistry instance');
  });

  // T-ACR03: counts() returns { enabled, totalActions, commands, tools, triggers } shape
  it('T-ACR03: counts() returns correct shape', () => {
    const c = actionRegistry.counts();
    assert.strictEqual(typeof c.enabled, 'boolean', 'enabled should be boolean');
    assert.strictEqual(typeof c.totalActions, 'number', 'totalActions should be number');
    assert.strictEqual(typeof c.commands, 'number', 'commands should be number');
    assert.strictEqual(typeof c.tools, 'number', 'tools should be number');
    assert.strictEqual(typeof c.triggers, 'number', 'triggers should be number');
  });

  // T-ACR04: reset() clears all actions — size becomes 0
  it('T-ACR04: reset() clears all actions', () => {
    actionRegistry.register({ name: '/test', kind: 'command' });
    assert.strictEqual(actionRegistry.size, 1);
    actionRegistry.reset();
    assert.strictEqual(actionRegistry.size, 0);
  });

  // T-ACR05: enabled getter returns boolean
  it('T-ACR05: enabled getter returns boolean', () => {
    assert.strictEqual(typeof actionRegistry.enabled, 'boolean');
  });

  // T-ACR06: size getter returns 0 initially (after reset)
  it('T-ACR06: size is 0 after reset', () => {
    actionRegistry.reset();
    assert.strictEqual(actionRegistry.size, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 2: Registration
// ═══════════════════════════════════════════════════════════════
describe('ActionRegistry Registration', () => {

  // T-ACR07: register() adds an action — size increases
  it('T-ACR07: register() adds an action', () => {
    actionRegistry.register({ name: '/ملخص', kind: 'command', description: 'summary' });
    assert.strictEqual(actionRegistry.size, 1);
  });

  // T-ACR08: register() throws when name is missing
  it('T-ACR08: register() throws when name is missing', () => {
    assert.throws(() => actionRegistry.register({}), /name is required/);
    assert.throws(() => actionRegistry.register(null), /name is required/);
    assert.throws(() => actionRegistry.register(undefined), /name is required/);
  });

  // T-ACR09: register() throws when name is empty string
  it('T-ACR09: register() throws when name is empty string', () => {
    assert.throws(() => actionRegistry.register({ name: '' }), /name is required/);
  });

  // T-ACR10: register() with kind='command' is retrievable
  it('T-ACR10: register with kind=command is retrievable', () => {
    actionRegistry.register({ name: '/test', kind: 'command' });
    const action = actionRegistry.get('/test');
    assert.ok(action, 'should find registered action');
    assert.strictEqual(action.kind, 'command');
  });

  // T-ACR11: register() with kind='tool' is retrievable
  it('T-ACR11: register with kind=tool is retrievable', () => {
    actionRegistry.register({ name: 'search-tool', kind: 'tool', description: 'a tool' });
    const action = actionRegistry.get('search-tool');
    assert.ok(action, 'should find registered tool');
    assert.strictEqual(action.kind, 'tool');
  });

  // T-ACR12: register() overwrites existing action with same name (case-insensitive)
  it('T-ACR12: register overwrites same name (case-insensitive)', () => {
    actionRegistry.register({ name: '/Test', kind: 'command', description: 'first' });
    actionRegistry.register({ name: '/test', kind: 'tool', description: 'second' });
    assert.strictEqual(actionRegistry.size, 1, 'should still be 1 (overwritten)');
    const action = actionRegistry.get('/test');
    assert.strictEqual(action.kind, 'tool');
    assert.strictEqual(action.description, 'second');
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 3: Lookup
// ═══════════════════════════════════════════════════════════════
describe('ActionRegistry Lookup', () => {

  // T-ACR13: get() returns action by exact name
  it('T-ACR13: get() returns action by exact name', () => {
    actionRegistry.register({ name: '/مصادر', kind: 'command', description: 'sources' });
    const action = actionRegistry.get('/مصادر');
    assert.ok(action, 'should find action');
    assert.strictEqual(action.name, '/مصادر');
  });

  // T-ACR14: get() is case-insensitive
  it('T-ACR14: get() is case-insensitive', () => {
    actionRegistry.register({ name: '/MyCommand', kind: 'command' });
    const action = actionRegistry.get('/mycommand');
    assert.ok(action, 'should find case-insensitive');
    assert.strictEqual(action.name, '/MyCommand');
  });

  // T-ACR15: get() returns null for unknown name
  it('T-ACR15: get() returns null for unknown name', () => {
    assert.strictEqual(actionRegistry.get('/nonexistent'), null);
    assert.strictEqual(actionRegistry.get(null), null);
    assert.strictEqual(actionRegistry.get(''), null);
  });

  // T-ACR16: has() returns true for registered, false for unknown
  it('T-ACR16: has() returns true/false correctly', () => {
    actionRegistry.register({ name: '/exists', kind: 'command' });
    assert.strictEqual(actionRegistry.has('/exists'), true);
    assert.strictEqual(actionRegistry.has('/EXISTS'), true);
    assert.strictEqual(actionRegistry.has('/nope'), false);
    assert.strictEqual(actionRegistry.has(null), false);
    assert.strictEqual(actionRegistry.has(''), false);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 4: Search & Filter
// ═══════════════════════════════════════════════════════════════
describe('ActionRegistry Search & Filter', () => {

  // T-ACR17: find() returns matching actions by query
  it('T-ACR17: find() returns matching actions', () => {
    actionRegistry.register({ name: '/ملخص', kind: 'command', description: 'ملخص شامل من المكتبة' });
    actionRegistry.register({ name: '/مصادر', kind: 'command', description: 'عرض المصادر' });
    actionRegistry.register({ name: 'embed-tool', kind: 'tool', description: 'embedding tool' });
    const results = actionRegistry.find('ملخص');
    assert.ok(results.length >= 1, 'should find at least one match');
    assert.strictEqual(results[0].name, '/ملخص');
  });

  // T-ACR18: find() respects limit parameter
  it('T-ACR18: find() respects limit parameter', () => {
    for (let i = 0; i < 5; i++) {
      actionRegistry.register({ name: `/cmd${i}`, kind: 'command', description: 'test command' });
    }
    const results = actionRegistry.find('command', 2);
    assert.strictEqual(results.length, 2, 'should respect limit');
  });

  // T-ACR19: find() returns empty array for no match
  it('T-ACR19: find() returns empty for no match', () => {
    actionRegistry.register({ name: '/test', kind: 'command', description: 'testing' });
    const results = actionRegistry.find('zzzznonexistent');
    assert.strictEqual(results.length, 0);
  });

  // T-ACR20: listByKind('command') returns only commands
  it('T-ACR20: listByKind filters correctly', () => {
    actionRegistry.register({ name: '/cmd1', kind: 'command' });
    actionRegistry.register({ name: 'tool1', kind: 'tool' });
    actionRegistry.register({ name: '/cmd2', kind: 'command' });
    actionRegistry.register({ name: 'trigger1', kind: 'trigger' });

    const commands = actionRegistry.listByKind('command');
    assert.strictEqual(commands.length, 2);
    assert.ok(commands.every(a => a.kind === 'command'));

    const tools = actionRegistry.listByKind('tool');
    assert.strictEqual(tools.length, 1);
    assert.strictEqual(tools[0].name, 'tool1');

    const triggers = actionRegistry.listByKind('trigger');
    assert.strictEqual(triggers.length, 1);
    assert.strictEqual(triggers[0].name, 'trigger1');
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 5: importFromCommandRegistry
// ═══════════════════════════════════════════════════════════════
describe('ActionRegistry importFromCommandRegistry', () => {

  // T-ACR21: importFromCommandRegistry returns number
  it('T-ACR21: importFromCommandRegistry returns a number', () => {
    const count = actionRegistry.importFromCommandRegistry();
    assert.strictEqual(typeof count, 'number');
    assert.ok(count >= 0, 'should be >= 0');
  });

  // T-ACR22: after import, size matches imported count
  it('T-ACR22: after import, size matches count', () => {
    const count = actionRegistry.importFromCommandRegistry();
    assert.strictEqual(actionRegistry.size, count);
  });

  // T-ACR23: imported actions have kind='command'
  it('T-ACR23: imported actions have kind=command', () => {
    actionRegistry.importFromCommandRegistry();
    const commands = actionRegistry.listByKind('command');
    assert.strictEqual(commands.length, actionRegistry.size, 'all imported should be commands');
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 6: counts() Detail
// ═══════════════════════════════════════════════════════════════
describe('ActionRegistry counts Detail', () => {

  // T-ACR24: counts reflects registered actions
  it('T-ACR24: counts reflects registered actions', () => {
    actionRegistry.register({ name: '/cmd', kind: 'command' });
    actionRegistry.register({ name: 'tool', kind: 'tool' });
    actionRegistry.register({ name: 'trig', kind: 'trigger' });
    const c = actionRegistry.counts();
    assert.strictEqual(c.totalActions, 3);
    assert.strictEqual(c.commands, 1);
    assert.strictEqual(c.tools, 1);
    assert.strictEqual(c.triggers, 1);
  });

  // T-ACR25: find() returns empty array for null/empty query
  it('T-ACR25: find() handles null and empty query', () => {
    actionRegistry.register({ name: '/test', kind: 'command' });
    assert.deepStrictEqual(actionRegistry.find(null), []);
    assert.deepStrictEqual(actionRegistry.find(''), []);
    assert.deepStrictEqual(actionRegistry.find('   '), []);
  });
});

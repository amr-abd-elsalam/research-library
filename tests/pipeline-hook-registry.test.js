// tests/pipeline-hook-registry.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 55 — PipelineHookRegistry unit tests
// Tests hook registration and execution for all event types:
//   beforePipeline, afterPipeline, beforeStage, afterStage
// Uses new PipelineHookRegistry() instances for full isolation.
// ═══════════════════════════════════════════════════════════════

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PipelineHookRegistry } from '../server/services/hookRegistry.js';

describe('PipelineHookRegistry', () => {

  // T-PHR01: fresh instance — size is 0
  it('T-PHR01: fresh instance has size 0', () => {
    const registry = new PipelineHookRegistry();
    assert.strictEqual(registry.size, 0);
  });

  // T-PHR02: register beforePipeline increases size
  it('T-PHR02: register beforePipeline increases size', () => {
    const registry = new PipelineHookRegistry();
    registry.register('beforePipeline', () => {});
    assert.strictEqual(registry.size, 1);
  });

  // T-PHR03: register afterPipeline increases size
  it('T-PHR03: register afterPipeline increases size', () => {
    const registry = new PipelineHookRegistry();
    registry.register('afterPipeline', () => {});
    assert.strictEqual(registry.size, 1);
  });

  // T-PHR04: register beforeStage with specific stage name
  it('T-PHR04: register beforeStage with specific stage name', () => {
    const registry = new PipelineHookRegistry();
    registry.register('beforeStage', 'stageEmbed', () => {});
    assert.strictEqual(registry.size, 1);
  });

  // T-PHR05: register afterStage with wildcard
  it('T-PHR05: register afterStage with wildcard *', () => {
    const registry = new PipelineHookRegistry();
    registry.register('afterStage', '*', () => {});
    assert.strictEqual(registry.size, 1);
  });

  // T-PHR06: run beforePipeline calls registered hooks
  it('T-PHR06: run beforePipeline calls registered hooks', async () => {
    const registry = new PipelineHookRegistry();
    let called = false;
    registry.register('beforePipeline', () => { called = true; });
    await registry.run('beforePipeline', null, {}, {});
    assert.strictEqual(called, true);
  });

  // T-PHR07: hook error is caught — does not propagate, other hooks still run
  it('T-PHR07: hook error is caught — other hooks still run', async () => {
    const registry = new PipelineHookRegistry();
    let secondCalled = false;
    registry.register('beforePipeline', () => { throw new Error('test error'); });
    registry.register('beforePipeline', () => { secondCalled = true; });
    await registry.run('beforePipeline', null, {}, {});
    assert.strictEqual(secondCalled, true);
  });

  // T-PHR08: run with no hooks for type — no throw
  it('T-PHR08: run with no hooks registered does not throw', async () => {
    const registry = new PipelineHookRegistry();
    await assert.doesNotReject(async () => {
      await registry.run('beforePipeline', null, {}, {});
    });
  });

  // T-PHR09: beforeStage hooks receive stageName
  it('T-PHR09: beforeStage hooks receive stageName', async () => {
    const registry = new PipelineHookRegistry();
    let receivedName = null;
    registry.register('beforeStage', 'stageSearch', (ctx, trace, name) => {
      receivedName = name;
    });
    await registry.run('beforeStage', 'stageSearch', {}, {});
    assert.strictEqual(receivedName, 'stageSearch');
  });

  // T-PHR10: afterStage wildcard '*' called for any stage
  it('T-PHR10: afterStage wildcard called for any stage', async () => {
    const registry = new PipelineHookRegistry();
    let called = false;
    registry.register('afterStage', '*', () => { called = true; });
    await registry.run('afterStage', 'stageEmbed', {}, {});
    assert.strictEqual(called, true);
  });

});

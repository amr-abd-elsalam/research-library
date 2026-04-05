// tests/listeners/log-listener.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 58 — Unit tests for logListener
// Tests that pipeline:complete, pipeline:stageComplete,
// pipeline:cacheHit, and command:complete events write entries
// to the OperationalLog ring buffer.
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { eventBus }       from '../../server/services/eventBus.js';
import { operationalLog } from '../../server/services/operationalLog.js';
import { register }       from '../../server/services/listeners/logListener.js';

let registered = false;

describe('LogListener', () => {

  before(() => {
    if (!registered) {
      register();
      registered = true;
    }
  });

  afterEach(() => {
    operationalLog.reset();
  });

  // T-LOG01: pipeline:complete — writes operational log entry
  it('T-LOG01: pipeline:complete — writes operational log entry', () => {
    eventBus.emit('pipeline:complete', {
      queryType: 'factual',
      totalMs: 200,
      aborted: false,
      correlationId: 'log-corr-01',
      sources: [{ id: 1 }, { id: 2 }],
      _queryIntent: { intent: 'question' },
    });

    const entries = operationalLog.all();
    const pipelineEntries = entries.filter(e => e.event === 'pipeline:complete');
    assert.ok(pipelineEntries.length >= 1, 'should have at least 1 pipeline:complete entry');

    const last = pipelineEntries[pipelineEntries.length - 1];
    assert.strictEqual(last.module, 'pipeline');
    assert.strictEqual(last.correlationId, 'log-corr-01');
    assert.strictEqual(last.detail.queryType, 'factual');
    assert.strictEqual(last.detail.totalMs, 200);
    assert.strictEqual(last.detail.sourcesCount, 2);
    assert.strictEqual(last.detail.intent, 'question');
  });

  // T-LOG02: pipeline:stageComplete — writes stage log entry
  it('T-LOG02: pipeline:stageComplete — writes stage log entry', () => {
    eventBus.emit('pipeline:stageComplete', {
      stageName: 'stageEmbed',
      durationMs: 45,
      status: 'ok',
      correlationId: 'log-corr-02',
    });

    const entries = operationalLog.all();
    const stageEntries = entries.filter(e => e.event === 'pipeline:stageComplete');
    assert.ok(stageEntries.length >= 1, 'should have at least 1 stageComplete entry');

    const last = stageEntries[stageEntries.length - 1];
    assert.strictEqual(last.module, 'pipeline');
    assert.strictEqual(last.detail.stageName, 'stageEmbed');
    assert.strictEqual(last.detail.durationMs, 45);
  });

  // T-LOG03: pipeline:cacheHit — writes cache hit log entry
  it('T-LOG03: pipeline:cacheHit — writes cache hit log entry', () => {
    eventBus.emit('pipeline:cacheHit', {
      message: 'What is machine learning and how does it work in practice?',
      topicFilter: 'AI',
    });

    const entries = operationalLog.all();
    const cacheEntries = entries.filter(e => e.event === 'pipeline:cacheHit');
    assert.ok(cacheEntries.length >= 1, 'should have at least 1 cacheHit entry');

    const last = cacheEntries[cacheEntries.length - 1];
    assert.strictEqual(last.module, 'cache');
    assert.strictEqual(last.detail.topicFilter, 'AI');
    assert.ok(last.detail.messagePreview.length <= 80, 'message should be truncated to 80 chars');
  });

  // T-LOG04: command:complete — writes command log entry
  it('T-LOG04: command:complete — writes command log entry', () => {
    eventBus.emit('command:complete', {
      commandName: '/ملخص',
      latencyMs: 60,
    });

    const entries = operationalLog.all();
    const cmdEntries = entries.filter(e => e.event === 'command:complete');
    assert.ok(cmdEntries.length >= 1, 'should have at least 1 command:complete entry');

    const last = cmdEntries[cmdEntries.length - 1];
    assert.strictEqual(last.module, 'commands');
    assert.strictEqual(last.detail.commandName, '/ملخص');
    assert.strictEqual(last.detail.latencyMs, 60);
  });

  // T-LOG05: null event data — no crash
  it('T-LOG05: null event data — no crash', () => {
    assert.doesNotThrow(() => {
      eventBus.emit('pipeline:complete', null);
    });
  });
});

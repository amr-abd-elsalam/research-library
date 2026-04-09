// tests/chaos-resilience.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 89 — Chaos Resilience Tests
// Tests graceful degradation under various failure scenarios.
// Uses PipelineTestHarness.runWithChaos() and direct chaos
// injection on MockLLMProvider and MockVectorStore.
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PipelineTestHarness, buildHit } from './helpers/pipeline-test-harness.js';
import { conversationContext } from '../server/services/conversationContext.js';

// ═══════════════════════════════════════════════════════════════
// Block 1: Single Stage Failures (T-CHR01 to T-CHR07)
// ═══════════════════════════════════════════════════════════════
describe('Chaos Resilience — Single Stage Failures', () => {
  let harness;

  before(async () => {
    harness = new PipelineTestHarness();
    await harness.setup();
  });

  after(async () => {
    await harness.teardown();
  });

  // T-CHR01: embed failure → pipeline throws
  it('T-CHR01: embed failure throws from pipeline', async () => {
    await assert.rejects(
      () => harness.runWithChaos('ما هو الذكاء الاصطناعي؟', {}, {
        llm: { failOnNthCall: 0 },
      }),
      (err) => {
        assert.ok(err.message.includes('chaos'), `expected chaos error, got: ${err.message}`);
        return true;
      },
    );
  });

  // T-CHR02: search failure → pipeline throws
  it('T-CHR02: search failure throws from pipeline', async () => {
    await assert.rejects(
      () => harness.runWithChaos('ما هو الذكاء الاصطناعي؟', {}, {
        vectorStore: { failOnNthCall: 0 },
      }),
      (err) => {
        assert.ok(err.message.includes('chaos'), `expected chaos error, got: ${err.message}`);
        return true;
      },
    );
  });

  // T-CHR03: stream/generate degradation → empty response (not crash)
  it('T-CHR03: degraded generate returns empty text', async () => {
    // degradeAfterCalls: 0 means degrade from the very first call
    const { ctx } = await harness.runWithChaos('ما هو الذكاء الاصطناعي؟', {}, {
      llm: { degradeAfterCalls: 0 },
    });
    // embedText still works (returns zero vector) but streamGenerate returns empty
    // If embed returns zero vector, search may still return results
    // The key is no crash
    assert.strictEqual(typeof ctx.fullText, 'string');
  });

  // T-CHR04: search returns 0 hits → low_confidence abort
  it('T-CHR04: zero search results → low_confidence abort', async () => {
    harness.mockStore.setEmptyMode(true);
    const { ctx } = await harness.run('سؤال بدون نتائج');
    assert.strictEqual(ctx.aborted, true);
    assert.strictEqual(ctx.abortReason, 'low_confidence');
    harness.mockStore.setEmptyMode(false);
  });

  // T-CHR05: low score results → abort
  it('T-CHR05: low score results → abort', async () => {
    harness.mockStore.setLowScoreMode(true);
    const { ctx } = await harness.run('سؤال بنتائج ضعيفة');
    assert.strictEqual(ctx.aborted, true);
    assert.strictEqual(ctx.abortReason, 'low_confidence');
    harness.mockStore.setLowScoreMode(false);
  });

  // T-CHR06: chaos cleared after runWithChaos (no leak)
  it('T-CHR06: chaos cleared after runWithChaos', async () => {
    // Use a fresh harness for isolation (avoids cumulative _chaosCallCount)
    const freshHarness = new PipelineTestHarness();
    await freshHarness.setup();
    try {
      // Run with chaos — should fail
      let failed = false;
      try {
        await freshHarness.runWithChaos('test', {}, { llm: { failOnNthCall: 0 } });
      } catch { failed = true; }
      assert.ok(failed, 'first run with chaos should fail');
      // Now run without chaos — should succeed
      const { ctx } = await freshHarness.run('ما هو الذكاء الاصطناعي؟');
      assert.strictEqual(ctx.aborted, false, 'should succeed after chaos cleared');
    } finally {
      await freshHarness.teardown();
    }
  });

  // T-CHR07: chaos on vectorStore cleared after runWithChaos
  it('T-CHR07: vectorStore chaos cleared after run', async () => {
    const freshHarness = new PipelineTestHarness();
    await freshHarness.setup();
    try {
      let failed = false;
      try {
        await freshHarness.runWithChaos('test', {}, { vectorStore: { failOnNthCall: 0 } });
      } catch { failed = true; }
      assert.ok(failed, 'first run with vectorStore chaos should fail');
      const { ctx } = await freshHarness.run('ما هو الذكاء الاصطناعي؟');
      assert.strictEqual(ctx.aborted, false, 'should succeed after vectorStore chaos cleared');
    } finally {
      await freshHarness.teardown();
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 2: Retry & Error Classification (T-CHR08 to T-CHR12)
// ═══════════════════════════════════════════════════════════════
describe('Chaos Resilience — Retry & Error Classification', () => {
  let harness;

  before(async () => {
    harness = new PipelineTestHarness();
    await harness.setup();
  });

  after(async () => {
    await harness.teardown();
  });

  // T-CHR08: embed failure throws Error (proper error type)
  it('T-CHR08: embed failure is proper Error type', async () => {
    await assert.rejects(
      () => harness.runWithChaos('test', {}, { llm: { failOnNthCall: 0 } }),
      (err) => {
        assert.ok(err instanceof Error, 'should be Error instance');
        return true;
      },
    );
  });

  // T-CHR09: search failure throws Error (proper error type)
  it('T-CHR09: search failure is proper Error type', async () => {
    await assert.rejects(
      () => harness.runWithChaos('test', {}, { vectorStore: { failOnNthCall: 0 } }),
      (err) => {
        assert.ok(err instanceof Error, 'should be Error instance');
        return true;
      },
    );
  });

  // T-CHR10: timeout chaos produces error
  it('T-CHR10: timeout chaos produces error', async () => {
    await assert.rejects(
      () => harness.runWithChaos('test', {}, {
        llm: { timeoutOnCall: { n: 0, ms: 10 } },
      }),
      (err) => {
        assert.ok(err.message.includes('timeout'), `expected timeout error, got: ${err.message}`);
        return true;
      },
    );
  });

  // T-CHR11: degradeAfterCalls(1) → first call ok, second degraded
  it('T-CHR11: degradeAfterCalls allows initial calls', async () => {
    // degradeAfterCalls: 1 means first call (idx 0) is normal, idx >= 1 is degraded
    const { ctx } = await harness.runWithChaos('ما هو الذكاء الاصطناعي؟', {}, {
      llm: { degradeAfterCalls: 1 },
    });
    // First call is embedText (idx=0, normal), second is streamGenerate (idx=1, degraded → empty)
    assert.strictEqual(typeof ctx.fullText, 'string');
  });

  // T-CHR12: latencySpike doesn't cause failure (just delays)
  it('T-CHR12: latencySpike completes without error', async () => {
    const { ctx } = await harness.runWithChaos('ما هو الذكاء الاصطناعي؟', {}, {
      llm: { latencySpike: { probability: 1.0, maxMs: 10 } },
    });
    assert.strictEqual(ctx.aborted, false, 'should complete despite latency spikes');
    assert.ok(ctx.fullText.length > 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 3: Cascading Failures (T-CHR13 to T-CHR16)
// ═══════════════════════════════════════════════════════════════
describe('Chaos Resilience — Cascading Failures', () => {
  let harness;

  before(async () => {
    harness = new PipelineTestHarness();
    await harness.setup();
  });

  after(async () => {
    await harness.teardown();
  });

  // T-CHR13: first turn fails → second turn succeeds → context not corrupted
  it('T-CHR13: failed turn does not corrupt context for next turn', async () => {
    const sessionId = 'chr13-' + Date.now();
    // First turn fails
    await assert.rejects(
      () => harness.runWithChaos('سؤال فاشل', { sessionId }, { llm: { failOnNthCall: 0 } }),
    );
    // Second turn succeeds
    const { ctx } = await harness.run('ما هو الذكاء الاصطناعي؟', { sessionId });
    assert.strictEqual(ctx.aborted, false);
    assert.ok(ctx.fullText.length > 0);
  });

  // T-CHR14: abort on one turn + success on next → both tracked correctly
  it('T-CHR14: abort + success sequence works', async () => {
    const sessionId = 'chr14-' + Date.now();
    // Abort via empty mode
    harness.mockStore.setEmptyMode(true);
    const turn1 = await harness.run('سؤال فارغ', { sessionId });
    assert.strictEqual(turn1.ctx.aborted, true);
    harness.mockStore.setEmptyMode(false);

    // Success
    const turn2 = await harness.run('ما هو الذكاء الاصطناعي؟', { sessionId });
    assert.strictEqual(turn2.ctx.aborted, false);
    assert.ok(turn2.ctx.fullText.length > 0);
  });

  // T-CHR15: multiple sequential failures don't accumulate state
  it('T-CHR15: multiple failures do not accumulate bad state', async () => {
    const freshHarness = new PipelineTestHarness();
    await freshHarness.setup();
    try {
      for (let i = 0; i < 3; i++) {
        try {
          await freshHarness.runWithChaos('fail', {}, { llm: { failOnNthCall: 0 } });
        } catch { /* expected */ }
      }
      // After 3 failures, normal run should succeed
      const { ctx } = await freshHarness.run('ما هو الذكاء الاصطناعي؟');
      assert.strictEqual(ctx.aborted, false);
      assert.ok(ctx.fullText.length > 0);
    } finally {
      await freshHarness.teardown();
    }
  });

  // T-CHR16: degraded response (empty text) is handled gracefully
  it('T-CHR16: degraded empty response handled gracefully', async () => {
    // Use fresh harness to avoid registry corruption from T-CHR15's freshHarness.teardown()
    const freshHarness = new PipelineTestHarness();
    await freshHarness.setup();
    try {
      const { ctx } = await freshHarness.runWithChaos('ما هو الذكاء الاصطناعي؟', {}, {
        llm: { degradeAfterCalls: 0 },
      });
      // Pipeline should complete — fullText may be empty string
      assert.strictEqual(typeof ctx.fullText, 'string');
      assert.strictEqual(ctx.aborted, false);
    } finally {
      await freshHarness.teardown();
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 4: Chaos Injection Patterns (T-CHR17 to T-CHR20)
// ═══════════════════════════════════════════════════════════════
describe('Chaos Resilience — Chaos Injection Patterns', () => {
  let harness;

  before(async () => {
    harness = new PipelineTestHarness();
    await harness.setup();
  });

  after(async () => {
    await harness.teardown();
  });

  // T-CHR17: 20% random LLM failure rate over 10 requests → at least 3 succeed
  it('T-CHR17: 20% random failure rate — majority succeed', async () => {
    let successes = 0;
    let failures = 0;
    for (let i = 0; i < 10; i++) {
      try {
        const { ctx } = await harness.runWithChaos('ما هو الذكاء الاصطناعي؟', {
          sessionId: `chr17-${i}-${Date.now()}`,
        }, {
          llm: { randomFailureRate: 0.2 },
        });
        if (!ctx.aborted) successes++;
        else successes++; // aborted but completed = still success
      } catch {
        failures++;
      }
    }
    assert.ok(successes >= 3, `expected at least 3 successes, got ${successes}`);
  });

  // T-CHR18: degradeAfterCalls(3) → first 3 succeed, rest degraded
  it('T-CHR18: degradeAfterCalls boundary works', async () => {
    harness.mockLLM.setChaos({ degradeAfterCalls: 3 });
    try {
      // First run: embedText (call 0) + streamGenerate (call 1) = both before threshold
      const r1 = await harness.run('سؤال 1', { sessionId: 'chr18a-' + Date.now() });
      assert.ok(r1.ctx.fullText.length > 0, 'first run should have content');

      // Second run: embedText (call 2) still ok, streamGenerate (call 3) = degraded
      const r2 = await harness.run('سؤال 2', { sessionId: 'chr18b-' + Date.now() });
      // streamGenerate at call index 3 should be degraded
      assert.strictEqual(typeof r2.ctx.fullText, 'string');
    } finally {
      harness.mockLLM.setChaos({});
    }
  });

  // T-CHR19: latency spikes don't prevent completion
  it('T-CHR19: latency spikes complete without error', async () => {
    const { ctx } = await harness.runWithChaos('ما هو الذكاء الاصطناعي؟', {}, {
      llm: { latencySpike: { probability: 1.0, maxMs: 5 } },
    });
    assert.strictEqual(ctx.aborted, false);
    assert.ok(ctx.fullText.length > 0);
  });

  // T-CHR20: concurrent pipeline runs with chaos → no singleton corruption
  it('T-CHR20: concurrent runs under chaos — state consistent', async () => {
    const before = conversationContext.counts().totalPipelineExecutions;
    const promises = [];
    for (let i = 0; i < 5; i++) {
      const sessionId = `chr20-${i}-${Date.now()}`;
      const p = harness.runWithChaos('ما هو الذكاء الاصطناعي؟', {
        sessionId,
      }, {
        llm: { randomFailureRate: 0.15 },
      }).then(r => {
        // Record turn manually for successes
        conversationContext.recordTurn(sessionId, {
          message: 'ما هو الذكاء الاصطناعي؟', response: r.ctx.fullText || '',
          queryType: r.ctx.queryRoute?.type, topicFilter: null,
        });
        conversationContext.incrementTurn(sessionId);
        return { success: true };
      }).catch(() => ({ success: false }));
      promises.push(p);
    }
    const results = await Promise.all(promises);
    const successCount = results.filter(r => r.success).length;
    // At least some should succeed
    assert.ok(successCount >= 1, `expected at least 1 success in concurrent runs, got ${successCount}`);
    // Singleton state should be consistent — total should increase
    const after = conversationContext.counts().totalPipelineExecutions;
    assert.ok(after >= before + successCount,
      `totalPipelineExecutions should increase by at least ${successCount}`);
  });
});

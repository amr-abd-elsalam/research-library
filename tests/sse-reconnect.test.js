// tests/sse-reconnect.test.js
// ═══════════════════════════════════════════════════════════════
// SSE Reconnect Exponential Backoff Tests — Phase 96
// Tests the pure calculation logic for reconnection delays.
// No network calls — tests pure math.
// ═══════════════════════════════════════════════════════════════

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

// ── Pure backoff calculation (mirrors sidebar.js logic) ────────
const BASE_DELAY = 1000;
const MAX_DELAY = 30000;
const JITTER_FACTOR = 0.3;

function calculateReconnectDelay(attempts, randomFn = Math.random) {
  const exp = Math.min(BASE_DELAY * Math.pow(2, attempts), MAX_DELAY);
  const jitter = exp * JITTER_FACTOR * (randomFn() * 2 - 1);
  return Math.max(BASE_DELAY, Math.round(exp + jitter));
}

describe('SSE Reconnect — Exponential Backoff', () => {

  // T-RCN01
  test('T-RCN01: first attempt (attempts=0) — delay is around BASE_DELAY (1000ms)', () => {
    const delay = calculateReconnectDelay(0, () => 0.5); // zero jitter at 0.5
    assert.ok(delay >= BASE_DELAY * (1 - JITTER_FACTOR), `delay ${delay} >= ${BASE_DELAY * (1 - JITTER_FACTOR)}`);
    assert.ok(delay <= BASE_DELAY * (1 + JITTER_FACTOR), `delay ${delay} <= ${BASE_DELAY * (1 + JITTER_FACTOR)}`);
  });

  // T-RCN02
  test('T-RCN02: delay doubles each attempt (exponential growth)', () => {
    const fixedRandom = () => 0.5; // zero jitter
    const d0 = calculateReconnectDelay(0, fixedRandom);
    const d1 = calculateReconnectDelay(1, fixedRandom);
    const d2 = calculateReconnectDelay(2, fixedRandom);
    assert.ok(d1 > d0, `attempt 1 (${d1}) > attempt 0 (${d0})`);
    assert.ok(d2 > d1, `attempt 2 (${d2}) > attempt 1 (${d1})`);
    // With zero jitter (random=0.5), d1 should be ~2x d0
    assert.ok(d1 >= d0 * 1.5, `d1 (${d1}) roughly doubles d0 (${d0})`);
  });

  // T-RCN03
  test('T-RCN03: delay caps at MAX_DELAY (30000ms)', () => {
    const delay = calculateReconnectDelay(100, () => 0.5); // very high attempts
    assert.ok(delay <= MAX_DELAY * (1 + JITTER_FACTOR), `delay ${delay} <= ${MAX_DELAY * (1 + JITTER_FACTOR)}`);
  });

  // T-RCN04
  test('T-RCN04: jitter stays within ±30% of exponential value', () => {
    for (let i = 0; i < 50; i++) {
      const delay = calculateReconnectDelay(3);
      const expectedExp = Math.min(BASE_DELAY * Math.pow(2, 3), MAX_DELAY);
      const lower = Math.max(BASE_DELAY, Math.round(expectedExp * (1 - JITTER_FACTOR)));
      const upper = Math.round(expectedExp * (1 + JITTER_FACTOR));
      assert.ok(delay >= lower, `delay ${delay} >= ${lower}`);
      assert.ok(delay <= upper, `delay ${delay} <= ${upper}`);
    }
  });

  // T-RCN05
  test('T-RCN05: delay never goes below BASE_DELAY even with negative jitter', () => {
    const delay = calculateReconnectDelay(0, () => 0); // max negative jitter
    assert.ok(delay >= BASE_DELAY, `delay ${delay} >= ${BASE_DELAY}`);
  });

  // T-RCN06
  test('T-RCN06: attempts=5 produces delay significantly higher than attempts=0', () => {
    const fixedRandom = () => 0.5;
    const d0 = calculateReconnectDelay(0, fixedRandom);
    const d5 = calculateReconnectDelay(5, fixedRandom);
    assert.ok(d5 > d0 * 4, `attempt 5 (${d5}) >> attempt 0 (${d0})`);
  });

  // T-RCN07
  test('T-RCN07: 10 consecutive failures produce increasing then capped delays', () => {
    const fixedRandom = () => 0.5;
    let prevDelay = 0;
    let cappedCount = 0;
    for (let i = 0; i < 10; i++) {
      const delay = calculateReconnectDelay(i, fixedRandom);
      if (delay >= MAX_DELAY * 0.9) cappedCount++;
      if (i > 0 && delay <= prevDelay && cappedCount === 0) {
        assert.fail(`delay should increase: attempt ${i} delay ${delay} <= previous ${prevDelay}`);
      }
      prevDelay = delay;
    }
    assert.ok(cappedCount > 0, 'some attempts should be capped');
  });

  // T-RCN08
  test('T-RCN08: function is deterministic with fixed random', () => {
    const fixedRandom = () => 0.75;
    const d1 = calculateReconnectDelay(3, fixedRandom);
    const d2 = calculateReconnectDelay(3, fixedRandom);
    assert.strictEqual(d1, d2, 'same inputs should produce same output');
  });
});

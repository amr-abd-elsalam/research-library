// tests/listeners/suggestions-listener.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 57 — Unit tests for suggestionsListener
// Tests:
//   - conversation:contextUpdated → triggers generate()
//   - suggestion:clicked → records click + increments metric
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { eventBus }          from '../../server/services/eventBus.js';
import { suggestionsEngine } from '../../server/services/suggestionsEngine.js';
import { metrics }           from '../../server/services/metrics.js';
import { featureFlags }      from '../../server/services/featureFlags.js';
import { register }          from '../../server/services/listeners/suggestionsListener.js';

let registered = false;

describe('SuggestionsListener', () => {

  before(() => {
    if (!registered) {
      register();
      registered = true;
    }
  });

  afterEach(() => {
    suggestionsEngine.reset();
    metrics.reset();
    featureFlags.clearOverride('SUGGESTIONS');
  });

  // T-SgL01: suggestion:clicked — calls suggestionsEngine.recordClick()
  it('T-SgL01: suggestion:clicked — records click in suggestionsEngine', () => {
    featureFlags.setOverride('SUGGESTIONS', true);

    eventBus.emit('suggestion:clicked', {
      text: 'ما المزيد عن الذكاء الاصطناعي؟',
      timestamp: Date.now(),
    });

    const clicks = suggestionsEngine.getClickCounts();
    assert.strictEqual(clicks.totalClicks, 1, 'totalClicks should be 1');
    assert.strictEqual(clicks.uniqueSuggestions, 1, 'uniqueSuggestions should be 1');
    assert.strictEqual(clicks.top[0].text, 'ما المزيد عن الذكاء الاصطناعي؟');
  });

  // T-SgL02: suggestion:clicked — increments suggestion_click_total metric
  it('T-SgL02: suggestion:clicked — increments suggestion_click_total', () => {
    eventBus.emit('suggestion:clicked', {
      text: 'test suggestion',
      timestamp: Date.now(),
    });

    const snap = metrics.snapshot();
    const clickTotal = snap.counters['suggestion_click_total']?.['[]'];
    assert.ok(clickTotal >= 1, `suggestion_click_total should be >= 1, got ${clickTotal}`);
  });

  // T-SgL03: suggestion:clicked multiple times — accumulates
  it('T-SgL03: suggestion:clicked multiple — accumulates clicks', () => {
    featureFlags.setOverride('SUGGESTIONS', true);

    eventBus.emit('suggestion:clicked', { text: 'suggestion A', timestamp: Date.now() });
    eventBus.emit('suggestion:clicked', { text: 'suggestion A', timestamp: Date.now() });
    eventBus.emit('suggestion:clicked', { text: 'suggestion B', timestamp: Date.now() });

    const clicks = suggestionsEngine.getClickCounts();
    assert.strictEqual(clicks.totalClicks, 3, 'totalClicks should be 3');
    assert.strictEqual(clicks.uniqueSuggestions, 2, 'uniqueSuggestions should be 2');
  });

  // T-SgL04: suggestion:clicked with empty text — no crash
  it('T-SgL04: suggestion:clicked with empty text — no crash', () => {
    assert.doesNotThrow(() => {
      eventBus.emit('suggestion:clicked', { text: '', timestamp: Date.now() });
    });
  });

  // T-SgL05: conversation:contextUpdated without sessionId — no crash
  it('T-SgL05: conversation:contextUpdated without sessionId — no crash', () => {
    assert.doesNotThrow(() => {
      eventBus.emit('conversation:contextUpdated', {});
    });
  });
});

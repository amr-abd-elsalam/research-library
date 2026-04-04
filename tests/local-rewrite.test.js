// tests/local-rewrite.test.js
// ═══════════════════════════════════════════════════════════════
// Phase T — attemptLocalRewrite() unit tests
// Tests all 11 Arabic follow-up patterns + edge cases.
// Pure function — no mocking needed.
// ═══════════════════════════════════════════════════════════════

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { attemptLocalRewrite } from '../server/services/pipeline.js';

describe('attemptLocalRewrite()', () => {

  // ── Helper: create a minimal convCtx ────────────────────────
  function ctx(entities) {
    return { entities };
  }

  // T-LR01: Pattern 1 — 'more_detail' with 'أكثر'
  it('T-LR01: pattern more_detail — أكثر', () => {
    const result = attemptLocalRewrite('أكثر', ctx(['الذكاء الاصطناعي']));
    assert.notStrictEqual(result, null);
    assert.strictEqual(result.pattern, 'more_detail');
    assert.ok(result.rewritten.includes('الذكاء الاصطناعي'));
  });

  // T-LR02: Pattern 1 — 'more_detail' with 'المزيد'
  it('T-LR02: pattern more_detail — المزيد', () => {
    const result = attemptLocalRewrite('المزيد', ctx(['الذكاء الاصطناعي']));
    assert.notStrictEqual(result, null);
    assert.strictEqual(result.pattern, 'more_detail');
    assert.ok(result.rewritten.includes('الذكاء الاصطناعي'));
  });

  // T-LR03: Pattern 2 — 'what_about'
  it('T-LR03: pattern what_about — وماذا عنه؟', () => {
    const result = attemptLocalRewrite('وماذا عنه؟', ctx(['البرمجة']));
    assert.notStrictEqual(result, null);
    assert.strictEqual(result.pattern, 'what_about');
    assert.ok(result.rewritten.includes('البرمجة'));
  });

  // T-LR04: Pattern 3 — 'affirm_continue'
  it('T-LR04: pattern affirm_continue — نعم', () => {
    const result = attemptLocalRewrite('نعم', ctx(['الشبكات']));
    assert.notStrictEqual(result, null);
    assert.strictEqual(result.pattern, 'affirm_continue');
    assert.ok(result.rewritten.includes('الشبكات'));
  });

  // T-LR05: Pattern 4 — 'why'
  it('T-LR05: pattern why — لماذا؟', () => {
    const result = attemptLocalRewrite('لماذا؟', ctx(['التعلم']));
    assert.notStrictEqual(result, null);
    assert.strictEqual(result.pattern, 'why');
    assert.ok(result.rewritten.includes('التعلم'));
  });

  // T-LR06: Pattern 5 — 'how'
  it('T-LR06: pattern how — كيف؟', () => {
    const result = attemptLocalRewrite('كيف؟', ctx(['الأمان']));
    assert.notStrictEqual(result, null);
    assert.strictEqual(result.pattern, 'how');
    assert.ok(result.rewritten.includes('الأمان'));
  });

  // T-LR07: Pattern 6 — 'when'
  it('T-LR07: pattern when — متى؟', () => {
    const result = attemptLocalRewrite('متى؟', ctx(['الإصدار']));
    assert.notStrictEqual(result, null);
    assert.strictEqual(result.pattern, 'when');
    assert.ok(result.rewritten.includes('الإصدار'));
  });

  // T-LR08: Pattern 7 — 'where'
  it('T-LR08: pattern where — أين؟', () => {
    const result = attemptLocalRewrite('أين؟', ctx(['الملفات']));
    assert.notStrictEqual(result, null);
    assert.strictEqual(result.pattern, 'where');
    assert.ok(result.rewritten.includes('الملفات'));
  });

  // T-LR09: Pattern 8 — 'who'
  it('T-LR09: pattern who — مين؟', () => {
    const result = attemptLocalRewrite('مين؟', ctx(['المطور']));
    assert.notStrictEqual(result, null);
    assert.strictEqual(result.pattern, 'who');
    assert.ok(result.rewritten.includes('المطور'));
  });

  // T-LR10: Pattern 9 — 'difference' with 2 entities
  it('T-LR10: pattern difference — ما الفرق with 2 entities', () => {
    const result = attemptLocalRewrite('ما الفرق', ctx(['React', 'Vue']));
    assert.notStrictEqual(result, null);
    assert.strictEqual(result.pattern, 'difference');
    assert.ok(result.rewritten.includes('React'));
    assert.ok(result.rewritten.includes('Vue'));
  });

  // T-LR11: Pattern 10 — 'opposite'
  it('T-LR11: pattern opposite — والعكس؟', () => {
    const result = attemptLocalRewrite('والعكس؟', ctx(['الخوارزمية']));
    assert.notStrictEqual(result, null);
    assert.strictEqual(result.pattern, 'opposite');
    assert.ok(result.rewritten.includes('الخوارزمية'));
  });

  // T-LR12: Pattern 11 — 'example'
  it('T-LR12: pattern example — مثال؟', () => {
    const result = attemptLocalRewrite('مثال؟', ctx(['الباترن']));
    assert.notStrictEqual(result, null);
    assert.strictEqual(result.pattern, 'example');
    assert.ok(result.rewritten.includes('الباترن'));
  });

  // T-LR13: no match — full sentence (should return null)
  it('T-LR13: returns null for full sentence (no pattern match)', () => {
    const result = attemptLocalRewrite('ما هو الذكاء الاصطناعي؟', ctx(['الذكاء الاصطناعي']));
    assert.strictEqual(result, null);
  });

  // T-LR14: no match — empty entities
  it('T-LR14: returns null when entities array is empty', () => {
    const result = attemptLocalRewrite('أكثر', ctx([]));
    assert.strictEqual(result, null);
  });

  // T-LR15: null convCtx
  it('T-LR15: returns null when convCtx is null', () => {
    const result = attemptLocalRewrite('أكثر', null);
    assert.strictEqual(result, null);
  });

  // T-LR16: difference pattern uses last 2 entities, not first 2
  it('T-LR16: difference pattern uses last 2 entities (most recent context)', () => {
    const result = attemptLocalRewrite('ما الفرق', ctx(['A', 'B', 'C']));
    assert.notStrictEqual(result, null);
    assert.strictEqual(result.pattern, 'difference');
    // Should use C (last) and B (second-to-last), not A and B
    assert.ok(result.rewritten.includes('C'), 'should include last entity C');
    assert.ok(result.rewritten.includes('B'), 'should include second-to-last entity B');
  });

});

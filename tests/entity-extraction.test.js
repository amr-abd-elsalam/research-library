// tests/entity-extraction.test.js
// ═══════════════════════════════════════════════════════════════
// Phase T — Entity Extraction v2 indirect tests
// Tests 4 extraction strategies via the public API:
//   recordTurn() → getContext() → check entities
// ═══════════════════════════════════════════════════════════════

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ConversationContext } from '../server/services/conversationContext.js';

describe('Entity Extraction v2 (via recordTurn + getContext)', () => {

  let cc;
  const SID = 'test-session-ee';

  beforeEach(() => {
    cc = new ConversationContext();
  });

  // T-EE01: Strategy 1 — Arabic quoted strings «»
  it('T-EE01: extracts Arabic quoted strings «مصطلح»', () => {
    cc.recordTurn(SID, { message: 'أريد معرفة المزيد عن «الحوسبة السحابية»', response: '', queryType: null, topicFilter: null });
    const ctx = cc.getContext(SID);
    assert.ok(ctx.entities.some(e => e.includes('الحوسبة السحابية')), 'should extract quoted Arabic term');
  });

  // T-EE02: Strategy 1 — English quotes ""
  it('T-EE02: extracts English quoted strings "test term"', () => {
    cc.recordTurn(SID, { message: 'What about "machine learning" approach?', response: '', queryType: null, topicFilter: null });
    const ctx = cc.getContext(SID);
    assert.ok(ctx.entities.some(e => e.includes('machine learning')), 'should extract English quoted term');
  });

  // T-EE03: Strategy 2 — Arabic ال phrases
  it('T-EE03: extracts Arabic ال phrases', () => {
    cc.recordTurn(SID, { message: 'الذكاء الاصطناعي يغير العالم', response: '', queryType: null, topicFilter: null });
    const ctx = cc.getContext(SID);
    assert.ok(ctx.entities.some(e => e.includes('الذكاء')), 'should extract Arabic ال phrase');
  });

  // T-EE04: Strategy 3 — English capitalized terms
  it('T-EE04: extracts English capitalized terms', () => {
    cc.recordTurn(SID, { message: 'I want to learn about Machine Learning and React', response: '', queryType: null, topicFilter: null });
    const ctx = cc.getContext(SID);
    assert.ok(
      ctx.entities.some(e => e === 'Machine' || e === 'Learning' || e === 'React'),
      'should extract capitalized English terms'
    );
  });

  // T-EE05: Strategy 3 — stop words filtered
  it('T-EE05: filters English stop words', () => {
    cc.recordTurn(SID, { message: 'The Quick Method is used With This approach', response: '', queryType: null, topicFilter: null });
    const ctx = cc.getContext(SID);
    // 'The', 'With', 'This' are stop words — should not appear
    assert.ok(!ctx.entities.includes('The'), 'should not include stop word "The"');
    assert.ok(!ctx.entities.includes('With'), 'should not include stop word "With"');
    assert.ok(!ctx.entities.includes('This'), 'should not include stop word "This"');
    // 'Quick' and 'Method' should be present
    assert.ok(ctx.entities.some(e => e === 'Quick' || e === 'Method'), 'should include non-stop capitalized terms');
  });

  // T-EE06: Strategy 4 — Arabic proper nouns after context words
  it('T-EE06: extracts Arabic proper nouns after context words', () => {
    cc.recordTurn(SID, { message: 'هذا النظام يسمى التحويل الرقمي', response: '', queryType: null, topicFilter: null });
    const ctx = cc.getContext(SID);
    assert.ok(
      ctx.entities.some(e => e.includes('التحويل')),
      'should extract proper noun after يسمى'
    );
  });

  // T-EE07: empty message
  it('T-EE07: handles empty message gracefully', () => {
    cc.recordTurn(SID, { message: '', response: '', queryType: null, topicFilter: null });
    const ctx = cc.getContext(SID);
    // Should have a context (turn was recorded) but no entities from empty message
    assert.ok(ctx !== null);
    // Entities might be empty or very few
    assert.ok(ctx.turns === 1);
  });

  // T-EE08: max entities cap
  it('T-EE08: respects maxContextEntities cap', () => {
    // Send many turns with unique entities to exceed the cap
    for (let i = 0; i < 30; i++) {
      cc.recordTurn(SID, {
        message: `يسمى المصطلح${i} والنظام${i}`,
        response: `الإجابة عن النظام${i} ويشمل المفهوم${i}`,
        queryType: null,
        topicFilter: null,
      });
    }
    const ctx = cc.getContext(SID);
    // Default maxContextEntities is 20
    assert.ok(ctx.entities.length <= 20, `entities count ${ctx.entities.length} should be <= 20`);
  });

  // T-EE09: response extraction — entities extracted from response too
  it('T-EE09: extracts entities from response text (first 600 chars)', () => {
    cc.recordTurn(SID, {
      message: 'ما هو النظام؟',
      response: 'النظام يسمى «البرمجة الكائنية» وهو مبني على Machine Learning',
      queryType: null,
      topicFilter: null,
    });
    const ctx = cc.getContext(SID);
    // Should extract from both message and response
    assert.ok(
      ctx.entities.some(e => e.includes('البرمجة الكائنية') || e === 'Machine' || e === 'Learning'),
      'should extract entities from response text'
    );
  });

  // T-EE10: context accumulates across turns
  it('T-EE10: accumulates entities across multiple turns', () => {
    cc.recordTurn(SID, { message: 'أريد معرفة «التعلم العميق»', response: '', queryType: null, topicFilter: null });
    cc.recordTurn(SID, { message: 'وماذا عن «الشبكات العصبية»', response: '', queryType: null, topicFilter: null });
    const ctx = cc.getContext(SID);
    assert.ok(ctx.turns === 2);
    assert.ok(ctx.entities.some(e => e.includes('التعلم العميق')), 'should have entity from turn 1');
    assert.ok(ctx.entities.some(e => e.includes('الشبكات العصبية')), 'should have entity from turn 2');
  });

});

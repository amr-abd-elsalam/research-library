// tests/event-trace.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 51 — EventTrace unit tests
// Tests the EventTrace class:
//   - correlationId generation (8-char, unique per instance)
//   - record() stage tracking + toJSON() snapshot
//   - toCompact() pipe-separated format
//   - span() nested tracing with parent linkage
//   - Edge cases: null detail, no stages
//
// Uses new EventTrace() class instances for full isolation.
// Zero external dependencies — crypto.randomUUID() only.
// ═══════════════════════════════════════════════════════════════

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventTrace } from '../server/services/eventTrace.js';

describe('EventTrace', () => {

  // T-ET1: correlationId — string, non-empty, 8 chars
  it('T-ET1: correlationId is 8-char non-empty string', () => {
    const trace = new EventTrace();
    assert.strictEqual(typeof trace.correlationId, 'string');
    assert.ok(trace.correlationId.length > 0, 'should be non-empty');
    assert.strictEqual(trace.correlationId.length, 8, 'should be 8 chars (UUID slice)');
  });

  // T-ET2: record() adds stage — toJSON() shows it
  it('T-ET2: record adds stage visible in toJSON', () => {
    const trace = new EventTrace();
    trace.record('stageEmbed', 145, 'ok', { model: 'gemini' });
    const json = trace.toJSON();
    assert.strictEqual(json.stages.length, 1);
    assert.strictEqual(json.stages[0].name, 'stageEmbed');
    assert.strictEqual(json.stages[0].durationMs, 145);
    assert.strictEqual(json.stages[0].status, 'ok');
    assert.deepStrictEqual(json.stages[0].detail, { model: 'gemini' });
  });

  // T-ET3: toJSON() structure — correct keys and types
  it('T-ET3: toJSON returns correct structure', () => {
    const trace = new EventTrace();
    trace.record('stageRoute', 2, 'ok');
    const json = trace.toJSON();
    assert.strictEqual(typeof json.correlationId, 'string');
    assert.strictEqual(json.parentId, null, 'root trace has null parentId');
    assert.strictEqual(typeof json.totalMs, 'number');
    assert.ok(json.totalMs >= 0, 'totalMs should be non-negative');
    assert.ok(Array.isArray(json.stages), 'stages should be an array');
    // childSpans should be absent when no spans created
    assert.strictEqual(json.childSpans, undefined, 'no childSpans when none created');
  });

  // T-ET4: stages ordered by insertion
  it('T-ET4: stages ordered by insertion', () => {
    const trace = new EventTrace();
    trace.record('stageRoute', 1, 'ok');
    trace.record('stageEmbed', 100, 'ok');
    trace.record('stageRetrieve', 50, 'ok');
    const json = trace.toJSON();
    assert.strictEqual(json.stages[0].name, 'stageRoute');
    assert.strictEqual(json.stages[1].name, 'stageEmbed');
    assert.strictEqual(json.stages[2].name, 'stageRetrieve');
  });

  // T-ET5: toCompact() — pipe-separated format
  it('T-ET5: toCompact returns pipe-separated format', () => {
    const trace = new EventTrace();
    trace.record('stageRoute', 2, 'ok');
    trace.record('stageEmbed', 145, 'ok');
    trace.record('stageGenerate', 300, 'error');
    const compact = trace.toCompact();
    assert.strictEqual(compact, 'stageRoute:ok:2ms|stageEmbed:ok:145ms|stageGenerate:error:300ms');
  });

  // T-ET6: record() stores durationMs, status, detail correctly
  it('T-ET6: record stores durationMs status detail correctly', () => {
    const trace = new EventTrace();
    trace.record('stageRerank', 25, 'skip', { reason: 'disabled' });
    const stage = trace.toJSON().stages[0];
    assert.strictEqual(stage.durationMs, 25);
    assert.strictEqual(stage.status, 'skip');
    assert.deepStrictEqual(stage.detail, { reason: 'disabled' });
    assert.strictEqual(stage.correlationId, trace.correlationId);
    assert.strictEqual(typeof stage.timestamp, 'number');
  });

  // T-ET7: two instances have different correlationIds
  it('T-ET7: two instances have different correlationIds', () => {
    const t1 = new EventTrace();
    const t2 = new EventTrace();
    assert.notStrictEqual(t1.correlationId, t2.correlationId);
  });

  // T-ET8: record() with null detail
  it('T-ET8: record with null detail stores null', () => {
    const trace = new EventTrace();
    trace.record('stageX', 10, 'ok', null);
    assert.strictEqual(trace.toJSON().stages[0].detail, null);
  });

  // T-ET9: record() with no detail argument (default)
  it('T-ET9: record with no detail argument defaults to null', () => {
    const trace = new EventTrace();
    trace.record('stageY', 5, 'ok');
    assert.strictEqual(trace.toJSON().stages[0].detail, null);
  });

  // T-ET10: span() creates child trace linked to parent
  it('T-ET10: span creates child trace linked to parent', () => {
    const parent = new EventTrace();
    const child = parent.span('sub-operation');
    assert.ok(child instanceof EventTrace, 'child should be an EventTrace instance');
    assert.strictEqual(child.parentId, parent.correlationId, 'child parentId should be parent correlationId');
    assert.notStrictEqual(child.correlationId, parent.correlationId, 'child should have its own correlationId');
  });

  // T-ET11: child span appears in parent toJSON().childSpans
  it('T-ET11: child span appears in parent toJSON childSpans', () => {
    const parent = new EventTrace();
    parent.record('stageMain', 10, 'ok');
    const child = parent.span('detail-fetch');
    child.record('subStage1', 5, 'ok');
    child.record('subStage2', 3, 'ok');

    const json = parent.toJSON();
    assert.ok(Array.isArray(json.childSpans), 'should have childSpans array');
    assert.strictEqual(json.childSpans.length, 1);
    assert.strictEqual(json.childSpans[0].name, 'detail-fetch');
    assert.strictEqual(json.childSpans[0].trace.stages.length, 2);
    assert.strictEqual(json.childSpans[0].trace.parentId, parent.correlationId);
  });

  // T-ET12: toCompact() with no stages — empty string
  it('T-ET12: toCompact with no stages returns empty string', () => {
    const trace = new EventTrace();
    assert.strictEqual(trace.toCompact(), '');
  });

  // T-ET13: constructor accepts requestId option (Phase 66)
  it('T-ET13: constructor accepts requestId option', () => {
    const trace = new EventTrace({ requestId: 'test-rid-abc' });
    assert.strictEqual(trace.requestId, 'test-rid-abc');
    assert.strictEqual(trace.parentId, null, 'parentId should default to null');
  });

  // T-ET14: toJSON includes requestId (Phase 66)
  it('T-ET14: toJSON includes requestId', () => {
    const trace = new EventTrace({ requestId: 'test-rid-def' });
    const json = trace.toJSON();
    assert.strictEqual(json.requestId, 'test-rid-def');
  });

  // T-ET15: constructor without args — requestId defaults to null (Phase 66 backward compat)
  it('T-ET15: constructor without args — requestId defaults to null', () => {
    const trace = new EventTrace();
    assert.strictEqual(trace.requestId, null);
    const json = trace.toJSON();
    assert.strictEqual(json.requestId, null);
  });

  // T-ET16: constructor with string parentId — backward compatible (Phase 66)
  it('T-ET16: constructor with string parentId — backward compatible', () => {
    const trace = new EventTrace('parent-abc');
    assert.strictEqual(trace.parentId, 'parent-abc');
    assert.strictEqual(trace.requestId, null, 'requestId should be null when using positional parentId');
  });

  // T-ET17: constructor with options object including both parentId and requestId (Phase 66)
  it('T-ET17: constructor with options { parentId, requestId }', () => {
    const trace = new EventTrace({ parentId: 'parent-xyz', requestId: 'rid-xyz' });
    assert.strictEqual(trace.parentId, 'parent-xyz');
    assert.strictEqual(trace.requestId, 'rid-xyz');
  });

});

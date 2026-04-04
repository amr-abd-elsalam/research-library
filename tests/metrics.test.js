// tests/metrics.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 48 — MetricsCollector unit tests
// Tests counter increment, histogram observe (sorted insertion +
// percentiles), gauge set, snapshot structure, restore (additive),
// and counts() introspection.
// Uses new MetricsCollector() class instances for full isolation.
// Config defaults: metricsEnabled: true, metricsWindow: 2000.
// ═══════════════════════════════════════════════════════════════

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MetricsCollector } from '../server/services/metrics.js';

describe('MetricsCollector', () => {

  // T-MC01: increment() — counter increases by 1 (default delta)
  it('T-MC01: increment increases counter by 1 (default delta)', () => {
    const mc = new MetricsCollector();
    mc.increment('test_counter');
    const snap = mc.snapshot();
    assert.strictEqual(snap.counters.test_counter['[]'], 1);
  });

  // T-MC02: increment() with labels — different label combos are separate buckets
  it('T-MC02: increment with labels — different combos are separate buckets', () => {
    const mc = new MetricsCollector();
    mc.increment('x', { type: 'a' });
    mc.increment('x', { type: 'b' });
    const snap = mc.snapshot();
    const bucket = snap.counters.x;
    const keyA = '[["type","a"]]';
    const keyB = '[["type","b"]]';
    assert.strictEqual(bucket[keyA], 1);
    assert.strictEqual(bucket[keyB], 1);
  });

  // T-MC03: increment() with delta > 1 — counter increases by specified delta
  it('T-MC03: increment with delta > 1 increases by specified delta', () => {
    const mc = new MetricsCollector();
    mc.increment('x', {}, 5);
    const snap = mc.snapshot();
    assert.strictEqual(snap.counters.x['[]'], 5);
  });

  // T-MC04: observe() — histogram entry has count, sum, p50, p95, p99 in snapshot
  it('T-MC04: observe creates histogram entry with count, sum, p50, p95, p99', () => {
    const mc = new MetricsCollector();
    mc.observe('test_hist', 100);
    const snap = mc.snapshot();
    const entry = snap.histograms.test_hist['[]'];
    assert.strictEqual(entry.count, 1);
    assert.strictEqual(entry.sum, 100);
    assert.strictEqual(typeof entry.p50, 'number');
    assert.strictEqual(typeof entry.p95, 'number');
    assert.strictEqual(typeof entry.p99, 'number');
  });

  // T-MC05: observe() multiple sorted values — p50 is median, count and sum correct
  it('T-MC05: observe multiple values — p50 is median, count and sum correct', () => {
    const mc = new MetricsCollector();
    const values = [10, 20, 30, 40, 50];
    for (const v of values) mc.observe('h', v);
    const snap = mc.snapshot();
    const entry = snap.histograms.h['[]'];
    assert.strictEqual(entry.count, 5);
    assert.strictEqual(entry.sum, 150);
    // p50 at index floor(5 * 0.50) = floor(2.5) = 2 → values[2] = 30
    assert.strictEqual(entry.p50, 30);
  });

  // T-MC06: set() — gauge reflects exact value in snapshot
  it('T-MC06: set stores gauge value in snapshot', () => {
    const mc = new MetricsCollector();
    mc.set('test_gauge', 42);
    const snap = mc.snapshot();
    assert.strictEqual(snap.gauges.test_gauge, 42);
  });

  // T-MC07: set() overwrite — last set value wins
  it('T-MC07: set overwrite — last set value wins', () => {
    const mc = new MetricsCollector();
    mc.set('g', 10);
    mc.set('g', 20);
    const snap = mc.snapshot();
    assert.strictEqual(snap.gauges.g, 20);
  });

  // T-MC08: snapshot() — returns object with counters, histograms, gauges, collected_since keys
  it('T-MC08: snapshot returns object with expected top-level keys', () => {
    const mc = new MetricsCollector();
    const snap = mc.snapshot();
    assert.ok('counters' in snap, 'should have counters key');
    assert.ok('histograms' in snap, 'should have histograms key');
    assert.ok('gauges' in snap, 'should have gauges key');
    assert.ok('collected_since' in snap, 'should have collected_since key');
  });

  // T-MC09: restore() counter — restores additively (existing + restored)
  it('T-MC09: restore counters additively (existing + restored)', () => {
    const mc = new MetricsCollector();
    mc.increment('c', {}, 3);
    mc.restore({ counters: { c: { '[]': 7 } } });
    const snap = mc.snapshot();
    assert.strictEqual(snap.counters.c['[]'], 10);
  });

  // T-MC10: counts() — returns object with counterNames, histogramNames, gaugeNames, enabled
  it('T-MC10: counts returns counterNames, histogramNames, gaugeNames, enabled', () => {
    const mc = new MetricsCollector();
    mc.increment('a');
    mc.observe('b', 1);
    mc.set('c', 1);
    const c = mc.counts();
    assert.strictEqual(c.counterNames, 1);
    assert.strictEqual(c.histogramNames, 1);
    assert.strictEqual(c.gaugeNames, 1);
    assert.strictEqual(typeof c.enabled, 'boolean');
    assert.strictEqual(c.enabled, true);
  });

});

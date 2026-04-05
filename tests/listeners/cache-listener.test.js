// tests/listeners/cache-listener.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 57 — Unit tests for cacheListener
// Tests that pipeline:complete saves to cache and library:changed
// clears the cache.
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { eventBus } from '../../server/services/eventBus.js';
import { cache }    from '../../server/services/cache.js';
import { register } from '../../server/services/listeners/cacheListener.js';

let registered = false;

describe('CacheListener', () => {

  before(() => {
    if (!registered) {
      register();
      registered = true;
    }
  });

  afterEach(() => {
    cache.invalidateAll();
  });

  // T-CL01: pipeline:complete with _cacheEntry — saves to cache
  it('T-CL01: pipeline:complete with _cacheEntry — saves to cache', () => {
    const cacheKey = 'chat:all:test-cache-question';
    const cacheEntry = { text: 'cached response', sources: [] };

    eventBus.emit('pipeline:complete', {
      _cacheKey: cacheKey,
      _cacheEntry: cacheEntry,
      aborted: false,
      message: 'test-cache-question',
    });

    const stored = cache.get(cacheKey);
    assert.deepStrictEqual(stored, cacheEntry, 'cache entry should be stored');
  });

  // T-CL02: pipeline:complete with aborted — does NOT save
  it('T-CL02: pipeline:complete with aborted — does NOT save', () => {
    const cacheKey = 'chat:all:aborted-question';

    eventBus.emit('pipeline:complete', {
      _cacheKey: cacheKey,
      _cacheEntry: { text: 'some text' },
      aborted: true,
      message: 'aborted-question',
    });

    const stored = cache.get(cacheKey);
    assert.strictEqual(stored, null, 'aborted requests should not be cached');
  });

  // T-CL03: pipeline:complete with _cacheEntry: null — does NOT save
  it('T-CL03: pipeline:complete with null _cacheEntry — does NOT save', () => {
    const cacheKey = 'chat:all:null-entry';

    eventBus.emit('pipeline:complete', {
      _cacheKey: cacheKey,
      _cacheEntry: null,
      aborted: false,
      message: 'null-entry',
    });

    const stored = cache.get(cacheKey);
    assert.strictEqual(stored, null, 'null _cacheEntry should not be cached');
  });

  // T-CL04: library:changed — clears all cache entries
  it('T-CL04: library:changed — clears all cache entries', () => {
    // Pre-populate cache
    cache.set('key1', { text: 'val1' }, 3600);
    cache.set('key2', { text: 'val2' }, 3600);
    const sizeBefore = cache.stats().size;
    assert.ok(sizeBefore >= 2, 'cache should have at least 2 entries');

    eventBus.emit('library:changed', { newVersion: 'v2-test' });

    const sizeAfter = cache.stats().size;
    assert.strictEqual(sizeAfter, 0, 'cache should be empty after library:changed');
  });

  // T-CL05: library:changed — sets new library version
  it('T-CL05: library:changed — sets new library version', () => {
    eventBus.emit('library:changed', { newVersion: 'v3-test-version' });

    const version = cache.getVersion();
    assert.strictEqual(version, 'v3-test-version', 'library version should be updated');
  });
});

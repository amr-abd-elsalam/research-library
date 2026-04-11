// tests/rtl-css-style-audit.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 101 — RTL CSS Audit Tests for style.css
// Reads style.css as text and verifies no physical CSS directional
// properties remain (outside known exceptions).
// Same pattern as tests/rtl-css-audit.test.js (admin.css).
// ═══════════════════════════════════════════════════════════════

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const styleCss = readFileSync(join(import.meta.dirname, '..', 'frontend', 'assets', 'css', 'style.css'), 'utf-8');

// Helper: find all occurrences of a pattern (line-by-line, skip comments)
function findPhysicalOccurrences(css, pattern) {
  const lines = css.split('\n');
  const matches = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Skip comments
    if (line.startsWith('/*') || line.startsWith('*') || line.startsWith('//')) continue;
    if (pattern.test(line)) {
      matches.push({ line: i + 1, text: line });
    }
  }
  return matches;
}

// ═══════════════════════════════════════════════════════════════
// Block 1: Physical Property Absence (T-RTLS01 to T-RTLS07)
// ═══════════════════════════════════════════════════════════════
describe('RTL CSS Style Audit — Physical Property Absence', () => {

  // T-RTLS01: no margin-left declarations
  it('T-RTLS01: style.css has no margin-left declarations', () => {
    const matches = findPhysicalOccurrences(styleCss, /^\s*margin-left\s*:/);
    assert.strictEqual(matches.length, 0, `Found margin-left at: ${matches.map(m => `line ${m.line}: ${m.text}`).join('; ')}`);
  });

  // T-RTLS02: no margin-right declarations
  it('T-RTLS02: style.css has no margin-right declarations', () => {
    const matches = findPhysicalOccurrences(styleCss, /^\s*margin-right\s*:/);
    assert.strictEqual(matches.length, 0, `Found margin-right at: ${matches.map(m => `line ${m.line}: ${m.text}`).join('; ')}`);
  });

  // T-RTLS03: no padding-left as standalone property
  it('T-RTLS03: style.css has no padding-left declarations', () => {
    const matches = findPhysicalOccurrences(styleCss, /^\s*padding-left\s*:/);
    assert.strictEqual(matches.length, 0, `Found padding-left at: ${matches.map(m => `line ${m.line}: ${m.text}`).join('; ')}`);
  });

  // T-RTLS04: no padding-right as standalone property
  it('T-RTLS04: style.css has no padding-right declarations', () => {
    const matches = findPhysicalOccurrences(styleCss, /^\s*padding-right\s*:/);
    assert.strictEqual(matches.length, 0, `Found padding-right at: ${matches.map(m => `line ${m.line}: ${m.text}`).join('; ')}`);
  });

  // T-RTLS05: no border-right as directional property
  it('T-RTLS05: style.css has no border-right declarations', () => {
    const matches = findPhysicalOccurrences(styleCss, /^\s*border-right\s*:/);
    assert.strictEqual(matches.length, 0, `Found border-right at: ${matches.map(m => `line ${m.line}: ${m.text}`).join('; ')}`);
  });

  // T-RTLS06: no border-left as directional property
  it('T-RTLS06: style.css has no border-left declarations', () => {
    const matches = findPhysicalOccurrences(styleCss, /^\s*border-left\s*:/);
    assert.strictEqual(matches.length, 0, `Found border-left at: ${matches.map(m => `line ${m.line}: ${m.text}`).join('; ')}`);
  });

  // T-RTLS07: no bare left:/right: positioning (excluding transforms and border-radius)
  it('T-RTLS07: style.css has no bare left: positioning', () => {
    const matches = findPhysicalOccurrences(styleCss, /^\s*left\s*:/);
    assert.strictEqual(matches.length, 0, `Found left: at: ${matches.map(m => `line ${m.line}: ${m.text}`).join('; ')}`);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 2: Logical Property Presence (T-RTLS08 to T-RTLS10)
// ═══════════════════════════════════════════════════════════════
describe('RTL CSS Style Audit — Logical Property Presence', () => {

  // T-RTLS08: uses padding-inline-start (confirms list migration)
  it('T-RTLS08: style.css uses padding-inline-start', () => {
    assert.ok(styleCss.includes('padding-inline-start'), 'should contain padding-inline-start');
  });

  // T-RTLS09: uses border-inline-start (confirms drawer migration)
  it('T-RTLS09: style.css uses border-inline-start', () => {
    assert.ok(styleCss.includes('border-inline-start'), 'should contain border-inline-start');
  });

  // T-RTLS10: uses inset-inline-end or inset-inline-start (confirms positioning migration)
  it('T-RTLS10: style.css uses inset-inline-end or inset-inline-start', () => {
    const hasEnd = styleCss.includes('inset-inline-end');
    const hasStart = styleCss.includes('inset-inline-start');
    assert.ok(hasEnd || hasStart, 'should contain inset-inline-end or inset-inline-start');
  });
});

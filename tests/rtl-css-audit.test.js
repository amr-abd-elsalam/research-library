// tests/rtl-css-audit.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 100 — RTL CSS Audit Tests
// Reads admin.css as text and verifies no physical CSS properties
// remain (outside known exceptions like direction:ltr blocks).
// ═══════════════════════════════════════════════════════════════

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const adminCss = readFileSync(join(import.meta.dirname, '..', 'frontend', 'assets', 'css', 'admin.css'), 'utf-8');

// Helper: find all occurrences of a pattern outside direction:ltr blocks
// This is a simplified check — looks for the property in CSS declarations
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
// Block 1: Physical Property Absence (T-RTL01 to T-RTL07)
// ═══════════════════════════════════════════════════════════════
describe('RTL CSS Audit — Physical Property Absence', () => {

  // T-RTL01: no margin-left (except inside inline styles handled by JS)
  it('T-RTL01: admin.css has no margin-left declarations', () => {
    const matches = findPhysicalOccurrences(adminCss, /^\s*margin-left\s*:/);
    assert.strictEqual(matches.length, 0, `Found margin-left at: ${matches.map(m => `line ${m.line}: ${m.text}`).join('; ')}`);
  });

  // T-RTL02: no margin-right declarations
  it('T-RTL02: admin.css has no margin-right declarations', () => {
    const matches = findPhysicalOccurrences(adminCss, /^\s*margin-right\s*:/);
    assert.strictEqual(matches.length, 0, `Found margin-right at: ${matches.map(m => `line ${m.line}: ${m.text}`).join('; ')}`);
  });

  // T-RTL03: no border-right used as accent indicator
  it('T-RTL03: admin.css has no border-right declarations', () => {
    const matches = findPhysicalOccurrences(adminCss, /^\s*border-right\s*:/);
    assert.strictEqual(matches.length, 0, `Found border-right at: ${matches.map(m => `line ${m.line}: ${m.text}`).join('; ')}`);
  });

  // T-RTL04: no border-right-color declarations
  it('T-RTL04: admin.css has no border-right-color declarations', () => {
    const matches = findPhysicalOccurrences(adminCss, /^\s*border-right-color\s*:/);
    assert.strictEqual(matches.length, 0, `Found border-right-color at: ${matches.map(m => `line ${m.line}: ${m.text}`).join('; ')}`);
  });

  // T-RTL05: no text-align:left outside direction:ltr blocks
  it('T-RTL05: admin.css has no text-align: left declarations', () => {
    const matches = findPhysicalOccurrences(adminCss, /^\s*text-align\s*:\s*left\s*;/);
    assert.strictEqual(matches.length, 0, `Found text-align:left at: ${matches.map(m => `line ${m.line}: ${m.text}`).join('; ')}`);
  });

  // T-RTL06: no bare left: positioning (check for left: that isn't inset-inline-start)
  it('T-RTL06: admin.css has no bare left: positioning', () => {
    const matches = findPhysicalOccurrences(adminCss, /^\s*left\s*:/);
    assert.strictEqual(matches.length, 0, `Found left: at: ${matches.map(m => `line ${m.line}: ${m.text}`).join('; ')}`);
  });

  // T-RTL07: no bare right: positioning (check for right: that isn't inset-inline-end)
  it('T-RTL07: admin.css has no bare right: positioning', () => {
    const matches = findPhysicalOccurrences(adminCss, /^\s*right\s*:/);
    assert.strictEqual(matches.length, 0, `Found right: at: ${matches.map(m => `line ${m.line}: ${m.text}`).join('; ')}`);
  });
});

// ═══════════════════════════════════════════════════════════════
// Block 2: Logical Property Presence (T-RTL08 to T-RTL10)
// ═══════════════════════════════════════════════════════════════
describe('RTL CSS Audit — Logical Property Presence', () => {

  // T-RTL08: admin.css uses margin-inline-end (confirms migration)
  it('T-RTL08: admin.css uses margin-inline-end', () => {
    assert.ok(adminCss.includes('margin-inline-end'), 'should contain margin-inline-end');
  });

  // T-RTL09: admin.css uses border-inline-start (confirms accent migration)
  it('T-RTL09: admin.css uses border-inline-start', () => {
    assert.ok(adminCss.includes('border-inline-start'), 'should contain border-inline-start');
  });

  // T-RTL10: admin.css uses inset-inline-start (confirms positioning migration)
  it('T-RTL10: admin.css uses inset-inline-start', () => {
    assert.ok(adminCss.includes('inset-inline-start'), 'should contain inset-inline-start');
  });
});

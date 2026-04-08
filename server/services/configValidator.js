// server/services/configValidator.js
// ═══════════════════════════════════════════════════════════════
// ConfigValidator — Phase 79 (Singleton #37)
// Cross-section config dependency validation.
// Runs once at bootstrap — detects contradictory or incomplete
// configurations and logs warnings/errors.
// Does NOT block startup — advisory only.
// Not feature-flagged — infrastructure, not a toggleable feature.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';

class ConfigValidator {
  /** @type {Array<{ name: string, check: () => { ok: boolean, message?: string, severity?: string } }>} */
  #rules;

  /** @type {{ valid: boolean, errors: string[], warnings: string[], checkedAt: number }|null} */
  #lastResult = null;

  constructor() {
    this.#rules = [
      {
        name: 'ANSWER_REFINEMENT_requires_GROUNDING',
        check: () => {
          if (config.ANSWER_REFINEMENT?.enabled === true && config.GROUNDING?.enabled !== true) {
            return { ok: false, message: 'ANSWER_REFINEMENT.enabled is true but GROUNDING.enabled is not true — refinement will be skipped (no grounding score available)', severity: 'warning' };
          }
          return { ok: true };
        },
      },
      {
        name: 'SEMANTIC_MATCHING_requires_GROUNDING_or_CITATION',
        check: () => {
          if (config.SEMANTIC_MATCHING?.enabled === true && config.GROUNDING?.enabled !== true && config.CITATION?.enabled !== true) {
            return { ok: false, message: 'SEMANTIC_MATCHING.enabled is true but neither GROUNDING nor CITATION is enabled — semantic embeddings have no consumer', severity: 'warning' };
          }
          return { ok: true };
        },
      },
      {
        name: 'SYSTEM_PROMPT_ENRICHMENT_requires_LIBRARY_INDEX',
        check: () => {
          if (config.SYSTEM_PROMPT_ENRICHMENT?.enabled === true && config.LIBRARY_INDEX?.enabled !== true) {
            return { ok: false, message: 'SYSTEM_PROMPT_ENRICHMENT.enabled is true but LIBRARY_INDEX.enabled is not true — no library data for enrichment', severity: 'warning' };
          }
          return { ok: true };
        },
      },
      {
        name: 'GAP_AWARE_ENRICHMENT_requires_CONTENT_GAPS',
        check: () => {
          if (config.SYSTEM_PROMPT_ENRICHMENT?.includeKnownGaps === true && config.CONTENT_GAPS?.enabled !== true) {
            return { ok: false, message: 'SYSTEM_PROMPT_ENRICHMENT.includeKnownGaps is true but CONTENT_GAPS.enabled is not true — no gap data available', severity: 'warning' };
          }
          return { ok: true };
        },
      },
      {
        name: 'CONTEXT_PERSISTENCE_requires_INTELLIGENT_COMPACTION',
        check: () => {
          if (config.CONTEXT?.persistContext === true && config.CONTEXT?.intelligentCompaction === false) {
            return { ok: false, message: 'CONTEXT.persistContext is true but CONTEXT.intelligentCompaction is false — no context to persist', severity: 'warning' };
          }
          return { ok: true };
        },
      },
      {
        name: 'BUDGET_ENFORCEMENT_requires_COST_GOVERNANCE_and_TOKEN_LIMIT',
        check: () => {
          if (config.COST_GOVERNANCE?.enforceBudget === true) {
            const problems = [];
            if (config.COST_GOVERNANCE?.enabled !== true) problems.push('COST_GOVERNANCE.enabled is not true');
            if (!config.SESSIONS?.maxTokensPerSession || config.SESSIONS.maxTokensPerSession <= 0) problems.push('SESSIONS.maxTokensPerSession is 0 or missing');
            if (problems.length > 0) {
              return { ok: false, message: `COST_GOVERNANCE.enforceBudget is true but: ${problems.join('; ')} — enforcement will not work`, severity: 'error' };
            }
          }
          return { ok: true };
        },
      },
      {
        name: 'PIPELINE_TIMEOUT_SANITY',
        check: () => {
          const maxMs = config.PIPELINE?.maxRequestMs;
          if (maxMs && maxMs > 0 && maxMs < 5000) {
            return { ok: false, message: `PIPELINE.maxRequestMs is ${maxMs}ms — this is very short and may cause frequent timeouts`, severity: 'warning' };
          }
          return { ok: true };
        },
      },
    ];
  }

  /**
   * Runs all validation rules against the current config.
   * @returns {{ valid: boolean, errors: string[], warnings: string[], checkedAt: number }}
   */
  validate() {
    const errors = [];
    const warnings = [];

    for (const rule of this.#rules) {
      try {
        const result = rule.check();
        if (!result.ok) {
          if (result.severity === 'error') {
            errors.push(result.message);
          } else {
            warnings.push(result.message);
          }
        }
      } catch (err) {
        errors.push(`Rule '${rule.name}' threw: ${err.message}`);
      }
    }

    this.#lastResult = {
      valid: errors.length === 0,
      errors,
      warnings,
      checkedAt: Date.now(),
    };

    return this.#lastResult;
  }

  /**
   * Summary for inspect endpoint.
   * @returns {{ totalRules: number, lastResult: { valid: boolean, errors: string[], warnings: string[], checkedAt: number }|null }}
   */
  counts() {
    return {
      totalRules: this.#rules.length,
      lastResult: this.#lastResult,
    };
  }

  /**
   * Resets state. For test isolation.
   */
  reset() {
    this.#lastResult = null;
  }
}

// ── Singleton instance ─────────────────────────────────────────
const configValidator = new ConfigValidator();

export { ConfigValidator, configValidator };

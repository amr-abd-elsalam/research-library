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
      {
        name: 'QUERY_PLANNING_requires_QUERY_COMPLEXITY',
        check: () => {
          if (config.QUERY_PLANNING?.enabled === true && config.QUERY_COMPLEXITY?.enabled !== true) {
            return { ok: false, message: 'QUERY_PLANNING.enabled is true but QUERY_COMPLEXITY.enabled is not true — planner needs complexity data to decide when to decompose', severity: 'warning' };
          }
          return { ok: true };
        },
      },
      {
        name: 'RAG_STRATEGIES_requires_QUERY_COMPLEXITY',
        check: () => {
          if (config.RAG_STRATEGIES?.enabled === true && config.QUERY_COMPLEXITY?.enabled !== true) {
            return { ok: false, message: 'RAG_STRATEGIES.enabled is true but QUERY_COMPLEXITY.enabled is not true — strategy selection uses complexity type as primary input', severity: 'warning' };
          }
          return { ok: true };
        },
      },
      {
        name: 'STREAMING_REVISION_requires_GROUNDING',
        check: () => {
          if (config.ANSWER_REFINEMENT?.streamingRevisionEnabled === true && config.GROUNDING?.enabled !== true) {
            return { ok: false, message: 'ANSWER_REFINEMENT.streamingRevisionEnabled is true but GROUNDING.enabled is not true — revision needs grounding score to detect weak answers', severity: 'warning' };
          }
          return { ok: true };
        },
      },
      {
        name: 'SESSIONS_without_SESSION_INDEX',
        check: () => {
          if (config.SESSIONS?.enabled === true && config.SESSION_INDEX?.enabled === false) {
            return { ok: false, message: 'SESSIONS enabled without SESSION_INDEX — sidebar will use slower disk reads for session list', severity: 'warning' };
          }
          return { ok: true };
        },
      },
      {
        name: 'PER_USER_ISOLATION_requires_SESSIONS',
        check: () => {
          if (config.SESSION_INDEX?.perUserIsolation === true && config.SESSIONS?.enabled !== true) {
            return { ok: false, message: 'SESSION_INDEX.perUserIsolation is true but SESSIONS.enabled is false — isolation has no effect', severity: 'warning' };
          }
          return { ok: true };
        },
      },
      {
        name: 'SIDEBAR_SSE_requires_SESSIONS',
        check: () => {
          if (config.SESSION_INDEX?.sseEnabled === true && config.SESSIONS?.enabled !== true) {
            return { ok: false, message: 'SESSION_INDEX.sseEnabled is true but SESSIONS.enabled is false — SSE sidebar updates have no sessions to stream', severity: 'warning' };
          }
          return { ok: true };
        },
      },
      {
        name: 'EXECUTION_REGISTRY_requires_COMMANDS',
        check: () => {
          if (config.EXECUTION_REGISTRY?.enabled === true && config.COMMANDS?.enabled !== true) {
            return { ok: false, message: 'EXECUTION_REGISTRY.enabled is true but COMMANDS.enabled is false — unified registry has no commands to import', severity: 'warning' };
          }
          return { ok: true };
        },
      },
      // ── Rule #15 (Phase 95) ───────────────────────────────
      {
        name: 'EXECUTION_REGISTRY_coverage_check',
        check: () => {
          if (config.EXECUTION_REGISTRY?.enabled !== false && config.ACTION_REGISTRY?.enabled !== true) {
            return { ok: false, message: 'EXECUTION_REGISTRY is enabled but ACTION_REGISTRY is disabled — unified registry will only contain commands, not admin actions', severity: 'warning' };
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

  /**
   * Re-validates config (same rules as validate).
   * Compares with previous lastResult to detect new issues.
   * Designed to be called after runtime config changes (e.g. feature flag toggles).
   * @returns {{ result: { valid: boolean, errors: string[], warnings: string[], checkedAt: number }, changed: boolean, newErrors: string[], newWarnings: string[] }}
   */
  revalidate() {
    const previous = this.#lastResult;
    const current = this.validate();

    const changed = !previous
      || previous.errors.length !== current.errors.length
      || previous.warnings.length !== current.warnings.length;

    const newErrors = current.errors.filter(e => !previous?.errors?.includes(e));
    const newWarnings = current.warnings.filter(w => !previous?.warnings?.includes(w));

    return { result: current, changed, newErrors, newWarnings };
  }
}

// ── Singleton instance ─────────────────────────────────────────
const configValidator = new ConfigValidator();

export { ConfigValidator, configValidator };

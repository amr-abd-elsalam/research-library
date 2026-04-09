// server/services/sessionReplaySerializer.js
// ═══════════════════════════════════════════════════════════════
// SessionReplaySerializer — Phase 84 (Singleton #41)
// Reads from AuditTrailListener + CorrelationIndex to build
// an ordered replay of a complete session conversation.
//
// Config: SESSIONS.enableReplay (default false)
// Stateless — reads from other singletons on demand.
// Zero overhead when disabled.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { getTrail }        from './listeners/auditTrailListener.js';
import { correlationIndex } from './correlationIndex.js';

class SessionReplaySerializer {

  /**
   * Whether session replay is enabled.
   * @returns {boolean}
   */
  get enabled() {
    return config.SESSIONS?.enableReplay === true;
  }

  /**
   * Builds a complete replay script for a session.
   * Reads audit trail events + enriches with correlation data.
   *
   * @param {string} sessionId
   * @returns {{ sessionId: string, turns: Array, totalTurns: number, durationMs: number }|null}
   */
  buildReplay(sessionId) {
    if (!this.enabled) return null;
    if (!sessionId || typeof sessionId !== 'string') return null;

    const trail = getTrail(sessionId, 200);
    if (!trail || trail.length === 0) return null;

    // Filter for query events (each represents a user question → pipeline answer)
    const queryEvents = trail.filter(e => e.type === 'query');
    if (queryEvents.length === 0) return null;

    const turns = [];

    for (let i = 0; i < queryEvents.length; i++) {
      const event = queryEvents[i];
      const correlationId = event.correlationId || null;

      // Look up enriched data from correlation index
      let corrData = null;
      if (correlationId) {
        corrData = correlationIndex.get(correlationId);
      }

      turns.push({
        turnNumber:     i + 1,
        question:       event.message || corrData?.message || null,
        answer:         corrData?.fullText || null,
        sources:        corrData ? (Array.isArray(corrData.sources) ? corrData.sources : null) : null,
        groundingScore: corrData?.groundingScore ?? null,
        avgScore:       event.avgScore ?? corrData?.avgScore ?? null,
        timingMs:       event.totalMs ?? null,
        rewriteUsed:    corrData?.effectiveMessage
          ? corrData.effectiveMessage !== corrData.message
          : null,
        correlationId,
      });
    }

    // Calculate session duration from first to last event timestamp
    const timestamps = trail.map(e => e.timestamp).filter(t => typeof t === 'number');
    const durationMs = timestamps.length >= 2
      ? Math.max(...timestamps) - Math.min(...timestamps)
      : 0;

    return {
      sessionId,
      turns,
      totalTurns: turns.length,
      durationMs,
    };
  }

  /**
   * Summary for inspect endpoint.
   * @returns {{ enabled: boolean }}
   */
  counts() {
    return { enabled: this.enabled };
  }

  /**
   * Reset — no-op (stateless singleton).
   */
  reset() {
    // Stateless — nothing to reset
  }
}

// ── Singleton instance ─────────────────────────────────────────
const sessionReplaySerializer = new SessionReplaySerializer();

export { SessionReplaySerializer, sessionReplaySerializer };

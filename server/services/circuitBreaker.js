// server/services/circuitBreaker.js
// ═══════════════════════════════════════════════════════════════
// CircuitBreaker — Phase 18
// Protects against external service failures (Gemini, Qdrant)
// by "opening the circuit" after consecutive failures.
// When open: calls fail instantly instead of waiting for timeout.
// Three states: closed → open → half-open → closed.
// Zero dependencies beyond logger, eventBus, metrics, config.
// ═══════════════════════════════════════════════════════════════

import config     from '../../config.js';
import { logger } from './logger.js';
import { eventBus } from './eventBus.js';
import { metrics }  from './metrics.js';

// ── Custom Error ───────────────────────────────────────────────
export class CircuitOpenError extends Error {
  /**
   * @param {string} circuitName — which circuit is open (e.g. 'gemini')
   */
  constructor(circuitName) {
    super(`Circuit '${circuitName}' is open — service unavailable`);
    this.name = 'CircuitOpenError';
    this.circuitName = circuitName;
  }
}

// ── Circuit Breaker Class ──────────────────────────────────────

class CircuitBreaker {
  #name;
  #state          = 'closed';
  #failureCount   = 0;
  #lastFailureTime = 0;
  #failureThreshold;
  #resetAfterMs;

  /**
   * @param {string} name — identifier (e.g. 'gemini', 'qdrant')
   * @param {object} [options]
   * @param {number} [options.failureThreshold=3]
   * @param {number} [options.resetAfterMs=30000]
   */
  constructor(name, options = {}) {
    this.#name             = name;
    this.#failureThreshold = options.failureThreshold ?? 3;
    this.#resetAfterMs     = options.resetAfterMs     ?? 30000;
  }

  /**
   * Executes a function through the circuit breaker.
   * - closed:    runs fn normally, tracks failures
   * - open:      throws CircuitOpenError immediately (if cooldown not expired)
   * - half-open: runs fn once — success → closed, failure → open
   *
   * @param {Function} fn — async function to protect
   * @returns {Promise<*>} result of fn
   * @throws {CircuitOpenError} if circuit is open
   */
  async execute(fn) {
    // ── Open state: check cooldown ─────────────────────────
    if (this.#state === 'open') {
      const elapsed = Date.now() - this.#lastFailureTime;
      if (elapsed < this.#resetAfterMs) {
        // Still in cooldown — fail fast
        throw new CircuitOpenError(this.#name);
      }
      // Cooldown expired — transition to half-open
      this.#transition('half-open');
    }

    // ── Closed or half-open: try the call ──────────────────
    try {
      const result = await fn();

      // Success — reset to closed if not already
      if (this.#state !== 'closed') {
        this.#transition('closed');
      }
      this.#failureCount = 0;

      return result;

    } catch (err) {
      this.#failureCount++;
      this.#lastFailureTime = Date.now();

      // In half-open: single failure → back to open
      if (this.#state === 'half-open') {
        this.#transition('open');
        throw err;
      }

      // In closed: check threshold
      if (this.#failureCount >= this.#failureThreshold) {
        this.#transition('open');
      }

      throw err;
    }
  }

  // ── State transition (with logging + events + metrics) ─────
  #transition(to) {
    const from = this.#state;
    if (from === to) return;

    this.#state = to;

    logger.warn('circuitBreaker', `${this.#name}: ${from} → ${to}`, {
      failureCount: this.#failureCount,
      resetAfterMs: this.#resetAfterMs,
    });

    eventBus.emit('circuit:stateChange', {
      name:      this.#name,
      from,
      to,
      timestamp: Date.now(),
    });

    metrics.increment('circuit_state_changes_total', {
      name: this.#name,
      to,
    });
  }

  /** @returns {'closed'|'open'|'half-open'} current state */
  get state() { return this.#state; }

  /** @returns {string} circuit name */
  get name() { return this.#name; }

  /**
   * Returns circuit breaker stats for health/inspect endpoints.
   * @returns {{ name: string, state: string, failureCount: number, lastFailureTime: number, failureThreshold: number, resetAfterMs: number }}
   */
  get stats() {
    return {
      name:             this.#name,
      state:            this.#state,
      failureCount:     this.#failureCount,
      lastFailureTime:  this.#lastFailureTime,
      failureThreshold: this.#failureThreshold,
      resetAfterMs:     this.#resetAfterMs,
    };
  }
}

// ── Passthrough (no-op) wrapper ────────────────────────────────
// Used when circuit breaker is disabled — zero overhead.

class PassthroughCircuitBreaker {
  #name;
  constructor(name) { this.#name = name; }
  async execute(fn) { return fn(); }
  get state() { return 'closed'; }
  get name()  { return this.#name; }
  get stats() {
    return { name: this.#name, state: 'disabled', failureCount: 0, lastFailureTime: 0, failureThreshold: 0, resetAfterMs: 0 };
  }
}

// ── Registry ───────────────────────────────────────────────────
/** @type {Map<string, CircuitBreaker|PassthroughCircuitBreaker>} */
const registry = new Map();

/**
 * Creates and registers a circuit breaker.
 * If circuit breaker is disabled in config, returns a passthrough (zero overhead).
 * @param {string} name — unique identifier
 * @param {object} [options] — { failureThreshold, resetAfterMs }
 * @returns {CircuitBreaker|PassthroughCircuitBreaker}
 */
export function createCircuitBreaker(name, options = {}) {
  const cbConfig = config.PIPELINE?.circuitBreaker;
  const enabled  = cbConfig?.enabled === true;

  const finalOptions = {
    failureThreshold: options.failureThreshold ?? cbConfig?.failureThreshold ?? 3,
    resetAfterMs:     options.resetAfterMs     ?? cbConfig?.resetAfterMs     ?? 30000,
  };

  const cb = enabled
    ? new CircuitBreaker(name, finalOptions)
    : new PassthroughCircuitBreaker(name);

  registry.set(name, cb);
  return cb;
}

/**
 * Returns an existing circuit breaker by name.
 * @param {string} name
 * @returns {CircuitBreaker|PassthroughCircuitBreaker|undefined}
 */
export function getCircuitBreaker(name) {
  return registry.get(name);
}

/**
 * Returns stats for all registered circuit breakers.
 * Used by health and inspect endpoints.
 * @returns {Object<string, object>}
 */
export function allCircuitStats() {
  const result = {};
  for (const [name, cb] of registry) {
    result[name] = cb.stats;
  }
  return result;
}

export { CircuitBreaker };

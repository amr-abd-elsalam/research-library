// server/services/permissionContext.js
// ═══════════════════════════════════════════════════════════════
// PermissionContext — Phase 26
// Evaluates per-request permissions based on access tier.
// Inspired by Claude Code's ToolPermissionContext deny-list pattern,
// adapted as allow-list per tier for white-label flexibility.
// Built per-request (not singleton) — each request resolves its tier
// from auth state and checks allowed resources against tier config.
// Zero overhead when disabled — all methods return true.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { logger } from './logger.js';

class PermissionContext {
  #tier;
  #tierConfig;
  #enabled;

  /**
   * @param {string|null} tier — resolved tier name (e.g. 'guest', 'member', 'premium')
   */
  constructor(tier) {
    this.#enabled = config.TIERS?.enabled === true;

    if (!this.#enabled) {
      this.#tier       = null;
      this.#tierConfig = null;
      return;
    }

    this.#tier       = tier || config.TIERS?.defaultTier || 'member';
    this.#tierConfig = config.TIERS?.definitions?.[this.#tier] || null;

    if (!this.#tierConfig) {
      logger.warn('permissionContext', `tier '${this.#tier}' not found in definitions — falling back to unrestricted`);
    }
  }

  /** @returns {string|null} resolved tier name */
  get tier() { return this.#tier; }

  /** @returns {boolean} whether tiers are enabled */
  get enabled() { return this.#enabled; }

  /**
   * Checks if a command is allowed for this tier.
   * @param {string} commandName — command name including prefix (e.g. '/ملخص')
   * @returns {boolean}
   */
  allowsCommand(commandName) {
    if (!this.#enabled || !this.#tierConfig) return true;
    const allowed = this.#tierConfig.allowedCommands;
    if (allowed === '*') return true;
    if (!Array.isArray(allowed)) return true;
    return allowed.includes(commandName);
  }

  /**
   * Checks if a response mode is allowed for this tier.
   * @param {string} mode — 'stream' | 'structured' | 'concise'
   * @returns {boolean}
   */
  allowsMode(mode) {
    if (!this.#enabled || !this.#tierConfig) return true;
    const allowed = this.#tierConfig.allowedModes;
    if (allowed === '*') return true;
    if (!Array.isArray(allowed)) return true;
    return allowed.includes(mode);
  }

  /**
   * Checks if a topic is allowed for this tier.
   * @param {string} topicId — topic filter ID
   * @returns {boolean}
   */
  allowsTopic(topicId) {
    if (!this.#enabled || !this.#tierConfig) return true;
    if (!topicId) return true; // null/undefined topic = "all" = always allowed
    const allowed = this.#tierConfig.allowedTopics;
    if (allowed === '*') return true;
    if (!Array.isArray(allowed)) return true;
    return allowed.includes(topicId);
  }

  /**
   * Returns the per-tier max tokens per session override.
   * 0 = use global config.SESSIONS.maxTokensPerSession.
   * @returns {number}
   */
  getMaxTokensPerSession() {
    if (!this.#enabled || !this.#tierConfig) return 0;
    return this.#tierConfig.maxTokensPerSession ?? 0;
  }

  /**
   * JSON-safe representation for debugging/logging.
   * @returns {{ enabled: boolean, tier: string|null, hasConfig: boolean }}
   */
  toJSON() {
    return {
      enabled:   this.#enabled,
      tier:      this.#tier,
      hasConfig: !!this.#tierConfig,
    };
  }
}

/**
 * Factory function — builds PermissionContext from request auth state.
 * Reads req._authenticated (set by requireAccess) and req._isAdmin (set by requireAdmin).
 * @param {object} req — HTTP request with _authenticated/_isAdmin flags
 * @returns {PermissionContext}
 */
function buildPermissionContext(req) {
  if (config.TIERS?.enabled !== true) {
    return new PermissionContext(null);
  }

  // Admin (Bearer token) → premium tier
  if (req._isAdmin) {
    return new PermissionContext('premium');
  }

  // Authenticated user (PIN or access token) → defaultTier
  if (req._authenticated) {
    return new PermissionContext(config.TIERS?.defaultTier || 'member');
  }

  // Guest (no auth, public access mode) → guestTier
  return new PermissionContext(config.TIERS?.guestTier || 'guest');
}

export { PermissionContext, buildPermissionContext };

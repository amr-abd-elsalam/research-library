// server/services/eventBus.js
// ═══════════════════════════════════════════════════════════════
// EventBus — Phase 12
// Lightweight publish/subscribe for decoupled module communication.
// Backend-only — fire-and-forget, synchronous emit, errors caught.
// ═══════════════════════════════════════════════════════════════

class EventBus {
  #listeners = new Map();

  /**
   * Subscribes a listener to an event.
   * @param {string} event — event name (e.g. 'pipeline:stageComplete')
   * @param {Function} fn  — (data) => void
   * @returns {Function} unsubscribe — call to remove this listener
   */
  on(event, fn) {
    if (typeof fn !== 'function') {
      throw new Error('EventBus.on: fn must be a function');
    }

    if (!this.#listeners.has(event)) {
      this.#listeners.set(event, []);
    }
    this.#listeners.get(event).push(fn);

    // Return unsubscribe function
    return () => {
      const arr = this.#listeners.get(event);
      if (!arr) return;
      const idx = arr.indexOf(fn);
      if (idx !== -1) arr.splice(idx, 1);
    };
  }

  /**
   * Emits an event to all registered listeners.
   * Synchronous, fire-and-forget — errors are caught and warned.
   * @param {string} event — event name
   * @param {*} data       — payload passed to each listener
   */
  emit(event, data) {
    const arr = this.#listeners.get(event);
    if (!arr || arr.length === 0) return;

    for (const fn of arr) {
      try {
        fn(data);
      } catch (err) {
        console.warn(`[eventBus] listener error on '${event}':`, err.message);
      }
    }
  }

  /**
   * Total number of listeners across all events.
   * @returns {number}
   */
  get size() {
    let count = 0;
    for (const [, arr] of this.#listeners) {
      count += arr.length;
    }
    return count;
  }
}

// ── Singleton instance ─────────────────────────────────────────
const eventBus = new EventBus();

export { EventBus, eventBus };

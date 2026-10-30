import path from 'node:path';
import { config, paths } from '../config.js';
import { JSONStore } from '../store.js';
import { bus } from '../bus.js';

// A place on the web where Charlie's work gets noticed. Each source polls its
// platform and turns real activity from other people into ledger earnings.
// Counts are high-water marks, and whatever exists at the first poll is a
// baseline rather than income.
export class Source {
  constructor(name, ledger, initial) {
    this.name = name;
    this.ledger = ledger;
    this.store = new JSONStore(path.join(paths.data, `source-${name}.json`), () => ({ initialized: false, lastPoll: null, ...initial }));
    this.error = null;
    this.timer = null;
  }

  get s() {
    return this.store.data;
  }

  get enabled() {
    return false;
  }

  // One poll, never throwing: errors are kept for the wake summary.
  async pollOnce() {
    if (!this.enabled) return;
    try {
      await this.poll();
      this.s.initialized = true;
      this.s.lastPoll = new Date().toISOString();
      this.error = null;
      this.store.save();
      bus.emit('sources', { name: this.name, status: this.status() });
    } catch (err) {
      this.error = String(err.message || err).slice(0, 300);
      console.error(`[${this.name}] poll failed:`, this.error);
    }
  }

  start() {
    if (!this.enabled) return;
    const run = () => this.pollOnce();
    setTimeout(run, 5000).unref?.();
    this.timer = setInterval(run, config.sources.pollMinutes * 60_000);
    this.timer.unref?.();
  }

  // Credit the increase of a counter above its high-water mark.
  rise(key, value, earnKey, reason) {
    const marks = (this.s.marks ??= {});
    const prev = marks[key];
    marks[key] = Math.max(prev ?? value, value);
    if (prev === undefined) {
      if (!this.s.initialized) return 0;
      marks[key] = value;
      if (value <= 0) return 0;
      return this.ledger.earn(earnKey, value, typeof reason === 'function' ? reason(value) : reason);
    }
    if (value > prev) {
      const n = value - prev;
      return this.ledger.earn(earnKey, n, typeof reason === 'function' ? reason(n) : reason);
    }
    return 0;
  }

  status() {
    return { name: this.name, enabled: this.enabled, error: this.error, lastPoll: this.s.lastPoll };
  }

  flush() {
    this.store.flush();
  }
}

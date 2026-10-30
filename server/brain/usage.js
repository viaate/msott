import path from 'node:path';
import { config, paths } from '../config.js';
import { JSONStore, today } from '../store.js';

// Tracks what Charlie's thinking costs in real dollars, per local day, so she
// can be put to bed when the daily budget is spent. Visitors see it as "energy".
export class Usage {
  constructor(file = path.join(paths.data, 'usage.json')) {
    this.store = new JSONStore(file, { days: {} });
  }

  day(date = today()) {
    return (this.store.data.days[date] ??= { usd: 0, calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  }

  record(model, usage) {
    const p = config.brain.pricingPerMTok[model] ?? config.brain.pricingPerMTok[config.brain.model] ?? { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 };
    const input = usage?.input_tokens ?? 0;
    const output = usage?.output_tokens ?? 0;
    const cacheRead = usage?.cache_read_input_tokens ?? 0;
    const cacheWrite = usage?.cache_creation_input_tokens ?? 0;
    const usd = (input * p.input + output * p.output + cacheRead * p.cacheRead + cacheWrite * p.cacheWrite) / 1e6;
    const d = this.day();
    d.usd += usd;
    d.calls += 1;
    d.input += input;
    d.output += output;
    d.cacheRead += cacheRead;
    d.cacheWrite += cacheWrite;
    const days = Object.keys(this.store.data.days).sort();
    for (const old of days.slice(0, -60)) delete this.store.data.days[old];
    this.store.save();
    return usd;
  }

  get spentToday() {
    return this.day().usd;
  }

  get budget() {
    return Number(config.brain.dailyBudgetUSD) || 0;
  }

  get exhausted() {
    return this.budget > 0 && this.spentToday >= this.budget;
  }

  // 0..1 share of today's budget left.
  get energy() {
    if (!this.budget) return 1;
    return Math.max(0, 1 - this.spentToday / this.budget);
  }

  flush() {
    this.store.flush();
  }
}

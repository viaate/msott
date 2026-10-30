import path from 'node:path';
import { config, paths, earnWeight } from './config.js';
import { JSONStore, today } from './store.js';
import { bus } from './bus.js';

const LABELS = {
  'github.star': ['star', 'stars'],
  'github.fork': ['fork', 'forks'],
  'github.follower': ['follower', 'followers'],
  'github.watcher': ['watcher', 'watchers'],
  'github.uniqueView': ['repo visitor', 'repo visitors'],
  'github.externalIssue': ['issue/PR from someone', 'issues/PRs from others'],
  'github.externalComment': ['comment from someone', 'comments from others'],
  'github.newRepo': ['new public repo', 'new public repos'],
  'site.visitor': ['visitor', 'visitors'],
  'site.pet': ['pet', 'pets'],
  'site.treat': ['treat', 'treats'],
  'site.message': ['message', 'messages'],
  'site.touch': ['touch on a build', 'touches on builds'],
  'beacon.view': ['page view', 'page views'],
  gift: ['gift from your human', 'gifts from your human'],
};

export function label(key, n = 1) {
  const pair = LABELS[key] ?? [key, key];
  return n === 1 ? pair[0] : pair[1];
}

const round = (n) => Math.round(n * 100) / 100;

// The ledger is the only place tokens come from or go to. Earnings are
// derived from outside signals (GitHub, visitors); Charlie can't add any.
export class Ledger {
  constructor(file = path.join(paths.data, 'ledger.json')) {
    this.store = new JSONStore(file, () => ({
      balance: config.economy.startingTokens,
      earned: 0,
      spent: 0,
      bySource: {},
      entries: [],
      daily: { date: today(), counts: {} },
    }));
  }

  get data() {
    return this.store.data;
  }

  get balance() {
    return this.data.balance;
  }

  record(entry) {
    this.data.entries.push(entry);
    if (this.data.entries.length > 500) this.data.entries.splice(0, this.data.entries.length - 500);
    this.store.save();
  }

  earn(key, units = 1, reason = '', { quiet = false } = {}) {
    const weight = key === 'gift' ? 1 : earnWeight(key);
    if (!weight || !(units > 0)) return 0;
    const amount = round(weight * units);
    const d = this.data;
    d.balance = round(d.balance + amount);
    d.earned = round(d.earned + amount);
    d.bySource[key] = round((d.bySource[key] ?? 0) + amount);
    const entry = { t: Date.now(), kind: 'earn', key, units, amount, reason: reason || `${units} ${label(key, units)}` };
    this.record(entry);
    bus.emit('balance', { balance: d.balance, delta: amount, key, reason: entry.reason });
    if (!quiet) bus.feed('earn', `+${amount} · ${entry.reason}`, { amount, key });
    return amount;
  }

  canAfford(amount) {
    return this.data.balance >= amount;
  }

  spend(amount, reason) {
    const d = this.data;
    if (d.balance < amount) throw new Error(`Not enough tokens: this costs ${amount}, you have ${d.balance}.`);
    d.balance = round(d.balance - amount);
    d.spent = round(d.spent + amount);
    this.record({ t: Date.now(), kind: 'spend', amount, reason });
    bus.emit('balance', { balance: d.balance, delta: -amount, reason });
    bus.feed('spend', `−${amount} · ${reason}`, { amount });
  }

  // Per-day counters used for anti-spam limits. Returns true (and counts it)
  // while the counter is under max.
  allow(counterKey, max) {
    const daily = this.data.daily;
    if (daily.date !== today()) {
      daily.date = today();
      daily.counts = {};
    }
    const n = daily.counts[counterKey] ?? 0;
    if (n >= max) return false;
    daily.counts[counterKey] = n + 1;
    this.store.save();
    return true;
  }

  // Earnings since a timestamp, grouped by source, for the wake summary.
  summarySince(t) {
    const groups = {};
    let total = 0;
    for (const e of this.data.entries) {
      if (e.t <= t || e.kind !== 'earn') continue;
      const g = (groups[e.key] ??= { units: 0, amount: 0 });
      g.units += e.units;
      g.amount = round(g.amount + e.amount);
      total = round(total + e.amount);
    }
    return { total, groups };
  }

  recent(n = 30) {
    return this.data.entries.slice(-n);
  }

  flush() {
    this.store.flush();
  }
}

export function price(kind, count) {
  const c = config.economy.costs[kind];
  if (typeof c === 'number') return c;
  return Math.round(c.base * Math.pow(c.growth, count));
}

import path from 'node:path';
import { paths } from './config.js';
import { JSONStore } from './store.js';
import { bus } from './bus.js';

export const FEELINGS = ['fullness', 'energy', 'joy', 'curiosity', 'calm'];

// How each feeling drifts per hour on its own. This is her body, not her
// choices: it changes the signals she wakes up to, never what she does.
const DRIFT = {
  awake: { fullness: -5, energy: -6, curiosity: 2 },
  asleep: { fullness: -3, energy: 18, calm: 12, curiosity: 4 },
};
const BASELINE = { joy: 55, calm: 60 };
const clamp = (v) => Math.max(0, Math.min(100, v));
const round = (v) => Math.round(v * 10) / 10;

const WORDS = {
  fullness: [[20, 'hungry'], [45, 'peckish'], [85, ''], [101, 'stuffed']],
  energy: [[20, 'exhausted'], [45, 'tired'], [90, ''], [101, 'full of beans']],
  joy: [[25, 'low'], [45, 'a bit flat'], [75, ''], [101, 'very happy']],
  curiosity: [[20, 'satisfied'], [70, ''], [85, 'restless'], [101, 'itching to do something new']],
  calm: [[25, 'frazzled'], [45, 'on edge'], [85, ''], [101, 'very calm']],
};

export function word(name, v) {
  return WORDS[name].find(([max]) => v < max)?.[1] ?? '';
}

export class Feelings {
  constructor(file = path.join(paths.data, 'feelings.json')) {
    this.store = new JSONStore(file, () => ({
      values: { fullness: 70, energy: 85, joy: 60, curiosity: 75, calm: 70 },
      bowl: 1,
      t: Date.now(),
    }));
    this.isAsleep = () => true;
    setInterval(() => this.emit(), 5 * 60_000).unref();
  }

  get d() {
    return this.store.data;
  }

  tick() {
    const now = Date.now();
    const hours = Math.min(48, (now - this.d.t) / 3_600_000);
    this.d.t = now;
    if (hours <= 0) return;
    const v = this.d.values;
    const drift = DRIFT[this.isAsleep() ? 'asleep' : 'awake'];
    for (const [k, perHour] of Object.entries(drift)) v[k] = clamp(v[k] + perHour * hours);
    for (const [k, base] of Object.entries(BASELINE)) v[k] = clamp(v[k] + (base - v[k]) * (1 - Math.exp(-0.1 * hours)));
    for (const k of FEELINGS) v[k] = round(v[k]);
    this.store.save();
  }

  get values() {
    this.tick();
    return { ...this.d.values };
  }

  bump(changes) {
    this.tick();
    const v = this.d.values;
    for (const [k, delta] of Object.entries(changes)) if (k in v) v[k] = round(clamp(v[k] + delta));
    this.store.save();
    this.emit();
  }

  emit() {
    bus.emit('feelings', this.publicState());
  }

  publicState() {
    return { values: this.values, bowl: this.d.bowl };
  }

  fillBowl() {
    this.d.bowl = Math.min(4, this.d.bowl + 1);
    this.store.save();
    this.emit();
    return this.d.bowl;
  }

  // Eats up to two portions from her bowl. Returns how much she ate.
  eat() {
    const portions = Math.min(2, this.d.bowl);
    if (!portions) return 0;
    this.d.bowl -= portions;
    this.bump({ fullness: 22 * portions, joy: 2 });
    return portions;
  }

  describe() {
    const v = this.values;
    return FEELINGS.map((k) => {
      const w = word(k, v[k]);
      return `${k} ${Math.round(v[k])}/100${w ? ` (${w})` : ''}`;
    }).join(' · ');
  }

  flush() {
    this.store.flush();
  }
}

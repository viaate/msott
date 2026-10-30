import path from 'node:path';
import { paths } from './config.js';
import { JSONStore } from './store.js';
import { bus } from './bus.js';

export const DIARY_KINDS = ['thought', 'place', 'food', 'visitor', 'offering', 'work', 'internet', 'dream'];

// Charlie's public diary. She writes every entry herself; visitors can read it.
export class Diary {
  constructor(file = path.join(paths.data, 'diary.json')) {
    this.store = new JSONStore(file, { seq: 0, entries: [] });
  }

  get entries() {
    return this.store.data.entries;
  }

  write({ text, kind = 'thought', mood = 0, place = null }, feelings) {
    const entry = {
      id: ++this.store.data.seq,
      t: Date.now(),
      kind: DIARY_KINDS.includes(kind) ? kind : 'thought',
      mood: Math.max(-2, Math.min(2, Math.round(Number(mood) || 0))),
      place: place ? String(place).slice(0, 40) : null,
      text: String(text).trim().slice(0, 1200),
      feelings,
    };
    this.entries.push(entry);
    if (this.entries.length > 600) this.entries.splice(0, this.entries.length - 600);
    this.store.save();
    bus.emit('diary', entry);
    return entry;
  }

  recent(n = 40) {
    return this.entries.slice(-n);
  }

  flush() {
    this.store.flush();
  }
}

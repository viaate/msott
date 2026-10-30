import path from 'node:path';
import { config, paths } from './config.js';
import { JSONStore } from './store.js';

// Everything visitors see live flows through here: SSE broadcast plus a
// persisted rolling feed (thoughts, actions, earnings, visitor messages).
class Bus {
  constructor() {
    this.clients = new Set();
    this.feedStore = new JSONStore(path.join(paths.data, 'feed.json'), { seq: 0, items: [] });
    this.listeners = new Map();
    this.recording = null;
  }

  get feedItems() {
    return this.feedStore.data.items;
  }

  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }

  // Records what happens during a wake so a static site can replay it later.
  startRecording() {
    this.recording = { started: Date.now(), events: [], code: new Map() };
  }

  stopRecording() {
    const r = this.recording;
    this.recording = null;
    return r ? r.events : [];
  }

  record(type, data) {
    const r = this.recording;
    if (!r || type === 'thought_delta' || type === 'viewers') return;
    const t = Date.now() - r.started;
    if (type === 'code_start') {
      const entry = { t, type: 'code', data: { key: data.key, tool: data.tool, title: '', code: '' } };
      r.code.set(data.key, entry.data);
      r.events.push(entry);
    } else if (type === 'code_title') {
      const c = r.code.get(data.key);
      if (c) c.title = data.title;
    } else if (type === 'code_delta') {
      const c = r.code.get(data.key);
      if (c) c.code += data.text;
    } else if (type !== 'code_end') {
      const last = r.events.at(-1);
      if (type === 'charlie' && last?.type === 'charlie' && JSON.stringify(last.data) === JSON.stringify(data)) return;
      r.events.push({ t, type, data });
    }
  }

  emit(type, data) {
    this.record(type, data);
    const frame = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.clients) client.write(frame);
    for (const fn of this.listeners.get(type) ?? []) fn(data);
  }

  feed(kind, text, extra = {}) {
    const store = this.feedStore;
    const item = { id: ++store.data.seq, t: Date.now(), kind, text: String(text), ...extra };
    store.data.items.push(item);
    const max = config.site.feedLength;
    if (store.data.items.length > max) store.data.items.splice(0, store.data.items.length - max);
    store.save();
    this.emit('feed', item);
    return item;
  }

  addClient(res) {
    this.clients.add(res);
    this.emit('viewers', { count: this.clients.size });
    res.on('close', () => {
      this.clients.delete(res);
      this.emit('viewers', { count: this.clients.size });
    });
  }

  get viewers() {
    return this.clients.size;
  }

  flush() {
    this.feedStore.flush();
  }
}

export const bus = new Bus();

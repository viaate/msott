import path from 'node:path';
import { paths } from './config.js';
import { JSONStore, clip } from './store.js';
import { bus } from './bus.js';

// Things Charlie asks her human for (an account somewhere, a decision, help),
// and notes her human leaves her. She reads both when she wakes.
export class Requests {
  constructor(file = path.join(paths.data, 'requests.json')) {
    this.store = new JSONStore(file, { seq: 0, items: [] });
  }

  get items() {
    return this.store.data.items;
  }

  get notes() {
    return (this.store.data.notes ??= []);
  }

  // A note from her human, with any files they gave her (paths in her home).
  note(text, { files = [], issue = null } = {}) {
    const item = { id: (this.store.data.noteSeq = (this.store.data.noteSeq ?? 0) + 1), t: Date.now(), text: clip(String(text ?? '').trim(), 4000), files, issue, seenAt: null };
    this.notes.push(item);
    if (this.notes.length > 100) this.notes.splice(0, this.notes.length - 100);
    this.store.save();
    bus.feed('system', `Her human left Charlie a note${files.length ? ` with ${files.length} file${files.length > 1 ? 's' : ''}` : ''}.`);
    return item;
  }

  unseenNotes() {
    return this.notes.filter((n) => !n.seenAt);
  }

  markNotesSeen(ids) {
    const set = new Set(ids);
    for (const n of this.notes) if (set.has(n.id)) n.seenAt = Date.now();
    this.store.save();
  }

  ask(text) {
    const open = this.items.filter((r) => r.status === 'open');
    if (open.length >= 10) throw new Error('You already have 10 open requests. Wait for your human to answer some.');
    const item = { id: ++this.store.data.seq, t: Date.now(), text: clip(String(text).trim(), 600), status: 'open', reply: null, answeredAt: null };
    this.items.push(item);
    this.store.save();
    bus.feed('ask', `Charlie asked her human: ${item.text}`, { requestId: item.id });
    bus.emit('requests', this.publicList());
    return item;
  }

  answer(id, reply, status = 'done') {
    const item = this.items.find((r) => r.id === Number(id));
    if (!item) throw new Error('no such request');
    item.status = ['done', 'declined'].includes(status) ? status : 'done';
    item.reply = clip(String(reply ?? ''), 600);
    item.answeredAt = Date.now();
    this.store.save();
    bus.feed('system', `Her human answered request #${item.id}${item.reply ? `: ${item.reply}` : '.'}`);
    bus.emit('requests', this.publicList());
    return item;
  }

  publicList() {
    return this.items.slice(-30);
  }

  lines(since) {
    const out = [];
    const open = this.items.filter((r) => r.status === 'open');
    const answered = this.items.filter((r) => r.answeredAt && r.answeredAt > since);
    if (answered.length) {
      out.push('YOUR HUMAN ANSWERED:');
      for (const r of answered) out.push(`- #${r.id} "${clip(r.text, 120)}" → ${r.status}${r.reply ? `: ${r.reply}` : ''}`);
    }
    if (open.length) {
      out.push('STILL WAITING ON YOUR HUMAN:');
      for (const r of open) out.push(`- #${r.id}: ${clip(r.text, 160)}`);
    }
    return out;
  }

  flush() {
    this.store.flush();
  }
}

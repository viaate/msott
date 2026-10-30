import crypto from 'node:crypto';
import path from 'node:path';
import { config, paths } from './config.js';
import { JSONStore, today } from './store.js';
import { bus } from './bus.js';

const limits = config.economy.limits;

function isLoopback(ip) {
  return !ip || ip === '::1' || ip.startsWith('127.') || ip === '::ffff:127.0.0.1';
}

// Visitors are anonymous: an id is a salted hash of IP + user agent that
// rotates daily, used only to count uniques and rate-limit.
export class Visitors {
  constructor(ledger, world) {
    this.ledger = ledger;
    this.world = world;
    this.salt = { date: '', value: '' };
    this.inbox = new JSONStore(path.join(paths.data, 'inbox.json'), { seq: 0, messages: [] });
    this.buckets = new Map();
  }

  ip(req) {
    if (config.site.trustProxy) {
      const cf = req.headers['cf-connecting-ip'];
      if (cf) return String(cf);
      const xff = req.headers['x-forwarded-for'];
      if (xff) return String(xff).split(',')[0].trim();
    }
    return req.socket.remoteAddress || '';
  }

  id(req) {
    if (this.salt.date !== today()) this.salt = { date: today(), value: crypto.randomBytes(16).toString('hex') };
    const ua = String(req.headers['user-agent'] || '');
    return crypto.createHash('sha256').update(`${this.ip(req)}|${ua}|${this.salt.value}`).digest('hex').slice(0, 16);
  }

  // Short burst limiter for POSTs: ~3 actions/second per visitor.
  burstOK(req) {
    const key = this.ip(req);
    const now = Date.now();
    const b = this.buckets.get(key) ?? { tokens: 6, t: now };
    b.tokens = Math.min(6, b.tokens + ((now - b.t) / 1000) * 3);
    b.t = now;
    this.buckets.set(key, b);
    if (this.buckets.size > 5000) this.buckets.clear();
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }

  visit(req) {
    const id = this.id(req);
    if (this.ledger.allow(`visit:${id}`, 1)) this.ledger.earn('site.visitor', 1, 'a new visitor came by', { quiet: true });
  }

  pet(req) {
    const id = this.id(req);
    const counted = this.ledger.allow(`pet:${id}`, limits.petsPerVisitorPerDay);
    if (counted) this.ledger.earn('site.pet', 1, 'someone petted you', { quiet: true });
    bus.emit('pet', { by: id.slice(0, 4) });
    return { counted };
  }

  treat(req) {
    const id = this.id(req);
    const counted = this.ledger.allow(`treat:${id}`, limits.treatsPerVisitorPerDay);
    if (counted) this.ledger.earn('site.treat', 1, 'someone gave you a treat', { quiet: true });
    bus.emit('treat', { by: id.slice(0, 4) });
    if (counted) bus.feed('visitor', `visitor ${id.slice(0, 4)} tossed Charlie a treat`, { by: id.slice(0, 4) });
    return { counted };
  }

  message(req, raw, name) {
    const id = this.id(req);
    const text = String(raw ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, config.site.maxMessageLength);
    if (!text) return { error: 'empty message' };
    if (!this.ledger.allow(`message:${id}`, limits.messagesPerVisitorPerDay)) {
      return { error: 'Charlie has plenty of your messages for today. Come back tomorrow!' };
    }
    const from = String(name ?? '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 24) || `visitor ${id.slice(0, 4)}`;
    const msg = { id: ++this.inbox.data.seq, t: Date.now(), from, visitor: id.slice(0, 4), text, read: false };
    this.inbox.data.messages.push(msg);
    if (this.inbox.data.messages.length > 300) this.inbox.data.messages.splice(0, this.inbox.data.messages.length - 300);
    this.inbox.save();
    this.ledger.earn('site.message', 1, `a message from ${from}`, { quiet: true });
    if (config.site.showMessagesPublicly) bus.feed('visitor', text, { from, messageId: msg.id });
    else bus.feed('visitor', `${from} left Charlie a message`, { from });
    bus.emit('message', { id: msg.id });
    return { ok: true, id: msg.id };
  }

  touch(req, name) {
    const id = this.id(req);
    const obj = this.world.get(name);
    if (!obj) return { error: 'no such thing' };
    const counted = this.ledger.allow(`touch:${id}:${name}`, limits.touchesPerVisitorPerObjectPerDay);
    if (counted) this.ledger.earn('site.touch', 1, `someone poked "${name}"`, { quiet: true });
    bus.emit('touch', { name, by: id.slice(0, 4) });
    return { counted, link: obj.link || null };
  }

  beacon(req, slug) {
    const ip = this.ip(req);
    if (isLoopback(ip)) return false;
    const id = this.id(req);
    if (!this.ledger.allow(`beacon:${id}:${slug}`, 1)) return false;
    this.ledger.earn('beacon.view', 1, `someone viewed "${slug}"`, { quiet: true });
    return true;
  }

  unread() {
    return this.inbox.data.messages.filter((m) => !m.read);
  }

  markRead(ids) {
    const set = new Set(ids);
    for (const m of this.inbox.data.messages) if (set.has(m.id)) m.read = true;
    this.inbox.save();
  }

  flush() {
    this.inbox.flush();
  }
}

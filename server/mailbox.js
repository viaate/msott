import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config, paths } from './config.js';
import { JSONStore } from './store.js';
import { sniffImage } from './visitors.js';

const env = process.env;
const DAY = 86400_000;

// A visitor is known only by their browser's public key.
export function visitorId(key) {
  return crypto.createHash('sha256').update(`${key.x}.${key.y}`).digest('base64url').slice(0, 22);
}

// A letter is { d, k, s }: d is the JSON the visitor wrote, k their browser's
// P-256 public key, s their signature over d. Returns what they wrote, plus
// who wrote it, or null if it isn't genuinely signed.
export function openLetter(raw) {
  let letter;
  try {
    letter = JSON.parse(raw);
  } catch {
    return null;
  }
  const { d, k, s } = letter ?? {};
  if (typeof d !== 'string' || d.length > 4000 || typeof s !== 'string' || typeof k?.x !== 'string' || typeof k?.y !== 'string') return null;
  try {
    const key = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: k.x, y: k.y }, format: 'jwk' });
    if (!crypto.verify('sha256', Buffer.from(d), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'))) return null;
    const body = JSON.parse(d);
    return body && typeof body === 'object' ? { ...body, from: visitorId(k) } : null;
  } catch {
    return null;
  }
}

// On GitHub Pages there's no server to catch a pet or a message, so the page
// drops them in Charlie's mailbox, a public topic on ntfy.sh, and every run
// collects what arrived. ntfy keeps letters for 12 hours (pictures for 3), far
// longer than the gap between runs. Anyone can read the topic, so letters are
// signed instead of trusted: nobody can act as someone else.
export class Mailbox {
  constructor({ visitors }) {
    this.visitors = visitors;
    const file = path.join(paths.data, 'mailbox.json');
    const fresh = !fs.existsSync(file);
    this.store = new JSONStore(file, () => ({ topic: `charlie-${crypto.randomBytes(9).toString('hex')}`, since: 0, seen: [] }));
    if (fresh) this.store.flush();
  }

  get server() {
    return (env.CHARLIE_MAILBOX_SERVER || config.site.mailbox).replace(/\/+$/, '');
  }

  get url() {
    return `${this.server}/${env.CHARLIE_MAILBOX_TOPIC || this.store.data.topic}`;
  }

  async intake() {
    const d = this.store.data;
    const since = d.since ? d.since - 120 : '12h';
    const res = await fetch(`${this.url}/json?poll=1&since=${since}`, { headers: { 'user-agent': 'charlie-home' } });
    if (!res.ok) throw new Error(`mailbox → ${res.status}`);
    const seen = new Set(d.seen);
    let events = 0;
    let messages = 0;
    for (const line of (await res.text()).split('\n')) {
      let m;
      try {
        m = JSON.parse(line);
      } catch {
        continue;
      }
      if (m?.event !== 'message' || seen.has(m.id)) continue;
      seen.add(m.id);
      d.since = Math.max(d.since, m.time);
      const l = openLetter(m.message);
      if (!l || typeof l.r !== 'string' || seen.has(`r:${l.r}`) || !(Math.abs(Date.now() - l.ts) < DAY)) continue;
      seen.add(`r:${l.r}`);
      if (!this.visitors.ledger.allow('mailbox', config.economy.limits.mailboxPerDay)) continue;
      events++;
      try {
        if ((await this.deliver(l, m.attachment)) === 'message') messages++;
      } catch (err) {
        console.error('[mailbox]', err.message);
      }
    }
    d.seen = [...seen].slice(-3000);
    this.store.save();
    return { events, messages };
  }

  async deliver(l, attachment) {
    const v = this.visitors;
    const who = v.web(l.from, l.n);
    if (l.k === 'pet') v.petBy(who);
    else if (l.k === 'treat') v.treatBy(who);
    else if (l.k === 'act') v.actionBy(who, String(l.a ?? ''));
    else if (l.k === 'msg') {
      const picture = l.f ? await this.picture(attachment, l.f) : null;
      return v.offerBy(who, { text: l.t, picture }).ok ? 'message' : null;
    }
    return null;
  }

  // A picture is only taken if it's the very file the visitor signed for.
  async picture(attachment, sha256) {
    if (!attachment?.url?.startsWith(`${this.server}/file/`) || !(attachment.size <= config.site.maxPictureBytes)) return null;
    try {
      const res = await fetch(attachment.url, { headers: { 'user-agent': 'charlie-home' } });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      const ok = buf.length <= config.site.maxPictureBytes && sniffImage(buf) && crypto.createHash('sha256').update(buf).digest('hex') === sha256;
      return ok ? buf : null;
    } catch {
      return null;
    }
  }

  flush() {
    this.store.flush();
  }
}

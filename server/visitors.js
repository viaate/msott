import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config, paths } from './config.js';
import { JSONStore, ensureDir, today } from './store.js';
import { bus } from './bus.js';
import { allActions } from './places.js';
import { randomName, cleanName } from '../web/js/names.js';

const limits = config.economy.limits;
const IMAGE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
const RETURN_GAP = 30 * 60_000;

function isLoopback(ip) {
  return !ip || ip === '::1' || ip.startsWith('127.') || ip === '::ffff:127.0.0.1';
}

function cookie(req, name) {
  const m = String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function sniffImage(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 4).toString() === 'GIF8') return 'image/gif';
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

export { sniffImage, cleanName };

// Visitors are remembered by a random cookie and a name, never by who they
// really are. Rate limits use a salted, daily-rotating hash of IP + agent.
export class Visitors {
  constructor({ ledger, world, feelings, agentState }) {
    this.ledger = ledger;
    this.world = world;
    this.feelings = feelings;
    this.agentState = agentState;
    this.salt = { date: '', value: '' };
    this.inbox = new JSONStore(path.join(paths.data, 'inbox.json'), { seq: 0, messages: [] });
    this.people = new JSONStore(path.join(paths.data, 'visitors.json'), { seq: 0, byToken: {}, events: [] });
    this.buckets = new Map();
  }

  // ---------------------------------------------------------------- identity
  ip(req) {
    if (config.site.trustProxy) {
      const cf = req.headers['cf-connecting-ip'];
      if (cf) return String(cf);
      const xff = req.headers['x-forwarded-for'];
      if (xff) return String(xff).split(',')[0].trim();
    }
    return req.socket.remoteAddress || '';
  }

  hash(req) {
    if (this.salt.date !== today()) this.salt = { date: today(), value: crypto.randomBytes(16).toString('hex') };
    const ua = String(req.headers['user-agent'] || '');
    return crypto.createHash('sha256').update(`${this.ip(req)}|${ua}|${this.salt.value}`).digest('hex').slice(0, 16);
  }

  // Finds (or creates) the visitor's profile, setting the cookie if new.
  identify(req, res) {
    const token = cookie(req, 'cv');
    let p = token && this.people.data.byToken[token];
    if (!p) {
      const t = crypto.randomBytes(18).toString('base64url');
      p = this.people.data.byToken[t] = {
        id: `v${++this.people.data.seq}`,
        name: randomName(),
        firstSeen: Date.now(),
        lastSeen: 0,
        visits: 0,
        notes: '',
        replies: [],
      };
      const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
      res.setHeader('set-cookie', `cv=${t}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly${secure}`);
      this.people.save();
    }
    return p;
  }

  byName(name) {
    const want = String(name ?? '').toLowerCase().replace(/^@/, '');
    let best = null;
    for (const p of Object.values(this.people.data.byToken)) {
      if (p.name.toLowerCase() === want && (!best || p.lastSeen > best.lastSeen)) best = p;
    }
    return best;
  }

  logEvent(e) {
    const ev = this.people.data.events;
    ev.push({ t: Date.now(), ...e });
    if (ev.length > 400) ev.splice(0, ev.length - 400);
    this.people.save();
  }

  eventsSince(t) {
    return this.people.data.events.filter((e) => e.t > t);
  }

  hello(req, res) {
    const p = this.identify(req, res);
    this.seen(p);
    const h = this.hash(req);
    if (this.ledger.allow(`visit:${h}`, 1)) this.ledger.earn('site.visitor', 1, 'a new visitor came by', { quiet: true });
    return this.about(p);
  }

  // Counts a visit when someone shows up again after a while.
  seen(p) {
    const now = Date.now();
    if (now - p.lastSeen > RETURN_GAP) {
      p.visits += 1;
      if (p.visits > 1) {
        this.logEvent({ kind: 'return', name: p.name, id: p.id });
        bus.feed('visitor', `${p.name} came back to visit`, { from: p.name, arrival: true });
      } else {
        this.logEvent({ kind: 'arrive', name: p.name, id: p.id });
      }
    }
    p.lastSeen = now;
    this.people.save();
  }

  // A visitor to her GitHub Pages site, known by their browser's own key
  // (see mailbox.js). They choose their name in "about you".
  web(id, rawName) {
    const key = `w:${id}`;
    const name = cleanName(rawName);
    let p = this.people.data.byToken[key];
    if (!p) {
      p = this.people.data.byToken[key] = { id: key, name: name.length >= 2 ? name : randomName(), web: true, firstSeen: Date.now(), lastSeen: 0, visits: 0, notes: '', replies: [] };
    } else if (name.length >= 2 && name !== p.name) {
      this.logEvent({ kind: 'rename', name, id: p.id, from: p.name });
      p.name = name;
    }
    this.seen(p);
    return { p, h: key };
  }

  who(req, res) {
    return { p: this.identify(req, res), h: this.hash(req) };
  }

  // What Charlie knows about each site visitor, for a static site's "about
  // you". Keyed by the visitor's public key id, which only their browser knows
  // is theirs.
  publicPeople() {
    const out = {};
    for (const p of Object.values(this.people.data.byToken)) {
      if (p.web) out[p.id.slice(2)] = this.about(p);
    }
    return out;
  }

  about(p) {
    const mine = this.inbox.data.messages.filter((m) => m.visitorId === p.id).slice(-12)
      .map(({ id, t, text, image }) => ({ id, t, text, picture: Boolean(image) }));
    return { name: p.name, visits: p.visits, firstSeen: p.firstSeen, notes: p.notes, replies: p.replies.slice(-12), messages: mine };
  }

  rename(req, res, raw) {
    const p = this.identify(req, res);
    const name = cleanName(raw);
    if (name.length < 2) return { error: 'Names need 2–20 letters, numbers, - or _.' };
    if (name !== p.name) {
      this.logEvent({ kind: 'rename', name, id: p.id, from: p.name });
      p.name = name;
      this.people.save();
    }
    return this.about(p);
  }

  // Charlie's own notes about a visitor, which they can see in "about you".
  note(name, text, mode = 'append') {
    const p = this.byName(name);
    if (!p) throw new Error(`You don't know anyone called "${name}" yet.`);
    const next = mode === 'rewrite' ? String(text) : [p.notes, String(text)].filter(Boolean).join(' ');
    p.notes = next.trim().slice(-600);
    this.people.save();
    bus.emit('visitor_note', { id: p.id });
    return p;
  }

  reply(name, text) {
    const p = this.byName(name);
    if (!p) return null;
    p.replies.push({ t: Date.now(), text });
    if (p.replies.length > 30) p.replies.splice(0, p.replies.length - 30);
    this.people.save();
    return p;
  }

  profileById(id) {
    return Object.values(this.people.data.byToken).find((p) => p.id === id) ?? null;
  }

  // ---------------------------------------------------------------- limits
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

  // ---------------------------------------------------------------- interactions
  pet(req, res) {
    return this.petBy(this.who(req, res));
  }

  petBy({ p, h }) {
    const counted = this.ledger.allow(`pet:${h}`, limits.petsPerVisitorPerDay);
    if (counted) {
      this.ledger.earn('site.pet', 1, `${p.name} petted you`, { quiet: true });
      this.feelings.bump({ joy: 1.5, calm: 0.5 });
      this.logEvent({ kind: 'pet', name: p.name, id: p.id });
    }
    bus.emit('pet', { by: p.name });
    return { counted };
  }

  treat(req, res) {
    return this.treatBy(this.who(req, res));
  }

  treatBy({ p, h }) {
    const counted = this.ledger.allow(`treat:${h}`, limits.treatsPerVisitorPerDay);
    if (counted) {
      this.ledger.earn('site.treat', 1, `${p.name} gave you a treat`, { quiet: true });
      this.feelings.bump({ fullness: 6, joy: 3 });
      this.logEvent({ kind: 'treat', name: p.name, id: p.id });
      bus.feed('visitor', `${p.name} tossed Charlie a treat`, { from: p.name });
    }
    bus.emit('treat', { by: p.name });
    return { counted };
  }

  // An offering: a message, a picture, or both.
  offer(req, res, { text, image }) {
    let picture = null;
    if (image) {
      const m = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(image));
      if (!m || !IMAGE_TYPES[m[1]]) return { error: 'Pictures need to be PNG, JPEG, WebP or GIF.' };
      picture = Buffer.from(m[2], 'base64');
    }
    return this.offerBy(this.who(req, res), { text, picture });
  }

  offerBy({ p, h }, { text: rawText, picture, maxLength = config.site.maxMessageLength, ref = null }) {
    const text = String(rawText ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, maxLength);
    let file = null;
    let mediaType = null;
    if (picture) {
      const buf = picture;
      mediaType = sniffImage(buf);
      if (!mediaType) return { error: "That file doesn't look like a picture." };
      if (buf.length > config.site.maxPictureBytes) return { error: `Pictures can be up to ${Math.round(config.site.maxPictureBytes / 1e6)} MB.` };
      if (!this.ledger.allow(`picture:${h}`, limits.picturesPerVisitorPerDay)) return { error: "Charlie has enough of your pictures for today. Thank you!" };
      file = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${IMAGE_TYPES[mediaType]}`;
      fs.writeFileSync(path.join(ensureDir(path.join(paths.data, 'offerings')), file), buf);
    }
    if (!text && !file) return { error: 'empty message' };
    if (text && !this.ledger.allow(`message:${h}`, limits.messagesPerVisitorPerDay)) {
      return { error: 'Charlie has plenty of your messages for today. Come back tomorrow!' };
    }
    const msg = { id: ++this.inbox.data.seq, t: Date.now(), from: p.name, visitorId: p.id, text, image: file, mediaType, read: false, ...(ref ? { ref } : {}) };
    this.inbox.data.messages.push(msg);
    if (this.inbox.data.messages.length > 400) this.inbox.data.messages.splice(0, this.inbox.data.messages.length - 400);
    this.inbox.save();
    if (text) {
      this.ledger.earn('site.message', 1, `a message from ${p.name}`, { quiet: true });
      this.feelings.bump({ joy: 2, curiosity: 3 });
    }
    if (file) {
      this.ledger.earn('site.picture', 1, `a picture from ${p.name}`, { quiet: true });
      this.feelings.bump({ joy: 2, curiosity: 6 });
    }
    if (text && config.site.showMessagesPublicly) bus.feed('visitor', text, { from: p.name, messageId: msg.id });
    if (file) bus.feed('visitor', `${p.name} left Charlie a picture`, { from: p.name });
    else if (!config.site.showMessagesPublicly) bus.feed('visitor', `${p.name} left Charlie a message`, { from: p.name });
    bus.emit('message', { id: msg.id });
    return { ok: true, id: msg.id };
  }

  action(req, res, id) {
    return this.actionBy(this.who(req, res), id);
  }

  actionBy({ p, h }, id) {
    const action = allActions(this.world).find((a) => a.id === id);
    if (!action) return { error: 'Nothing like that to do here.' };
    if (!this.ledger.allow(`action:${h}`, limits.actionsPerVisitorPerDay)) {
      return { error: "You've done plenty for Charlie today. She noticed!" };
    }
    if (!this.ledger.allow(`action:${h}:${id}`, limits.sameActionPerVisitorPerDay)) {
      return { error: 'Maybe try something else for a bit.' };
    }
    this.ledger.earn('site.action', 1, `${p.name} ${action.past}`, { quiet: true });
    if (Object.keys(action.effects).length) this.feelings.bump(action.effects);
    let ate = 0;
    if (action.id === 'fill_bowl') {
      this.feelings.fillBowl();
      const s = this.agentState();
      if (s.status === 'awake' && s.location === 'bowl') ate = this.feelings.eat();
    }
    this.logEvent({ kind: 'action', name: p.name, id: p.id, action: action.id, label: action.past });
    bus.emit('action', { id: action.id, place: action.place, label: action.label, by: p.name, ate });
    const told = action.past.replace(/\byour\b/g, "Charlie's").replace(/\byou\b/g, 'Charlie');
    bus.feed('visitor', `${p.name} ${told}${ate ? ', and Charlie ate right away' : ''}`, { from: p.name, action: action.id });
    return { ok: true, ate };
  }

  touch(req, res, name) {
    const p = this.identify(req, res);
    const obj = this.world.get(name);
    if (!obj) return { error: 'no such thing' };
    const counted = this.ledger.allow(`touch:${this.hash(req)}:${name}`, limits.touchesPerVisitorPerObjectPerDay);
    if (counted) {
      this.ledger.earn('site.touch', 1, `${p.name} poked "${name}"`, { quiet: true });
      this.logEvent({ kind: 'touch', name: p.name, id: p.id, label: `poked "${name}"` });
    }
    bus.emit('touch', { name, by: p.name });
    return { counted, link: obj.link || null };
  }

  beacon(req, slug) {
    if (isLoopback(this.ip(req))) return false;
    if (!this.ledger.allow(`beacon:${this.hash(req)}:${slug}`, 1)) return false;
    this.ledger.earn('beacon.view', 1, `someone viewed "${slug}"`, { quiet: true });
    return true;
  }

  // ---------------------------------------------------------------- inbox
  unread() {
    return this.inbox.data.messages.filter((m) => !m.read);
  }

  // Once she's seen a picture it isn't kept, since her saved life is public.
  markRead(ids) {
    const set = new Set(ids);
    for (const m of this.inbox.data.messages) {
      if (!set.has(m.id)) continue;
      m.read = true;
      if (m.image) fs.rmSync(path.join(paths.data, 'offerings', m.image), { force: true });
    }
    this.inbox.save();
  }

  picture(msg) {
    try {
      return fs.readFileSync(path.join(paths.data, 'offerings', msg.image)).toString('base64');
    } catch {
      return null;
    }
  }

  flush() {
    this.inbox.flush();
    this.people.flush();
  }
}

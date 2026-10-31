// How the page talks to Charlie's home. Live: a server streams events as they
// happen. Static (GitHub Pages): read state.json, replay her latest wake, and
// drop pets, treats and messages in her mailbox for her next check-in.

import { randomName, cleanName } from './names.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sha256 = (bytes) => crypto.subtle.digest('SHA-256', bytes);
const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' };

function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch {}
  return null;
}

class Emitter {
  constructor() {
    this.handlers = new Map();
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(fn);
  }

  emit(type, data) {
    for (const fn of this.handlers.get(type) ?? []) fn(data);
  }
}

class LiveNet extends Emitter {
  kind = 'live';

  start() {
    const es = new EventSource('api/events');
    const types = ['hello', 'charlie', 'go', 'feed', 'thought_delta', 'code_start', 'code_title', 'code_delta', 'code_end', 'balance', 'prices', 'skills', 'world', 'feelings', 'diary', 'site', 'requests', 'actions', 'action', 'visitor_note', 'viewers', 'pet', 'treat', 'say', 'touch'];
    for (const t of types) es.addEventListener(t, (e) => this.emit(t, JSON.parse(e.data)));
    es.onerror = () => this.emit('connection', false);
    es.onopen = () => this.emit('connection', true);
  }

  async post(path, body) {
    try {
      const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
      return await res.json().catch(() => ({ error: `error ${res.status}` }));
    } catch {
      return { error: "Couldn't reach Charlie's house." };
    }
  }

  hello() {
    return this.post('api/hello');
  }

  pointsUrl(meta) {
    return `api/world/${meta.name}/points?v=${meta.version}`;
  }

  async skillSource(name) {
    const res = await fetch(`api/skills/${name}`);
    return res.ok ? res.json() : null;
  }

  pet() {
    return this.post('api/pet');
  }

  treat() {
    return this.post('api/treat');
  }

  act(id) {
    return this.post('api/action', { id });
  }

  touch(name) {
    return this.post('api/touch', { name });
  }

  message(body) {
    return this.post('api/message', body);
  }

  async me() {
    try {
      const res = await fetch('api/me');
      return res.ok ? res.json() : null;
    } catch {
      return null;
    }
  }

  rename(name) {
    return this.post('api/me', { name });
  }
}

class StaticNet extends Emitter {
  kind = 'static';

  constructor(cfg) {
    super();
    this.cfg = cfg;
    this.state = null;
    this.version = -1;
    this.seen = Number(store('charlie-session') || 0);
    this.replaying = null;
    this.lastSent = {};
  }

  async fetchState() {
    const res = await fetch(`state.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`state.json ${res.status}`);
    return res.json();
  }

  async start() {
    try {
      const s = await this.fetchState();
      this.state = s;
      this.version = s.version;
      this.emit('connection', true);
      if (this.isFresh(s.lastSession)) {
        this.emit('hello', this.before(s));
        this.replay(s.lastSession);
      } else {
        this.emit('hello', s.snapshot);
        if (s.lastSession) this.emit('replay', { active: false, available: true, endedAt: s.lastSession.endedAt });
      }
    } catch {
      this.emit('connection', false);
    }
    setInterval(() => this.poll(), 60_000);
  }

  isFresh(session) {
    return Boolean(session && session.id !== this.seen && Date.now() - session.endedAt < 6 * 3600_000 && session.events?.length);
  }

  async poll() {
    if (this.replaying) return;
    let s;
    try {
      s = await this.fetchState();
    } catch {
      return;
    }
    if (s.version === this.version) return;
    const prev = this.state.snapshot;
    this.state = s;
    this.version = s.version;
    if (this.isFresh(s.lastSession)) {
      this.diff(prev, this.before(s));
      this.replay(s.lastSession);
    } else this.diff(prev, s.snapshot);
  }

  // What the world looked like right before her latest wake.
  before(s) {
    const b = s.lastSession.before;
    const snap = structuredClone(s.snapshot);
    snap.tokens.balance = b.balance;
    snap.feed = snap.feed.filter((f) => f.id <= b.feedSeq);
    snap.diary = snap.diary.filter((d) => d.id <= b.diarySeq);
    snap.ledger = snap.ledger.filter((e) => e.t <= b.ledgerT);
    snap.charlie = b.charlie;
    const had = new Set(b.world.map((w) => w.split(':')[0]));
    snap.world.objects = snap.world.objects.filter((o) => o.builtin || had.has(o.name));
    snap.skills = snap.skills.filter((k) => b.skills.includes(k.name));
    snap.feelings = b.feelings;
    if (b.site) snap.site = b.site;
    return snap;
  }

  // Turn the difference between two snapshots into the same events a live server sends.
  diff(a, b) {
    const lastFeed = a.feed.at(-1)?.id ?? 0;
    for (const item of b.feed) if (item.id > lastFeed) this.emit('feed', item);
    if (a.tokens.balance !== b.tokens.balance) this.emit('balance', { balance: b.tokens.balance, delta: b.tokens.balance - a.tokens.balance, reason: '' });
    const lastDiary = a.diary.at(-1)?.id ?? 0;
    for (const e of b.diary) if (e.id > lastDiary) this.emit('diary', e);
    const sig = (w) => w.objects.map((o) => `${o.name}:${o.version}:${o.status}`).join('|');
    if (sig(a.world) !== sig(b.world)) {
      const old = new Map(a.world.objects.map((o) => [o.name, o.version]));
      const changed = b.world.objects.find((o) => !o.builtin && old.get(o.name) !== o.version)?.name;
      this.emit('world', { objects: b.world.objects, buildable: b.world.buildable, changed });
    }
    if (JSON.stringify(a.skills) !== JSON.stringify(b.skills)) this.emit('skills', b.skills);
    this.emit('feelings', b.feelings);
    this.emit('charlie', b.charlie);
    this.emit('site', b.site);
    this.emit('requests', b.requests);
    this.emit('actions', b.actions);
    this.emit('prices', b.prices);
  }

  async replay(session) {
    const r = { cancel: false, session };
    this.replaying = r;
    this.emit('replay', { active: true, startedAt: session.startedAt, endedAt: session.endedAt });
    const finals = new Map(this.state.snapshot.world.objects.map((o) => [o.name, o]));
    const events = session.events;
    const total = events.at(-1)?.t || 1;
    const k = Math.min(1, 100_000 / total);
    let prevT = 0;
    for (const e of events) {
      if (r.cancel) return;
      const gap = Math.min(5000, Math.max(e.type === 'charlie' ? 120 : 600, (e.t - prevT) * k));
      prevT = e.t;
      await sleep(gap);
      if (r.cancel) return;
      await this.play(e, r, finals);
    }
    this.finish(r);
  }

  async play(e, r, finals) {
    if (e.type === 'feed' && e.data.kind === 'thought' && e.data.key) {
      const text = e.data.text;
      for (let i = 0; i < text.length && !r.cancel; i += 3) {
        this.emit('thought_delta', { key: e.data.key, text: text.slice(i, i + 3) });
        await sleep(16);
      }
      this.emit('feed', e.data);
    } else if (e.type === 'code') {
      const { key, tool, title, code } = e.data;
      this.emit('code_start', { key, tool });
      if (title) this.emit('code_title', { key, title });
      for (let i = 0; i < code.length && !r.cancel; i += 28) {
        this.emit('code_delta', { key, text: code.slice(i, i + 28) });
        await sleep(14);
      }
      this.emit('code_end', { key });
    } else if (e.type === 'world') {
      // Builds are published once, in their final form.
      this.emit('world', { ...e.data, objects: e.data.objects.map((o) => (finals.get(o.name) && o.status === 'ok' ? { ...o, version: finals.get(o.name).version } : o)) });
    } else this.emit(e.type, e.data);
  }

  finish(r) {
    this.seen = r.session.id;
    store('charlie-session', String(r.session.id));
    this.replaying = null;
    const s = this.state.snapshot;
    this.emit('charlie', s.charlie);
    this.emit('feelings', s.feelings);
    this.emit('replay', { active: false, available: true, endedAt: r.session.endedAt });
  }

  skipReplay() {
    if (!this.replaying) return;
    const r = this.replaying;
    r.cancel = true;
    this.emit('hello', this.state.snapshot);
    this.finish(r);
  }

  replayAgain() {
    const s = this.state;
    if (!s?.lastSession || this.replaying) return;
    this.emit('hello', this.before(s));
    this.replay(s.lastSession);
  }

  hello() {
    return this.me();
  }

  pointsUrl(meta) {
    return `world/${meta.name}.bin?v=${meta.version}`;
  }

  async skillSource(name) {
    const res = await fetch(`skills/${name}.json`);
    return res.ok ? res.json() : null;
  }

  // ---- visitors reach her through her mailbox ----

  // Each browser has its own signing key, kept in localStorage. It's who you
  // are to Charlie: nobody else can pet her or write to her as you.
  identity() {
    this.idp ??= (async () => {
      let jwk = null;
      try {
        jwk = JSON.parse(store('charlie-key'));
      } catch {}
      let key;
      if (jwk?.d) key = await crypto.subtle.importKey('jwk', jwk, ECDSA, false, ['sign']);
      else {
        const pair = await crypto.subtle.generateKey(ECDSA, true, ['sign', 'verify']);
        jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
        store('charlie-key', JSON.stringify(jwk));
        key = pair.privateKey;
      }
      const pub = { x: jwk.x, y: jwk.y };
      const id = b64url(await sha256(new TextEncoder().encode(`${pub.x}.${pub.y}`))).slice(0, 22);
      return { key, pub, id };
    })();
    return this.idp;
  }

  myName() {
    let name = store('charlie-name');
    if (!name) store('charlie-name', (name = randomName()));
    return name;
  }

  async send(kind, fields = {}, picture = null) {
    const box = this.cfg.mailbox;
    if (!box) return { error: "Charlie's mailbox isn't set up yet." };
    if (!globalThis.crypto?.subtle) return { error: "This browser can't reach Charlie from here." };
    // A flurry of clicks is one pet as far as her mailbox is concerned.
    const wait = { pet: 30_000, treat: 20_000, act: 5_000 }[kind] ?? 0;
    if (Date.now() - (this.lastSent[kind] ?? 0) < wait) return { sent: true };
    this.lastSent[kind] = Date.now();
    try {
      const me = await this.identity();
      let f;
      if (picture) f = [...new Uint8Array(await sha256(await picture.arrayBuffer()))].map((b) => b.toString(16).padStart(2, '0')).join('');
      const d = JSON.stringify({ k: kind, ...fields, ...(f ? { f } : {}), n: this.myName(), ts: Date.now(), r: b64url(crypto.getRandomValues(new Uint8Array(12))) });
      const s = b64url(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, me.key, new TextEncoder().encode(d)));
      const letter = JSON.stringify({ d, k: me.pub, s });
      const res = picture
        ? await fetch(`${box}?${new URLSearchParams({ filename: 'picture.jpg', message: letter })}`, { method: 'PUT', body: picture })
        : await fetch(box, { method: 'POST', body: letter });
      if (res.status === 429) return { error: "Charlie's mailbox is full for the moment. Try again in a bit." };
      if (!res.ok) return { error: "Couldn't reach Charlie's mailbox." };
      return { sent: true };
    } catch {
      return { error: "Couldn't reach Charlie's mailbox." };
    }
  }

  pet() {
    return this.send('pet');
  }

  treat() {
    return this.send('treat');
  }

  act(id) {
    if (id === 'pet') return this.pet();
    if (id === 'treat') return this.treat();
    if (!this.state?.snapshot.actions.some((x) => x.id === id)) return { error: 'Nothing like that to do.' };
    return this.send('act', { a: id });
  }

  async touch(name) {
    const o = this.state?.snapshot.world.objects.find((x) => x.name === name);
    return { link: o?.link ?? null };
  }

  async message({ text, image }) {
    const picture = image ? await shrink(image) : null;
    if (image && !picture) return { error: "Couldn't read that picture." };
    const r = await this.send('msg', { t: String(text || '').slice(0, 280) }, picture);
    if (r.sent) {
      const sent = this.sent();
      sent.push({ t: Date.now(), text: text || '', picture: Boolean(picture) });
      store('charlie-sent', JSON.stringify(sent.slice(-12)));
    }
    return r;
  }

  sent() {
    try {
      return JSON.parse(store('charlie-sent')) ?? [];
    } catch {
      return [];
    }
  }

  // What Charlie knows about you, as of her last check-in.
  async me() {
    const name = this.myName();
    let known = null;
    try {
      known = this.state?.people?.[(await this.identity()).id] ?? null;
    } catch {}
    const messages = known?.messages?.length ? known.messages : this.sent();
    return { visits: 0, firstSeen: null, notes: '', replies: [], ...known, messages, name };
  }

  async rename(raw) {
    const name = cleanName(raw);
    if (name.length < 2) return { error: 'Names need 2–20 letters, numbers, - or _.' };
    store('charlie-name', name);
    return this.me();
  }
}

// Pictures travel small: at most 1024 px on a side, as JPEG.
async function shrink(dataUrl) {
  try {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const k = Math.min(1, 1024 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.85));
  } catch {
    return null;
  }
}

export function createNet() {
  const cfg = window.CHARLIE;
  return cfg?.static ? new StaticNet(cfg) : new LiveNet();
}

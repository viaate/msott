const $ = (id) => document.getElementById(id);

const EARN_LABELS = {
  'github.star': 'a star on one of her repos',
  'github.fork': 'a fork of one of her repos',
  'github.follower': 'a GitHub follower',
  'github.watcher': 'someone watching a repo',
  'github.uniqueView': 'a unique visitor to a repo',
  'github.externalIssue': 'an issue or PR from someone',
  'github.externalComment': 'a comment from someone',
  'github.newRepo': 'shipping a new public repo',
  'site.visitor': 'you, visiting (once a day)',
  'site.pet': 'a pet',
  'site.treat': 'a treat',
  'site.message': 'a message',
  'site.touch': 'a click on one of her builds',
  'beacon.view': 'a view of a page she made',
};

const ACTIVITY = {
  waking: 'waking up',
  thinking: 'thinking',
  coding: 'writing code',
  building: 'building something',
  skill: 'using a skill',
};

const FEELINGS = [
  ['fullness', '#a8d08f'],
  ['energy', '#e9bd62'],
  ['joy', '#ef8f8f'],
  ['curiosity', '#b9a0ec'],
  ['calm', '#93b6d8'],
];

const PLACE_NAMES = {
  bed: 'on her bed',
  window: 'by the window',
  door: 'by the door',
  bowl: 'at her bowl',
  toy: 'with her lemon tart toy',
  rug: 'on the rug',
  center: 'in the middle of the room',
};

const MOOD_WORDS = ['awful', 'low', 'okay', 'good', 'wonderful'];

// Shrinks a picture before upload so it travels light (and costs Charlie fewer tokens to see).
async function shrinkPicture(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * k));
  c.height = Math.max(1, Math.round(bmp.height * k));
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.86);
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function fmt(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function minutesUntil(t) {
  const m = Math.max(0, Math.round((t - Date.now()) / 60000));
  if (m < 1) return 'any moment';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60 ? `${m % 60}m` : ''}`.trim();
}

function ago(t) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

export class UI {
  constructor() {
    this.state = null;
    this.shown = 0;
    this.live = new Map();
    this.code = null;
    this.codeHideTimer = null;
    this.bubbleTimer = null;
    this.feed = $('feed');

    this.onAction = () => {};
    this.onView = () => {};
    this.me = null;
    this.picture = null;

    $('tokens').addEventListener('click', () => this.toggle('ledger-panel', $('tokens')));
    $('info-btn').addEventListener('click', () => this.toggle('info-panel', $('info-btn')));
    $('diary-btn').addEventListener('click', () => {
      this.toggle('diary-panel', $('diary-btn'));
      if (!$('diary-panel').hidden) this.refreshMe();
    });
    $('actions-btn').addEventListener('click', () => this.toggle('actions-menu', $('actions-btn')));
    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => {
      $(b.dataset.close).hidden = true;
    }));
    document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => this.tab(b.dataset.tab)));
    document.querySelectorAll('[data-dtab]').forEach((b) => b.addEventListener('click', () => this.diaryTab(b.dataset.dtab)));
    document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => this.onView(b.dataset.view)));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') for (const id of ['ledger-panel', 'info-panel', 'source-panel', 'diary-panel', 'actions-menu']) $(id).hidden = true;
    });

    $('pic').addEventListener('change', async () => {
      const file = $('pic').files[0];
      $('pic').value = '';
      if (!file) return;
      try {
        this.picture = await shrinkPicture(file);
        $('pic-name').textContent = `picture: ${file.name.slice(0, 28)}`;
        $('pic-chip').hidden = false;
      } catch {
        this.toast("Couldn't read that picture.");
      }
    });
    $('pic-clear').addEventListener('click', () => {
      this.picture = null;
      $('pic-chip').hidden = true;
    });
    $('msg-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = $('msg').value.trim();
      if (!text && !this.picture) return;
      const body = { text, image: this.picture ?? undefined };
      $('msg').value = '';
      this.picture = null;
      $('pic-chip').hidden = true;
      const r = await this.post('/api/message', body);
      this.toast(r.error ? r.error : 'Charlie got it. She reads things when she wakes up, and remembers who left them.');
      this.refreshMe();
    });
    $('name-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const r = await this.post('/api/me', { name: $('my-name').value });
      if (r.error) this.toast(r.error);
      else this.setMe(r);
    });
    setInterval(() => this.renderStatus(), 20000);
  }

  async post(path, body) {
    try {
      const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
      return await res.json().catch(() => ({ error: `error ${res.status}` }));
    } catch {
      return { error: "Couldn't reach Charlie's house." };
    }
  }

  toggle(id, btn) {
    const p = $(id);
    p.hidden = !p.hidden;
    btn?.setAttribute('aria-expanded', String(!p.hidden));
    // The two right-hand panels share space; opening one closes the other.
    const other = { 'ledger-panel': ['info-panel', 'info-btn'], 'info-panel': ['ledger-panel', 'tokens'] }[id];
    if (other && !p.hidden) {
      $(other[0]).hidden = true;
      $(other[1]).setAttribute('aria-expanded', 'false');
    }
    if (id === 'actions-menu' && !p.hidden) this.renderActions();
  }

  tab(name) {
    document.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    document.querySelectorAll('[data-pane]').forEach((p) => {
      p.hidden = p.dataset.pane !== name;
    });
  }

  // Full snapshot from the server (on connect).
  load(s) {
    this.state = s;
    this.setBalance(s.tokens.balance, true);
    this.renderStatus();
    this.renderLedger();
    this.renderSkills();
    this.renderWorld();
    this.renderFeelings();
    this.renderDiary();
    this.renderActions();
    this.setViewers(s.viewers);
    this.feed.textContent = '';
    this.live.clear();
    for (const item of s.feed) this.addFeed(item, false);
    this.scrollFeed(true);
    const gh = s.github;
    const link = $('gh-link');
    link.textContent = '';
    if (gh?.url) {
      link.append('Her GitHub: ');
      const a = el('a', '', `@${gh.login}`);
      a.href = gh.url;
      a.target = '_blank';
      a.rel = 'noopener';
      link.append(a);
    }
  }

  setCharlie(c) {
    if (!this.state) return;
    this.state.charlie = c;
    this.renderStatus();
    if (!$('actions-menu').hidden) this.renderActions();
  }

  renderStatus() {
    const c = this.state?.charlie;
    if (!c) return;
    const pip = $('status-pip');
    let text;
    pip.className = 'pip';
    if (c.paused) text = 'paused by her human';
    else if (!c.brain.ready) text = 'asleep · no brain connected yet';
    else if (c.status === 'awake') {
      pip.classList.add('awake');
      text = c.activity === 'skill' && c.detail ? `awake · using ${c.detail}` : `awake · ${ACTIVITY[c.activity] ?? 'thinking'}`;
    } else {
      pip.classList.add('sleeping');
      text = c.energy <= 0.001 ? 'all thought out · back tomorrow' : c.nextWakeAt ? `napping · wakes in ${minutesUntil(c.nextWakeAt)}` : 'napping';
    }
    $('status-text').textContent = text;
    $('budget-bar').style.width = `${Math.round(Math.max(0, Math.min(1, c.energy)) * 100)}%`;
    $('doing-text').textContent = `Charlie is ${this.doing(c)}`;
    $('doing').classList.toggle('awake', c.status === 'awake' && !c.paused);
    const tz = this.state.tz;
    try {
      $('clock').textContent = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz });
    } catch {
      $('clock').textContent = '';
    }
  }

  doing(c) {
    const where = PLACE_NAMES[c.location] ?? (c.location ? `at "${c.location}"` : '');
    if (c.paused) return 'taking a break';
    if (c.status !== 'awake') return c.energy <= 0.001 ? 'fast asleep for the night' : 'napping on her bed';
    if (c.activity === 'waking') return 'waking up and stretching';
    if (c.activity === 'coding') return c.detail ? `writing code for "${c.detail}"` : 'writing some code';
    if (c.activity === 'building') return c.detail ? `building "${c.detail}"` : 'building something';
    if (c.activity === 'skill') return c.detail ? `using her ${c.detail} skill` : 'busy with something';
    if (c.doing) return c.doing;
    return `having a think${where ? ` ${where}` : ''}`;
  }

  setConnection(ok) {
    if (!ok) $('status-text').textContent = 'reconnecting…';
    else this.renderStatus();
  }

  setView(v) {
    document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
    document.body.classList.toggle('view-3d', v === '3d');
    $('hint').textContent = v === '3d' ? 'drag to look around her · scroll to move closer · click charlie to pet her' : 'drag to look around · scroll to zoom · click charlie to pet her';
  }

  // ---- feelings ----
  setFeelings(f) {
    if (!this.state) return;
    this.state.feelings = f;
    this.renderFeelings();
  }

  renderFeelings() {
    const box = $('feelings');
    const values = this.state?.feelings?.values;
    if (!values) return;
    if (!box.children.length) {
      for (const [name, color] of FEELINGS) {
        const item = el('div', 'feel');
        item.style.setProperty('--c', color);
        const label = el('span', 'name', name);
        const bar = el('span', 'meter');
        bar.append(el('i'));
        item.append(el('span', 'pip'), label, bar);
        item.dataset.name = name;
        box.append(item);
      }
    }
    for (const item of box.children) {
      const v = values[item.dataset.name] ?? 0;
      item.querySelector('.meter i').style.width = `${Math.round(v)}%`;
      item.title = `${item.dataset.name}: ${Math.round(v)}/100`;
    }
  }

  // ---- actions ----
  setActions(list) {
    if (!this.state) return;
    this.state.actions = list;
    if (!$('actions-menu').hidden) this.renderActions();
  }

  renderActions() {
    const menu = $('actions-menu');
    if (!this.state) return;
    menu.textContent = '';
    const here = this.state.charlie?.location;
    const section = (title, items) => {
      if (!items.length) return;
      menu.append(el('h3', '', title));
      const wrap = el('div', 'action-list');
      for (const a of items) {
        const b = el('button', a.place && a.place === here ? 'here' : '', a.label);
        if (a.place === here) b.title = "she's right there";
        b.addEventListener('click', () => this.onAction(a.id));
        wrap.append(b);
      }
      menu.append(wrap);
    };
    section('for charlie', [{ id: 'pet', label: 'pet her' }, { id: 'treat', label: 'toss a treat' }]);
    const acts = this.state.actions ?? [];
    section('around the house', acts.filter((a) => !a.build));
    section('at her builds', acts.filter((a) => a.build).map((a) => ({ ...a, label: `${a.label} (${a.place})` })));
    const bowl = this.state.feelings?.bowl ?? 0;
    menu.append(el('p', 'menu-note', bowl ? `her bowl has ${bowl} portion${bowl > 1 ? 's' : ''} in it` : 'her bowl is empty'));
  }

  // ---- diary ----
  diaryTab(name) {
    document.querySelectorAll('[data-dtab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.dtab === name)));
    document.querySelectorAll('[data-dpane]').forEach((p) => {
      p.hidden = p.dataset.dpane !== name;
    });
    if (name === 'you') this.refreshMe();
  }

  addDiary(entry) {
    if (!this.state) return;
    this.state.diary.push(entry);
    if (this.state.diary.length > 120) this.state.diary.shift();
    this.renderDiary();
  }

  renderDiary() {
    const entries = this.state?.diary ?? [];
    const list = $('diary-entries');
    list.textContent = '';
    for (const e of [...entries].reverse().slice(0, 60)) {
      const li = el('li');
      const head = el('div', 'entry-head');
      head.append(el('span', 'tag', e.kind));
      if (e.place) head.append(el('span', 'tag place', e.place));
      head.append(el('span', 'when', ago(e.t)));
      li.append(head, el('p', '', e.text));
      list.append(li);
    }
    if (!entries.length) list.append(el('li', 'empty', "She hasn't written anything yet."));
    // Mood arc: her own sense of how things went, entry by entry.
    const svg = $('mood-arc');
    const moods = entries.slice(-30).map((e) => e.mood);
    svg.textContent = '';
    const ns = 'http://www.w3.org/2000/svg';
    const mid = document.createElementNS(ns, 'line');
    Object.entries({ x1: 0, x2: 300, y1: 30, y2: 30, class: 'midline' }).forEach(([k, v]) => mid.setAttribute(k, v));
    svg.append(mid);
    if (moods.length >= 2) {
      const smooth = moods.map((_, i) => {
        const w = moods.slice(Math.max(0, i - 2), i + 1);
        return w.reduce((a, b) => a + b, 0) / w.length;
      });
      const pts = smooth.map((m, i) => `${(i / (smooth.length - 1)) * 296 + 2},${30 - m * 13}`).join(' ');
      const line = document.createElementNS(ns, 'polyline');
      line.setAttribute('points', pts);
      line.setAttribute('class', 'arc');
      svg.append(line);
      const last = smooth.at(-1);
      $('mood-word').textContent = MOOD_WORDS[Math.max(0, Math.min(4, Math.round(last) + 2))];
    } else $('mood-word').textContent = moods.length ? MOOD_WORDS[moods[0] + 2] : '';
  }

  // ---- about you ----
  setMe(me) {
    if (!me || me.error) return;
    this.me = me;
    this.renderMe();
  }

  async refreshMe() {
    try {
      const res = await fetch('/api/me');
      if (res.ok) this.setMe(await res.json());
    } catch {}
  }

  renderMe() {
    const me = this.me;
    if (!me) return;
    if (document.activeElement !== $('my-name')) $('my-name').value = me.name;
    $('me-meta').textContent = `${me.visits <= 1 ? 'your first visit' : `visit #${me.visits}`} · first came by ${new Date(me.firstSeen).toLocaleDateString()}`;
    $('me-notes').textContent = me.notes || "Nothing yet. She hasn't noted anything about you.";
    const replies = $('me-replies');
    replies.textContent = '';
    for (const r of [...me.replies].reverse()) {
      const li = el('li');
      li.append(el('span', 'when', ago(r.t)), document.createTextNode(` “${r.text}”`));
      replies.append(li);
    }
    if (!me.replies.length) replies.append(el('li', 'empty', 'Nothing yet.'));
    const msgs = $('me-messages');
    msgs.textContent = '';
    for (const m of [...me.messages].reverse()) {
      const li = el('li');
      li.append(el('span', 'when', ago(m.t)), document.createTextNode(` ${m.picture ? '[a picture] ' : ''}${m.text}`));
      msgs.append(li);
    }
    if (!me.messages.length) msgs.append(el('li', 'empty', 'Nothing yet. Leave her a message or a picture.'));
  }

  setViewers(n) {
    $('viewers').textContent = n > 1 ? `${n} watching` : n === 1 ? 'just you watching' : '';
  }

  setBalance(balance, instant = false) {
    const from = this.shown;
    const to = balance;
    if (this.state) this.state.tokens.balance = balance;
    if (instant) {
      this.shown = to;
      $('token-num').textContent = fmt(Math.floor(to));
      return;
    }
    const start = performance.now();
    const tick = (now) => {
      const k = Math.min(1, (now - start) / 900);
      const v = from + (to - from) * (1 - (1 - k) ** 3);
      $('token-num').textContent = fmt(Math.floor(v));
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    this.shown = to;
    const btn = $('tokens');
    btn.classList.remove('bump');
    void btn.offsetWidth;
    btn.classList.add('bump');
  }

  balanceEvent({ balance, delta, reason }) {
    this.setBalance(balance);
    const pop = el('span', delta >= 0 ? 'plus' : 'minus', `${delta >= 0 ? '+' : '−'}${fmt(Math.abs(delta))}`);
    pop.title = reason;
    $('token-pop').append(pop);
    setTimeout(() => pop.remove(), 2500);
    if (this.state) {
      this.state.ledger.push({ t: Date.now(), kind: delta >= 0 ? 'earn' : 'spend', amount: Math.abs(delta), reason });
      if (this.state.ledger.length > 60) this.state.ledger.splice(0, this.state.ledger.length - 60);
      if (delta >= 0) this.state.tokens.earned += delta;
      else this.state.tokens.spent += -delta;
      this.renderLedger();
    }
  }

  renderLedger() {
    const s = this.state;
    if (!s) return;
    const totals = $('ledger-totals');
    totals.textContent = '';
    for (const [k, v] of [['earned', s.tokens.earned], ['spent', s.tokens.spent]]) {
      const span = el('span', '', `${k} `);
      span.append(el('b', '', fmt(v)));
      totals.append(span);
    }
    const table = $('earn-table');
    table.textContent = '';
    const rows = Object.entries(s.earn).sort((a, b) => b[1] - a[1]);
    for (const [k, v] of rows) {
      const tr = el('tr');
      tr.append(el('td', '', EARN_LABELS[k] ?? k), el('td', '', `+${v}`));
      table.append(tr);
    }
    const pr = $('prices');
    pr.textContent = '';
    const line = (label, v) => {
      const d = el('div', '', `${label} `);
      d.append(el('b', '', `${v}`));
      pr.append(d);
    };
    line('her next new skill', s.prices.skill);
    line('her next new build', s.prices.build);
    line('revising a skill', s.prices.reviseSkill);
    line('rebuilding', s.prices.rebuild);
    const list = $('ledger-entries');
    list.textContent = '';
    for (const e of s.ledger.slice(-25).reverse()) {
      const li = el('li', e.kind);
      li.append(el('span', '', e.reason), el('span', 'amt', `${e.kind === 'earn' ? '+' : '−'}${fmt(e.amount)} · ${ago(e.t)}`));
      list.append(li);
    }
    if (!s.ledger.length) list.append(el('li', '', 'nothing yet. pet her!'));
  }

  setPrices(p) {
    if (!this.state) return;
    Object.assign(this.state.prices, p);
    this.renderLedger();
  }

  setSkills(list) {
    if (!this.state) return;
    this.state.skills = list;
    this.renderSkills();
  }

  renderSkills() {
    const box = $('skills-list');
    box.textContent = '';
    for (const sk of this.state.skills) {
      const item = el('div', 'item');
      item.append(el('div', 'name', sk.name));
      item.append(el('div', 'meta', `${sk.origin === 'starter' ? 'her first skill' : `learned ${new Date(sk.learnedAt).toLocaleDateString()}`} · used ${sk.uses ?? 0}×${sk.revisions ? ` · ${sk.revisions} revisions` : ''}`));
      item.append(el('div', 'desc', sk.description));
      const btn = el('button', '', 'read her code');
      btn.addEventListener('click', () => this.showSource(sk.name));
      item.append(btn);
      box.append(item);
    }
  }

  async showSource(name) {
    const res = await fetch(`/api/skills/${name}`);
    if (!res.ok) return;
    const src = await res.json();
    $('source-title').textContent = src.name;
    $('source-desc').textContent = src.description;
    $('source-code').textContent = src.code;
    $('source-panel').hidden = false;
  }

  setWorld(w) {
    if (!this.state) return;
    this.state.world = { ...this.state.world, ...w };
    this.renderWorld();
  }

  renderWorld() {
    const box = $('world-list');
    box.textContent = '';
    for (const o of this.state.world.objects) {
      const item = el('div', 'item');
      item.append(el('div', 'name', o.name));
      item.append(el('div', 'meta', o.builtin ? 'where it all started' : `plot [${o.plot}] · ${o.count} dots${o.status !== 'ok' ? ' · under construction' : ''}`));
      item.append(el('div', 'desc', o.description));
      if (o.link) {
        const a = el('a', '', o.link);
        a.href = o.link;
        a.target = '_blank';
        a.rel = 'noopener nofollow';
        item.append(a);
      }
      box.append(item);
    }
  }

  // ---- the mind feed ----
  addFeed(item, scroll = true) {
    if (item.key && this.live.has(item.key)) {
      const li = this.live.get(item.key);
      li.textContent = item.text;
      li.classList.remove('live');
      this.live.delete(item.key);
      return;
    }
    const li = el('li', item.kind);
    if (item.kind === 'result' && item.ok === false) li.classList.add('bad');
    if (item.kind === 'visitor' && item.from && !item.arrival && !item.action && !/^\S+ (tossed|left|came)/.test(item.text)) {
      li.append(el('span', 'who', `${item.from}: `), document.createTextNode(item.text));
    } else if (item.kind === 'say' && item.to) {
      li.append(el('span', 'who', `@${item.to} `), document.createTextNode(item.text));
    } else li.textContent = item.text;
    li.title = new Date(item.t).toLocaleString();
    this.feed.append(li);
    while (this.feed.children.length > 200) this.feed.firstChild.remove();
    if (scroll) this.scrollFeed();
  }

  thoughtDelta({ key, text }) {
    let li = this.live.get(key);
    if (!li) {
      li = el('li', 'thought live', '');
      this.live.set(key, li);
      this.feed.append(li);
    }
    li.textContent += text;
    this.scrollFeed();
  }

  scrollFeed(force = false) {
    const f = this.feed;
    const near = f.scrollHeight - f.scrollTop - f.clientHeight < 120;
    if (force || near) f.scrollTop = f.scrollHeight;
  }

  // ---- live code ----
  codeStart({ key, tool }) {
    clearTimeout(this.codeHideTimer);
    this.code = { key, text: '' };
    $('code-title').textContent = tool === 'build' ? 'building something…' : 'writing a new skill…';
    $('code-text').textContent = '';
    $('code-panel').classList.remove('done');
    $('code-panel').hidden = false;
  }

  codeTitle({ key, title }) {
    if (this.code?.key !== key) return;
    $('code-title').textContent = `${$('code-title').textContent.startsWith('building') ? 'building' : 'writing skill'} “${title}”`;
  }

  codeDelta({ key, text }) {
    if (this.code?.key !== key) return;
    const pre = $('code-text');
    pre.textContent += text;
    pre.scrollTop = pre.scrollHeight;
  }

  codeEnd({ key }) {
    if (this.code?.key !== key) return;
    $('code-panel').classList.add('done');
    this.codeHideTimer = setTimeout(() => {
      $('code-panel').hidden = true;
    }, 9000);
  }

  // ---- bubble / tip / toast ----
  say(text) {
    const b = $('bubble');
    b.textContent = text;
    b.hidden = false;
    clearTimeout(this.bubbleTimer);
    this.bubbleTimer = setTimeout(() => {
      b.hidden = true;
    }, Math.max(4500, text.length * 75));
  }

  placeBubble(x, y, visible) {
    const b = $('bubble');
    if (b.hidden) return;
    b.style.visibility = visible ? 'visible' : 'hidden';
    b.style.left = `${Math.max(150, Math.min(innerWidth - 150, x))}px`;
    b.style.top = `${Math.max(70, y)}px`;
  }

  showTip(x, y, obj) {
    const tip = $('tip');
    if (!obj) {
      tip.hidden = true;
      return;
    }
    tip.textContent = '';
    tip.append(el('div', 'name', obj.name));
    if (obj.description) tip.append(el('div', 'desc', obj.description));
    if (obj.link) {
      try {
        tip.append(el('div', 'link', `click to visit ${new URL(obj.link).host}`));
      } catch {}
    }
    tip.hidden = false;
    tip.style.left = `${Math.min(innerWidth - 320, x)}px`;
    tip.style.top = `${Math.min(innerHeight - 120, y)}px`;
  }

  toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      t.hidden = true;
    }, 3500);
  }
}

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { config, paths, secrets } from './config.js';
import { ensureDir } from './store.js';
import { bus } from './bus.js';
import { Ledger } from './ledger.js';
import { Visitors } from './visitors.js';
import { Feelings } from './feelings.js';
import { Diary } from './diary.js';
import { HOUSE_ACTIONS, buildActions } from './places.js';
import { GitHubWatcher } from './github.js';
import { Usage } from './brain/usage.js';
import { Skills } from './brain/skills.js';
import { World } from './brain/world.js';
import { Agent } from './brain/agent.js';
import { CORE_NAMES } from './brain/tools.js';
import { setGithubLogin } from './brain/sandbox.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  const payload = isBuf || typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'content-type': isBuf ? 'application/octet-stream' : typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    ...headers,
  });
  res.end(payload);
}

function readBody(req, limit = 8192) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let done = false;
    const finish = (v) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        finish({ tooBig: true });
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        finish(size ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        finish({});
      }
    });
    req.on('error', () => finish({}));
  });
}

function serveFile(res, file, cache = 'no-cache') {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'not found');
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'content-length': st.size, 'cache-control': cache });
    fs.createReadStream(file).pipe(res);
  });
}

function safeJoin(root, rel) {
  const target = path.resolve(root, '.' + path.sep + decodeURIComponent(rel));
  return target.startsWith(root + path.sep) || target === root ? target : null;
}

function isAdmin(req) {
  if (!secrets.adminToken) return false;
  const got = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(got);
  const b = Buffer.from(secrets.adminToken);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function createApp({ client } = {}) {
  for (const dir of [paths.data, paths.home, paths.workspace, paths.logs]) ensureDir(dir);
  const homePkg = path.join(paths.home, 'package.json');
  if (!fs.existsSync(homePkg)) fs.writeFileSync(homePkg, JSON.stringify({ name: 'charlie-home', private: true, type: 'module' }, null, 2));

  const ledger = new Ledger();
  const usage = new Usage();
  const github = new GitHubWatcher(ledger);
  const skills = new Skills({ ledger, reserved: CORE_NAMES });
  const world = new World({ ledger, progress: skills.progress });
  const feelings = new Feelings();
  const diary = new Diary();
  let agent = null;
  const visitors = new Visitors({ ledger, world, feelings, agentState: () => agent.s });
  agent = new Agent({ ledger, skills, world, visitors, usage, github, feelings, diary, client });
  feelings.isAsleep = () => agent.s.status !== 'awake';
  skills.init();
  world.init();
  if (!bus.feedItems.length) bus.feed('system', `${config.persona.name} moved into her new house. It has a bed, a window, a door, and not much else.`);
  bus.on('github', (s) => setGithubLogin(s.login));
  const emitPrices = () => bus.emit('prices', { skill: skills.nextPrice(), build: world.nextPrice() });
  bus.on('skills', emitPrices);
  bus.on('world', emitPrices);
  bus.on('world', () => bus.emit('actions', actionsList()));
  // Good news from the outside world lifts her spirits.
  bus.on('balance', ({ key, delta }) => {
    if (delta > 0 && (key?.startsWith('github.') || key === 'beacon.view' || key === 'gift')) feelings.bump({ joy: Math.min(12, 2 + delta * 0.3) });
  });

  const actionsList = () => [...HOUSE_ACTIONS, ...buildActions(world)].map(({ id, place, label, build }) => ({ id, place, label, build: Boolean(build) }));

  const snapshot = () => ({
    charlie: agent.publicState(),
    tokens: { balance: ledger.data.balance, earned: ledger.data.earned, spent: ledger.data.spent, bySource: ledger.data.bySource },
    prices: { skill: skills.nextPrice(), reviseSkill: config.economy.costs.reviseSkill, build: world.nextPrice(), rebuild: config.economy.costs.rebuild },
    earn: Object.fromEntries(Object.entries(config.economy.earn).filter(([k, v]) => v > 0 && (k !== 'beacon.view' || secrets.publicUrl))),
    ledger: ledger.recent(40),
    skills: skills.publicList(),
    world: { plotSize: config.world.plotSize, objects: world.publicList(), buildable: world.buildable() },
    feed: bus.feedItems.slice(-150),
    viewers: bus.viewers,
    github: github.status(),
    feelings: feelings.publicState(),
    diary: diary.recent(60),
    actions: actionsList(),
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  const routes = async (req, res) => {
    const url = new URL(req.url, 'http://local');
    const p = url.pathname;
    const method = req.method;

    if (method === 'GET' && p === '/api/state') return send(res, 200, snapshot());

    if (method === 'GET' && p === '/api/events') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      });
      res.write(`retry: 3000\n\nevent: hello\ndata: ${JSON.stringify(snapshot())}\n\n`);
      const ping = setInterval(() => res.write(': ping\n\n'), 25000);
      res.on('close', () => clearInterval(ping));
      bus.addClient(res);
      return;
    }

    let m;
    if (method === 'GET' && (m = p.match(/^\/api\/world\/([a-z0-9_]+)\/points$/))) {
      const file = world.pointsFile(m[1]);
      return file ? serveFile(res, file, 'public, max-age=31536000, immutable') : send(res, 404, 'not found');
    }
    if (method === 'GET' && (m = p.match(/^\/api\/skills\/([a-z0-9_]+)$/))) {
      const src = skills.source(m[1]);
      return src ? send(res, 200, src) : send(res, 404, { error: 'unknown skill' });
    }
    if (method === 'GET' && p === '/api/me') return send(res, 200, visitors.about(visitors.identify(req, res)));
    if (method === 'GET' && p === '/api/diary') return send(res, 200, diary.recent(Math.min(300, Number(url.searchParams.get('limit')) || 100)));
    if (method === 'GET' && (m = p.match(/^\/beacon\/([\w.-]{1,64})$/))) {
      visitors.beacon(req, m[1].replace(/\.gif$/, ''));
      return send(res, 200, GIF, { 'content-type': 'image/gif', 'cache-control': 'no-store, max-age=0' });
    }

    if (method === 'POST' && p.startsWith('/api/') && !p.startsWith('/api/admin/')) {
      if (!visitors.burstOK(req)) return send(res, 429, { error: 'slow down a little' });
      const body = await readBody(req, p === '/api/message' ? Math.ceil(config.site.maxPictureBytes * 1.4) + 4096 : 8192);
      if (body.tooBig) return send(res, 413, { error: 'That is too big.' });
      if (p === '/api/hello' || p === '/api/visit') return send(res, 200, visitors.hello(req, res));
      if (p === '/api/me') {
        const r = visitors.rename(req, res, body.name);
        return send(res, r.error ? 400 : 200, r);
      }
      if (p === '/api/pet') return send(res, 200, visitors.pet(req, res));
      if (p === '/api/treat') return send(res, 200, visitors.treat(req, res));
      if (p === '/api/touch') {
        const r = visitors.touch(req, res, String(body.name || ''));
        return send(res, r.error ? 404 : 200, r);
      }
      if (p === '/api/action') {
        const r = visitors.action(req, res, String(body.id || ''));
        return send(res, r.error ? 429 : 200, r);
      }
      if (p === '/api/message') {
        const r = visitors.offer(req, res, { text: body.text, image: body.image });
        return send(res, r.error ? 400 : 200, r);
      }
    }

    if (p.startsWith('/api/admin/')) {
      if (!isAdmin(req)) return send(res, 403, { error: 'admin token required' });
      const action = p.slice('/api/admin/'.length);
      if (method === 'GET' && action === 'usage') return send(res, 200, { today: usage.day(), days: usage.store.data.days, budget: usage.budget });
      if (method !== 'POST') return send(res, 405, { error: 'POST only' });
      const body = await readBody(req);
      if (action === 'pause') agent.pause();
      else if (action === 'resume') agent.resume();
      else if (action === 'wake') return send(res, 200, { ok: agent.wakeNow() });
      else if (action === 'grant') {
        const amount = Number(body.amount);
        if (!(amount > 0 && amount <= 10000)) return send(res, 400, { error: 'amount must be 1–10000' });
        ledger.earn('gift', amount, String(body.reason || 'a gift from your human').slice(0, 120));
      } else return send(res, 404, { error: 'unknown action' });
      return send(res, 200, { ok: true, charlie: agent.publicState() });
    }

    if (method !== 'GET' && method !== 'HEAD') return send(res, 405, 'method not allowed');
    if (p.startsWith('/vendor/three/')) {
      const file = safeJoin(paths.three, p.slice('/vendor/three/'.length));
      return file ? serveFile(res, file, 'public, max-age=86400') : send(res, 404, 'not found');
    }
    const file = safeJoin(paths.web, p === '/' ? 'index.html' : p.slice(1));
    return file ? serveFile(res, file) : send(res, 404, 'not found');
  };

  const server = http.createServer((req, res) => {
    routes(req, res).catch((err) => {
      console.error('[http]', err);
      if (!res.headersSent) send(res, 500, { error: 'internal error' });
    });
  });

  const flush = () => {
    for (const s of [bus, ledger, usage, github, visitors, agent, feelings, diary]) {
      try {
        s.flush();
      } catch {}
    }
  };

  return {
    server, ledger, usage, github, skills, world, visitors, agent, feelings, diary, flush, snapshot,
    start() {
      github.start();
      world.startRefreshLoop();
      agent.start();
    },
  };
}

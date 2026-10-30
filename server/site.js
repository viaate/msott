import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, paths, secrets } from './config.js';
import { JSONStore, ensureDir, today, clip } from './store.js';
import { bus } from './bus.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
};

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|discord|telegram|curl|wget|python|node-fetch|undici|axios|go-http|java\/|headless|lighthouse|monitor|uptime|scan|fetch|http-client|okhttp|libwww/i;
const PATH_RE = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*\/?$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;

// Only real people count: no bots, link previews, scripts, or this machine.
export function isRealVisitor(req, ip) {
  const ua = String(req.headers['user-agent'] || '');
  if (!ua || ua.length < 20 || BOT.test(ua)) return false;
  if (!ip || ip === '::1' || ip.startsWith('127.') || ip === '::ffff:127.0.0.1') return false;
  return true;
}

function refHost(req) {
  try {
    const h = new URL(String(req.headers.referer || '')).host.replace(/^www\./, '');
    return h || 'direct';
  } catch {
    return 'direct';
  }
}

export function baseUrl() {
  return secrets.publicUrl || `http://localhost:${process.env.PORT || config.site.port}`;
}

// Charlie's website (home/site, served at /pages/) and her tracked links
// (/go/<slug>). Every real visit to either is counted here and becomes tokens.
export class Site {
  constructor({ ledger, visitors }) {
    this.ledger = ledger;
    this.visitors = visitors;
    this.root = path.join(paths.home, 'site');
    this.store = new JSONStore(path.join(paths.data, 'site.json'), { pages: {}, links: {} });
  }

  init() {
    ensureDir(this.root);
  }

  get s() {
    return this.store.data;
  }

  // ---------------------------------------------------------------- publishing
  normalize(raw) {
    let p = String(raw ?? '').trim().toLowerCase().replace(/^\/+/, '').replace(/^pages\//, '');
    if (!p || p.endsWith('/')) p += 'index.html';
    if (!path.extname(p)) p += '.html';
    if (!PATH_RE.test(p) || p.split('/').some((seg) => seg === '..' || seg.startsWith('.'))) {
      throw new Error('path must be lowercase letters, digits, dots, dashes and underscores, like "zine/index.html" or "about.html".');
    }
    if (!MIME[path.extname(p)]) throw new Error(`Unsupported file type "${path.extname(p)}". Use one of: ${Object.keys(MIME).join(' ')}`);
    return p;
  }

  urlFor(file) {
    const clean = file.replace(/index\.html$/, '').replace(/\.html$/, '');
    return `${baseUrl()}/pages/${clean}`;
  }

  siteBytes() {
    let total = 0;
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const f = path.join(dir, e.name);
        if (e.isDirectory()) walk(f);
        else total += fs.statSync(f).size;
      }
    };
    if (fs.existsSync(this.root)) walk(this.root);
    return total;
  }

  publish({ path: raw, content, encoding = 'utf8' }) {
    const file = this.normalize(raw);
    if (typeof content !== 'string') throw new Error('content is required.');
    const buf = Buffer.from(content, encoding === 'base64' ? 'base64' : 'utf8');
    if (buf.length > config.site.maxPageBytes) throw new Error(`That file is ${buf.length} bytes; the limit is ${config.site.maxPageBytes}.`);
    const target = path.join(this.root, file);
    const existing = fs.existsSync(target) ? fs.statSync(target).size : 0;
    if (this.siteBytes() - existing + buf.length > config.site.maxSiteBytes) throw new Error('Your website is full. Unpublish something first.');
    ensureDir(path.dirname(target));
    fs.writeFileSync(target, buf);
    const url = this.urlFor(file);
    bus.emit('site', this.publicState());
    return { file, url, updated: existing > 0 };
  }

  unpublish(raw) {
    const file = this.normalize(raw);
    const target = path.join(this.root, file);
    if (!fs.existsSync(target)) throw new Error(`Nothing published at ${file}.`);
    fs.rmSync(target);
    bus.emit('site', this.publicState());
    return file;
  }

  files() {
    const out = [];
    const walk = (dir, rel = '') => {
      if (!fs.existsSync(dir)) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name.startsWith('.')) continue;
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) walk(path.join(dir, e.name), r);
        else out.push(r);
      }
    };
    walk(this.root);
    return out.sort();
  }

  // ---------------------------------------------------------------- links
  makeLink({ url, slug, note }) {
    let u;
    try {
      u = new URL(String(url));
      if (!['http:', 'https:'].includes(u.protocol)) throw new Error();
    } catch {
      throw new Error('url must be an http(s) URL.');
    }
    let s = slug ? String(slug).toLowerCase() : crypto.randomBytes(3).toString('hex');
    if (!SLUG_RE.test(s)) throw new Error('slug must be 2–40 lowercase letters, digits or dashes.');
    const existing = this.s.links[s];
    this.s.links[s] = { url: u.href, note: clip(note ?? '', 200), created: existing?.created ?? Date.now(), total: existing?.total ?? 0, days: existing?.days ?? {}, refs: existing?.refs ?? {} };
    this.store.save();
    bus.emit('site', this.publicState());
    return { slug: s, link: `${baseUrl()}/go/${s}`, url: u.href };
  }

  // ---------------------------------------------------------------- counting
  count(kind, key, req) {
    const ip = this.visitors.ip(req);
    if (!isRealVisitor(req, ip)) return false;
    const h = this.visitors.hash(req);
    if (!this.ledger.allow(`${kind}:${key}:${h}`, 1)) return false;
    const bucket = kind === 'page' ? (this.s.pages[key] ??= { total: 0, days: {}, refs: {} }) : this.s.links[key];
    if (!bucket) return false;
    const d = today();
    bucket.total += 1;
    bucket.days[d] = (bucket.days[d] ?? 0) + 1;
    const ref = refHost(req);
    bucket.refs[ref] = (bucket.refs[ref] ?? 0) + 1;
    const days = Object.keys(bucket.days).sort();
    for (const old of days.slice(0, -30)) delete bucket.days[old];
    this.store.save();
    const where = ref === 'direct' ? '' : ` from ${ref}`;
    if (kind === 'page') this.ledger.earn('page.view', 1, `someone read /pages/${key}${where}`, { quiet: true });
    else this.ledger.earn('link.click', 1, `someone clicked /go/${key}${where}`, { quiet: true });
    return true;
  }

  // ---------------------------------------------------------------- serving
  serve(req, res, rel) {
    let p;
    try {
      p = decodeURIComponent(rel).toLowerCase();
    } catch {
      p = '';
    }
    if (p.includes('..')) return this.notFound(res);
    let file = p === '' || p.endsWith('/') ? `${p}index.html` : p;
    let target = path.join(this.root, file);
    if (!path.extname(file)) {
      if (fs.existsSync(`${target}.html`)) {
        file += '.html';
        target += '.html';
      } else if (fs.existsSync(path.join(target, 'index.html'))) {
        res.writeHead(301, { location: `/pages/${p}/` });
        return res.end();
      }
    }
    if (!target.startsWith(this.root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) return this.notFound(res);
    const type = MIME[path.extname(target)] ?? 'application/octet-stream';
    const html = type.startsWith('text/html');
    if (html) this.count('page', file.replace(/index\.html$/, '').replace(/\.html$/, '') || '/', req);
    res.writeHead(200, {
      'content-type': type,
      'cache-control': html ? 'no-cache' : 'public, max-age=300',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      // Her pages run in a sandbox with an opaque origin: they can't touch
      // this site's cookies, storage or API as the visitor.
      'content-security-policy': 'sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads',
    });
    fs.createReadStream(target).pipe(res);
  }

  notFound(res) {
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><meta charset="utf-8"><title>Not here</title><body style="background:#0e0d0c;color:#efe6d8;font:16px monospace;display:grid;place-items:center;height:100vh;margin:0"><p>Charlie hasn\'t made anything here (yet). <a style="color:#d6834a" href="/">Visit her</a>.</p>');
  }

  redirect(req, res, slug) {
    const link = this.s.links[slug];
    if (!link) return this.notFound(res);
    this.count('link', slug, req);
    res.writeHead(302, { location: link.url, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer-when-downgrade' });
    res.end();
  }

  // ---------------------------------------------------------------- reporting
  pageStats() {
    const d = today();
    return this.files().filter((f) => /\.html?$/.test(f)).map((f) => {
      const key = f.replace(/index\.html$/, '').replace(/\.html$/, '') || '/';
      const st = this.s.pages[key] ?? { total: 0, days: {}, refs: {} };
      return { file: f, url: this.urlFor(f), today: st.days[d] ?? 0, total: st.total, refs: st.refs };
    });
  }

  linkStats() {
    const d = today();
    return Object.entries(this.s.links).map(([slug, l]) => ({ slug, link: `${baseUrl()}/go/${slug}`, url: l.url, note: l.note, today: l.days[d] ?? 0, total: l.total, refs: l.refs }));
  }

  summary() {
    const top = (refs) => Object.entries(refs).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([h, n]) => `${h} ${n}`).join(', ');
    const lines = [];
    const pages = this.pageStats();
    const files = this.files();
    lines.push(`YOUR WEBSITE: ${baseUrl()}/pages/ — ${pages.length} page${pages.length === 1 ? '' : 's'}, ${files.length - pages.length} other file${files.length - pages.length === 1 ? '' : 's'}${secrets.publicUrl ? '' : ' (NOT public yet: only reachable on this machine until your human sets a public address)'}`);
    for (const p of pages.sort((a, b) => b.total - a.total).slice(0, 12)) {
      lines.push(`- ${p.url} — ${p.today} views today, ${p.total} all-time${p.total ? ` · from: ${top(p.refs)}` : ''}`);
    }
    const links = this.linkStats();
    if (links.length) {
      lines.push('TRACKED LINKS:');
      for (const l of links.sort((a, b) => b.total - a.total).slice(0, 12)) {
        lines.push(`- ${l.link} → ${l.url}${l.note ? ` (${l.note})` : ''} — ${l.today} clicks today, ${l.total} all-time${l.total ? ` · from: ${top(l.refs)}` : ''}`);
      }
    }
    return lines;
  }

  publicState() {
    return {
      base: `${baseUrl()}/pages/`,
      public: Boolean(secrets.publicUrl),
      pages: this.pageStats().map(({ file, url, today: t, total }) => ({ file, url, today: t, total })),
      links: this.linkStats().map(({ slug, link, url, total }) => ({ slug, link, url, total })),
    };
  }

  flush() {
    this.store.flush();
  }
}

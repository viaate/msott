import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { paths } from './config.js';
import { readJSON, writeJSON, ensureDir } from './store.js';

const env = process.env;

function copyDir(from, to, transform) {
  if (!fs.existsSync(from)) return;
  ensureDir(to);
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const a = path.join(from, e.name);
    const b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b, transform);
    else if (transform && /\.html?$/.test(e.name)) fs.writeFileSync(b, transform(fs.readFileSync(a, 'utf8')));
    else fs.copyFileSync(a, b);
  }
}

function hashDir(dir, h) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((x, y) => x.name.localeCompare(y.name))) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) hashDir(f, h);
    else h.update(e.name).update(fs.readFileSync(f));
  }
}

function counter() {
  return env.GOATCOUNTER_CODE ? `<script data-goatcounter="https://${env.GOATCOUNTER_CODE}.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>` : '';
}

function withCounter(html) {
  const tag = counter();
  if (!tag || html.includes('data-goatcounter')) return html;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${tag}\n</body>`) : `${html}\n${tag}\n`;
}

function redirectPage(slug, url) {
  const safe = url.replace(/"/g, '%22').replace(/</g, '%3C');
  const pixel = env.GOATCOUNTER_CODE
    ? `new Image().src = "https://${env.GOATCOUNTER_CODE}.goatcounter.com/count?p=" + encodeURIComponent(location.pathname) + "&r=" + encodeURIComponent(document.referrer) + "&rnd=" + Math.random(); setTimeout(go, 400);`
    : 'go();';
  return `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>…</title>
<meta http-equiv="refresh" content="3;url=${safe}">
<body style="background:#0e0d0c;color:#9a9087;font:14px monospace;display:grid;place-items:center;height:100vh;margin:0">
<p>taking you there… <a style="color:#d6834a" href="${safe}">go</a></p>
<script>function go(){location.replace(${JSON.stringify(url)})}${pixel}</script>
`;
}

// Builds the whole site for GitHub Pages: the dot world, her website under
// pages/, her /go/ links, and state.json that the world reads. Returns
// whether anything visitors would see has changed since the last deploy.
export function exportSite(app, { out, session, issues, repo }) {
  fs.rmSync(out, { recursive: true, force: true });
  ensureDir(out);

  const config = { static: true, repo, issues };
  copyDir(paths.web, out, (html) => withCounter(html.replace('<script type="module" src="js/main.js"></script>', `<script>window.CHARLIE = ${JSON.stringify(config)};</script>\n  <script type="module" src="js/main.js"></script>`)));

  const three = paths.three;
  for (const f of ['build/three.module.js', 'build/three.core.js', 'examples/jsm/controls/OrbitControls.js']) {
    ensureDir(path.dirname(path.join(out, 'vendor/three', f)));
    fs.copyFileSync(path.join(three, f), path.join(out, 'vendor/three', f));
  }

  ensureDir(path.join(out, 'world'));
  for (const o of app.world.list()) {
    const f = !o.builtin && app.world.pointsFile(o.name);
    if (f) fs.copyFileSync(f, path.join(out, 'world', `${o.name}.bin`));
  }
  ensureDir(path.join(out, 'skills'));
  for (const sk of app.skills.list()) fs.writeFileSync(path.join(out, 'skills', `${sk.name}.json`), JSON.stringify(app.skills.source(sk.name)));

  copyDir(app.site.root, path.join(out, 'pages'), withCounter);
  for (const l of app.site.linkStats()) {
    ensureDir(path.join(out, 'go', l.slug));
    fs.writeFileSync(path.join(out, 'go', l.slug, 'index.html'), redirectPage(l.slug, l.url));
  }

  const snapshot = app.snapshot();
  snapshot.viewers = 0;
  const people = app.visitors.publicPeople();

  // Fingerprint everything except slow drifts (feelings, budget), so idle
  // ticks don't redeploy.
  const h = crypto.createHash('sha256');
  h.update(JSON.stringify({
    tokens: snapshot.tokens,
    ledger: snapshot.ledger.at(-1)?.t ?? 0,
    feed: snapshot.feed.at(-1)?.id ?? 0,
    world: snapshot.world.objects.map((o) => `${o.name}:${o.version}:${o.status}`),
    skills: snapshot.skills.map((s) => `${s.name}:${s.revisions}:${s.uses}`),
    diary: snapshot.diary.at(-1)?.id ?? 0,
    site: snapshot.site,
    requests: snapshot.requests,
    people,
    charlie: [snapshot.charlie.status, snapshot.charlie.nextWakeAt, snapshot.charlie.location, snapshot.charlie.paused],
    session: session?.id ?? null,
  }));
  hashDir(paths.web, h);
  hashDir(app.site.root, h);
  const fingerprint = h.digest('hex');
  const record = readJSON(path.join(paths.data, 'export.json'), { fingerprint: null, version: 0, deployedAt: 0 });
  const stale = Date.now() - record.deployedAt > 3 * 3600_000;
  const changed = fingerprint !== record.fingerprint || stale;
  if (changed) {
    record.version += 1;
    record.fingerprint = fingerprint;
    record.deployedAt = Date.now();
    writeJSON(path.join(paths.data, 'export.json'), record);
  }

  writeJSON(path.join(out, 'state.json'), { version: record.version, generatedAt: new Date().toISOString(), static: config, snapshot, people, lastSession: session ?? null });
  fs.writeFileSync(path.join(out, '.nojekyll'), '');
  fs.writeFileSync(path.join(out, '404.html'), `<!doctype html><meta charset="utf-8"><title>Not here</title><body style="background:#0e0d0c;color:#efe6d8;font:16px monospace;display:grid;place-items:center;height:100vh;margin:0"><p>Charlie hasn't made anything here (yet). <a style="color:#d6834a" href="${env.PUBLIC_URL || '/'}">Visit her</a>.</p>${counter()}`);
  return { changed, version: record.version };
}

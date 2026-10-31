// Charlie on Reddit, through Reddit's developer platform (Devvit).
// Her login is kept encrypted (with her human's setup code as the key), so it
// can be saved with the rest of her life without being readable.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';

const env = process.env;
const HOME = env.CHARLIE_HOME || env.HOME;
const ROOT = path.join(env.CHARLIE_WORKSPACE || path.join(HOME, 'workspace'), 'devvit');
const SEALED = path.join(HOME, 'devvit-login.enc');
const PLAIN = path.join(HOME, '.devvit', 'token');
const KEY = crypto.createHash('sha256').update(`charlie-devvit:${env.CHARLIE_DEVVIT_CODE || ''}`).digest();

function seal(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const body = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  fs.writeFileSync(SEALED, Buffer.concat([iv, c.getAuthTag(), body]).toString('base64'));
}

function unseal() {
  try {
    const buf = Buffer.from(fs.readFileSync(SEALED, 'utf8'), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', KEY, buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

// After any command, keep the newest login (sealed) and leave no plain copy.
function stash() {
  if (!fs.existsSync(PLAIN)) return;
  const raw = fs.readFileSync(PLAIN, 'utf8').trim();
  if (raw) seal(raw);
  fs.rmSync(PLAIN, { force: true });
}

function sh(cmd, args, { cwd, timeout = 240000, extraEnv = {} } = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, timeout, maxBuffer: 20 * 1024 * 1024, env: { ...env, CI: '1', FORCE_COLOR: '0', NO_COLOR: '1', DEVVIT_DISABLE_METRICS: '1', ...extraEnv } }, (err, stdout, stderr) => {
      const out = `${stdout}${stderr}`.replace(/\x1b\[[0-9;]*m/g, '').trim();
      resolve({ ok: !err, code: err?.code ?? 0, out: out.length > 9000 ? `…${out.slice(-9000)}` : out, timedOut: Boolean(err?.killed) });
    });
  });
}

function project() {
  if (!fs.existsSync(ROOT)) return null;
  for (const d of fs.readdirSync(ROOT)) {
    if (fs.existsSync(path.join(ROOT, d, 'devvit.json'))) return path.join(ROOT, d);
  }
  return null;
}

async function cliBin(dir) {
  const local = dir && path.join(dir, 'node_modules', '.bin', 'devvit');
  if (local && fs.existsSync(local)) return local;
  const shared = path.join(HOME, 'node_modules', '.bin', 'devvit');
  if (!fs.existsSync(shared)) {
    const r = await sh('npm', ['install', '--no-audit', '--no-fund', 'devvit@^0.15'], { cwd: HOME });
    if (!r.ok) throw new Error(`Couldn't install the devvit CLI:\n${r.out}`);
  }
  return shared;
}

async function devvit(args, dir, opts = {}) {
  // Newest saved login first; otherwise one her human made with `devvit login`.
  const token = unseal() ?? env.CHARLIE_DEVVIT_LOGIN ?? null;
  const bin = await cliBin(dir);
  const r = await sh(bin, args, { cwd: dir || ROOT, extraEnv: token ? { DEVVIT_AUTH_TOKEN: token } : {}, ...opts });
  stash();
  return r;
}

async function deps(dir) {
  if (fs.existsSync(path.join(dir, 'node_modules'))) return null;
  const r = await sh('npm', ['install', '--no-audit', '--no-fund'], { cwd: dir });
  return r.ok ? null : `npm install failed:\n${r.out}`;
}

function inside(dir, rel) {
  const target = path.resolve(dir, String(rel ?? ''));
  if (target !== dir && !target.startsWith(dir + path.sep)) throw new Error('Paths must stay inside your app.');
  return target;
}

function listFiles(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git'].includes(e.name)) continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) listFiles(f, base, out);
    else out.push(`${path.relative(base, f)} (${fs.statSync(f).size} bytes)`);
  }
  return out;
}

export const _sealing = { seal, unseal, stash, SEALED, PLAIN };

// Reddit's code is one long base64 string, but what gets pasted may be the
// whole command Reddit showed ("npx devvit@latest init <code>"), quoted, or
// wrapped onto several lines.
export function setupCode(raw) {
  const text = String(raw ?? '').replace(/--code[= ]/g, ' ').replace(/[`'"]/g, ' ').trim();
  const b64 = (t) => /^[A-Za-z0-9+/_-]+={0,2}$/.test(t);
  const lines = text.split(/\s*\n\s*/);
  if (lines.length > 1 && !/[ \t]/.test(lines.join('')) && lines.every(b64)) return lines.join('');
  return text.split(/\s+/).filter((t) => b64(t) && t.length >= 16).sort((a, b) => b.length - a.length)[0] ?? text;
}

export default async function run(input) {
  if (!env.CHARLIE_DEVVIT_CODE) throw new Error('No Devvit setup code yet (CHARLIE_DEVVIT_CODE). Ask your human for one.');
  fs.mkdirSync(ROOT, { recursive: true });
  let dir = project();

  if (input.action === 'setup') {
    if (dir) return `Your app is already set up at ${path.relative(HOME, dir)}.`;
    const args = ['init', setupCode(env.CHARLIE_DEVVIT_CODE)];
    if (input.template) args.push(`--template=${input.template}`);
    const r = await devvit(args, ROOT);
    dir = project();
    if (!dir) {
      const why = /Invalid code provided/.test(r.out)
        ? "Reddit couldn't read the setup code at all, so it was probably cut off or mangled when it was copied."
        : /Failed to login|No auth code/.test(r.out)
          ? 'Reddit read the setup code but it no longer works (it was already used, or it expired).'
          : "Here's what Devvit said.";
      return `Setup didn't finish. ${why}\n${r.out}\n\n(Ask your human for a new code from https://developers.reddit.com/new, copied whole.)`;
    }
    fs.rmSync(path.join(dir, '.git'), { recursive: true, force: true });
    return `Set up your app in ${path.relative(HOME, dir)}.\n${r.out.slice(-2000)}\n\nFiles:\n${listFiles(dir).join('\n')}`;
  }
  if (!dir) return 'You have no Devvit app yet. Run the "setup" action first.';

  switch (input.action) {
    case 'status': {
      const who = await devvit(['whoami'], dir);
      const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'devvit.json'), 'utf8'));
      return `App "${cfg.name}" in ${path.relative(HOME, dir)}\nLogged in as: ${who.out}\nSigned-in session saved: ${fs.existsSync(SEALED) ? 'yes' : 'no'}`;
    }
    case 'files':
      return listFiles(dir).join('\n');
    case 'read': {
      const f = inside(dir, input.path);
      return fs.readFileSync(f, 'utf8').slice(0, 20000);
    }
    case 'write': {
      const written = [];
      for (const [rel, content] of Object.entries(input.files ?? {})) {
        const f = inside(dir, rel);
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.writeFileSync(f, String(content));
        written.push(rel);
      }
      return `Wrote ${written.length} file(s): ${written.join(', ')}`;
    }
    case 'upload': {
      const problem = await deps(dir);
      if (problem) return problem;
      const r = await devvit(['upload', '--bump', 'patch'], dir);
      return `${r.ok ? 'Uploaded.' : 'Upload failed.'}\n${r.out}`;
    }
    case 'install': {
      const r = await devvit(['install', String(input.subreddit ?? '').replace(/^\/?r\//, '')], dir);
      return r.out;
    }
    case 'publish': {
      const problem = await deps(dir);
      if (problem) return problem;
      const r = await devvit(['publish', '--bump', 'patch', ...(input.public ? ['--public'] : [])], dir);
      return r.out;
    }
    case 'logs': {
      // `devvit logs` streams forever, so take what arrives in a few seconds.
      const r = await devvit(['logs', String(input.subreddit ?? '').replace(/^\/?r\//, ''), '--since', input.since || '1h', '--json'], dir, { timeout: 20000 });
      return r.out || '(no logs in that window)';
    }
    case 'run': {
      const r = await devvit((input.args ?? []).map(String), dir);
      return r.out;
    }
  }
  throw new Error(`Unknown action ${input.action}`);
}

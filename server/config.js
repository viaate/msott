import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// .env is optional; real environment variables always win.
try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch {}

// On GitHub, every extra setting comes in one secret, CHARLIE_ENV, written
// like a .env file (KEY=value per line).
if (process.env.CHARLIE_ENV) {
  for (const line of process.env.CHARLIE_ENV.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined || process.env[m[1]] === '') process.env[m[1]] = value;
  }
  delete process.env.CHARLIE_ENV;
}

function deepMerge(base, extra) {
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return extra ?? base;
  const out = { ...base };
  for (const [k, v] of Object.entries(extra)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base?.[k] && typeof base[k] === 'object'
      ? deepMerge(base[k], v)
      : v;
  }
  return out;
}

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const defaults = readJSON(path.join(ROOT, 'charlie.config.json'));
const localFile = path.join(ROOT, 'charlie.config.local.json');
export const config = fs.existsSync(localFile) ? deepMerge(defaults, readJSON(localFile)) : defaults;

const env = process.env;

export const paths = {
  root: ROOT,
  web: path.join(ROOT, 'web'),
  starter: path.join(ROOT, 'starter'),
  three: path.join(ROOT, 'node_modules', 'three'),
  data: path.resolve(env.CHARLIE_DATA_DIR || path.join(ROOT, 'data')),
  home: path.resolve(env.CHARLIE_HOME_DIR || path.join(ROOT, 'home')),
};
paths.skills = path.join(paths.home, 'skills');
paths.world = path.join(paths.home, 'world');
paths.workspace = path.join(paths.home, 'workspace');
paths.logs = path.join(paths.home, 'logs');
paths.memory = path.join(paths.home, 'memory.md');

// On GitHub Pages, her address follows from the repo name.
if (!env.PUBLIC_URL && env.CHARLIE_MODE === 'github' && env.GITHUB_REPOSITORY) {
  const [owner, name] = env.GITHUB_REPOSITORY.split('/');
  const host = `${owner.toLowerCase()}.github.io`;
  env.PUBLIC_URL = name.toLowerCase() === host ? `https://${host}` : `https://${host}/${name}`;
}

export const secrets = {
  anthropicKey: env.ANTHROPIC_API_KEY || '',
  githubToken: env.GITHUB_TOKEN || '',
  githubUser: env.GITHUB_USERNAME || '',
  adminToken: env.ADMIN_TOKEN || '',
  publicUrl: (env.PUBLIC_URL || '').replace(/\/+$/, ''),
};

export const port = Number(env.PORT || config.site.port || 8787);

// "server": a long-running Node server you host. "github": GitHub Actions
// runs her on a schedule and GitHub Pages hosts everything.
export const mode = env.CHARLIE_MODE === 'github' ? 'github' : 'server';

// Optional: run Charlie's code as a separate, low-privilege OS user (POSIX).
export const runAs = env.CHARLIE_UID ? { uid: Number(env.CHARLIE_UID), gid: Number(env.CHARLIE_GID || env.CHARLIE_UID) } : {};

// Extra credentials the owner hands to Charlie: every CHARLIE_* variable is
// passed through to her skills (except the harness's own path settings).
export function charlieEnv() {
  const out = {};
  for (const [k, v] of Object.entries(env)) {
    if (k.startsWith('CHARLIE_') && !['CHARLIE_DATA_DIR', 'CHARLIE_HOME_DIR', 'CHARLIE_UID', 'CHARLIE_GID', 'CHARLIE_MODE', 'CHARLIE_SITE_OUT'].includes(k)) out[k] = v;
  }
  return out;
}

export function earnWeight(key) {
  return Number(config.economy.earn[key] ?? 0);
}

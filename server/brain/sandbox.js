import fs from 'node:fs';
import path from 'node:path';
import { fork, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { paths, secrets, charlieEnv, runAs } from '../config.js';
import { ensureDir } from '../store.js';

const RUNNER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'runner.mjs');

let githubLogin = '';
export function setGithubLogin(login) {
  githubLogin = login || githubLogin;
}

// The environment Charlie's code runs with. Deliberately excludes the
// Anthropic key and the admin token; includes her own accounts.
export function childEnv() {
  const pass = ['PATH', 'LANG', 'TZ', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'SYSTEMROOT', 'COMSPEC', 'PATHEXT', 'WINDIR',
    'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'no_proxy', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE'];
  const env = {};
  for (const k of pass) if (process.env[k]) env[k] = process.env[k];
  Object.assign(env, {
    HOME: paths.home,
    USERPROFILE: paths.home,
    CHARLIE_HOME: paths.home,
    CHARLIE_WORKSPACE: paths.workspace,
    CHARLIE_PUBLIC_URL: secrets.publicUrl,
    GITHUB_TOKEN: secrets.githubToken,
    GITHUB_USERNAME: secrets.githubUser || githubLogin,
    ...charlieEnv(),
  });
  return env;
}

// Values that must never show up in anything published (code views, logs).
export function scrubSecrets(text) {
  let out = String(text ?? '');
  const values = [secrets.githubToken, secrets.anthropicKey, secrets.adminToken, ...Object.values(charlieEnv())]
    .filter((v) => v && v.length >= 8);
  for (const v of values) out = out.split(v).join('•••');
  return out;
}

// Syntax check without executing anything, so a typo never costs tokens.
export function checkSyntax(file) {
  return new Promise((resolve) => {
    execFile(process.execPath, ['--check', file], { timeout: 15000, ...runAs }, (err, _stdout, stderr) => {
      if (!err) return resolve(null);
      const msg = String(stderr || err.message).replaceAll(file, path.basename(file)).trim();
      resolve(msg.split('\n').slice(0, 12).join('\n'));
    });
  });
}

export function runModule({ file, mode, input, ctx, timeoutMs }) {
  ensureDir(paths.workspace);
  const started = Date.now();
  return new Promise((resolve) => {
    const child = fork(RUNNER, [], {
      cwd: paths.workspace,
      env: childEnv(),
      silent: true,
      serialization: 'advanced',
      execArgv: ['--max-old-space-size=1024'],
      ...runAs,
    });
    let logs = '';
    const cap = 16000;
    const collect = (d) => {
      if (logs.length < cap) logs += d.toString();
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);

    let result = null;
    let done = false;
    const finish = (r) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ ...r, logs: scrubSecrets(logs.slice(0, cap)).trim(), ms: Date.now() - started });
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish({ ok: false, error: `Timed out after ${Math.round(timeoutMs / 1000)}s and was stopped.` });
    }, timeoutMs);

    child.on('message', (msg) => {
      result = msg;
    });
    child.on('error', (err) => finish({ ok: false, error: String(err.message || err) }));
    child.on('exit', (code, signal) => {
      finish(result ?? { ok: false, error: `The process exited (${signal || `code ${code}`}) before returning anything.` });
    });
    child.send({ file, mode, input, ctx });
  });
}

export function appendLog(name, text) {
  const file = path.join(ensureDir(path.join(paths.logs, 'runs')), `${name}.log`);
  try {
    if (fs.existsSync(file) && fs.statSync(file).size > 1_000_000) {
      const tail = fs.readFileSync(file, 'utf8').slice(-400_000);
      fs.writeFileSync(file, tail);
    }
    fs.appendFileSync(file, `\n=== ${new Date().toISOString()} ===\n${scrubSecrets(text)}\n`);
  } catch {}
}

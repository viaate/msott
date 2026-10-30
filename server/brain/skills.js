import fs from 'node:fs';
import path from 'node:path';
import { config, paths } from '../config.js';
import { ensureDir, readJSON, writeJSON, JSONStore, clip } from '../store.js';
import { price } from '../ledger.js';
import { bus } from '../bus.js';
import { checkSyntax, runModule, appendLog, scrubSecrets } from './sandbox.js';

export const NAME_RE = /^[a-z][a-z0-9_]{1,39}$/;

// A skill lives in home/skills/<name>/: tool.json (the tool definition the
// model sees), index.mjs (code Charlie wrote), NOTES.md, meta.json.
export class Skills {
  constructor({ ledger, reserved = [] }) {
    this.ledger = ledger;
    this.reserved = new Set(reserved);
    this.progress = new JSONStore(path.join(paths.data, 'progress.json'), { skillsLearned: 0, buildsMade: 0 });
  }

  init() {
    ensureDir(paths.skills);
    for (const name of config.starterSkills ?? []) {
      const from = path.join(paths.starter, 'skills', name);
      const to = path.join(paths.skills, name);
      if (!fs.existsSync(from) || fs.existsSync(to)) continue;
      // Account skills (reddit, bluesky…) arrive once her human gives her the account.
      const needs = readJSON(path.join(from, 'starter.json'), {}).requires ?? [];
      if (!needs.every((k) => process.env[k])) continue;
      fs.cpSync(from, to, { recursive: true, filter: (src) => path.basename(src) !== 'starter.json' });
      writeJSON(path.join(to, 'meta.json'), { origin: 'starter', learnedAt: new Date().toISOString(), revisions: 0, spent: 0, uses: 0 });
    }
  }

  dir(name) {
    return path.join(paths.skills, name);
  }

  get(name) {
    if (!NAME_RE.test(name)) return null;
    const dir = this.dir(name);
    const tool = readJSON(path.join(dir, 'tool.json'), null);
    if (!tool || !fs.existsSync(path.join(dir, 'index.mjs'))) return null;
    const meta = readJSON(path.join(dir, 'meta.json'), {});
    return { name, description: tool.description, input_schema: tool.input_schema, ...meta };
  }

  list() {
    if (!fs.existsSync(paths.skills)) return [];
    return fs.readdirSync(paths.skills)
      .map((n) => this.get(n))
      .filter(Boolean)
      .sort((a, b) => String(a.learnedAt).localeCompare(String(b.learnedAt)));
  }

  publicList() {
    return this.list().map(({ name, description, origin, learnedAt, revisions, uses, lastUsed, lastError }) =>
      ({ name, description, origin, learnedAt, revisions, uses, lastUsed, lastError: lastError ? clip(lastError, 300) : null }));
  }

  // Tool definitions for the model. Fixed for the length of one wake.
  tools() {
    return this.list().map((s) => ({
      name: s.name,
      description: s.description,
      input_schema: s.input_schema,
      eager_input_streaming: true,
    }));
  }

  nextPrice() {
    return price('skill', this.progress.data.skillsLearned);
  }

  async learn({ name, description, input_schema, code, notes }) {
    if (typeof name !== 'string' || !NAME_RE.test(name)) throw new Error('name must be 2–40 chars: lowercase letters, digits, underscores, starting with a letter.');
    if (this.reserved.has(name)) throw new Error(`"${name}" is one of your built-in abilities; pick another name.`);
    if (typeof description !== 'string' || !description.trim()) throw new Error('description is required — it is how future-you will know when to use this skill.');
    if (!input_schema || typeof input_schema !== 'object' || input_schema.type !== 'object') throw new Error('input_schema must be a JSON Schema object with "type": "object".');
    if (typeof code !== 'string' || !code.trim()) throw new Error('code is required.');
    if (code.length > config.skills.maxCodeChars) throw new Error(`code is too long (max ${config.skills.maxCodeChars} characters).`);
    if (!/export\s+default/.test(code)) throw new Error('code must `export default async function run(input, ctx) { ... }`.');

    const existing = this.get(name);
    const cost = existing ? price('reviseSkill') : this.nextPrice();
    if (!this.ledger.canAfford(cost)) {
      throw new Error(`${existing ? 'Revising' : 'Learning'} a skill costs ${cost} tokens and you have ${this.ledger.balance}. Nothing was charged.`);
    }

    const staging = ensureDir(path.join(paths.home, '.staging'));
    const tmp = path.join(staging, `${name}-${Date.now()}.mjs`);
    fs.writeFileSync(tmp, code);
    const syntaxError = await checkSyntax(tmp);
    if (syntaxError) {
      fs.rmSync(tmp, { force: true });
      throw new Error(`Syntax error — nothing was charged:\n${syntaxError}`);
    }

    this.ledger.spend(cost, existing ? `revised skill "${name}"` : `learned a new skill: "${name}"`);
    const dir = ensureDir(this.dir(name));
    fs.renameSync(tmp, path.join(dir, 'index.mjs'));
    writeJSON(path.join(dir, 'tool.json'), {
      name,
      description: description.trim().slice(0, 4000),
      input_schema: { properties: {}, ...input_schema },
    });
    if (notes) fs.writeFileSync(path.join(dir, 'NOTES.md'), String(notes));
    const meta = existing
      ? { ...readJSON(path.join(dir, 'meta.json'), {}), revisions: (existing.revisions ?? 0) + 1, revisedAt: new Date().toISOString() }
      : { origin: 'learned', learnedAt: new Date().toISOString(), revisions: 0, uses: 0 };
    meta.spent = (meta.spent ?? 0) + cost;
    meta.lastError = null;
    writeJSON(path.join(dir, 'meta.json'), meta);
    if (!existing) {
      this.progress.data.skillsLearned += 1;
      this.progress.save();
    }
    bus.emit('skills', this.publicList());
    return { cost, revised: Boolean(existing) };
  }

  async run(name, input) {
    const skill = this.get(name);
    if (!skill) return { ok: false, text: `You don't know a skill called "${name}".` };
    const dir = this.dir(name);
    const r = await runModule({
      file: path.join(dir, 'index.mjs'),
      mode: 'skill',
      input,
      ctx: { home: paths.home, workspace: paths.workspace, skill: name, now: new Date().toISOString() },
      timeoutMs: config.skills.timeoutSeconds * 1000,
    });
    const meta = readJSON(path.join(dir, 'meta.json'), {});
    meta.uses = (meta.uses ?? 0) + 1;
    meta.lastUsed = new Date().toISOString();
    meta.lastError = r.ok ? null : String(r.error).slice(0, 2000);
    writeJSON(path.join(dir, 'meta.json'), meta);

    let text = r.ok ? (typeof r.result === 'string' ? r.result : JSON.stringify(r.result ?? null, null, 2)) : `Error: ${r.error}`;
    if (r.logs) text += `\n\n[console output]\n${r.logs}`;
    text = scrubSecrets(text);
    appendLog(name, `input: ${clip(JSON.stringify(input), 2000)}\n${r.ok ? 'ok' : 'error'} in ${r.ms}ms\n${clip(text, 8000)}`);
    return { ok: r.ok, text: clip(text, config.skills.maxResultChars), ms: r.ms };
  }

  forget(name) {
    const skill = this.get(name);
    if (!skill) throw new Error(`You don't know a skill called "${name}".`);
    const trash = ensureDir(path.join(paths.home, '.forgotten'));
    fs.renameSync(this.dir(name), path.join(trash, `${name}-${Date.now()}`));
    bus.emit('skills', this.publicList());
  }

  source(name) {
    const skill = this.get(name);
    if (!skill) return null;
    const dir = this.dir(name);
    const read = (f) => (fs.existsSync(path.join(dir, f)) ? fs.readFileSync(path.join(dir, f), 'utf8') : '');
    return {
      ...this.publicList().find((s) => s.name === name),
      input_schema: skill.input_schema,
      notes: scrubSecrets(read('NOTES.md')),
      code: scrubSecrets(read('index.mjs')),
    };
  }
}

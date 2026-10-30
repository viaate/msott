import fs from 'node:fs';
import path from 'node:path';
import { config, paths } from '../config.js';
import { ensureDir, readJSON, writeJSON, clip } from '../store.js';
import { price } from '../ledger.js';
import { bus } from '../bus.js';
import { checkSyntax, runModule, appendLog, scrubSecrets } from './sandbox.js';
import { NAME_RE } from './skills.js';

export const MOTIONS = ['none', 'spin', 'bob', 'pulse', 'twinkle'];
const DEFAULT_COLOR = [232, 220, 198];

export const HOUSE = {
  name: 'house',
  builtin: true,
  plot: [0, 0],
  description: 'Your house: herringbone wood floors, a window, a door to the outside, your bed with the white waffle blanket, a water bowl and your lemon tart toy.',
  motion: 'none',
};

function parseColor(c) {
  if (typeof c === 'number' && Number.isFinite(c)) return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  if (typeof c === 'string') {
    let h = c.trim().replace(/^#/, '');
    if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    if (/^[0-9a-f]{6}$/i.test(h)) return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  if (Array.isArray(c) && c.length >= 3 && c.every((v) => Number.isFinite(v))) {
    const scale = c.slice(0, 3).every((v) => v <= 1) ? 255 : 1;
    return c.slice(0, 3).map((v) => Math.max(0, Math.min(255, Math.round(v * scale))));
  }
  return DEFAULT_COLOR;
}

// Turns whatever Charlie's build() returned into compact dot buffers.
export function normalizePoints(result, { half, maxHeight, maxPoints }) {
  const list = Array.isArray(result) ? result : result?.points;
  if (!Array.isArray(list)) throw new Error('build() must return an array of dots, or { points: [...] }.');
  const warnings = [];
  if (list.length > maxPoints) warnings.push(`returned ${list.length} dots; only the first ${maxPoints} were kept`);
  const n = Math.min(list.length, maxPoints);
  const positions = new Float32Array(n * 3);
  const colors = new Uint8Array(n * 3);
  const sizes = new Uint8Array(n);
  let count = 0;
  let clamped = 0;
  let skipped = 0;
  const clampv = (v, lo, hi) => {
    if (v < lo || v > hi) clamped++;
    return Math.max(lo, Math.min(hi, v));
  };
  for (let i = 0; i < n; i++) {
    const p = list[i];
    let x, y, z, color, size;
    if (Array.isArray(p)) [x, y, z, color, size] = p;
    else if (p && typeof p === 'object') ({ x, y, z, color = p.c, size = p.s } = p);
    if (![x, y, z].every((v) => typeof v === 'number' && Number.isFinite(v))) {
      skipped++;
      continue;
    }
    positions[count * 3] = clampv(x, -half, half);
    positions[count * 3 + 1] = clampv(y, 0, maxHeight);
    positions[count * 3 + 2] = clampv(z, -half, half);
    colors.set(parseColor(color), count * 3);
    const s = typeof size === 'number' && Number.isFinite(size) ? size : 0.08;
    sizes[count] = Math.round(Math.max(0.02, Math.min(0.4, s)) * 500);
    count++;
  }
  if (skipped) warnings.push(`${skipped} dots had non-numeric coordinates and were skipped`);
  if (clamped) warnings.push(`${clamped} coordinates were outside the plot and got clamped`);
  if (!count) throw new Error('build() returned no usable dots.');
  return { count, positions: positions.subarray(0, count * 3), colors: colors.subarray(0, count * 3), sizes: sizes.subarray(0, count), warnings };
}

// Binary layout: u32 count, u32 version, f32 xyz * n, u8 rgb * n, u8 size * n.
export function encodePoints({ count, positions, colors, sizes }) {
  const buf = Buffer.alloc(8 + count * 12 + count * 4);
  buf.writeUInt32LE(count, 0);
  buf.writeUInt32LE(1, 4);
  Buffer.from(positions.buffer, positions.byteOffset, count * 12).copy(buf, 8);
  Buffer.from(colors.buffer, colors.byteOffset, count * 3).copy(buf, 8 + count * 12);
  Buffer.from(sizes.buffer, sizes.byteOffset, count).copy(buf, 8 + count * 15);
  return buf;
}

const key = ([x, z]) => `${x},${z}`;

// Charlie's world is a grid of plots. The house is plot [0,0]; every build is
// code she wrote that returns dots, placed on a free plot next to the others.
export class World {
  constructor({ ledger, progress }) {
    this.ledger = ledger;
    this.progress = progress;
    this.refreshing = false;
  }

  init() {
    ensureDir(paths.world);
  }

  dir(name) {
    return path.join(paths.world, name);
  }

  get(name) {
    if (name === 'house') return HOUSE;
    if (!NAME_RE.test(name ?? '')) return null;
    const meta = readJSON(path.join(this.dir(name), 'meta.json'), null);
    return meta ? { name, ...meta } : null;
  }

  list() {
    const built = fs.existsSync(paths.world)
      ? fs.readdirSync(paths.world).map((n) => this.get(n)).filter(Boolean)
      : [];
    return [HOUSE, ...built.sort((a, b) => String(a.builtAt).localeCompare(String(b.builtAt)))];
  }

  publicList() {
    return this.list().map(({ name, builtin, plot, description, link, motion, count, status, error, builtAt, version, refreshMinutes, actions }) =>
      ({ name, builtin: Boolean(builtin), plot, description, link: link || null, motion: motion || 'none', count: count || 0, status: status || 'ok', error: error ? clip(error, 300) : null, builtAt, version: version || 0, refreshMinutes: refreshMinutes || null, actions: actions || [] }));
  }

  occupied() {
    return new Set(this.list().map((o) => key(o.plot)));
  }

  buildable() {
    const occ = this.occupied();
    const out = new Map();
    for (const k of occ) {
      const [x, z] = k.split(',').map(Number);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const p = [x + dx, z + dz];
        if (!occ.has(key(p))) out.set(key(p), p);
      }
    }
    // Nearest first; among equals, plots on the camera's side of the house (+x/+z) first.
    return [...out.values()].sort((a, b) => (Math.hypot(...a) - Math.hypot(...b)) || (b[0] + b[1] - a[0] - a[1]) || (b[0] - a[0]));
  }

  nextPrice() {
    return price('build', this.progress.data.buildsMade);
  }

  async build({ name, description, code, plot, link, motion = 'none', refresh_minutes, actions }) {
    if (typeof name !== 'string' || !NAME_RE.test(name) || name === 'house') throw new Error('name must be 2–40 chars of lowercase letters, digits and underscores (and not "house").');
    if (typeof description !== 'string' || !description.trim()) throw new Error('description is required — visitors see it when they hover your build.');
    if (typeof code !== 'string' || !/export\s+default/.test(code)) throw new Error('code must `export default function build(ctx) { return [...dots] }`.');
    if (code.length > config.skills.maxCodeChars) throw new Error('code is too long.');
    if (!MOTIONS.includes(motion)) throw new Error(`motion must be one of: ${MOTIONS.join(', ')}.`);
    if (link != null && link !== '') {
      try {
        const u = new URL(link);
        if (!['http:', 'https:'].includes(u.protocol)) throw new Error();
      } catch {
        throw new Error('link must be an http(s) URL.');
      }
    }
    if (actions != null && (!Array.isArray(actions) || actions.length > 3 || !actions.every((a) => typeof a === 'string' && a.trim() && a.length <= 40))) {
      throw new Error('actions must be a list of up to 3 short labels (≤ 40 characters), e.g. ["ring the bell"].');
    }
    let refreshMinutes = null;
    if (refresh_minutes != null) {
      refreshMinutes = Math.round(Number(refresh_minutes));
      if (!(refreshMinutes >= config.world.minRefreshMinutes)) throw new Error(`refresh_minutes must be at least ${config.world.minRefreshMinutes}.`);
    }

    const existing = this.get(name);
    let target = existing?.plot;
    if (plot != null) {
      if (!Array.isArray(plot) || plot.length !== 2 || !plot.every(Number.isInteger)) throw new Error('plot must be [x, z] integers.');
      if (!existing || key(plot) !== key(existing.plot)) {
        if (!this.buildable().some((p) => key(p) === key(plot))) {
          throw new Error(`Plot [${plot}] isn't free next to your world. Free plots: ${this.buildable().map((p) => `[${p}]`).join(' ')}`);
        }
      }
      target = plot;
    }
    target ??= this.buildable()[0];

    const cost = existing ? price('rebuild') : this.nextPrice();
    if (!this.ledger.canAfford(cost)) throw new Error(`${existing ? 'Rebuilding' : 'Building'} costs ${cost} tokens and you have ${this.ledger.balance}. Nothing was charged.`);

    const dir = ensureDir(this.dir(name));
    const tmp = path.join(dir, `build.${Date.now()}.mjs`);
    fs.writeFileSync(tmp, code);
    const syntaxError = await checkSyntax(tmp);
    if (syntaxError) {
      fs.rmSync(tmp, { force: true });
      if (!existing) fs.rmSync(dir, { recursive: true, force: true });
      throw new Error(`Syntax error — nothing was charged:\n${syntaxError}`);
    }

    this.ledger.spend(cost, existing ? `rebuilt "${name}"` : `built "${name}" on plot [${target}]`);
    fs.renameSync(tmp, path.join(dir, 'build.mjs'));
    const meta = {
      ...(existing ?? {}),
      plot: target,
      description: description.trim().slice(0, 600),
      link: link || null,
      motion,
      refreshMinutes,
      actions: actions?.map((a) => a.trim()) ?? existing?.actions ?? [],
      builtAt: existing?.builtAt ?? new Date().toISOString(),
      spent: (existing?.spent ?? 0) + cost,
    };
    delete meta.name;
    writeJSON(path.join(dir, 'meta.json'), meta);
    if (!existing) {
      this.progress.data.buildsMade += 1;
      this.progress.save();
    }
    const r = await this.generate(name);
    return { cost, plot: target, rebuilt: Boolean(existing), ...r };
  }

  // Runs the build code and stores the dots. Keeps the previous dots on failure.
  async generate(name) {
    const dir = this.dir(name);
    const meta = readJSON(path.join(dir, 'meta.json'), {});
    const { plotSize, maxPointsPerBuild, maxHeight, buildTimeoutSeconds } = config.world;
    const r = await runModule({
      file: path.join(dir, 'build.mjs'),
      mode: 'build',
      ctx: { name, seed: Math.floor(Math.random() * 2 ** 31), plotSize, maxPoints: maxPointsPerBuild, maxHeight, now: new Date().toISOString(), home: paths.home },
      timeoutMs: buildTimeoutSeconds * 1000,
    });
    let outcome;
    try {
      if (!r.ok) throw new Error(r.error);
      const pts = normalizePoints(r.result, { half: plotSize / 2 - 0.25, maxHeight, maxPoints: maxPointsPerBuild });
      fs.writeFileSync(path.join(dir, 'points.bin'), encodePoints(pts));
      Object.assign(meta, { count: pts.count, status: 'ok', error: null, version: (meta.version ?? 0) + 1, generatedAt: new Date().toISOString() });
      outcome = { ok: true, count: pts.count, warnings: pts.warnings, logs: r.logs };
    } catch (err) {
      const error = scrubSecrets(String(err.message || err));
      Object.assign(meta, { status: meta.count ? 'ok' : 'broken', error });
      outcome = { ok: false, error, logs: r.logs };
    }
    writeJSON(path.join(dir, 'meta.json'), meta);
    appendLog(`build-${name}`, outcome.ok ? `ok: ${outcome.count} dots ${outcome.warnings.join('; ')}\n${r.logs}` : `error: ${outcome.error}\n${r.logs}`);
    bus.emit('world', { objects: this.publicList(), changed: name, buildable: this.buildable() });
    return outcome;
  }

  pointsFile(name) {
    const f = path.join(this.dir(name), 'points.bin');
    return NAME_RE.test(name) && fs.existsSync(f) ? f : null;
  }

  demolish(name) {
    if (name === 'house') throw new Error("You can't demolish your house.");
    const obj = this.get(name);
    if (!obj) throw new Error(`There's nothing called "${name}" in your world.`);
    const trash = ensureDir(path.join(paths.home, '.demolished'));
    fs.renameSync(this.dir(name), path.join(trash, `${name}-${Date.now()}`));
    bus.emit('world', { objects: this.publicList(), changed: name, buildable: this.buildable() });
  }

  // Re-runs builds that asked to refresh on a schedule.
  async refreshDue() {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      for (const obj of this.list()) {
        if (!obj.refreshMinutes || obj.builtin) continue;
        const last = Date.parse(obj.generatedAt || obj.builtAt || 0);
        if (Date.now() - last >= obj.refreshMinutes * 60_000) await this.generate(obj.name);
      }
    } finally {
      this.refreshing = false;
    }
  }

  startRefreshLoop() {
    setInterval(() => this.refreshDue(), 60_000).unref();
  }
}

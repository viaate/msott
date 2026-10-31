import fs from 'node:fs';
import path from 'node:path';
import { config, paths } from '../config.js';
import { ensureDir, readJSON, writeJSON, clip } from '../store.js';
import { price } from '../ledger.js';
import { bus } from '../bus.js';
import { checkSyntax, runModule, appendLog, scrubSecrets } from './sandbox.js';
import { NAME_RE } from './skills.js';

export const MOTIONS = ['none', 'spin', 'bob', 'pulse', 'twinkle'];
// Where on a plot a build sits: all of it, or one quarter (shown at half size).
// North is −z and east is +x; her front door faces west.
export const SPOTS = ['whole', 'nw', 'ne', 'sw', 'se'];
const spotOf = (o) => o.spot || 'whole';
export const placeLabel = (plot, spot = 'whole') => `[${plot}]${spot === 'whole' ? '' : ` (${spot} quarter)`}`;
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

// Turns whatever Charlie's build() returned into compact dot buffers: one
// list of dots, or { frames: [dots, dots, ...], fps } for something that moves.
export function normalizePoints(result, { half, maxHeight, maxPoints, maxFrames = 1 }) {
  let frames = Array.isArray(result?.frames) ? result.frames : [Array.isArray(result) ? result : result?.points];
  if (!frames.length || !frames.every(Array.isArray)) throw new Error('build() must return an array of dots, { points: [...] }, or { frames: [[...], [...]], fps }.');
  const warnings = [];
  if (frames.length > maxFrames) {
    warnings.push(`returned ${frames.length} frames; only the first ${maxFrames} were kept`);
    frames = frames.slice(0, maxFrames);
  }
  const total = frames.reduce((s, f) => s + f.length, 0);
  if (total > maxPoints) warnings.push(`returned ${total} dots${frames.length > 1 ? ' across all frames' : ''}; only the first ${maxPoints} were kept`);
  const n = Math.min(total, maxPoints);
  const positions = new Float32Array(n * 3);
  const colors = new Uint8Array(n * 3);
  const sizes = new Uint8Array(n);
  const frameOf = new Uint8Array(n);
  let count = 0;
  let clamped = 0;
  let skipped = 0;
  const clampv = (v, lo, hi) => {
    if (v < lo || v > hi) clamped++;
    return Math.max(lo, Math.min(hi, v));
  };
  const list = frames.flatMap((f, fi) => f.map((p) => [fi, p])).slice(0, n);
  for (let i = 0; i < n; i++) {
    const [fi, p] = list[i];
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
    frameOf[count] = fi;
    count++;
  }
  if (skipped) warnings.push(`${skipped} dots had non-numeric coordinates and were skipped`);
  if (clamped) warnings.push(`${clamped} coordinates were outside the plot and got clamped`);
  if (!count) throw new Error('build() returned no usable dots.');
  const out = { count, positions: positions.subarray(0, count * 3), colors: colors.subarray(0, count * 3), sizes: sizes.subarray(0, count), frames: 1, fps: null, warnings };
  if (frames.length > 1) {
    const fps = Number(result.fps);
    Object.assign(out, { frame: frameOf.subarray(0, count), frames: frames.length, fps: Number.isFinite(fps) ? Math.max(1, Math.min(30, fps)) : 8 });
  }
  return out;
}

// Binary layout: u32 count, u32 version, f32 xyz * n, u8 rgb * n, u8 size * n,
// and in version 2 (builds that move) u8 frame * n.
export function encodePoints({ count, positions, colors, sizes, frame }) {
  const buf = Buffer.alloc(8 + count * 12 + count * 4 + (frame ? count : 0));
  buf.writeUInt32LE(count, 0);
  buf.writeUInt32LE(frame ? 2 : 1, 4);
  Buffer.from(positions.buffer, positions.byteOffset, count * 12).copy(buf, 8);
  Buffer.from(colors.buffer, colors.byteOffset, count * 3).copy(buf, 8 + count * 12);
  Buffer.from(sizes.buffer, sizes.byteOffset, count).copy(buf, 8 + count * 15);
  if (frame) Buffer.from(frame.buffer, frame.byteOffset, count).copy(buf, 8 + count * 16);
  return buf;
}

const key = ([x, z]) => `${x},${z}`;

function checkPlace({ plot, spot, scale }) {
  if (plot != null && (!Array.isArray(plot) || plot.length !== 2 || !plot.every(Number.isInteger))) throw new Error('plot must be [x, z] integers.');
  if (spot != null && !SPOTS.includes(spot)) throw new Error(`spot must be one of: ${SPOTS.join(', ')}.`);
  if (scale != null && !(Number(scale) >= 0.25 && Number(scale) <= 1)) throw new Error('scale must be between 0.25 and 1.');
}

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
    return this.list().map(({ name, builtin, origin, plot, spot, scale, description, link, motion, count, frames, fps, status, error, builtAt, version, refreshMinutes, actions }) =>
      ({ name, builtin: Boolean(builtin), starter: origin === 'starter', plot, spot: spot || 'whole', scale: scale || 1, description, link: link || null, motion: motion || 'none', count: count || 0, frames: frames || 1, fps: fps || null, status: status || 'ok', error: error ? clip(error, 300) : null, builtAt, version: version || 0, refreshMinutes: refreshMinutes || null, actions: actions || [] }));
  }

  at(plot) {
    return this.list().find((o) => key(o.plot) === key(plot)) ?? null;
  }

  // Everything on a plot, leaving one build out.
  on(plot, except) {
    return this.list().filter((o) => o.name !== except && key(o.plot) === key(plot));
  }

  // Can a build go here? A plot already in her world takes it in any spot
  // nothing else covers; a new plot has to touch her world.
  fits(plot, spot, except) {
    const here = this.on(plot, except);
    if (!here.length) return this.buildable(except).some((p) => key(p) === key(plot));
    return spot !== 'whole' && here.every((o) => spotOf(o) !== 'whole' && spotOf(o) !== spot);
  }

  // Free quarters on plots that are already split up.
  freeQuarters(except) {
    const out = [];
    const seen = new Set();
    for (const o of this.list()) {
      if (o.name === except || seen.has(key(o.plot))) continue;
      seen.add(key(o.plot));
      for (const q of SPOTS.slice(1)) if (spotOf(o) !== 'whole' && this.fits(o.plot, q, except)) out.push(placeLabel(o.plot, q));
    }
    return out;
  }

  freeText(except) {
    const quarters = this.freeQuarters(except);
    return `Free plots: ${this.buildable(except).map((p) => `[${p}]`).join(' ')}${quarters.length ? `. Free quarters: ${quarters.join(', ')}` : ''}`;
  }

  // How far she can wander: a couple of plots past the edge of her world.
  reach() {
    return 2 + Math.max(1, ...this.list().map((o) => Math.max(Math.abs(o.plot[0]), Math.abs(o.plot[1]))));
  }

  // `except` leaves one build out, for working out where it could go instead.
  occupied(except) {
    return new Set(this.list().filter((o) => o.name !== except).map((o) => key(o.plot)));
  }

  buildable(except) {
    const occ = this.occupied(except);
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

  async build({ name, description, code, plot, spot, scale, link, motion = 'none', refresh_minutes, actions, replaces }) {
    if (typeof name !== 'string' || !NAME_RE.test(name) || name === 'house') throw new Error('name must be 2–40 chars of lowercase letters, digits and underscores (and not "house").');
    if (typeof description !== 'string' || !description.trim()) throw new Error('description is required — visitors see it when they hover your build.');
    if (typeof code !== 'string' || !/export\s+default/.test(code)) throw new Error('code must `export default function build(ctx) { return [...dots] }`.');
    if (code.length > config.skills.maxCodeChars) throw new Error('code is too long.');
    if (!MOTIONS.includes(motion)) throw new Error(`motion must be one of: ${MOTIONS.join(', ')}.`);
    checkPlace({ spot, scale });
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
    // A replacement takes the old build's plot, and the old one is demolished.
    let old = null;
    if (replaces != null && replaces !== name) {
      old = this.get(String(replaces));
      if (!old || old.builtin) throw new Error(`You don't have a build called "${replaces}" to replace.`);
      if (existing) throw new Error(`You already have a build called "${name}". Pick a new name, or leave out replaces to rebuild it.`);
    }
    const prev = existing ?? old;
    let target = prev?.plot;
    const where = spot ?? (prev ? spotOf(prev) : 'whole');
    if (plot != null) {
      checkPlace({ plot });
      target = plot;
    }
    if (old && (key(target) !== key(old.plot) || where !== spotOf(old))) {
      throw new Error(`A replacement takes the place of the build it replaces, ${placeLabel(old.plot, spotOf(old))}. Leave out plot and spot, or move it afterwards with move_build.`);
    }
    target ??= this.buildable()[0];
    const moved = !prev || key(target) !== key(prev.plot) || where !== spotOf(prev);
    if (!old && moved && !this.fits(target, where, name)) throw new Error(`${placeLabel(target, where)} isn't free. ${this.freeText(name)}`);

    const cost = existing || old ? price('rebuild') : this.nextPrice();
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

    this.ledger.spend(cost, existing ? `rebuilt "${name}"` : old ? `replaced "${old.name}" with "${name}"` : `built "${name}" on plot [${target}]`);
    if (old) this.demolish(old.name);
    fs.renameSync(tmp, path.join(dir, 'build.mjs'));
    const meta = {
      ...(existing ?? {}),
      plot: target,
      spot: where,
      scale: Number(scale ?? existing?.scale ?? 1),
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
    if (!existing && !old) {
      this.progress.data.buildsMade += 1;
      this.progress.save();
    }
    const r = await this.generate(name);
    return { cost, plot: target, spot: where, rebuilt: Boolean(existing), replaced: old?.name ?? null, ...r };
  }

  // Runs the build code and stores the dots. Keeps the previous dots on failure.
  async generate(name) {
    const dir = this.dir(name);
    const meta = readJSON(path.join(dir, 'meta.json'), {});
    const { plotSize, maxPointsPerBuild, maxHeight, maxFrames, buildTimeoutSeconds } = config.world;
    const r = await runModule({
      file: path.join(dir, 'build.mjs'),
      mode: 'build',
      ctx: { name, seed: Math.floor(Math.random() * 2 ** 31), plotSize, maxPoints: maxPointsPerBuild, maxHeight, maxFrames, now: new Date().toISOString(), home: paths.home },
      timeoutMs: buildTimeoutSeconds * 1000,
    });
    let outcome;
    try {
      if (!r.ok) throw new Error(r.error);
      const pts = normalizePoints(r.result, { half: plotSize / 2 - 0.25, maxHeight, maxPoints: maxPointsPerBuild, maxFrames });
      fs.writeFileSync(path.join(dir, 'points.bin'), encodePoints(pts));
      Object.assign(meta, { count: pts.count, frames: pts.frames, fps: pts.fps, status: 'ok', error: null, version: (meta.version ?? 0) + 1, generatedAt: new Date().toISOString() });
      outcome = { ok: true, count: pts.count, frames: pts.frames, warnings: pts.warnings, logs: r.logs };
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

  // Moving and resizing are free, so she can rearrange her world whenever she
  // likes. Into another build's exact place, the two swap.
  move(name, { plot, spot, scale } = {}) {
    if (name === 'house') throw new Error('Your house stays where it is.');
    const obj = this.get(name);
    if (!obj) throw new Error(`There's nothing called "${name}" in your world.`);
    checkPlace({ plot, spot, scale });
    const to = plot ?? obj.plot;
    const where = spot ?? spotOf(obj);
    const moving = key(to) !== key(obj.plot) || where !== spotOf(obj);
    if (!moving && scale == null) throw new Error(`"${name}" is already at ${placeLabel(to, where)}.`);
    let other = null;
    if (moving) {
      other = this.on(to, name).find((o) => spotOf(o) === where) ?? null;
      if (other?.builtin) throw new Error(`Plot [${to}] is your house.`);
      if (!other && !this.fits(to, where, name)) throw new Error(`${placeLabel(to, where)} isn't free. ${this.freeText(name)}, or any other build's place to swap.`);
    }
    const update = (n, patch) => {
      const file = path.join(this.dir(n), 'meta.json');
      writeJSON(file, { ...readJSON(file, {}), ...patch });
    };
    update(name, { plot: to, spot: where, ...(scale != null ? { scale: Number(scale) } : {}) });
    if (other) update(other.name, { plot: obj.plot, spot: spotOf(obj) });
    bus.emit('world', { objects: this.publicList(), changed: name, buildable: this.buildable() });
    return { from: placeLabel(obj.plot, spotOf(obj)), to: placeLabel(to, where), scale: Number(scale ?? obj.scale ?? 1), moved: moving, swapped: other?.name ?? null };
  }

  // Her world starts with a few places to go besides her house. Each one is
  // planted once; after that it's hers to keep, move, replace or demolish.
  async plantStarters() {
    const planted = new Set(this.progress.data.startersPlanted ?? []);
    for (const s of config.starterBuilds ?? []) {
      const from = path.join(paths.starter, 'builds', `${s.name}.mjs`);
      if (planted.has(s.name) || !fs.existsSync(from)) continue;
      planted.add(s.name);
      this.progress.data.startersPlanted = [...planted];
      this.progress.save();
      if (this.get(s.name)) continue;
      const plot = this.fits(s.plot, 'whole') ? s.plot : this.buildable()[0];
      const dir = ensureDir(this.dir(s.name));
      fs.copyFileSync(from, path.join(dir, 'build.mjs'));
      writeJSON(path.join(dir, 'meta.json'), {
        origin: 'starter', plot, spot: 'whole', scale: 1, description: s.description, link: null,
        motion: s.motion ?? 'none', refreshMinutes: null, actions: s.actions ?? [], builtAt: new Date().toISOString(), spent: 0,
      });
      await this.generate(s.name);
    }
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

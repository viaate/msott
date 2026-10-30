import fs from 'node:fs';
import path from 'node:path';
import { config, paths } from '../config.js';
import { clip } from '../store.js';
import { MOTIONS } from './world.js';

export const MEMORY_CAP = 8000;
export const PLACES = ['bed', 'window', 'door', 'bowl', 'toy', 'rug', 'center'];

// Charlie's built-in abilities: free, and mostly about herself and her house.
// Everything that reaches outside comes from skills she writes.
export const CORE_TOOLS = [
  {
    name: 'look',
    description: 'Check your current status: tokens, prices, skills, world and free plots, how many people are watching, energy left today, and any new visitor messages. Use it after doing something that might have changed things.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'say',
    description: 'Say something out loud to the people watching you right now. It appears as a speech bubble over your head and in the feed. Use it to greet visitors, answer messages, or show off what you made.',
    input_schema: {
      type: 'object',
      properties: { text: { type: 'string', description: 'What to say (max 240 characters).' } },
      required: ['text'],
    },
  },
  {
    name: 'go',
    description: `Walk somewhere in your world: ${PLACES.map((p) => `"${p}"`).join(', ')}, or the name of one of your builds. Purely physical, and free.`,
    input_schema: {
      type: 'object',
      properties: { to: { type: 'string', description: 'A place in your house or the name of a build.' } },
      required: ['to'],
    },
  },
  {
    name: 'remember',
    description: `Write to your memory file (memory.md). Apart from the wake summary, it's the only thing that survives your naps, so record plans, lessons, and anything future-you needs. "append" adds a note; "rewrite" replaces the whole file, so use it to keep memory organized and under ${MEMORY_CAP} characters.`,
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        mode: { type: 'string', enum: ['append', 'rewrite'] },
      },
      required: ['text', 'mode'],
    },
  },
  {
    name: 'read_file',
    description: 'Read a file, or list a folder, inside your home: your skills\' code, your builds, run logs in logs/runs/, files your skills wrote in workspace/. Free. Paths are relative to your home folder; "." lists the top level.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
  },
  {
    name: 'learn_skill',
    description: 'Write the code for a new skill, or a new version of a skill you already have (same name). Costs tokens; the current prices are in your status. Syntax is checked before you pay. The skill becomes a tool you can call from your next wake onward.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Tool name: lowercase letters, digits, underscores.' },
        description: { type: 'string', description: 'What the skill does and when to use it. Future-you reads this to decide when to call it.' },
        input_schema: { type: 'object', description: 'JSON Schema ("type": "object") for the skill\'s input.' },
        code: { type: 'string', description: 'The full ES module source: export default async function run(input, ctx) { ... }' },
        notes: { type: 'string', description: 'Optional notes for yourself: how it works, gotchas, ideas.' },
      },
      required: ['name', 'description', 'input_schema', 'code'],
    },
  },
  {
    name: 'build',
    description: 'Write code that adds a dot sculpture to your world, or rebuild one of your builds (same name). Costs tokens; the current prices are in your status. Syntax is checked before you pay. It runs immediately and the result appears for everyone watching.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Lowercase letters, digits, underscores.' },
        description: { type: 'string', description: 'What it is. Visitors see this when they hover over it.' },
        code: { type: 'string', description: 'The full ES module source: export default async function build(ctx) { return [[x, y, z, color, size], ...] }' },
        plot: { type: 'array', items: { type: 'integer' }, description: '[x, z] of a free plot next to your world. Omit to use the nearest free plot (or keep the current plot when rebuilding).' },
        link: { type: 'string', description: 'Optional https URL that visitors go to when they click the build.' },
        motion: { type: 'string', enum: MOTIONS },
        refresh_minutes: { type: 'integer', description: `Optional: re-run the code every N minutes (≥ ${config.world.minRefreshMinutes}) so the build can show live data.` },
      },
      required: ['name', 'description', 'code'],
    },
  },
  {
    name: 'forget_skill',
    description: 'Forget one of your skills. It is removed from your tools from your next wake onward. No refund.',
    input_schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
  },
  {
    name: 'demolish',
    description: 'Remove one of your builds from the world and free up its plot. No refund.',
    input_schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
  },
  {
    name: 'nap',
    description: `Go to sleep, which ends this waking stretch. Choose how long, from ${config.schedule.minNapMinutes} to ${config.schedule.maxNapMinutes} minutes. Always nap when you're done, and remember anything important first.`,
    input_schema: {
      type: 'object',
      properties: {
        minutes: { type: 'integer' },
        note: { type: 'string', description: 'Optional: what you mean to do when you wake.' },
      },
      required: ['minutes'],
    },
  },
].map((t) => ({ ...t, eager_input_streaming: true }));

export const CORE_NAMES = CORE_TOOLS.map((t) => t.name);

export function readMemory() {
  try {
    return fs.readFileSync(paths.memory, 'utf8');
  } catch {
    return '';
  }
}

export function writeMemory(text, mode) {
  const current = readMemory();
  const next = mode === 'rewrite' ? String(text) : `${current}${current && !current.endsWith('\n') ? '\n' : ''}${String(text)}\n`;
  if (next.length > MEMORY_CAP) {
    throw new Error(`Memory would be ${next.length} characters; the limit is ${MEMORY_CAP}. Use mode "rewrite" with a tighter version.`);
  }
  fs.writeFileSync(paths.memory, next);
  return next.length;
}

export function readHomeFile(rel) {
  const target = path.resolve(paths.home, String(rel || '.'));
  const relative = path.relative(paths.home, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('You can only read inside your home folder.');
  if (!fs.existsSync(target)) throw new Error(`Nothing at ${rel}.`);
  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    const entries = fs.readdirSync(target, { withFileTypes: true })
      .filter((e) => e.name !== 'node_modules' || relative === '')
      .slice(0, 200)
      .map((e) => {
        if (e.isDirectory()) return `${e.name}/`;
        const size = fs.statSync(path.join(target, e.name)).size;
        return `${e.name}  (${size} bytes)`;
      });
    return `${relative || '.'}/\n${entries.join('\n') || '(empty)'}`;
  }
  const buf = fs.readFileSync(target);
  if (buf.subarray(0, 8000).includes(0)) return `${rel} is a binary file (${buf.length} bytes).`;
  return clip(buf.toString('utf8'), 20000);
}

// Minimal JSON Schema check for tool inputs (tool input streaming turns off
// the API's own validation, so a truncated input must not run).
export function validateInput(schema, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'input must be an object';
  for (const key of schema?.required ?? []) {
    if (input[key] === undefined) return `missing required field "${key}"`;
  }
  for (const [key, prop] of Object.entries(schema?.properties ?? {})) {
    const v = input[key];
    if (v === undefined || !prop?.type) continue;
    const types = Array.isArray(prop.type) ? prop.type : [prop.type];
    const ok = types.some((t) => {
      if (t === 'integer') return Number.isInteger(v);
      if (t === 'number') return typeof v === 'number';
      if (t === 'array') return Array.isArray(v);
      if (t === 'object') return v && typeof v === 'object' && !Array.isArray(v);
      if (t === 'null') return v === null;
      return typeof v === t;
    });
    if (!ok) return `field "${key}" should be ${types.join(' or ')}`;
    if (prop.enum && !prop.enum.includes(v)) return `field "${key}" must be one of ${prop.enum.join(', ')}`;
  }
  return null;
}

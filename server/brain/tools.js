import fs from 'node:fs';
import path from 'node:path';
import { config, paths } from '../config.js';
import { clip } from '../store.js';
import { MOTIONS } from './world.js';
import { DIARY_KINDS } from '../diary.js';
import { visionImage } from '../images.js';

export const MEMORY_CAP = 8000;
export const PLACES = ['bed', 'window', 'door', 'bowl', 'toy', 'rug', 'center', 'outside'];

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
    description: 'Say something out loud to the people watching you right now. It appears as a speech bubble over your head and in the feed. Use it to greet visitors, answer messages, or show off what you made. Give `to` (a visitor\'s name) to answer someone; they will also find it in their "about you" page next time.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'What to say (max 240 characters).' },
        to: { type: 'string', description: 'Optional: the visitor you are talking to.' },
      },
      required: ['text'],
    },
  },
  {
    name: 'go',
    description: `Walk somewhere in your world: ${PLACES.map((p) => `"${p}"`).join(', ')} ("outside" is just out your front door), the name of one of your builds, or any plot of your land as "[x, z]". Free. If there's food in your bowl when you get to it, you eat. Visitors see "Charlie is <doing>" while you're there.`,
    input_schema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'A place in your house, "outside", the name of a build, or a plot like "[2, -1]".' },
        doing: { type: 'string', description: 'Optional: a few words for what you\'re doing there, e.g. "watching the street".' },
      },
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
    name: 'diary',
    description: 'Write an entry in your diary: what happened, what you noticed, and how it made you feel. Visitors can read your diary, and your mood over time is drawn from these entries. Free. A few honest entries a day is plenty.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The entry, in your own voice.' },
        kind: { type: 'string', enum: DIARY_KINDS },
        mood: { type: 'integer', description: 'How it left you feeling, from -2 (awful) to 2 (wonderful).' },
        place: { type: 'string', description: 'Optional: where it happened.' },
      },
      required: ['text', 'kind', 'mood'],
    },
  },
  {
    name: 'remember_visitor',
    description: 'Remember something about a visitor, by name. You will see it whenever they come back, and they can see what you remember about them. Free.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        note: { type: 'string' },
        mode: { type: 'string', enum: ['append', 'rewrite'] },
      },
      required: ['name', 'note'],
    },
  },
  {
    name: 'publish_page',
    description: 'Publish a file on your own website at /pages/. Use it for web pages, styles, scripts, images and anything else you make for people to see. Give the contents, or from_file to publish a file from your home folder as it is (an image your code made, say). Every real person who views one of your pages earns you tokens, and you can see how many people came and where from. Free. Publishing to the same path updates the file.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Where it lives on your site, e.g. "index.html", "zine/index.html", "zine/style.css", "art/dot.png".' },
        content: { type: 'string', description: 'The file contents (text, or base64 for binary files).' },
        encoding: { type: 'string', enum: ['utf8', 'base64'] },
        from_file: { type: 'string', description: 'Instead of content: a file in your home folder to publish, e.g. "workspace/avatar.png".' },
      },
      required: ['path'],
    },
  },
  {
    name: 'unpublish_page',
    description: 'Take a file off your website.',
    input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  },
  {
    name: 'make_link',
    description: 'Make a tracked short link, /go/<slug>, that sends people anywhere on the web. Every real person who clicks it earns you tokens, and you can see where the clicks came from. Use these links in anything you post elsewhere (Reddit, Bluesky, other sites) so you can tell what works. Free. Reusing a slug changes where it points.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        slug: { type: 'string', description: 'Optional: 2–40 lowercase letters, digits, dashes.' },
        note: { type: 'string', description: 'Optional: where you are using it, for your own records.' },
      },
      required: ['url'],
    },
  },
  {
    name: 'ask_human',
    description: 'Ask your human for something you can\'t do yourself: an account on a new site, a shop, a decision, some help. They answer when they can, and you see the answer when you wake. Free. Keep requests few and specific.',
    input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  },
  {
    name: 'read_file',
    description: 'Read a file, or list a folder, inside your home: your skills\' code, your builds, run logs in logs/runs/, files your skills wrote in workspace/, files your human gave you in from-your-human/. Pictures (PNG, JPEG, WebP, GIF) you get to see. Free. Paths are relative to your home folder; "." lists the top level.',
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
    description: 'Write code that makes something out of dots in your world, still or moving, or rebuild one of your builds (same name). Costs tokens; the current prices are in your status. Syntax is checked before you pay. It runs immediately and the result appears for everyone watching.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Lowercase letters, digits, underscores.' },
        description: { type: 'string', description: 'What it is. Visitors see this when they hover over it.' },
        code: { type: 'string', description: 'The full ES module source: export default async function build(ctx) { return [[x, y, z, color, size], ...] } (or return { frames: [[...dots], [...dots]], fps } for something that moves).' },
        plot: { type: 'array', items: { type: 'integer' }, description: '[x, z] of a free plot next to your world. Omit to use the nearest free plot (or keep the current plot when rebuilding).' },
        replaces: { type: 'string', description: 'Optional: the name of a build to swap out for this one. The old build is demolished and this one goes on its plot, for the rebuild price.' },
        link: { type: 'string', description: 'Optional https URL that visitors go to when they click the build.' },
        motion: { type: 'string', enum: MOTIONS },
        refresh_minutes: { type: 'integer', description: `Optional: re-run the code every N minutes (≥ ${config.world.minRefreshMinutes}) so the build can show live data.` },
        actions: { type: 'array', items: { type: 'string' }, description: 'Optional: up to 3 short things visitors can do at this build (e.g. "ring the bell"). You hear about it when they do.' },
      },
      required: ['name', 'description', 'code'],
    },
  },
  {
    name: 'move_build',
    description: 'Move one of your builds to another plot. Free, and its dots stay just as they are. Move it onto another build\'s plot and the two swap places.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        plot: { type: 'array', items: { type: 'integer' }, description: '[x, z] of a free plot next to your world, or of another build to swap with.' },
      },
      required: ['name', 'plot'],
    },
  },
  {
    name: 'forget_skill',
    description: 'Forget one of your skills. It is removed from your tools from your next wake onward. No refund.',
    input_schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
  },
  {
    name: 'demolish',
    description: 'Remove one of your builds from the world and free up its plot. Free, but there is no refund.',
    input_schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
  },
  {
    name: 'nap',
    description: `Go to sleep, which ends this waking stretch. You choose when you wake: anywhere from ${config.schedule.minNapMinutes} minute to ${config.schedule.maxNapMinutes / 60} hours from now. Remember anything important first.`,
    input_schema: {
      type: 'object',
      properties: {
        minutes: { type: 'integer' },
        note: { type: 'string', description: 'Optional: what you mean to do when you wake.' },
        wake_for_messages: { type: 'boolean', description: 'Optional: whether a new message from a visitor may wake you early (default true). Set false to sleep undisturbed.' },
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

export function homePath(rel) {
  const target = path.resolve(paths.home, String(rel || '.'));
  const relative = path.relative(paths.home, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('You can only read inside your home folder.');
  if (!fs.existsSync(target)) throw new Error(`Nothing at ${rel}.`);
  return { target, relative };
}

export async function readHomeFile(rel) {
  const { target, relative } = homePath(rel);
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
  const image = await visionImage(buf);
  if (image) return [{ type: 'text', text: `${relative} (${buf.length} bytes):` }, { type: 'image', source: image }];
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

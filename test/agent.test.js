import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'charlie-agent-'));
process.env.CHARLIE_DATA_DIR = path.join(tmp, 'data');
process.env.CHARLIE_HOME_DIR = path.join(tmp, 'home');
process.env.ANTHROPIC_API_KEY = 'sk-test-should-not-leak';
process.env.GITHUB_TOKEN = '';

const { fakeClient } = await import('./fake-client.js');
const { createApp } = await import('../server/app.js');
const { bus } = await import('../server/bus.js');

const TREE = `export default function build(ctx) {
  const dots = [];
  for (let i = 0; i < 400; i++) {
    const a = i * 2.4, r = (i / 400) * 2;
    dots.push([Math.cos(a) * r, 6 - (i / 400) * 5, Math.sin(a) * r, i % 7 ? '#5f8f4f' : '#e9bd62']);
  }
  for (let i = 0; i < 10; i++) dots.push([0, i / 10, 0, '#6b4a2f', 0.12]);
  return dots;
}`;

const SKILL = `export default async function run(input, ctx) {
  console.log('tick from', ctx.skill);
  return { now: new Date().toISOString(), cwd: process.cwd(), hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY), echo: input.text ?? null };
}`;

test('a full wake: look, talk, learn a skill, build, remember, nap — then use the skill', async () => {
  const client = fakeClient([
    [{ type: 'thinking', thinking: 'Mmm, I just woke up. Let me look around.' }, { type: 'tool_use', name: 'look', input: {} }],
    [{ type: 'tool_use', name: 'say', input: { text: 'hi everyone!' } }, { type: 'tool_use', name: 'go', input: { to: 'window' } }],
    [{ type: 'tool_use', name: 'learn_skill', input: { name: 'clock', description: 'Tells the time.', input_schema: { type: 'object', properties: { text: { type: 'string' } } }, code: SKILL } }],
    [{ type: 'tool_use', name: 'build', input: { name: 'tree', description: 'A little dot tree.', code: TREE, motion: 'twinkle' } }],
    [{ type: 'tool_use', name: 'build', input: { name: 'oops', description: 'Will fail.', code: "export default function build() { throw new Error('nope'); }" } }],
    [{ type: 'tool_use', name: 'learn_skill', input: { name: 'typo', description: 'Broken.', input_schema: { type: 'object' }, code: 'export default async function run( {' } }],
    [{ type: 'tool_use', name: 'remember', input: { mode: 'append', text: 'Built a tree. Learned clock.' } }, { type: 'tool_use', name: 'nap', input: { minutes: 15 } }],
    // second wake
    [{ type: 'tool_use', name: 'clock', input: { text: 'woof' } }],
    [{ type: 'text', text: 'Good. Back to sleep.' }, { type: 'tool_use', name: 'nap', input: { minutes: 60, note: 'check stars' } }],
  ]);
  const app = createApp({ client });
  app.ledger.earn('gift', 100, 'test gift');
  const start = app.ledger.balance;

  const seen = [];
  bus.on('code_delta', (d) => seen.push(d.text));

  await app.agent.wake('the test said so');

  const first = client.calls[0];
  assert.ok(first.tools.some((t) => t.name === 'github'), 'starter skill is a tool');
  assert.ok(first.tools.some((t) => t.name === 'learn_skill'));
  assert.equal(first.thinking.display, 'updates');
  assert.ok(first.betas.includes('thinking-display-updates-2026-08-18'));
  assert.match(first.messages[0].content, /very first time/);
  assert.match(first.system[0].text, /You are Charlie/);

  // learned + charged; the typo cost nothing
  assert.ok(app.skills.get('clock'));
  assert.equal(app.skills.get('typo'), null);
  assert.equal(app.ledger.balance, start - 25 - 15 - 20);

  // the tree has dots; the failed build shows as broken
  const tree = app.world.get('tree');
  assert.equal(tree.status, 'ok');
  assert.equal(tree.count, 410);
  assert.ok(app.world.pointsFile('tree'));
  assert.equal(app.world.get('oops').status, 'broken');
  assert.deepEqual(tree.plot, [1, 0]);

  assert.match(fs.readFileSync(path.join(tmp, 'home', 'memory.md'), 'utf8'), /Built a tree/);
  assert.ok(seen.join('').includes('export default function build'), 'code streamed live');
  const s = app.agent.s;
  assert.equal(s.status, 'sleeping');
  assert.ok(Math.abs(s.nextWakeAt - (Date.now() + 15 * 60000)) < 5000);
  assert.ok(bus.feedItems.some((f) => f.kind === 'say' && f.text === 'hi everyone!'));
  assert.ok(s.lastSession.some((l) => l.includes('clock')));

  // Second wake: the new skill is now a tool and runs in its own process.
  await app.agent.wake('round two');
  const second = client.calls[7];
  assert.ok(second.tools.some((t) => t.name === 'clock'));
  assert.match(second.messages[0].content, /LAST TIME YOU WERE AWAKE/);
  const results = client.calls[8].messages.at(-1).content;
  const out = results.find((b) => b.type === 'tool_result');
  assert.ok(!out.is_error, out.content);
  assert.match(out.content, /"hasAnthropicKey": false/);
  assert.match(out.content, /"echo": "woof"/);
  assert.match(out.content, /tick from clock/);
  assert.equal(app.agent.s.napNote, 'check stars');
  app.flush();
});

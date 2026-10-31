import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'charlie-world-'));
process.env.CHARLIE_DATA_DIR = path.join(tmp, 'data');
process.env.CHARLIE_HOME_DIR = path.join(tmp, 'home');
process.env.ANTHROPIC_API_KEY = '';
process.env.GITHUB_TOKEN = '';

const { fakeClient } = await import('./fake-client.js');
const { createApp } = await import('../server/app.js');
const { price } = await import('../server/ledger.js');

const dots = (color) => `export default function build() { const d = []; for (let i = 0; i < 50; i++) d.push([Math.cos(i), i / 25, Math.sin(i), '${color}']); return d; }`;
// Something that moves: six frames of a little ball rolling across its plot.
const ROLLER = `export default function build(ctx) {
  const frames = [];
  for (let f = 0; f < 6; f++) {
    const d = [];
    for (let i = 0; i < 40; i++) d.push([-3 + f + Math.cos(i) * 0.3, 0.5 + Math.sin(i) * 0.3, 0, '#c87f4a']);
    frames.push(d);
  }
  return { frames, fps: 12 };
}`;

test('she can head outside, wander her land, make things that move, and rearrange her world', async () => {
  const use = (name, input) => [{ type: 'tool_use', name, input }];
  const client = fakeClient([
    use('go', { to: 'outside' }),
    use('go', { to: '[-2, 1]' }),
    use('go', { to: '[40,0]' }),
    use('build', { name: 'shed', description: 'a shed', code: dots('#8a6a4a'), plot: [1, 0] }),
    use('build', { name: 'roller', description: 'a rolling ball', code: ROLLER, plot: [0, 1] }),
    use('move_build', { name: 'shed', plot: [-1, 0] }),
    use('move_build', { name: 'roller', plot: [-1, 0] }),
    use('move_build', { name: 'shed', plot: [5, 5] }),
    use('build', { name: 'garden', description: 'a garden', code: dots('#5f8f4f'), replaces: 'roller' }),
    use('go', { to: '[0,1]' }),
    use('demolish', { name: 'garden' }),
    use('nap', { minutes: 1440, wake_for_messages: false }),
  ]);
  const app = createApp({ client });
  app.ledger.earn('gift', 100, 'test gift');
  const start = app.ledger.balance;
  await app.agent.wake('the test said so');
  const result = (turn) => client.calls[turn + 1].messages.at(-1).content.find((b) => b.type === 'tool_result');

  // Out the door and across her land, but not off the edge of it.
  assert.match(result(0).content, /out your front door/);
  assert.match(result(1).content, /plot \[-2,1\]/);
  assert.ok(result(2).is_error);
  assert.match(result(2).content, /past the edge of your land/);

  // A build can move: its frames are kept and sent to the world.
  const roller = app.world.get('roller');
  assert.equal(roller, null, 'roller was replaced');
  assert.match(result(4).content, /240 dots across 6 frames/);

  // Moving swaps with whatever is there, and can't strand a build.
  assert.match(result(6).content, /"roller" is now on plot \[-1,0\], and "shed" moved to \[0,1\]/);
  assert.ok(result(7).is_error);
  assert.deepEqual(app.world.get('shed').plot, [0, 1]);

  // Replacing takes the old build's plot for the rebuild price, and doesn't count as growing.
  assert.match(result(8).content, /Replaced "roller" with "garden" on plot \[-1,0\]/);
  assert.equal(app.ledger.balance, start - price('build', 0) - price('build', 1) - price('rebuild'));
  assert.equal(app.world.progress.data.buildsMade, 2);

  // Standing on a build's plot means standing at that build.
  assert.match(result(9).content, /over to shed/);
  assert.match(result(10).content, /"garden" is gone/);
  assert.deepEqual(app.world.publicList().map((o) => [o.name, String(o.plot)]), [['house', '0,0'], ['shed', '0,1']]);

  // She picks when she wakes, and whether a message may wake her sooner.
  const s = app.agent.s;
  assert.ok(Math.abs(s.nextWakeAt - (Date.now() + 1440 * 60000)) < 5000);
  assert.equal(s.wakeForMessages, false);
  assert.equal(app.agent.isDue(true), false);
  app.flush();
});

test('a tired dog stays up as long as she likes', async () => {
  const turns = Array.from({ length: 30 }, (_, i) => [{ type: 'tool_use', name: 'go', input: { to: i % 2 ? 'rug' : 'outside' } }]);
  const client = fakeClient([...turns, [{ type: 'tool_use', name: 'nap', input: { minutes: 5 } }]]);
  const app = createApp({ client });
  app.feelings.values.energy = 5;
  await app.agent.wake('the test said so');
  assert.equal(client.calls.length, 31, 'nothing cut her wake short');
  assert.ok(!client.calls.some((c) => JSON.stringify(c.messages).includes('nearly as long as one can be')));
  assert.ok(Math.abs(app.agent.s.nextWakeAt - (Date.now() + 5 * 60000)) < 5000);
  app.flush();
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'charlie-visitors-'));
process.env.CHARLIE_DATA_DIR = path.join(tmp, 'data');
process.env.CHARLIE_HOME_DIR = path.join(tmp, 'home');
process.env.ANTHROPIC_API_KEY = '';
process.env.GITHUB_TOKEN = '';

const { fakeClient } = await import('./fake-client.js');
const { createApp } = await import('../server/app.js');

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('visitors are remembered, leave offerings, do things, and Charlie sees it all', async () => {
  const client = fakeClient([
    [{ type: 'tool_use', name: 'diary', input: { text: 'Someone named testPup sent me a tiny picture. I liked it.', kind: 'offering', mood: 2 } }],
    [{ type: 'tool_use', name: 'remember_visitor', input: { name: 'testPup', note: 'Sends tiny pictures.' } }],
    [{ type: 'tool_use', name: 'say', input: { text: 'thank you testPup!', to: 'testPup' } }],
    [{ type: 'tool_use', name: 'go', input: { to: 'bowl', doing: 'eating breakfast' } }],
    [{ type: 'tool_use', name: 'nap', input: { minutes: 30 } }],
  ]);
  const app = createApp({ client });
  await new Promise((r) => app.server.listen(0, r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  let jar = '';
  const call = async (p, body) => {
    const res = await fetch(base + p, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', cookie: jar }, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = res.headers.get('set-cookie');
    if (set) jar = set.split(';')[0];
    return { status: res.status, json: await res.json() };
  };

  const hello = await call('/api/hello', {});
  assert.match(hello.json.name, /^[a-z]+[A-Z][a-z]+\d\d$/);
  assert.ok(jar.startsWith('cv='));
  assert.equal((await call('/api/me', { name: 'test Pup!' })).json.name, 'testPup');
  assert.equal((await call('/api/message', { text: 'hi charlie', image: PNG })).status, 200);
  assert.equal((await call('/api/message', { image: 'data:image/png;base64,bm90IGFuIGltYWdl' })).status, 400);
  assert.equal((await call('/api/action', { id: 'fill_bowl' })).status, 200);
  assert.equal((await call('/api/action', { id: 'nope' })).status, 429);
  await call('/api/pet', {});
  const bowlBefore = app.feelings.d.bowl;
  assert.equal(bowlBefore, 2);

  await app.agent.wake('testing');
  const wake = client.calls[0].messages[0].content;
  assert.ok(Array.isArray(wake), 'wake message carries the picture');
  const text = wake[0].text;
  assert.match(text, /HOW YOU FEEL: fullness/);
  assert.match(text, /testPup/);
  assert.match(text, /filled your food bowl/);
  assert.match(text, /left you a picture and said "hi charlie"/);
  assert.ok(wake.some((b) => b.type === 'image' && b.source.media_type === 'image/png'));
  assert.ok(client.calls[0].tools.some((t) => t.name === 'diary'));

  assert.equal(app.diary.entries.at(-1).mood, 2);
  assert.equal(app.feelings.d.bowl, 0, 'she ate both portions');
  const me = (await call('/api/me')).json;
  assert.equal(me.notes, 'Sends tiny pictures.');
  assert.equal(me.replies.at(-1).text, 'thank you testPup!');
  assert.equal(me.messages.at(-1).picture, true);
  assert.equal(app.agent.s.location, 'bed');

  // Second wake: the message was read and isn't shown again.
  client.calls.length = 0;
  await app.agent.wake('again');
  assert.doesNotMatch(JSON.stringify(client.calls[0].messages[0].content), /hi charlie/);
  app.server.close();
  app.flush();
});

test('feelings drift over time and recover with sleep', async () => {
  const { Feelings } = await import('../server/feelings.js');
  const f = new Feelings(path.join(tmp, 'f.json'));
  f.isAsleep = () => false;
  const start = f.values;
  f.d.t -= 4 * 3600_000;
  const later = f.values;
  assert.ok(later.fullness < start.fullness && later.energy < start.energy);
  f.isAsleep = () => true;
  f.d.t -= 3 * 3600_000;
  assert.ok(f.values.energy > later.energy);
  assert.match(f.describe(), /fullness \d+\/100/);
});

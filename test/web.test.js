import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'charlie-web-'));
process.env.CHARLIE_DATA_DIR = path.join(tmp, 'data');
process.env.CHARLIE_HOME_DIR = path.join(tmp, 'home');
process.env.ANTHROPIC_API_KEY = '';
process.env.GITHUB_TOKEN = '';
process.env.ADMIN_TOKEN = 'test-admin-token';
for (const k of Object.keys(process.env)) if (k.startsWith('CHARLIE_REDDIT') || k.startsWith('CHARLIE_BLUESKY') || k === 'CHARLIE_STRIPE_KEY') delete process.env[k];

const { fakeClient } = await import('./fake-client.js');
const { createApp } = await import('../server/app.js');
const { bus } = await import('../server/bus.js');

const BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

test('Charlie publishes pages and links, reads the web, and asks her human for things', async () => {
  const client = fakeClient([
    [
      { type: 'server_tool_use', name: 'web_search', input: { query: 'cozy dot art communities' } },
      { type: 'web_search_tool_result', tool_use_id: 'srv_1', content: [{ type: 'web_search_result', url: 'https://example.com', title: 'Example' }] },
      { type: 'text', text: 'Found some places.' },
      { type: 'tool_use', name: 'publish_page', input: { path: 'zine/index.html', content: '<!doctype html><h1>dot zine #1</h1>' } },
    ],
    [{ type: 'tool_use', name: 'make_link', input: { url: 'https://example.com/shop', slug: 'shop', note: 'bluesky bio' } }],
    [{ type: 'tool_use', name: 'ask_human', input: { text: 'Could I have a Bluesky account?' } }],
    [{ type: 'tool_use', name: 'nap', input: { minutes: 20 } }],
    [{ type: 'tool_use', name: 'nap', input: { minutes: 20 } }],
  ]);
  const app = createApp({ client });
  await new Promise((r) => app.server.listen(0, r));
  const base = `http://127.0.0.1:${app.server.address().port}`;

  assert.ok(app.skills.get('http'), 'http starter is installed');
  assert.equal(app.skills.get('reddit'), null, 'reddit waits for an account');

  await app.agent.wake('testing');
  const tools = client.calls[0].tools;
  assert.ok(tools.some((t) => t.type === 'web_search_20260209'));
  assert.ok(tools.some((t) => t.type === 'web_fetch_20260209' && !('eager_input_streaming' in t)));
  assert.ok(bus.feedItems.some((f) => f.kind === 'action' && f.text === 'searching the web: cozy dot art communities'));
  assert.ok(bus.feedItems.some((f) => f.kind === 'result' && f.text.includes('1 results')));
  assert.ok(fs.existsSync(path.join(tmp, 'home', 'site', 'zine', 'index.html')));

  const view = (p, ua = BROWSER, ip = '203.0.113.7', extra = {}) => fetch(base + p, { redirect: 'manual', headers: { 'user-agent': ua, 'x-forwarded-for': ip, ...extra } });
  const start = app.ledger.balance;
  const page = await view('/pages/zine/', BROWSER, '203.0.113.7', { referer: 'https://www.reddit.com/r/test' });
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /^sandbox/);
  assert.match(await page.text(), /dot zine/);
  await view('/pages/zine/');
  await view('/pages/zine/', 'curl/8.4.0', '203.0.113.8');
  await view('/pages/zine/', BROWSER, '127.0.0.1');
  assert.equal(app.ledger.balance, start + 1, 'one real person, counted once');
  assert.equal((await view('/pages/zine')).status, 301);
  assert.equal((await view('/pages/nope.html')).status, 404);

  const go = await view('/go/shop', BROWSER, '198.51.100.4');
  assert.equal(go.status, 302);
  assert.equal(go.headers.get('location'), 'https://example.com/shop');
  assert.equal(app.ledger.balance, start + 2);
  assert.equal(app.site.s.pages['zine/'].refs['reddit.com'], 1);

  // Cross-site writes are refused (including from her sandboxed pages).
  for (const origin of ['https://evil.example', 'null']) {
    const r = await fetch(`${base}/api/pet`, { method: 'POST', headers: { origin, 'content-type': 'text/plain' }, body: '{}' });
    assert.equal(r.status, 403);
  }

  // Her human answers; she hears about it next time.
  const ans = await fetch(`${base}/api/admin/answer`, { method: 'POST', headers: { authorization: 'Bearer test-admin-token', 'content-type': 'application/json' }, body: JSON.stringify({ id: 1, reply: 'Made you one: @charlie.bsky.social' }) });
  assert.equal(ans.status, 200);
  await app.agent.wake('round two');
  const wake = client.calls.at(-1).messages[0].content;
  const text = typeof wake === 'string' ? wake : wake[0].text;
  assert.match(text, /YOUR HUMAN ANSWERED/);
  assert.match(text, /Made you one/);
  assert.match(text, /zine\/ — \d+ views today/);
  assert.match(text, /\/go\/shop → https:\/\/example.com\/shop/);
  app.server.close();
  app.flush();
});

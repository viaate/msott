import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'charlie-gh-'));
Object.assign(process.env, {
  CHARLIE_MODE: 'github',
  CHARLIE_DATA_DIR: path.join(tmp, 'state'),
  CHARLIE_HOME_DIR: path.join(tmp, 'home'),
  PUBLIC_URL: 'https://example.github.io/msott',
  ANTHROPIC_API_KEY: '',
  GITHUB_TOKEN: '',
  REPO_TOKEN: '',
  GITHUB_REPOSITORY: '',
  CHARLIE_ENV: 'CHARLIE_FAVORITE_TOY=lemon tart\n# a comment\nTZ="UTC"',
});

const { fakeClient } = await import('./fake-client.js');
const { tick } = await import('../server/tick.js');
const { formFields, imageUrls, ACTION_OPTIONS } = await import('../server/github-home.js');

const TREE = 'export default function build() { const d = []; for (let i = 0; i < 300; i++) d.push([Math.cos(i) * 2, i / 50, Math.sin(i) * 2, "#5f8f4f"]); return d; }';

test('a scheduled run wakes her, records the wake, and builds a static site', async () => {
  assert.equal(process.env.CHARLIE_FAVORITE_TOY, 'lemon tart', 'CHARLIE_ENV is unpacked');
  const client = fakeClient([
    [{ type: 'thinking', thinking: 'Morning! Let me make a page.' }, { type: 'tool_use', name: 'publish_page', input: { path: 'zine/index.html', content: '<!doctype html><body><h1>zine</h1></body>' } }],
    [{ type: 'tool_use', name: 'build', input: { name: 'tree', description: 'a tree', code: TREE } }],
    [{ type: 'tool_use', name: 'make_link', input: { url: 'https://example.com', slug: 'hello' } }],
    [{ type: 'tool_use', name: 'nap', input: { minutes: 45 } }],
  ]);
  const out = path.join(tmp, '_site');
  const r = await tick({ cmd: 'gift', args: [100, 'test'], client, out });
  assert.equal(r.woke, true);
  assert.equal(r.changed, true);

  const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  assert.match(html, /window\.CHARLIE = \{"static":true/);
  assert.doesNotMatch(html, /(href|src)="\//, 'all paths are relative for project Pages sites');
  for (const f of ['state.json', 'vendor/three/build/three.module.js', 'vendor/three/build/three.core.js', 'vendor/three/examples/jsm/controls/OrbitControls.js', 'world/tree.bin', 'skills/http.json', 'pages/zine/index.html', 'go/hello/index.html', '.nojekyll']) {
    assert.ok(fs.existsSync(path.join(out, f)), f);
  }
  assert.match(fs.readFileSync(path.join(out, 'go/hello/index.html'), 'utf8'), /location\.replace\("https:\/\/example\.com\/"\)/);

  const state = JSON.parse(fs.readFileSync(path.join(out, 'state.json'), 'utf8'));
  const types = new Set(state.lastSession.events.map((e) => e.type));
  for (const t of ['charlie', 'feed', 'code', 'world', 'balance', 'site']) assert.ok(types.has(t), `recorded ${t}`);
  const code = state.lastSession.events.find((e) => e.type === 'code');
  assert.match(code.data.code, /export default function build/);
  assert.equal(state.lastSession.before.charlie.status, 'sleeping');
  assert.equal(state.snapshot.charlie.status, 'sleeping');
  assert.ok(state.snapshot.site.pages[0].url.startsWith('https://example.github.io/msott/pages/'));
  assert.match(client.calls[0].system[0].text, /GitHub Pages/);

  // Right after, she's napping and nothing changed: no redeploy.
  const again = await tick({ client, out });
  assert.equal(again.woke, false);
  assert.equal(again.changed, false);
});

test('issue forms are read the way GitHub writes them', () => {
  const body = '### What do you do?\n\nfill her bowl\n\n### Something else? (optional)\n\n_No response_';
  assert.deepEqual(formFields(body), { 'what do you do?': 'fill her bowl', 'something else? (optional)': '' });
  const urls = imageUrls('hi ![cat](https://github.com/user-attachments/assets/abc) <img src="https://evil.example/x.png"> <img width="5" src="https://private-user-images.githubusercontent.com/1/2.png?jwt=x">');
  assert.deepEqual(urls, ['https://github.com/user-attachments/assets/abc', 'https://private-user-images.githubusercontent.com/1/2.png?jwt=x']);

  // Every dropdown option in the issue form does something.
  const yml = fs.readFileSync(new URL('../.github/ISSUE_TEMPLATE/charlie-action.yml', import.meta.url), 'utf8');
  const options = [...yml.matchAll(/^\s+- (.+)$/gm)].map((m) => m[1]).filter((o) => !o.startsWith('type:'));
  for (const o of options) if (o !== 'something else') assert.ok(ACTION_OPTIONS[o], `"${o}" is handled`);
});

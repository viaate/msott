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
  CHARLIE_ENV: 'CHARLIE_FAVORITE_TOY=lemon tart\n# a comment\nTZ="UTC"\nCHARLIE_NAP_SPOT=bed\nCHARLIE_SNACK=carrot',
  // The way the workflow hands over every secret: later CHARLIE_ENV_ blocks
  // and per-setting secrets override CHARLIE_ENV.
  CHARLIE_SECRETS: JSON.stringify({
    ANTHROPIC_API_KEY: 'ignored-here',
    github_token: 'ignored-too',
    CHARLIE_ENV_2: 'CHARLIE_NAP_SPOT=rug\nCHARLIE_SNACK=apple',
    CHARLIE_ENV_10: 'CHARLIE_SNACK=blueberry',
    CHARLIE_BLUESKY_HANDLE_TEST: 'imcharliethedog.com',
    PATH: '/nope',
  }),
  CHARLIE_REDDIT_USERNAME: 'imcharliethedog',
});

// The outside world, as these tests see it: her ntfy mailbox and Reddit's feeds.
const web = { letters: [], files: {}, reddit: {} };
globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  const ok = (body, type = 'text/plain') => new Response(body, { status: 200, headers: { 'content-type': type } });
  if (url.host === 'ntfy.sh' && url.pathname.endsWith('/json')) return ok(web.letters.map((l) => JSON.stringify(l)).join('\n'));
  if (url.host === 'ntfy.sh' && web.files[url.pathname]) return ok(web.files[url.pathname], 'image/gif');
  if (url.host === 'www.reddit.com' && web.reddit[url.pathname]) return ok(web.reddit[url.pathname], 'application/atom+xml');
  if (url.host === 'www.reddit.com') return new Response('blocked', { status: 403 });
  throw new Error(`unexpected request in tests: ${url}`);
};

const atom = (entries) => `<?xml version="1.0"?><feed>${entries.map(([id, author, link]) => `<entry><author><name>/u/${author}</name></author><id>${id}</id><link href="${link}" /><updated>2026-10-30T12:00:00+00:00</updated><title>a post about naps</title></entry>`).join('')}</feed>`;
const POST_A = 'https://www.reddit.com/r/goldendoodles/comments/aaa/naps/';
const POST_B = 'https://www.reddit.com/r/dogpictures/comments/bbb/floor/';

// What Reddit looks like at her first check: one post with two comments.
web.reddit['/user/imcharliethedog/submitted/.rss'] = atom([['t3_aaa', 'imcharliethedog', POST_A]]);
web.reddit['/r/goldendoodles/comments/aaa/naps/.rss'] = atom([['t3_aaa', 'imcharliethedog', POST_A], ['t1_1', 'bob', POST_A], ['t1_2', 'carol', POST_A]]);

const { fakeClient } = await import('./fake-client.js');
const { tick } = await import('../server/tick.js');
const { openLetter } = await import('../server/mailbox.js');

const TREE = 'export default function build() { const d = []; for (let i = 0; i < 300; i++) d.push([Math.cos(i) * 2, i / 50, Math.sin(i) * 2, "#5f8f4f"]); return d; }';

test('a scheduled run wakes her, records the wake, and builds a static site', async () => {
  assert.equal(process.env.CHARLIE_FAVORITE_TOY, 'lemon tart', 'CHARLIE_ENV is unpacked');
  assert.equal(process.env.CHARLIE_NAP_SPOT, 'rug', 'CHARLIE_ENV_2 overrides CHARLIE_ENV');
  assert.equal(process.env.CHARLIE_SNACK, 'blueberry', 'CHARLIE_ENV_10 comes after CHARLIE_ENV_2');
  assert.equal(process.env.CHARLIE_BLUESKY_HANDLE_TEST, 'imcharliethedog.com', 'a secret named after a setting works');
  assert.notEqual(process.env.PATH, '/nope', 'other secrets are left alone');
  assert.equal(process.env.ANTHROPIC_API_KEY, '');
  for (const k of ['CHARLIE_ENV', 'CHARLIE_ENV_2', 'CHARLIE_SECRETS']) assert.equal(process.env[k], undefined, `${k} is cleared`);
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

// Letters are signed exactly the way the page signs them, with WebCrypto.
const subtle = globalThis.crypto.subtle;
const b64url = (buf) => Buffer.from(buf).toString('base64url');
async function visitor() {
  const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await subtle.exportKey('jwk', pair.publicKey);
  const id = b64url(await subtle.digest('SHA-256', new TextEncoder().encode(`${jwk.x}.${jwk.y}`))).slice(0, 22);
  return { key: pair.privateKey, pub: { x: jwk.x, y: jwk.y }, id };
}
let seq = 0;
async function letter(v, body) {
  const d = JSON.stringify({ ts: Date.now(), r: `nonce${++seq}`, ...body });
  const s = b64url(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, v.key, new TextEncoder().encode(d)));
  return JSON.stringify({ d, k: v.pub, s });
}
let msgId = 0;
const post = (message, extra = {}) => web.letters.push({ id: `m${++msgId}`, time: Math.floor(Date.now() / 1000), event: 'message', topic: 't', message, ...extra });

test('visitors pet her and write to her through her mailbox, and only genuine letters count', async () => {
  const maya = await visitor();
  const sly = await visitor();
  const gif = Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'latin1');
  const sha = (await import('node:crypto')).createHash('sha256').update(gif).digest('hex');

  const pet = await letter(maya, { k: 'pet', n: 'Maya' });
  post(pet);
  post(pet); // the same letter again is not a second pet
  post(await letter(maya, { k: 'act', a: 'fill_bowl', n: 'Maya' }));
  web.files['/file/pic1.gif'] = gif;
  post(await letter(maya, { k: 'msg', t: 'you are a very good girl', f: sha, n: 'Maya' }), { attachment: { name: 'picture.jpg', size: gif.length, url: 'https://ntfy.sh/file/pic1.gif' } });
  // A letter claiming to be Maya, signed by someone else.
  const forged = JSON.parse(await letter(sly, { k: 'treat', n: 'Maya' }));
  post(JSON.stringify({ ...forged, k: maya.pub }));
  assert.equal(openLetter(JSON.stringify({ ...forged, k: maya.pub })), null);

  // Reddit: one post had 2 comments at the first check; now 2 more from other
  // people, 1 from Charlie herself, and a new post with 1 comment.
  web.reddit['/user/imcharliethedog/submitted/.rss'] = atom([['t3_bbb', 'imcharliethedog', POST_B], ['t3_aaa', 'imcharliethedog', POST_A]]);
  web.reddit['/r/goldendoodles/comments/aaa/naps/.rss'] = atom([['t3_aaa', 'imcharliethedog', POST_A], ['t1_1', 'bob', POST_A], ['t1_2', 'carol', POST_A], ['t1_3', 'ImCharlieTheDog', POST_A], ['t1_4', 'dave', POST_A], ['t1_5', 'erin', POST_A]]);
  web.reddit['/r/dogpictures/comments/bbb/floor/.rss'] = atom([['t3_bbb', 'imcharliethedog', POST_B], ['t1_6', 'finn', POST_B]]);

  const out = path.join(tmp, '_site');
  const r = await tick({ client: fakeClient([]), out });
  assert.equal(r.changed, true);
  const state = JSON.parse(fs.readFileSync(path.join(out, 'state.json'), 'utf8'));
  const earned = (key) => state.snapshot.ledger.filter((e) => e.key === key).reduce((n, e) => n + e.units, 0);
  assert.equal(earned('site.pet'), 1);
  assert.equal(earned('site.action'), 1);
  assert.equal(earned('site.message'), 1);
  assert.equal(earned('site.picture'), 1);
  assert.equal(earned('site.treat'), 0, 'the forged letter was ignored');
  assert.equal(earned('reddit.comment'), 3, 'two new comments on the old post, one on the new post');
  assert.equal(earned('reddit.karma'), 0, "Reddit wouldn't show her profile, so no karma yet");

  // Maya can find what Charlie knows about her by her own key, and nobody else's.
  const me = state.people[maya.id];
  assert.equal(me.name, 'Maya');
  assert.equal(me.messages[0].text, 'you are a very good girl');
  assert.equal(me.messages[0].picture, true);
  assert.equal(Object.keys(state.people).length, 1);
  assert.ok(state.snapshot.feed.some((f) => /Maya filled Charlie's food bowl/.test(f.text)));
  assert.match(state.static.mailbox, /^https:\/\/ntfy\.sh\/charlie-[0-9a-f]{18}$/);

  // Letters already read aren't read again.
  await tick({ client: fakeClient([]), out });
  const s2 = JSON.parse(fs.readFileSync(path.join(out, 'state.json'), 'utf8'));
  assert.equal(s2.snapshot.ledger.filter((e) => e.key === 'site.pet').length, 1);
});

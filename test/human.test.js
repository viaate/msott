import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'charlie-human-'));
Object.assign(process.env, {
  CHARLIE_MODE: 'github',
  CHARLIE_DATA_DIR: path.join(tmp, 'state'),
  CHARLIE_HOME_DIR: path.join(tmp, 'home'),
  PUBLIC_URL: 'https://imcharliethedog.com',
  ANTHROPIC_API_KEY: '',
  GITHUB_TOKEN: '',
  REPO_TOKEN: 'repo-token',
  GITHUB_REPOSITORY: 'viaate/msott',
  CHARLIE_REDDIT_USERNAME: '',
  CHARLIE_MAILBOX_SERVER: 'https://mailbox.test',
});

const { Jimp } = await import('jimp');
const PHOTO = await new Jimp({ width: 64, height: 48, color: 0xb5653aff }).getBuffer('image/png');

// The outside world: GitHub's API and attachments, an empty mailbox, and
// whatever a test adds.
const calls = [];
const routes = [];
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  const method = init.method ?? 'GET';
  calls.push({ method, url: String(url), body: init.body });
  for (const r of routes) {
    const out = r(url, method, init);
    if (out) return out;
  }
  const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
  if (url.host === 'mailbox.test') return new Response('', { status: 200 });
  if (url.host === 'www.reddit.com') return new Response('<feed></feed>', { status: 200 });
  if (url.host === 'api.github.com') {
    if (url.pathname === '/repos/viaate/msott') return json({ owner: { login: 'viaate' } });
    if (url.pathname === '/repos/viaate/msott/issues' && method === 'GET') {
      assert.equal(url.searchParams.get('creator'), 'viaate');
      return json([
        { number: 7, title: 'profile pictures', body: 'Can you make yourself profile pictures from these?\n\n![face](https://github.com/user-attachments/assets/face-1)\n<img width="300" alt="x" src="https://github.com/user-attachments/assets/face-2" />', labels: [] },
        { number: 3, title: '💌 for Charlie', body: 'an old visitor issue', labels: [{ name: 'for-charlie' }] },
      ]);
    }
    return json({});
  }
  if (url.host === 'github.com' && url.pathname.startsWith('/user-attachments/assets/')) return new Response(PHOTO, { status: 200 });
  throw new Error(`unexpected request in tests: ${method} ${url}`);
};

const { fakeClient } = await import('./fake-client.js');
const { tick } = await import('../server/tick.js');
const { readHomeFile } = await import('../server/brain/tools.js');
const { visionImage } = await import('../server/images.js');

test('an issue her human opens is a note she reads, photos and all, and then it is closed', async () => {
  const client = fakeClient([
    [{ type: 'tool_use', name: 'read_file', input: { path: 'from-your-human/issue-7-1.png' } }],
    [{ type: 'tool_use', name: 'publish_page', input: { path: 'me/face.png', from_file: 'from-your-human/issue-7-2.png' } }],
    [{ type: 'tool_use', name: 'nap', input: { minutes: 60 } }],
  ]);
  const out = path.join(tmp, '_site');
  const r = await tick({ cmd: 'wake', client, out });
  assert.equal(r.woke, true);

  const wake = client.calls[0].messages[0].content;
  const text = wake[0].text;
  assert.match(text, /FROM YOUR HUMAN/);
  assert.match(text, /Can you make yourself profile pictures from these\?/);
  assert.match(text, /from-your-human\/issue-7-1\.png, from-your-human\/issue-7-2\.png/);
  assert.doesNotMatch(text, /an old visitor issue/);
  assert.equal(wake.filter((b) => b.type === 'image').length, 2, 'she sees both photos');

  // read_file shows her the picture.
  const result = client.calls[1].messages.at(-1).content.find((b) => b.type === 'tool_result');
  assert.ok(result.content.some((b) => b.type === 'image' && b.source.media_type === 'image/png'));
  // …and she can put it on her website as is.
  assert.deepEqual(fs.readFileSync(path.join(out, 'pages/me/face.png')), PHOTO);

  const closed = calls.filter((c) => c.url.endsWith('/issues/7') && c.method === 'PATCH');
  assert.equal(closed.length, 1);
  assert.match(calls.find((c) => c.url.endsWith('/issues/7/comments')).body, /Charlie read this/);

  // The next run doesn't hand her the same note again.
  const again = fakeClient([]);
  await tick({ cmd: 'wake', client: again, out });
  assert.doesNotMatch(JSON.stringify(again.calls[0].messages[0].content), /FROM YOUR HUMAN/);
});

test('photos too big to send are shrunk before she looks at them', async () => {
  const big = new Jimp({ width: 2600, height: 2000 });
  big.scan((x, y, i) => {
    big.bitmap.data.writeUInt32BE(Math.floor(Math.random() * 0xffffff) * 256 + 255, i);
  });
  const jpeg = await big.getBuffer('image/jpeg', { quality: 100 });
  assert.ok(jpeg.length > 3_500_000, `test photo is ${jpeg.length} bytes`);
  const seen = await visionImage(jpeg);
  assert.equal(seen.media_type, 'image/jpeg');
  const back = await Jimp.read(Buffer.from(seen.data, 'base64'));
  assert.equal(Math.max(back.width, back.height), 1568);
  assert.match(await readHomeFile('skills'), /^skills\//, 'folders still list');
  assert.equal(await visionImage(Buffer.from('not a picture')), null);
});

test('her Bluesky skill updates her profile picture and keeps the rest of her profile', async () => {
  Object.assign(process.env, { CHARLIE_BLUESKY_HANDLE: 'imcharliethedog.bsky.social', CHARLIE_BLUESKY_APP_PASSWORD: 'pw', CHARLIE_BLUESKY_DID: 'did:plc:charlie', HOME: path.join(tmp, 'home') });
  fs.mkdirSync(path.join(tmp, 'home/workspace'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'home/workspace/avatar.png'), PHOTO);
  const seen = [];
  routes.push((url, method, init) => {
    if (url.host !== 'bsky.social') return null;
    const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
    const m = url.pathname.split('/').pop();
    seen.push(m);
    if (m === 'com.atproto.server.createSession') {
      // Her old handle is gone (she moved to her own domain); her DID still works.
      const { identifier } = JSON.parse(init.body);
      return identifier === 'did:plc:charlie' ? json({ accessJwt: 'jwt', did: 'did:plc:charlie', handle: 'imcharliethedog.com' }) : json({ error: 'AuthenticationRequired' }, 401);
    }
    if (m === 'com.atproto.repo.getRecord') return json({ cid: 'cid1', value: { $type: 'app.bsky.actor.profile', displayName: 'Charlie The Dog' } });
    if (m === 'com.atproto.repo.uploadBlob') {
      assert.equal(init.headers['content-type'], 'image/png');
      return json({ blob: { $type: 'blob', ref: { $link: 'bafy' }, mimeType: 'image/png', size: PHOTO.length } });
    }
    if (m === 'com.atproto.repo.putRecord') {
      const body = JSON.parse(init.body);
      assert.equal(body.record.displayName, 'Charlie The Dog');
      assert.equal(body.record.description, 'a dog made of dots');
      assert.equal(body.record.avatar.ref.$link, 'bafy');
      assert.equal(body.swapRecord, 'cid1');
      return json({ uri: 'at://did:plc:charlie/app.bsky.actor.profile/self' });
    }
    return null;
  });
  const { default: bluesky } = await import('../starter/skills/bluesky/index.mjs');
  const r = await bluesky({ action: 'update_profile', avatar: 'workspace/avatar.png', bio: 'a dog made of dots' });
  assert.deepEqual(r.changed, ['bio', 'avatar']);
  assert.ok(seen.includes('com.atproto.repo.putRecord'));
  await assert.rejects(bluesky({ action: 'update_profile', avatar: '../../etc/passwd' }), /home folder/);
});

test('a starter skill she never changed picks up improvements; one she revised is left alone', async () => {
  const { Skills } = await import('../server/brain/skills.js');
  const { Ledger } = await import('../server/ledger.js');
  const skills = new Skills({ ledger: new Ledger(), reserved: [] });
  const dir = path.join(tmp, 'home/skills');
  for (const [name, revisions] of [['http', 0], ['github', 2]]) {
    fs.mkdirSync(path.join(dir, name), { recursive: true });
    fs.writeFileSync(path.join(dir, name, 'index.mjs'), 'export default async () => "old"');
    fs.writeFileSync(path.join(dir, name, 'meta.json'), JSON.stringify({ origin: 'starter', revisions }));
  }
  skills.init();
  assert.notEqual(fs.readFileSync(path.join(dir, 'http/index.mjs'), 'utf8'), 'export default async () => "old"');
  assert.equal(fs.readFileSync(path.join(dir, 'github/index.mjs'), 'utf8'), 'export default async () => "old"');
});

test('on a shared Gumroad account, only her own products earn her tokens', async () => {
  Object.assign(process.env, { CHARLIE_GUMROAD_TOKEN: 'g', CHARLIE_GUMROAD_PRODUCTS: 'https://someone.gumroad.com/l/dot-zine' });
  let sales = [{ id: 's1', product_id: 'P1', price: 500, currency: 'usd' }];
  routes.push((url) => {
    if (url.host !== 'api.gumroad.com') return null;
    const json = (v) => new Response(JSON.stringify(v), { status: 200, headers: { 'content-type': 'application/json' } });
    if (url.pathname === '/v2/products') return json({ products: [{ id: 'P1', name: 'Dot zine', custom_permalink: 'dot-zine' }, { id: 'P2', name: 'My consulting', custom_permalink: 'consulting' }] });
    if (url.pathname === '/v2/sales') return json({ sales });
    return null;
  });
  const { SalesSource } = await import('../server/sources/sales.js');
  const { Ledger } = await import('../server/ledger.js');
  const ledger = new Ledger();
  const src = new SalesSource(ledger);
  await src.pollOnce();
  const before = ledger.data.balance;
  sales = [...sales, { id: 's2', product_id: 'P1', price: 300, currency: 'usd', product_name: 'Dot zine' }, { id: 's3', product_id: 'P2', price: 20000, currency: 'usd', product_name: 'My consulting' }];
  await src.pollOnce();
  assert.equal(src.error, null);
  assert.equal(ledger.data.balance - before, 3 * 20, 'only the $3 zine sale counts');
  assert.match(src.lines().join('\n'), /YOUR GUMROAD PRODUCTS: Dot zine/);
});

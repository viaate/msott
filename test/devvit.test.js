import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'charlie-devvit-'));
process.env.CHARLIE_HOME = home;
process.env.CHARLIE_DEVVIT_CODE = 'one-time-code-from-reddit';

const { _sealing } = await import('../starter/skills/devvit/index.mjs');

test('her Reddit login is kept sealed, never as plain text', () => {
  const login = JSON.stringify({ token: Buffer.from(JSON.stringify({ accessToken: 'a', refreshToken: 'r' })).toString('base64') });
  fs.mkdirSync(path.dirname(_sealing.PLAIN), { recursive: true });
  fs.writeFileSync(_sealing.PLAIN, login);
  _sealing.stash();
  assert.equal(fs.existsSync(_sealing.PLAIN), false, 'plain copy removed');
  const sealed = fs.readFileSync(_sealing.SEALED, 'utf8');
  assert.ok(!sealed.includes('refreshToken') && !sealed.includes(login));
  assert.equal(_sealing.unseal(), login);
  fs.writeFileSync(_sealing.SEALED, 'garbage');
  assert.equal(_sealing.unseal(), null);
});

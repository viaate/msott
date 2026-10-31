import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'charlie-econ-'));
process.env.CHARLIE_DATA_DIR = path.join(tmp, 'data');
process.env.CHARLIE_HOME_DIR = path.join(tmp, 'home');

const { Ledger, price } = await import('../server/ledger.js');
const { normalizePoints, encodePoints } = await import('../server/brain/world.js');
const { FieldStreamer } = await import('../server/brain/partial.js');
const { validateInput } = await import('../server/brain/tools.js');
const { config } = await import('../server/config.js');

test('ledger earns by weight, spends, and refuses overdrafts', () => {
  const l = new Ledger(path.join(tmp, 'l1.json'));
  assert.equal(l.balance, config.economy.startingTokens);
  l.earn('github.star', 2, 'two stars');
  assert.equal(l.balance, config.economy.startingTokens + 2 * config.economy.earn['github.star']);
  assert.throws(() => l.spend(1e9, 'too much'), /Not enough tokens/);
  l.spend(5, 'a thing');
  assert.equal(l.data.spent, 5);
  assert.equal(l.earn('not.a.source', 3), 0);
});

test('daily limits cap repeat actions', () => {
  const l = new Ledger(path.join(tmp, 'l2.json'));
  const results = Array.from({ length: 5 }, () => l.allow('pet:abc', 3));
  assert.deepEqual(results, [true, true, true, false, false]);
});

test('prices grow with each purchase', () => {
  const a = price('skill', 0);
  const b = price('skill', 1);
  const c = price('skill', 5);
  assert.equal(a, config.economy.costs.skill.base);
  assert.ok(b > a && c > b);
  assert.equal(price('reviseSkill'), config.economy.costs.reviseSkill);
});

test('build output is normalized, clamped and encoded', () => {
  const pts = normalizePoints([[0, 1, 0, '#ff0000', 0.1], { x: 99, y: -3, z: 0 }, [NaN, 0, 0], [1, 2, 3, 0x00ff00]], { half: 5, maxHeight: 10, maxPoints: 100 });
  assert.equal(pts.count, 3);
  assert.deepEqual([...pts.positions.slice(3, 6)], [5, 0, 0]);
  assert.deepEqual([...pts.colors.slice(0, 3)], [255, 0, 0]);
  assert.deepEqual([...pts.colors.slice(6, 9)], [0, 255, 0]);
  const buf = encodePoints(pts);
  assert.equal(buf.readUInt32LE(0), 3);
  assert.equal(buf.length, 8 + 3 * 16);
  assert.throws(() => normalizePoints({ nope: true }, { half: 5, maxHeight: 10, maxPoints: 10 }), /array of dots/);

  // Something that moves: frames go out together, each dot tagged with its frame.
  const moving = normalizePoints({ frames: [[[0, 1, 0]], [[1, 1, 0], [2, 1, 0]], [[3, 1, 0]]], fps: 99 }, { half: 5, maxHeight: 10, maxPoints: 2, maxFrames: 2 });
  assert.equal(moving.count, 2);
  assert.equal(moving.frames, 2);
  assert.equal(moving.fps, 30);
  assert.deepEqual([...moving.frame], [0, 1]);
  assert.equal(moving.warnings.length, 2, 'too many frames, and too many dots');
  const mbuf = encodePoints(moving);
  assert.equal(mbuf.readUInt32LE(4), 2);
  assert.deepEqual([...mbuf.subarray(8 + 2 * 16)], [0, 1]);
});

test('code streams out of partial tool JSON', () => {
  const json = JSON.stringify({ name: 'x', description: 'has "code": "fake" inside', code: 'const a = "hi";\nexport default () => a;\t// done' });
  const f = new FieldStreamer('code');
  let out = '';
  for (let i = 0; i < json.length; i += 3) out += f.push(json.slice(i, i + 3));
  assert.equal(out, 'const a = "hi";\nexport default () => a;\t// done');
});

test('tool inputs are checked against their schema', () => {
  const schema = { type: 'object', properties: { n: { type: 'integer' }, m: { type: 'string', enum: ['a', 'b'] } }, required: ['n'] };
  assert.equal(validateInput(schema, { n: 2, m: 'a' }), null);
  assert.match(validateInput(schema, {}), /missing/);
  assert.match(validateInput(schema, { n: 1.5 }), /integer/);
  assert.match(validateInput(schema, { n: 1, m: 'c' }), /one of/);
});

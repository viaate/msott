import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { paths } from './config.js';
import { createApp } from './app.js';
import { bus } from './bus.js';
import { readJSON, writeJSON } from './store.js';
import { GitHubHome } from './github-home.js';
import { Mailbox } from './mailbox.js';
import { exportSite } from './export.js';

async function devvitSetup(app) {
  const file = path.join(paths.data, 'devvit.json');
  const rec = readJSON(file, {});
  const tag = crypto.createHash('sha256').update(process.env.CHARLIE_DEVVIT_CODE).digest('hex').slice(0, 16);
  if (rec.tried === tag) return;
  const r = await app.skills.run('devvit', { action: 'setup', template: process.env.CHARLIE_DEVVIT_TEMPLATE || 'threejs' });
  const ready = r.ok && /Set up your app|already set up/.test(r.text);
  writeJSON(file, { tried: tag, ready, at: new Date().toISOString() });
  const why = /couldn't read the setup code/.test(r.text) ? "Reddit couldn't read that code, so it was probably cut off when it was copied" : 'that code no longer works (they only work once, and not for long)';
  bus.feed('system', ready ? 'Charlie has a Reddit app of her own now.' : `Charlie's Reddit app couldn't be set up: ${why}. A fresh code from developers.reddit.com/new, copied whole, will do it.`);
}

async function step(name, fn) {
  try {
    return await fn();
  } catch (err) {
    console.error(`[${name}]`, err.message);
    return null;
  }
}

// One scheduled run on GitHub: collect her mailbox, check her accounts, wake
// her if her nap is over, then build the site for GitHub Pages.
export async function tick({ cmd = 'tick', args = [], client, out } = {}) {
  const repo = process.env.GITHUB_REPOSITORY || '';
  out = path.resolve(out || process.env.CHARLIE_SITE_OUT || path.join(paths.root, '_site'));
  const app = createApp({ client });
  const home = new GitHubHome({ repo, token: process.env.REPO_TOKEN, requests: app.requests });
  const mailbox = new Mailbox({ visitors: app.visitors });
  const notes = [];

  if (home.enabled) await step('labels', () => home.ensureLabels());
  const fromHuman = home.enabled ? ((await step('notes', () => home.notes())) ?? 0) : 0;
  if (fromHuman) notes.push(`${fromHuman} note${fromHuman > 1 ? 's' : ''} from you`);
  const intake = (await step('mailbox', () => mailbox.intake())) ?? { events: 0, messages: 0 };
  if (intake.events) notes.push(`${intake.events} letter${intake.events > 1 ? 's' : ''} from visitors`);

  if (cmd === 'pause') app.agent.pause();
  if (cmd === 'resume') app.agent.resume();
  if (cmd === 'gift') {
    const amount = Number(process.env.GIFT_AMOUNT || args[0] || 10);
    app.ledger.earn('gift', amount, process.env.GIFT_REASON || args[1] || 'a gift from your human');
    notes.push(`gift of ${amount}`);
  }

  // A Devvit code from Reddit is single-use and may expire, so use it as soon as it appears.
  if (process.env.CHARLIE_DEVVIT_CODE && app.skills.get('devvit')) await step('devvit', () => devvitSetup(app));

  for (const src of app.sources) await src.pollOnce();
  await step('refresh', () => app.world.refreshDue());
  if (home.enabled) await step('requests', () => home.syncRequests());

  const sessionFile = path.join(paths.data, 'session.json');
  let session = readJSON(sessionFile, null);
  const force = cmd === 'wake';
  let woke = false;
  if (force || app.agent.isDue(intake.messages > 0 || app.requests.unseenNotes().length > 0)) {
    const before = app.agent.beforeSnapshot();
    const early = app.agent.s.nextWakeAt > Date.now();
    const reason = force ? 'your human woke you up' : early && fromHuman ? 'your human left you a note' : early && intake.messages ? 'a visitor left you a message' : 'your nap ended';
    bus.startRecording();
    await app.agent.wake(reason);
    session = { id: (session?.id ?? 0) + 1, startedAt: before.t, endedAt: Date.now(), before, events: bus.stopRecording() };
    writeJSON(sessionFile, session);
    notes.push('Charlie woke up');
    woke = true;
  } else if (!app.agent.client) {
    console.log('No ANTHROPIC_API_KEY: Charlie has no brain yet, so she stays asleep.');
  }

  if (home.enabled) {
    await step('requests', () => home.syncRequests());
    await step('notes', () => home.closeReadNotes());
  }
  app.flush();
  home.flush();
  mailbox.flush();

  const { changed, version } = exportSite(app, { out, session, mailbox: mailbox.url, repo });
  return { app, changed, version, woke, out, summary: notes.join(', ') || 'a quiet tick' };
}

export function output(key, value) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${String(value).replace(/\n/g, ' ')}\n`);
  console.log(`${key}: ${value}`);
}

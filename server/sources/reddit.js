import fs from 'node:fs';
import path from 'node:path';
import { Source } from './base.js';
import { config, paths } from '../config.js';

const env = process.env;
const WWW = 'https://www.reddit.com';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

export function redditCreds() {
  const c = {
    id: env.CHARLIE_REDDIT_CLIENT_ID,
    secret: env.CHARLIE_REDDIT_CLIENT_SECRET,
    username: env.CHARLIE_REDDIT_USERNAME,
    password: env.CHARLIE_REDDIT_PASSWORD,
  };
  return Object.values(c).every(Boolean) ? c : null;
}

// The Reddit accounts whose posts count as hers: her own profile, and the
// account her Devvit app posts as (Devvit apps post under their app name).
export function redditProfiles() {
  const out = [];
  const own = (env.CHARLIE_REDDIT_USERNAME || config.sources.reddit?.username || '').replace(/^\/?u\//i, '').trim();
  if (own) out.push(own);
  const app = devvitAppName();
  if (app && !out.some((u) => u.toLowerCase() === app.toLowerCase())) out.push(app);
  return out;
}

function devvitAppName() {
  const root = path.join(paths.workspace, 'devvit');
  try {
    for (const d of fs.readdirSync(root)) {
      const f = path.join(root, d, 'devvit.json');
      if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8')).name || null;
    }
  } catch {}
  return null;
}

function unescape(s) {
  return String(s ?? '').replace(/&(lt|gt|quot|apos|#39|amp);/g, (_, e) => ({ lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", amp: '&' })[e]);
}

// The entries of a Reddit Atom feed: t3_ ids are posts, t1_ ids comments.
export function atomEntries(xml) {
  return [...String(xml).matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => ({
    id: (e.match(/<id>([^<]+)<\/id>/) ?? [])[1] ?? '',
    author: (e.match(/<author>\s*<name>\/?u\/([^<]+)<\/name>/) ?? [])[1] ?? '',
    link: unescape((e.match(/<link href="([^"]+)"/) ?? [])[1] ?? ''),
    title: unescape((e.match(/<title>([^<]*)<\/title>/) ?? [])[1] ?? ''),
    t: Date.parse((e.match(/<published>([^<]+)<\/published>/) ?? e.match(/<updated>([^<]+)<\/updated>/) ?? [])[1] ?? '') || 0,
  }));
}

// Reddit: karma her posts and comments earn, and comments other people leave
// on her posts. With API credentials it asks the API. Without them (Reddit's
// API is closed to new apps), it reads the public feeds Reddit publishes for
// every profile and post, and karma whenever Reddit lets her profile be read.
export class RedditSource extends Source {
  constructor(ledger) {
    super('reddit', ledger, { karma: null, user: null });
  }

  get enabled() {
    return Boolean(redditCreds() || redditProfiles().length);
  }

  async token() {
    const c = redditCreds();
    if (this.tok && this.tok.exp > Date.now()) return this.tok.value;
    const res = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${c.id}:${c.secret}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': `charlie-harness/0.1 by u/${c.username}`,
      },
      body: new URLSearchParams({ grant_type: 'password', username: c.username, password: c.password }),
    });
    const j = await res.json();
    if (!j.access_token) throw new Error(`Reddit login failed: ${JSON.stringify(j).slice(0, 200)}`);
    this.tok = { value: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
    return this.tok.value;
  }

  async api(p) {
    const res = await fetch(`https://oauth.reddit.com${p}`, {
      headers: { authorization: `Bearer ${await this.token()}`, 'user-agent': `charlie-harness/0.1 by u/${redditCreds().username}` },
    });
    if (!res.ok) throw new Error(`Reddit ${p} → ${res.status}`);
    return res.json();
  }

  async poll() {
    if (!redditCreds()) return this.pollPublic();
    const me = await this.api('/api/v1/me');
    this.s.user = me.name;
    const karma = (me.link_karma ?? 0) + (me.comment_karma ?? 0);
    if (!this.s.initialized) this.s.marks = { karma };
    else this.rise('karma', karma, 'reddit.karma', (n) => `+${n} karma on Reddit`);
    this.s.karma = karma;

    // Comments by other people on her posts: a post's comments minus her own.
    const posts = (await this.api(`/user/${me.name}/submitted?limit=50`)).data.children.map((c) => c.data);
    const mine = (await this.api(`/user/${me.name}/comments?limit=100`)).data.children.map((c) => c.data);
    const ownCount = {};
    for (const c of mine) ownCount[c.link_id] = (ownCount[c.link_id] ?? 0) + 1;
    for (const p of posts) {
      const others = Math.max(0, p.num_comments - (ownCount[`t3_${p.id}`] ?? 0));
      if (!this.s.initialized) (this.s.marks ??= {})[`c:${p.id}`] = others;
      else this.rise(`c:${p.id}`, others, 'reddit.comment', (n) => `${n} new comment${n > 1 ? 's' : ''} on your post in r/${p.subreddit}: "${p.title.slice(0, 60)}"`);
    }
    this.s.posts = posts.slice(0, 15).map((p) => ({ title: p.title, sub: p.subreddit, score: p.score, comments: p.num_comments, url: `https://reddit.com${p.permalink}`, removed: Boolean(p.removed_by_category) }));
  }

  async get(p, as = 'text') {
    const res = await fetch(`${WWW}${p}`, { headers: { 'user-agent': `charlie/1.0 (by u/${redditProfiles()[0]})` } });
    if (!res.ok) throw Object.assign(new Error(`Reddit ${p.split('?')[0]} → ${res.status}`), { status: res.status });
    return as === 'json' ? res.json() : res.text();
  }

  async pollPublic() {
    const users = redditProfiles();
    const theirs = (a) => users.some((u) => u.toLowerCase() === a.toLowerCase());
    this.s.user = users[0];
    const old = new Map((this.s.posts ?? []).map((p) => [p.id, p]));
    const posts = [];
    for (const u of users) {
      for (const e of atomEntries(await this.get(`/user/${u}/submitted/.rss?limit=25`))) {
        if (!e.id.startsWith('t3_')) continue;
        const id = e.id.slice(3);
        posts.push({ id, by: u, title: e.title, sub: (e.link.match(/\/r\/([^/]+)\//) ?? [])[1] ?? '?', url: e.link, t: e.t, comments: old.get(id)?.comments ?? null, score: old.get(id)?.score ?? null });
      }
      await pause(1500);
    }
    posts.sort((a, b) => b.t - a.t);

    // Comments from other people, read from each post's own feed: the newest
    // few every time, and one older post in turn. Reddit's feeds stop at 100.
    const older = posts.slice(5);
    const due = posts.slice(0, 5);
    if (older.length) due.push(older[(this.s.turn = ((this.s.turn ?? 0) + 1) % older.length)]);
    for (const p of due) {
      try {
        const feed = atomEntries(await this.get(`${new URL(p.url).pathname}.rss?limit=100`));
        p.comments = feed.filter((e) => e.id.startsWith('t1_') && !theirs(e.author)).length;
        this.rise(`c:${p.id}`, p.comments, 'reddit.comment', (n) => `${n} new comment${n > 1 ? 's' : ''} on your post in r/${p.sub}: "${p.title.slice(0, 60)}"`);
      } catch (err) {
        if (err.status === 429) break;
      }
      await pause(1500);
    }

    // Karma, when Reddit lets us read profiles from here (it often refuses
    // servers in the cloud; then it tries again in a few hours).
    if (!(this.s.karmaRetryAt > Date.now())) {
      try {
        let karma = 0;
        for (const u of users) {
          const { data } = await this.get(`/user/${u}/about.json`, 'json');
          const k = data.total_karma ?? (data.link_karma ?? 0) + (data.comment_karma ?? 0);
          (this.s.marks ??= {})[`karma:${u}`] ??= k;
          this.rise(`karma:${u}`, k, 'reddit.karma', (n) => `+${n} karma on Reddit`);
          karma += k;
        }
        this.s.karma = karma;
        this.s.karmaRetryAt = 0;
      } catch {
        this.s.karmaRetryAt = Date.now() + 6 * 3600_000;
      }
    }
    this.s.posts = posts.slice(0, 25);
  }

  status() {
    return { ...super.status(), label: this.s.user ? `Reddit u/${this.s.user}` : 'Reddit', karma: this.s.karma, url: this.s.user ? `https://www.reddit.com/user/${this.s.user}` : null };
  }

  lines() {
    const karma = this.s.karma != null ? `, ${this.s.karma} karma` : '';
    if (!this.s.posts?.length) return this.s.user ? [`REDDIT (u/${this.s.user}${karma}): no posts yet.`] : [];
    const score = (p) => (p.score != null ? `${p.score} points, ` : '');
    const comments = (p) => (p.comments != null ? `${p.comments} comments` : 'comments not checked yet');
    return [
      `REDDIT (u/${this.s.user}${karma}), recent posts:`,
      ...this.s.posts.slice(0, 8).map((p) => `- r/${p.sub}${p.by && p.by !== this.s.user ? ` (as u/${p.by})` : ''}: "${p.title.slice(0, 70)}" — ${score(p)}${comments(p)}${p.removed ? ' — REMOVED by moderators' : ''}`),
    ];
  }
}

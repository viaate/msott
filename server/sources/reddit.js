import { Source } from './base.js';

const env = process.env;

export function redditCreds() {
  const c = {
    id: env.CHARLIE_REDDIT_CLIENT_ID,
    secret: env.CHARLIE_REDDIT_CLIENT_SECRET,
    username: env.CHARLIE_REDDIT_USERNAME,
    password: env.CHARLIE_REDDIT_PASSWORD,
  };
  return Object.values(c).every(Boolean) ? c : null;
}

// Reddit: karma her posts and comments earn, and comments other people leave
// on her posts.
export class RedditSource extends Source {
  constructor(ledger) {
    super('reddit', ledger, { karma: null, user: null });
  }

  get enabled() {
    return Boolean(redditCreds());
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

  status() {
    return { ...super.status(), label: this.s.user ? `Reddit u/${this.s.user}` : 'Reddit', karma: this.s.karma, url: this.s.user ? `https://www.reddit.com/user/${this.s.user}` : null };
  }

  lines() {
    if (!this.s.posts?.length) return [];
    return [`REDDIT (u/${this.s.user}, ${this.s.karma} karma), recent posts:`, ...this.s.posts.slice(0, 8).map((p) => `- r/${p.sub}: "${p.title.slice(0, 70)}" — ${p.score} points, ${p.comments} comments${p.removed ? ' — REMOVED by moderators' : ''}`)];
  }
}

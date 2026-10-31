import { Source } from './base.js';

const API = 'https://public.api.bsky.app/xrpc';
const PLURAL = { like: 'likes', repost: 'reposts', reply: 'replies', quote: 'quotes' };

// Bluesky: followers, and likes, reposts, replies and quotes on her posts.
// Uses the public API, so it only needs her handle.
export class BlueskySource extends Source {
  constructor(ledger) {
    super('bluesky', ledger, { handle: null, followers: null });
    // Her DID outlasts handle changes, so her skill can still sign in after one.
    if (this.s.did && this.handle && !process.env.CHARLIE_BLUESKY_DID) process.env.CHARLIE_BLUESKY_DID = this.s.did;
  }

  get handle() {
    return (process.env.CHARLIE_BLUESKY_HANDLE || '').replace(/^@/, '');
  }

  get enabled() {
    return Boolean(this.handle);
  }

  async get(method, params) {
    const res = await fetch(`${API}/${method}?${new URLSearchParams(params)}`, { headers: { 'user-agent': 'charlie-harness/0.1' } });
    if (!res.ok) throw new Error(`Bluesky ${method} → ${res.status}`);
    return res.json();
  }

  async poll() {
    let profile;
    try {
      profile = await this.get('app.bsky.actor.getProfile', { actor: this.handle });
    } catch (err) {
      if (!this.s.did) throw err;
      profile = await this.get('app.bsky.actor.getProfile', { actor: this.s.did });
    }
    this.s.did = profile.did;
    this.s.handle = profile.handle;
    const first = !this.s.initialized;
    const marks = (this.s.marks ??= {});
    if (first) marks.followers = profile.followersCount;
    else this.rise('followers', profile.followersCount, 'bluesky.follower', (n) => `${n} new follower${n > 1 ? 's' : ''} on Bluesky`);
    this.s.followers = profile.followersCount;

    const feed = await this.get('app.bsky.feed.getAuthorFeed', { actor: profile.did, limit: 60, filter: 'posts_no_replies' });
    const posts = feed.feed.map((f) => f.post).filter((p) => p.author.did === profile.did);
    for (const p of posts) {
      const id = p.uri.split('/').pop();
      const text = String(p.record?.text ?? '').slice(0, 50);
      for (const [field, key, word] of [['likeCount', 'bluesky.like', 'like'], ['repostCount', 'bluesky.repost', 'repost'], ['replyCount', 'bluesky.reply', 'reply'], ['quoteCount', 'bluesky.repost', 'quote']]) {
        const v = p[field] ?? 0;
        if (first) marks[`${field}:${id}`] = v;
        else this.rise(`${field}:${id}`, v, key, (n) => `${n} new ${n > 1 ? PLURAL[word] : word} on Bluesky: "${text}"`);
      }
    }
    this.s.posts = posts.slice(0, 10).map((p) => ({ text: String(p.record?.text ?? '').slice(0, 80), likes: p.likeCount, reposts: p.repostCount, replies: p.replyCount }));
  }

  status() {
    const handle = this.s.handle || this.handle;
    return { ...super.status(), label: handle ? `Bluesky @${handle}` : 'Bluesky', followers: this.s.followers, url: handle ? `https://bsky.app/profile/${handle}` : null };
  }

  lines() {
    if (!this.s.posts?.length) return [];
    return [`BLUESKY (@${this.s.handle}, ${this.s.followers} followers), recent posts:`, ...this.s.posts.slice(0, 6).map((p) => `- "${p.text}" — ${p.likes} likes, ${p.reposts} reposts, ${p.replies} replies`)];
  }
}

// Charlie on Bluesky, with an app password on her own account.
const PDS = 'https://bsky.social/xrpc';
const env = process.env;

async function session() {
  const res = await fetch(`${PDS}/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: env.CHARLIE_BLUESKY_HANDLE.replace(/^@/, ''), password: env.CHARLIE_BLUESKY_APP_PASSWORD }),
  });
  const j = await res.json();
  if (!j.accessJwt) throw new Error(`Bluesky login failed: ${JSON.stringify(j)}`);
  return j;
}

async function xrpc(s, method, { params, body } = {}) {
  const url = `${PDS}/${method}${params ? `?${new URLSearchParams(params)}` : ''}`;
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${s.accessJwt}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Bluesky ${method} → ${res.status}: ${JSON.stringify(j).slice(0, 300)}`);
  return j;
}

// Links in the text become clickable facets (byte offsets in UTF-8).
function facets(text) {
  const out = [];
  const re = /https?:\/\/[^\s)]+/g;
  let m;
  while ((m = re.exec(text))) {
    const start = Buffer.byteLength(text.slice(0, m.index));
    out.push({ index: { byteStart: start, byteEnd: start + Buffer.byteLength(m[0]) }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: m[0] }] });
  }
  return out;
}

function record(text, input, reply) {
  const r = { $type: 'app.bsky.feed.post', text, createdAt: new Date().toISOString(), facets: facets(text) };
  if (input.link) r.embed = { $type: 'app.bsky.embed.external', external: { uri: input.link, title: input.link_title || input.link, description: input.link_description || '' } };
  if (reply) r.reply = reply;
  return r;
}

const brief = (p) => ({ uri: p.uri, text: p.record?.text, likes: p.likeCount, reposts: p.repostCount, replies: p.replyCount, quotes: p.quoteCount, at: p.record?.createdAt, author: p.author?.handle });

export default async function run(input) {
  const s = await session();
  switch (input.action) {
    case 'post': {
      if (!input.text || [...input.text].length > 300) throw new Error('Posts need text, up to 300 characters.');
      const r = await xrpc(s, 'com.atproto.repo.createRecord', { body: { repo: s.did, collection: 'app.bsky.feed.post', record: record(input.text, input) } });
      return { ok: true, uri: r.uri, url: `https://bsky.app/profile/${s.handle}/post/${r.uri.split('/').pop()}` };
    }
    case 'reply': {
      const t = await xrpc(s, 'app.bsky.feed.getPostThread', { params: { uri: input.uri, depth: 0 } });
      const parent = t.thread.post;
      const root = parent.record.reply?.root ?? { uri: parent.uri, cid: parent.cid };
      const r = await xrpc(s, 'com.atproto.repo.createRecord', { body: { repo: s.did, collection: 'app.bsky.feed.post', record: record(input.text, input, { root, parent: { uri: parent.uri, cid: parent.cid } }) } });
      return { ok: true, uri: r.uri };
    }
    case 'notifications':
      return (await xrpc(s, 'app.bsky.notification.listNotifications', { params: { limit: 30 } })).notifications.map((n) => ({ reason: n.reason, from: n.author.handle, text: n.record?.text, uri: n.uri, at: n.indexedAt, new: !n.isRead }));
    case 'my_posts':
      return (await xrpc(s, 'app.bsky.feed.getAuthorFeed', { params: { actor: s.did, limit: 25 } })).feed.map((f) => brief(f.post));
    case 'profile': {
      const p = await xrpc(s, 'app.bsky.actor.getProfile', { params: { actor: input.actor || s.did } });
      return { handle: p.handle, name: p.displayName, bio: p.description, followers: p.followersCount, following: p.followsCount, posts: p.postsCount };
    }
    case 'search':
      return (await xrpc(s, 'app.bsky.feed.searchPosts', { params: { q: input.query, limit: 20 } })).posts.map(brief);
    case 'thread': {
      const t = await xrpc(s, 'app.bsky.feed.getPostThread', { params: { uri: input.uri, depth: 2 } });
      return { post: brief(t.thread.post), replies: (t.thread.replies ?? []).map((r) => brief(r.post)) };
    }
  }
  throw new Error(`Unknown action ${input.action}`);
}

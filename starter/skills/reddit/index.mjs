// Charlie on Reddit, through a "script" app on her own account.
import fs from 'node:fs';
import path from 'node:path';

const env = process.env;
const UA = `charlie-the-dog/1.0 by u/${env.CHARLIE_REDDIT_USERNAME}`;
const cache = path.join(env.CHARLIE_HOME || '.', '.cache', 'reddit-token.json');

async function token() {
  try {
    const t = JSON.parse(fs.readFileSync(cache, 'utf8'));
    if (t.exp > Date.now()) return t.value;
  } catch {}
  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${env.CHARLIE_REDDIT_CLIENT_ID}:${env.CHARLIE_REDDIT_CLIENT_SECRET}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': UA,
    },
    body: new URLSearchParams({ grant_type: 'password', username: env.CHARLIE_REDDIT_USERNAME, password: env.CHARLIE_REDDIT_PASSWORD }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error(`Reddit login failed: ${JSON.stringify(j)}`);
  fs.mkdirSync(path.dirname(cache), { recursive: true });
  fs.writeFileSync(cache, JSON.stringify({ value: j.access_token, exp: Date.now() + (j.expires_in - 120) * 1000 }));
  return j.access_token;
}

async function api(method, p, form) {
  const res = await fetch(`https://oauth.reddit.com${p}`, {
    method,
    headers: { authorization: `Bearer ${await token()}`, 'user-agent': UA, ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
    body: form ? new URLSearchParams({ api_type: 'json', ...form }) : undefined,
  });
  const text = await res.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {}
  if (!res.ok) throw new Error(`Reddit ${method} ${p} → ${res.status}: ${String(text).slice(0, 400)}`);
  return data;
}

const post = (d) => ({ id: d.name, title: d.title, subreddit: d.subreddit, score: d.score, comments: d.num_comments, url: `https://reddit.com${d.permalink}`, removed: d.removed_by_category || null, created: new Date(d.created_utc * 1000).toISOString() });
const comment = (d) => ({ id: d.name, on: d.link_title, subreddit: d.subreddit, score: d.score, body: String(d.body).slice(0, 300), url: `https://reddit.com${d.permalink}` });

export default async function run(input) {
  const me = env.CHARLIE_REDDIT_USERNAME;
  const sr = String(input.subreddit || '').replace(/^\/?r\//, '');
  switch (input.action) {
    case 'me': {
      const m = await api('GET', '/api/v1/me');
      return { name: m.name, link_karma: m.link_karma, comment_karma: m.comment_karma, created: new Date(m.created_utc * 1000).toISOString() };
    }
    case 'rules':
      return (await api('GET', `/r/${sr}/about/rules`)).rules.map((r) => ({ rule: r.short_name, details: String(r.description).slice(0, 500) }));
    case 'about': {
      const a = (await api('GET', `/r/${sr}/about`)).data;
      return { name: a.display_name, subscribers: a.subscribers, active: a.accounts_active, description: String(a.public_description || '').slice(0, 600), submission_type: a.submission_type, over18: a.over18 };
    }
    case 'submit': {
      const form = { sr, title: input.title, kind: input.url ? 'link' : 'self', ...(input.url ? { url: input.url } : { text: input.text ?? '' }), ...(input.flair_id ? { flair_id: input.flair_id } : {}), resubmit: 'true' };
      const r = await api('POST', '/api/submit', form);
      return r.json?.errors?.length ? { errors: r.json.errors } : { ok: true, url: r.json?.data?.url, id: r.json?.data?.name };
    }
    case 'comment': {
      const r = await api('POST', '/api/comment', { thing_id: input.parent, text: input.text });
      return r.json?.errors?.length ? { errors: r.json.errors } : { ok: true, id: r.json?.data?.things?.[0]?.data?.name };
    }
    case 'my_posts':
      return (await api('GET', `/user/${me}/submitted?limit=25`)).data.children.map((c) => post(c.data));
    case 'my_comments':
      return (await api('GET', `/user/${me}/comments?limit=25`)).data.children.map((c) => comment(c.data));
    case 'inbox':
      return (await api('GET', '/message/inbox?limit=25')).data.children.map((c) => ({ id: c.data.name, from: c.data.author, subject: c.data.subject, body: String(c.data.body).slice(0, 400), context: c.data.context ? `https://reddit.com${c.data.context}` : null, new: c.data.new }));
    case 'read': {
      const id = String(input.id).replace(/^t3_/, '');
      const [p, comments] = await api('GET', `/comments/${id}?limit=20&depth=2&sort=top`);
      return { post: { ...post(p.data.children[0].data), text: String(p.data.children[0].data.selftext).slice(0, 1500) }, comments: comments.data.children.filter((c) => c.kind === 't1').map((c) => ({ id: c.data.name, author: c.data.author, score: c.data.score, body: String(c.data.body).slice(0, 400) })) };
    }
    case 'search': {
      const q = new URLSearchParams({ q: input.query ?? '', limit: '15', sort: 'relevance', ...(sr ? { restrict_sr: 'true' } : {}) });
      return (await api('GET', `${sr ? `/r/${sr}` : ''}/search?${q}`)).data.children.map((c) => post(c.data));
    }
    case 'api':
      return api(String(input.method || 'GET').toUpperCase(), input.path, input.form);
  }
  throw new Error(`Unknown action ${input.action}`);
}

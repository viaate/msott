// Charlie's first skill: talk to GitHub as herself.
const API = 'https://api.github.com';

const NOISE = /(_url|^url|node_id|gravatar_id)$/;
const KEEP = new Set(['html_url', 'clone_url', 'download_url', 'avatar_url']);

function trim(value, depth = 0) {
  if (Array.isArray(value)) return value.map((v) => trim(v, depth + 1));
  if (!value || typeof value !== 'object') return value;
  if (depth > 0 && value.login && value.type && Object.keys(value).length > 6) return value.login;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (NOISE.test(k) && !KEEP.has(k)) continue;
    if (k === 'permissions' || k === 'license' || k === '_links') continue;
    out[k] = trim(v, depth + 1);
  }
  return out;
}

export default async function run({ method = 'GET', path, body, raw = false }) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('No GitHub account is connected yet (GITHUB_TOKEN is empty).');
  if (typeof path !== 'string' || !path.startsWith('/')) throw new Error('path must start with "/", e.g. /user/repos');

  if (body && typeof body.content_text === 'string') {
    body = { ...body, content: Buffer.from(body.content_text, 'utf8').toString('base64') };
    delete body.content_text;
  }

  const res = await fetch(API + path, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'charlie-the-dog',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {}

  return {
    status: res.status,
    ok: res.ok,
    rateLimitRemaining: Number(res.headers.get('x-ratelimit-remaining') ?? NaN) || undefined,
    data: raw ? data : trim(data),
  };
}

// Charlie's hands on the web: one HTTP request at a time.
const SECRET = /\{\{\s*((?:CHARLIE_|GITHUB_)[A-Z0-9_]+)\s*\}\}/g;

function fill(value) {
  if (typeof value === 'string') {
    return value.replace(SECRET, (_, name) => {
      if (!(name in process.env)) throw new Error(`There's no secret called ${name} in your environment.`);
      return process.env[name];
    });
  }
  if (Array.isArray(value)) return value.map(fill);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v)]));
  return value;
}

function readable(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, '')
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)\b[^>]*>/gi, '\n')
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 [$1]')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

export default async function run({ method = 'GET', url, headers = {}, json, form, body, raw = false, max_chars = 12000 }) {
  const secrets = Object.entries(process.env).filter(([k, v]) => (k.startsWith('CHARLIE_') || k === 'GITHUB_TOKEN') && v && v.length >= 6).map(([, v]) => v);
  const h = { 'user-agent': 'charlie-the-dog/1.0', ...fill(headers) };
  let payload;
  if (json !== undefined) {
    payload = JSON.stringify(fill(json));
    h['content-type'] ??= 'application/json';
  } else if (form) {
    payload = new URLSearchParams(fill(form)).toString();
    h['content-type'] ??= 'application/x-www-form-urlencoded';
  } else if (body !== undefined) payload = fill(body);

  const res = await fetch(fill(url), { method, headers: h, body: payload, redirect: 'follow' });
  const type = res.headers.get('content-type') || '';
  let text = method === 'HEAD' ? '' : await res.text();
  let data = text;
  if (type.includes('json')) {
    try {
      data = JSON.parse(text);
    } catch {}
  } else if (type.includes('html') && !raw) data = readable(text);
  let out = typeof data === 'string' ? data : JSON.stringify(data, null, 1);
  // Never echo a secret back, even if a site reflects it.
  for (const s of secrets) out = out.split(s).join('•••');
  if (out.length > max_chars) out = `${out.slice(0, max_chars)}\n…[${out.length - max_chars} more characters]`;
  return {
    status: res.status,
    ok: res.ok,
    url: res.url,
    headers: Object.fromEntries(['content-type', 'location', 'retry-after', 'x-ratelimit-remaining'].map((k) => [k, res.headers.get(k)]).filter(([, v]) => v)),
    body: out,
  };
}

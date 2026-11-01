import fs from 'node:fs';
import path from 'node:path';
export default async function run(input, ctx) {
  const safe = (p) => { const f = path.resolve(ctx.home, p); if (!f.startsWith(path.resolve(ctx.home))) throw new Error('outside home'); return f; };
  const file = safe(input.path);
  let text = fs.readFileSync(file, 'utf8');
  const report = [];
  for (const e of input.edits || []) {
    const n = text.split(e.find).length - 1;
    if (n === 0) { report.push(`NOT FOUND: ${e.find.slice(0,60)}`); continue; }
    text = e.all ? text.split(e.find).join(e.replace) : text.replace(e.find, () => e.replace);
    report.push(`replaced ${e.all ? n : 1}/${n}: ${e.find.slice(0,40)}`);
  }
  if ((input.edits || []).length) fs.writeFileSync(file, text);
  if (input.copy_to) { const t = safe(input.copy_to); fs.mkdirSync(path.dirname(t), {recursive:true}); fs.writeFileSync(t, text); report.push('copied to ' + input.copy_to); }
  if (input.push_to_repo) {
    const r = input.push_to_repo;
    const api = `https://api.github.com/repos/${r.repo}/contents/${r.path.split('/').map(encodeURIComponent).join('/')}`;
    const h = { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'charlie-edit-file' };
    let sha;
    const g = await fetch(api + (r.branch ? `?ref=${r.branch}` : ''), { headers: h });
    if (g.ok) sha = (await g.json()).sha;
    const body = { message: r.message || `update ${r.path}`, content: Buffer.from(text, 'utf8').toString('base64') };
    if (sha) body.sha = sha; if (r.branch) body.branch = r.branch;
    const p = await fetch(api, { method: 'PUT', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    report.push(`push ${r.repo}/${r.path}: ${p.status} ${p.ok ? (sha ? 'updated' : 'created') : (await p.text()).slice(0,200)}`);
  }
  let lines = [];
  if (input.grep) lines = text.split('\n').map((l,i)=>`${i+1}: ${l.slice(0,200)}`).filter(l=>l.includes(input.grep)).slice(0,40);
  return { size: text.length, report, lines };
}
import fs from 'node:fs';
import path from 'node:path';
import { paths } from './config.js';
import { JSONStore, clip, ensureDir } from './store.js';
import { sniffImage } from './visitors.js';

export const ASK_LABEL = 'charlie-asks';
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
const MAX_FILE = 25_000_000;

// Files attached to an issue (dragged into GitHub's editor).
export function attachmentUrls(text) {
  const urls = new Set();
  for (const m of String(text ?? '').matchAll(/!?\[[^\]]*\]\((https:\/\/[^)\s]+)\)/g)) urls.add(m[1]);
  for (const m of String(text ?? '').matchAll(/<img[^>]+src="(https:\/\/[^"]+)"/g)) urls.add(m[1]);
  return [...urls].filter((u) => /^https:\/\/(github\.com\/(user-attachments\/|[^/]+\/[^/]+\/files\/)|user-images\.githubusercontent\.com\/|private-user-images\.githubusercontent\.com\/)/.test(u));
}

function withoutAttachments(text) {
  return String(text ?? '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/<img[^>]*>/g, '').trim();
}

// When Charlie lives on GitHub, her human talks with her through issues on
// her repo: her requests become issues assigned to them, and any issue they
// open is a note to her (with whatever files they attach). Visitors reach her
// through her mailbox instead.
export class GitHubHome {
  constructor({ repo, token, requests }) {
    this.repo = repo;
    this.token = token;
    this.requests = requests;
    this.store = new JSONStore(path.join(paths.data, 'github-home.json'), { labels: false, owner: null });
  }

  get enabled() {
    return Boolean(this.repo && this.token);
  }

  async api(method, p, body) {
    const res = await fetch(`https://api.github.com${p}`, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'charlie-home',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`GitHub ${method} ${p} → ${res.status} ${JSON.stringify(data).slice(0, 200)}`);
    return data;
  }

  async ensureLabels() {
    if (this.store.data.labels) return;
    try {
      await this.api('POST', `/repos/${this.repo}/labels`, { name: ASK_LABEL, color: 'e9bd62', description: 'Charlie is asking her human for something' });
    } catch {}
    const repo = await this.api('GET', `/repos/${this.repo}`);
    this.store.data.owner = repo.owner.login;
    this.store.data.labels = true;
    this.store.save();
  }

  // Issues her human opens are notes to her. Attached files go in her home,
  // in from-your-human/, for her to look at and use.
  async notes() {
    const owner = this.store.data.owner;
    if (!owner) return 0;
    const delivered = new Set(this.store.data.notes ?? []);
    const issues = await this.api('GET', `/repos/${this.repo}/issues?state=open&creator=${encodeURIComponent(owner)}&sort=created&direction=asc&per_page=30`);
    let n = 0;
    for (const issue of issues) {
      const labels = issue.labels.map((l) => (typeof l === 'string' ? l : l.name));
      if (issue.pull_request || delivered.has(issue.number) || labels.some((l) => [ASK_LABEL, 'for-charlie'].includes(l))) continue;
      const files = [];
      for (const url of attachmentUrls(issue.body).slice(0, 12)) {
        const buf = await this.download(url);
        if (!buf) continue;
        const name = decodeURIComponent(new URL(url).pathname.split('/').pop()).replace(/[^\w.-]/g, '');
        const ext = EXT[sniffImage(buf)] ?? (path.extname(name).slice(1) || 'bin');
        const rel = `from-your-human/issue-${issue.number}-${files.length + 1}.${ext}`;
        fs.writeFileSync(path.join(ensureDir(path.join(paths.home, 'from-your-human')), path.basename(rel)), buf);
        files.push(rel);
      }
      this.requests.note([issue.title, withoutAttachments(issue.body)].filter(Boolean).join('\n\n'), { files, issue: issue.number });
      delivered.add(issue.number);
      n++;
      await this.api('POST', `/repos/${this.repo}/issues/${issue.number}/reactions`, { content: 'eyes' }).catch(() => {});
    }
    this.store.data.notes = [...delivered].slice(-500);
    this.store.save();
    return n;
  }

  // Once she's read a note, its issue is closed.
  async closeReadNotes() {
    for (const note of this.requests.notes) {
      if (!note.issue || !note.seenAt || note.closed) continue;
      try {
        const site = process.env.PUBLIC_URL || '';
        await this.api('POST', `/repos/${this.repo}/issues/${note.issue}/comments`, { body: `🐾 Charlie read this when she woke up.${site ? ` Watch her replay to see what she did: ${site}` : ''}` });
        await this.api('PATCH', `/repos/${this.repo}/issues/${note.issue}`, { state: 'closed', state_reason: 'completed' });
        note.closed = true;
        this.requests.store.save();
      } catch (err) {
        console.error('[issues] closing a note failed:', err.message);
      }
    }
  }

  async download(url) {
    try {
      const res = await fetch(url, { headers: { authorization: `Bearer ${this.token}`, 'user-agent': 'charlie-home' }, redirect: 'follow' });
      if (!res.ok || Number(res.headers.get('content-length') || 0) > MAX_FILE) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      return buf.length <= MAX_FILE ? buf : null;
    } catch {
      return null;
    }
  }

  // Her requests become issues assigned to her human; their first comment is the answer.
  async syncRequests() {
    const owner = this.store.data.owner;
    for (const r of this.requests.items) {
      try {
        if (r.status === 'open' && !r.issue) {
          const issue = await this.api('POST', `/repos/${this.repo}/issues`, {
            title: `Charlie asks: ${clip(r.text, 70).replace(/\n/g, ' ')}`,
            body: `${r.text}\n\n---\nReply with a comment. Charlie reads the first reply from @${owner} the next time she wakes up. Close the issue to say no without a reply.`,
            labels: [ASK_LABEL],
            ...(owner ? { assignees: [owner] } : {}),
          });
          r.issue = issue.number;
          this.requests.store.save();
        } else if (r.status === 'open' && r.issue) {
          const comments = await this.api('GET', `/repos/${this.repo}/issues/${r.issue}/comments?per_page=30`);
          const answer = comments.find((c) => ['OWNER', 'MEMBER', 'COLLABORATOR'].includes(c.author_association) && c.user.type !== 'Bot');
          if (answer) {
            this.requests.answer(r.id, answer.body, 'done');
            await this.api('PATCH', `/repos/${this.repo}/issues/${r.issue}`, { state: 'closed', state_reason: 'completed' });
          } else {
            const issue = await this.api('GET', `/repos/${this.repo}/issues/${r.issue}`);
            if (issue.state === 'closed') this.requests.answer(r.id, '', 'declined');
          }
        }
      } catch (err) {
        console.error('[issues] request sync failed:', err.message);
      }
    }
  }

  flush() {
    this.store.flush();
  }
}


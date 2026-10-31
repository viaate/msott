import path from 'node:path';
import { paths } from './config.js';
import { JSONStore, clip } from './store.js';

export const ASK_LABEL = 'charlie-asks';

// When Charlie lives on GitHub, her requests to her human become issues on her
// repo, assigned to them. (Visitors reach her through her mailbox instead.)
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


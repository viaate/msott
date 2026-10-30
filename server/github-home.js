import path from 'node:path';
import { config, paths } from './config.js';
import { JSONStore, clip } from './store.js';
import { HOUSE_ACTIONS, buildActions } from './places.js';
import { sniffImage } from './visitors.js';

export const VISITOR_LABEL = 'for-charlie';
export const ASK_LABEL = 'charlie-asks';

// Option text in .github/ISSUE_TEMPLATE/charlie-action.yml → what it does.
export const ACTION_OPTIONS = {
  'pet her': 'pet',
  'toss a treat': 'treat',
  ...Object.fromEntries(HOUSE_ACTIONS.map((a) => [a.label, a.id])),
};

// Issue forms arrive as markdown: "### Label\n\nvalue" for each field.
export function formFields(body) {
  const out = {};
  for (const section of String(body ?? '').split(/^###\s+/m).slice(1)) {
    const nl = section.indexOf('\n');
    const label = (nl < 0 ? section : section.slice(0, nl)).trim().toLowerCase();
    let value = nl < 0 ? '' : section.slice(nl + 1).trim();
    if (value === '_No response_') value = '';
    out[label] = value;
  }
  return out;
}

export function imageUrls(text) {
  const urls = new Set();
  for (const m of String(text ?? '').matchAll(/!\[[^\]]*\]\((https:\/\/[^)\s]+)\)/g)) urls.add(m[1]);
  for (const m of String(text ?? '').matchAll(/<img[^>]+src="(https:\/\/[^"]+)"/g)) urls.add(m[1]);
  return [...urls].filter((u) => /^https:\/\/(github\.com\/user-attachments\/|user-images\.githubusercontent\.com\/|private-user-images\.githubusercontent\.com\/)/.test(u));
}

function stripImages(text) {
  return String(text ?? '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/<img[^>]*>/g, '').trim();
}

// When Charlie lives on GitHub, visitors reach her through issues on her
// repo: issue forms for pets, treats, actions and messages. She answers on
// the issue, and her requests to her human become issues too.
export class GitHubHome {
  constructor({ repo, token, visitors, requests, world }) {
    this.repo = repo;
    this.token = token;
    this.visitors = visitors;
    this.requests = requests;
    this.world = world;
    this.store = new JSONStore(path.join(paths.data, 'github-home.json'), { labels: false, done: [], owner: null });
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
    const want = [[VISITOR_LABEL, 'd6834a', 'Something for Charlie'], [ASK_LABEL, 'e9bd62', 'Charlie is asking her human for something'], ['message', '93b6d8', ''], ['action', 'a8d08f', '']];
    for (const [name, color, description] of want) {
      try {
        await this.api('POST', `/repos/${this.repo}/labels`, { name, color, description });
      } catch {}
    }
    const repo = await this.api('GET', `/repos/${this.repo}`);
    this.store.data.owner = repo.owner.login;
    this.store.data.labels = true;
    this.store.save();
  }

  // New issues from visitors → pets, treats, actions, messages, pictures.
  async intake() {
    const done = new Set(this.store.data.done);
    const issues = await this.api('GET', `/repos/${this.repo}/issues?labels=${VISITOR_LABEL}&state=open&sort=created&direction=asc&per_page=50`);
    let messages = 0;
    let events = 0;
    for (const issue of issues) {
      if (done.has(issue.number) || issue.pull_request || issue.user?.type === 'Bot') continue;
      done.add(issue.number);
      events++;
      const login = issue.user.login;
      const who = this.visitors.github(login);
      who.p.issue = issue.number;
      const fields = formFields(issue.body);
      const labels = issue.labels.map((l) => (typeof l === 'string' ? l : l.name));
      try {
        if (labels.includes('action')) {
          const choice = (fields['what do you do?'] ?? '').trim().toLowerCase();
          const other = (fields['something else? (optional)'] ?? '').trim();
          let id = ACTION_OPTIONS[choice];
          if (!id && other) {
            const builds = buildActions(this.world);
            id = builds.find((a) => a.id === other || a.label.toLowerCase() === other.toLowerCase())?.id;
          }
          let r;
          if (id === 'pet') r = this.visitors.petBy(who);
          else if (id === 'treat') r = this.visitors.treatBy(who);
          else if (id) r = this.visitors.actionBy(who, id);
          else r = { error: "Charlie didn't understand that one." };
          const ok = !r.error && r.counted !== false;
          await this.comment(issue.number, ok ? '🐾 Charlie felt that.' : `🐾 ${r.error ?? "Charlie's had plenty of those from you today, but she noticed."}`);
          await this.api('PATCH', `/repos/${this.repo}/issues/${issue.number}`, { state: 'closed', state_reason: 'completed' });
        } else {
          const raw = fields['your message'] ?? issue.body ?? '';
          const pictures = [];
          for (const url of imageUrls(raw).slice(0, 2)) {
            const buf = await this.download(url);
            if (buf) pictures.push(buf);
          }
          const text = [issue.title.replace(/^💌\s*for charlie\s*/i, '').trim(), stripImages(raw)].filter(Boolean).join('\n').trim();
          const r = this.visitors.offerBy(who, { text, picture: pictures[0] ?? null, maxLength: 1200, ref: issue.number });
          if (r.error) await this.comment(issue.number, r.error);
          else {
            messages++;
            await this.api('POST', `/repos/${this.repo}/issues/${issue.number}/reactions`, { content: 'eyes' }).catch(() => {});
          }
        }
      } catch (err) {
        console.error(`[issues] #${issue.number}:`, err.message);
      }
    }
    this.store.data.done = [...done].slice(-3000);
    this.store.save();
    return { events, messages };
  }

  async download(url) {
    try {
      const res = await fetch(url, { headers: { authorization: `Bearer ${this.token}`, 'user-agent': 'charlie-home' }, redirect: 'follow' });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      return buf.length <= config.site.maxPictureBytes && sniffImage(buf) ? buf : null;
    } catch {
      return null;
    }
  }

  async comment(number, body) {
    return this.api('POST', `/repos/${this.repo}/issues/${number}/comments`, { body: `${body}\n\n<sub>[visit Charlie](${process.env.PUBLIC_URL || ''})</sub>` });
  }

  // Charlie's replies to people go onto their issue, then it's closed.
  async outbox() {
    const people = this.visitors.people.data;
    const queue = people.outbox ?? [];
    people.outbox = [];
    for (const item of queue) {
      const who = this.visitors.byName(item.login);
      if (!who?.issue) continue;
      try {
        await this.comment(who.issue, `**Charlie:** ${item.text}`);
        await this.api('PATCH', `/repos/${this.repo}/issues/${who.issue}`, { state: 'closed', state_reason: 'completed' });
      } catch (err) {
        console.error('[issues] reply failed:', err.message);
      }
    }
    this.visitors.people.save();
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

  issueLinks() {
    const base = `https://github.com/${this.repo}/issues/new`;
    return { action: `${base}?template=charlie-action.yml`, message: `${base}?template=charlie-message.yml` };
  }

  flush() {
    this.store.flush();
  }
}


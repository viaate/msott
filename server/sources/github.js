import path from 'node:path';
import { config, paths, secrets } from '../config.js';
import { JSONStore } from '../store.js';
import { bus } from '../bus.js';

const API = 'https://api.github.com';

// Watches Charlie's GitHub account and turns real activity from other people
// into ledger earnings. Everything is a high-water mark, so unstar/restar
// churn can't be farmed, and anything that existed before the first poll is
// a baseline rather than income.
export class GitHubWatcher {
  constructor(ledger) {
    this.ledger = ledger;
    this.store = new JSONStore(path.join(paths.data, 'github.json'), {
      initialized: false,
      login: '',
      followers: 0,
      repos: {},
      views: {},
      seenIssues: [],
      seenComments: [],
      lastPoll: null,
    });
    this.error = null;
    this.timer = null;
  }

  get s() {
    return this.store.data;
  }

  get enabled() {
    return Boolean(secrets.githubToken);
  }

  status() {
    return {
      enabled: this.enabled,
      login: this.s.login || secrets.githubUser || null,
      url: this.s.login ? `https://github.com/${this.s.login}` : null,
      lastPoll: this.s.lastPoll,
      error: this.error,
      repos: Object.keys(this.s.repos).length,
      label: this.s.login ? `GitHub @${this.s.login}` : 'GitHub',
    };
  }

  start() {
    if (!this.enabled) return;
    const run = () => this.poll().catch((err) => {
      this.error = String(err.message || err);
      console.error('[github] poll failed:', this.error);
    });
    setTimeout(run, 3000);
    this.timer = setInterval(run, config.sources.pollMinutes * 60_000);
  }

  stop() {
    clearInterval(this.timer);
  }

  async gh(p, { allow404 = false } = {}) {
    const res = await fetch(API + p, {
      headers: {
        authorization: `Bearer ${secrets.githubToken}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'charlie-harness',
      },
    });
    if (allow404 && (res.status === 404 || res.status === 403)) return null;
    if (!res.ok) throw new Error(`GitHub ${p} → ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }

  async poll() {
    const s = this.s;
    const first = !s.initialized;
    const since = s.lastPoll || new Date().toISOString();
    const pollStarted = new Date().toISOString();

    const me = await this.gh('/user');
    s.login = me.login;

    if (first) s.followers = me.followers;
    else if (me.followers > s.followers) {
      const n = me.followers - s.followers;
      s.followers = me.followers;
      this.ledger.earn('github.follower', n, `${n} new follower${n > 1 ? 's' : ''} on GitHub`);
    }

    const starred = new Set(((await this.gh('/user/starred?per_page=100')) ?? []).map((r) => r.full_name));
    const repos = (await this.gh('/user/repos?affiliation=owner&per_page=100&sort=pushed')).filter((r) => !r.fork);

    for (const r of repos) {
      const stars = Math.max(0, r.stargazers_count - (starred.has(r.full_name) ? 1 : 0));
      let rec = s.repos[r.full_name];
      if (!rec) {
        rec = s.repos[r.full_name] = first
          ? { stars, forks: r.forks_count, watchers: 0, baseline: true, credited: true }
          : { stars: 0, forks: 0, watchers: 0, baseline: false, credited: false };
      }
      if (stars > rec.stars) {
        const n = stars - rec.stars;
        rec.stars = stars;
        this.ledger.earn('github.star', n, `★ ${n} new star${n > 1 ? 's' : ''} on ${r.full_name}`);
      }
      if (r.forks_count > rec.forks) {
        const n = r.forks_count - rec.forks;
        rec.forks = r.forks_count;
        this.ledger.earn('github.fork', n, `${n} new fork${n > 1 ? 's' : ''} of ${r.full_name}`);
      }
      // "Making something": a new non-empty public repo, a few per day at most.
      if (!rec.credited && !r.private && r.size > 0 && this.ledger.allow('github.newRepo', config.economy.limits.newReposCreditedPerDay)) {
        rec.credited = true;
        this.ledger.earn('github.newRepo', 1, `shipped a new public repo: ${r.full_name}`);
      }
    }

    // Deeper per-repo checks for the most recently active repos.
    for (const r of repos.slice(0, config.github.maxReposScanned)) {
      const rec = s.repos[r.full_name];
      const full = await this.gh(`/repos/${r.full_name}`, { allow404: true });
      if (full) {
        // The owner auto-watches their own repos, so subtract one.
        const watchers = Math.max(0, (full.subscribers_count ?? 0) - 1);
        if (first) rec.watchers = watchers;
        else if (watchers > rec.watchers) {
          const n = watchers - rec.watchers;
          rec.watchers = watchers;
          this.ledger.earn('github.watcher', n, `${n} new watcher${n > 1 ? 's' : ''} on ${r.full_name}`);
        }
      }

      const traffic = await this.gh(`/repos/${r.full_name}/traffic/views`, { allow404: true });
      let newViews = 0;
      for (const day of traffic?.views ?? []) {
        const key = `${r.full_name}|${day.timestamp.slice(0, 10)}`;
        const prev = s.views[key] ?? (first ? day.uniques : 0);
        if (day.uniques > prev) newViews += day.uniques - prev;
        s.views[key] = Math.max(prev, day.uniques);
      }
      if (newViews > 0) this.ledger.earn('github.uniqueView', newViews, `${newViews} visitor${newViews > 1 ? 's' : ''} looked at ${r.full_name}`);

      if (first) continue;
      const issues = (await this.gh(`/repos/${r.full_name}/issues?state=all&per_page=50&since=${since}`, { allow404: true })) ?? [];
      for (const it of issues) {
        if (this.isOther(it.user) && !s.seenIssues.includes(it.id) && it.created_at >= since) {
          s.seenIssues.push(it.id);
          const what = it.pull_request ? 'pull request' : 'issue';
          this.ledger.earn('github.externalIssue', 1, `@${it.user.login} opened a ${what} on ${r.full_name}: "${it.title.slice(0, 60)}"`);
        }
      }
      const comments = (await this.gh(`/repos/${r.full_name}/issues/comments?per_page=50&since=${since}`, { allow404: true })) ?? [];
      for (const c of comments) {
        if (this.isOther(c.user) && !s.seenComments.includes(c.id) && c.created_at >= since) {
          s.seenComments.push(c.id);
          this.ledger.earn('github.externalComment', 1, `@${c.user.login} commented on ${r.full_name}`);
        }
      }
    }

    s.seenIssues = s.seenIssues.slice(-2000);
    s.seenComments = s.seenComments.slice(-2000);
    // Keep 30 days of view history; GitHub only reports the last 14.
    const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    for (const key of Object.keys(s.views)) if (key.split('|')[1] < cutoff) delete s.views[key];

    s.initialized = true;
    s.lastPoll = pollStarted;
    this.error = null;
    this.store.save();
    bus.emit('github', this.status());
  }

  isOther(user) {
    return user && user.login !== this.s.login && user.type !== 'Bot';
  }

  flush() {
    this.store.flush();
  }
}

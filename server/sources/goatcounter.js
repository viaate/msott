import { Source } from './base.js';
import { secrets } from '../config.js';

const env = process.env;

// GoatCounter counts real visitors to pages on GitHub Pages (which can't count
// anything itself). Her pages, her /go/ links and her world all report there.
export class GoatCounterSource extends Source {
  constructor(ledger, site) {
    super('goatcounter', ledger, { refs: [] });
    this.site = site;
  }

  get enabled() {
    return Boolean(env.GOATCOUNTER_CODE && env.GOATCOUNTER_TOKEN);
  }

  async api(p) {
    const res = await fetch(`https://${env.GOATCOUNTER_CODE}.goatcounter.com/api/v0${p}`, {
      headers: { authorization: `Bearer ${env.GOATCOUNTER_TOKEN}`, 'content-type': 'application/json' },
    });
    if (!res.ok) throw new Error(`GoatCounter ${p} → ${res.status}`);
    return res.json();
  }

  async poll() {
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    const end = new Date(now);
    end.setUTCMinutes(0, 0, 0);
    end.setUTCHours(end.getUTCHours() + 1);
    const q = (start) => `start=${encodeURIComponent(start)}&end=${encodeURIComponent(end.toISOString().replace(/\.\d+Z$/, 'Z'))}`;
    const { hits = [] } = await this.api(`/stats/hits?${q(`${day}T00:00:00Z`)}&limit=100`);
    const prefix = secrets.publicUrl ? new URL(secrets.publicUrl).pathname.replace(/\/+$/, '') : '';
    const marks = (this.s.marks ??= {});
    for (const h of hits) {
      let rel = h.path.startsWith(prefix) ? h.path.slice(prefix.length) : h.path;
      if (!rel.startsWith('/')) rel = `/${rel}`;
      const mk = `${day}|${rel}`;
      const prev = marks[mk] ?? (this.s.initialized ? 0 : h.count);
      marks[mk] = Math.max(prev, h.count);
      const n = h.count - prev;
      if (n <= 0) continue;
      if (rel.startsWith('/pages/')) {
        const key = rel.slice('/pages/'.length).replace(/index\.html$/, '').replace(/\.html$/, '') || '/';
        this.site.credit('page', key, n);
      } else if (rel.startsWith('/go/')) {
        this.site.credit('link', rel.slice('/go/'.length).replace(/\/$/, ''), n);
      } else if (rel === '/' || rel === '/index.html') {
        this.ledger.earn('site.visitor', n, `${n} ${n === 1 ? 'person' : 'people'} came to see your world`, { quiet: true });
      }
    }
    for (const k of Object.keys(marks)) if (k.split('|')[0] < new Date(Date.now() - 3 * 86400_000).toISOString().slice(0, 10)) delete marks[k];
    const week = new Date(Date.now() - 7 * 86400_000);
    week.setUTCMinutes(0, 0, 0);
    try {
      const { stats = [] } = await this.api(`/stats/toprefs?${q(week.toISOString().replace(/\.\d+Z$/, 'Z'))}&limit=10`);
      this.s.refs = stats.map((r) => ({ name: r.name || 'direct', count: r.count }));
    } catch {}
  }

  status() {
    return { ...super.status(), label: 'visitor counter (GoatCounter)' };
  }

  lines() {
    if (!this.s.refs?.length) return [];
    return [`WHERE VISITORS CAME FROM (last 7 days): ${this.s.refs.map((r) => `${r.name} ${r.count}`).join(', ')}`];
  }
}

import { Source } from './base.js';

const env = process.env;

// Real sales through her human's shop accounts. Money goes to her human;
// Charlie earns tokens per unit of currency sold (refunds are not counted).
export class SalesSource extends Source {
  constructor(ledger) {
    super('sales', ledger, { seen: [], total: 0, count: 0, recent: [] });
  }

  get enabled() {
    return Boolean(env.CHARLIE_STRIPE_KEY || env.CHARLIE_GUMROAD_TOKEN);
  }

  credit(id, amount, currency, what) {
    if (this.s.seen.includes(id)) return;
    this.s.seen.push(id);
    if (this.s.seen.length > 5000) this.s.seen.splice(0, this.s.seen.length - 5000);
    if (!this.s.initialized) return;
    this.s.total += amount;
    this.s.count += 1;
    this.s.recent.unshift({ t: Date.now(), amount, currency, what });
    this.s.recent = this.s.recent.slice(0, 20);
    this.ledger.earn('sales.usd', amount, `a sale! ${amount.toFixed(2)} ${currency.toUpperCase()}${what ? ` for ${what}` : ''}`);
  }

  async poll() {
    if (env.CHARLIE_STRIPE_KEY) {
      const since = Math.floor(Date.now() / 1000) - 7 * 86400;
      const res = await fetch(`https://api.stripe.com/v1/charges?limit=100&created[gte]=${since}`, { headers: { authorization: `Bearer ${env.CHARLIE_STRIPE_KEY}` } });
      if (!res.ok) throw new Error(`Stripe → ${res.status}`);
      for (const c of (await res.json()).data) {
        if (c.paid && c.status === 'succeeded' && !c.refunded) this.credit(`stripe:${c.id}`, c.amount / 100, c.currency, c.description || c.calculated_statement_descriptor || '');
      }
    }
    if (env.CHARLIE_GUMROAD_TOKEN) {
      const res = await fetch(`https://api.gumroad.com/v2/sales?access_token=${encodeURIComponent(env.CHARLIE_GUMROAD_TOKEN)}`);
      if (!res.ok) throw new Error(`Gumroad → ${res.status}`);
      for (const s of (await res.json()).sales ?? []) {
        if (!s.refunded) this.credit(`gumroad:${s.id}`, (s.price ?? 0) / 100, s.currency || 'usd', s.product_name || '');
      }
    }
  }

  status() {
    const shops = [env.CHARLIE_STRIPE_KEY && 'Stripe', env.CHARLIE_GUMROAD_TOKEN && 'Gumroad'].filter(Boolean);
    return { ...super.status(), label: shops.length ? `shop (${shops.join(' + ')})` : 'shop', sales: this.s.count, total: this.s.total };
  }

  lines() {
    if (!this.enabled) return [];
    const out = [`SALES: ${this.s.count} sales so far, ${this.s.total.toFixed(2)} total`];
    for (const r of this.s.recent.slice(0, 5)) out.push(`- ${r.amount.toFixed(2)} ${r.currency.toUpperCase()}${r.what ? ` — ${r.what}` : ''}`);
    return out;
  }
}

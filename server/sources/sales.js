import { Source } from './base.js';

const env = process.env;

export function gumroadProductList() {
  return String(env.CHARLIE_GUMROAD_PRODUCTS ?? '').split(/[\s,]+/).map((x) => x.trim().replace(/^.*\/l\//, '').toLowerCase()).filter(Boolean);
}

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
      const mine = await this.gumroadProducts();
      const sales = (await this.gumroad('sales')).sales ?? [];
      for (const s of sales) {
        if (s.refunded || (mine && !mine.has(s.product_id))) continue;
        this.credit(`gumroad:${s.id}`, (s.price ?? 0) / 100, s.currency || 'usd', s.product_name || '');
      }
    }
  }

  async gumroad(p) {
    const res = await fetch(`https://api.gumroad.com/v2/${p}?access_token=${encodeURIComponent(env.CHARLIE_GUMROAD_TOKEN)}`);
    if (!res.ok) throw new Error(`Gumroad ${p} → ${res.status}`);
    return res.json();
  }

  // When the Gumroad account is shared with her human's own products, only
  // the ones in CHARLIE_GUMROAD_PRODUCTS (ids or permalinks) are hers.
  async gumroadProducts() {
    const wanted = gumroadProductList();
    if (!wanted.length) return null;
    const ids = new Set();
    const names = [];
    for (const p of (await this.gumroad('products')).products ?? []) {
      const keys = [p.id, p.custom_permalink, String(p.short_url ?? '').split('/').pop()].filter(Boolean).map((k) => k.toLowerCase());
      if (keys.some((k) => wanted.includes(k))) {
        ids.add(p.id);
        names.push(p.name);
      }
    }
    this.s.mine = names;
    return ids;
  }

  status() {
    const shops = [env.CHARLIE_STRIPE_KEY && 'Stripe', env.CHARLIE_GUMROAD_TOKEN && 'Gumroad'].filter(Boolean);
    return { ...super.status(), label: shops.length ? `shop (${shops.join(' + ')})` : 'shop', sales: this.s.count, total: this.s.total };
  }

  lines() {
    if (!this.enabled) return [];
    const out = [`SALES: ${this.s.count} sales so far, ${this.s.total.toFixed(2)} total`];
    if (gumroadProductList().length) out.push(`YOUR GUMROAD PRODUCTS: ${this.s.mine?.length ? this.s.mine.join(', ') : '(none found yet)'}`);
    for (const r of this.s.recent.slice(0, 5)) out.push(`- ${r.amount.toFixed(2)} ${r.currency.toUpperCase()}${r.what ? ` — ${r.what}` : ''}`);
    return out;
  }
}

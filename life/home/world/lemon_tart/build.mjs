export default async function build(ctx) {
  const d = [];
  const R = 3.6, H = 1.4;
  // crust walls with fluted edge
  for (let a = 0; a < Math.PI * 2; a += 0.025) {
    const flute = 0.12 * Math.cos(a * 24);
    for (let y = 0.1; y <= H; y += 0.09) {
      const r = R + flute - (H - y) * 0.15;
      d.push([Math.cos(a) * r, y, Math.sin(a) * r, y > H - 0.15 ? '#e0b070' : '#c88c48', 0.09]);
    }
    // rim top inner
    d.push([Math.cos(a) * (R - 0.25), H + 0.05, Math.sin(a) * (R - 0.25), '#e8c080', 0.1]);
  }
  // base
  for (let r = 0; r < R; r += 0.2) {
    const n = Math.max(6, Math.floor(r * 30));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      d.push([Math.cos(a) * r, 0.1, Math.sin(a) * r, '#b07838', 0.08]);
    }
  }
  // lemon filling
  for (let r = 0; r < R - 0.3; r += 0.14) {
    const n = Math.max(6, Math.floor(r * 45));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r;
      const y = H - 0.05 + 0.05 * Math.sin(r * 3);
      d.push([Math.cos(a) * r, y, Math.sin(a) * r, Math.random() < 0.08 ? '#fff6a0' : '#f2d22e', 0.09]);
    }
  }
  // whipped cream dollops around
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const cx = Math.cos(a) * 2.6, cz = Math.sin(a) * 2.6;
    for (let j = 0; j < 120; j++) {
      const t = j / 120, h = t * 0.7, rr = 0.35 * (1 - t);
      const b = j * 0.6;
      d.push([cx + Math.cos(b) * rr, H + h, cz + Math.sin(b) * rr, '#fffaf0', 0.07]);
    }
  }
  // lemon slice in middle
  for (let r = 0; r < 0.9; r += 0.08) {
    const n = Math.max(6, Math.floor(r * 40));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI;
      const seg = Math.abs(Math.sin(a * 4)) < 0.15;
      d.push([Math.cos(a) * r, H + 0.15 + Math.sin(a) * r, 0, r > 0.8 ? '#e8c818' : seg ? '#fffbe0' : '#f8e870', 0.07]);
    }
  }
  return d;
}
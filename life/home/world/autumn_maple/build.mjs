export default async function build(ctx) {
  let s = 12345;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const leafCols = ['#c8501e', '#e07a24', '#e8a33a', '#b8321c', '#d9902a', '#9c3a18', '#f0b84a'];
  const pick = () => leafCols[Math.floor(r() * leafCols.length)];
  const base = [];
  const tx = 0.8, tz = -0.6;
  for (let y = 0; y < 7; y += 0.2) {
    const rad = 0.55 - y * 0.035 + (y < 0.6 ? (0.6 - y) * 0.5 : 0);
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + y * 0.3;
      base.push([tx + Math.cos(a) * rad, y, tz + Math.sin(a) * rad, r() < 0.5 ? '#5a3a24' : '#4a2e1c', 0.09]);
    }
  }
  const branches = [[2.6, 0.9, 0.3], [-2.4, 1.1, -0.4], [0.4, 1.2, 2.4], [-0.6, 1.0, -2.6], [1.8, 1.3, -1.8], [-1.8, 1.4, 1.6]];
  for (const [bx, by, bz] of branches) {
    const y0 = 4.2 + r() * 1.5;
    for (let t = 0; t <= 1; t += 0.05) {
      base.push([tx + bx * t, y0 + by * t * 2, tz + bz * t, '#4a2e1c', 0.07]);
    }
  }
  const blobs = [[0, 8.6, 0, 3.0], [2.2, 7.6, 0.4, 2.0], [-2.2, 7.8, -0.4, 2.1], [0.3, 7.5, 2.2, 2.0], [-0.4, 7.7, -2.3, 2.0], [1.4, 9.8, -1.0, 1.7], [-1.3, 9.9, 1.0, 1.7]];
  for (const [bx, by, bz, br] of blobs) {
    const n = Math.floor(br * br * 36);
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1, th = r() * Math.PI * 2;
      const rr = br * Math.cbrt(0.35 + 0.65 * r());
      const q = Math.sqrt(1 - u * u);
      const x = tx + bx + rr * q * Math.cos(th), z = tz + bz + rr * q * Math.sin(th), y = by + rr * u * 0.8;
      if (Math.abs(x) > 5.6 || Math.abs(z) > 5.6) continue;
      base.push([x, y, z, pick(), 0.13 + r() * 0.07]);
    }
  }
  const px = -2.2, pz = 2.4;
  for (let i = 0; i < 340; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 1.9;
    const h = 1.0 * (1 - (d / 1.9) ** 2) * (0.5 + 0.5 * r());
    base.push([px + Math.cos(a) * d, h, pz + Math.sin(a) * d * 0.85, pick(), 0.13 + r() * 0.05]);
  }
  for (let i = 0; i < 140; i++) {
    const a = r() * Math.PI * 2, d = 1 + r() * 4.4;
    const x = tx + Math.cos(a) * d, z = tz + Math.sin(a) * d;
    if (Math.abs(x) > 5.6 || Math.abs(z) > 5.6) continue;
    base.push([x, 0.03, z, pick(), 0.1]);
  }
  for (let y = 0; y < 1.4; y += 0.12) base.push([-4.3, y, 3.9, '#6b4a2e', 0.07]);
  for (let x = -5.0; x <= -3.6; x += 0.1) for (let y = 1.2; y <= 1.7; y += 0.1) base.push([x, y, 3.9, '#a07a4e', 0.07]);
  const NF = 12, NL = 30;
  const leaves = [];
  for (let i = 0; i < NL; i++) {
    const a = r() * Math.PI * 2, d = r() * 3.2;
    leaves.push({ x: tx + Math.cos(a) * d, z: tz + Math.sin(a) * d, y0: 6 + r() * 3.5, ph: r(), sw: 0.3 + r() * 0.5, c: pick(), sp: r() * 6 });
  }
  const frames = [];
  for (let f = 0; f < NF; f++) {
    const fr = base.slice();
    for (const L of leaves) {
      const t = (f / NF + L.ph) % 1;
      const y = L.y0 * (1 - t);
      const sway = Math.sin(t * Math.PI * 4 + L.sp) * L.sw;
      let x = L.x + sway - t * 0.8, z = L.z + Math.cos(t * Math.PI * 3 + L.sp) * L.sw * 0.6;
      x = Math.max(-5.6, Math.min(5.6, x)); z = Math.max(-5.6, Math.min(5.6, z));
      fr.push([x, Math.max(0.05, y), z, L.c, 0.13]);
    }
    frames.push(fr);
  }
  return { frames, fps: 5 };
}
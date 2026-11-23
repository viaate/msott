export default async function build(ctx) {
  let s = 12345;
  const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  const base = [];
  const P = (x, y, z, c, sz) => base.push([+x.toFixed(3), +y.toFixed(3), +z.toFixed(3), c, sz]);
  const wood = ['#8a5a36', '#7a4e2e', '#9a6840'];
  const W = 2.3, Y0 = 1.3, Y1 = 5.5, Z = 0;
  for (const px of [-1.9, 1.9]) for (let y = 0; y < Y0 + 0.2; y += 0.12) for (const dx of [-0.07, 0.07]) for (const dz of [-0.07, 0.07]) P(px + dx, y, dz, wood[1], 0.08);
  for (let x = -W; x <= W; x += 0.16) for (let y = Y0; y <= Y1; y += 0.16) P(x, y, Z - 0.12, wood[(Math.floor(x * 6) + Math.floor(y * 6)) % 3 === 0 ? 2 : 0], 0.1);
  for (let x = -W - 0.1; x <= W + 0.1; x += 0.08) { P(x, Y0 - 0.05, Z + 0.02, wood[1], 0.08); P(x, Y1 + 0.05, Z + 0.02, wood[1], 0.08); }
  for (let y = Y0; y <= Y1; y += 0.08) { P(-W - 0.1, y, Z + 0.02, wood[1], 0.08); P(W + 0.1, y, Z + 0.02, wood[1], 0.08); }
  for (let i = -W - 0.4; i <= W + 0.4; i += 0.09) {
    const h = Y1 + 0.15 + (W + 0.4 - Math.abs(i)) * 0.35;
    for (let zz = -0.33; zz <= 0.34; zz += 0.22) {
      P(i, h, zz, '#6b3f24', 0.09);
      P(i, h + 0.09, zz, '#f4f1ea', 0.1);
    }
  }
  const cols = 6, rows = 4;
  const colors = ['#b3362f', '#2f6b3f', '#e8dcc0'];
  const dw = (2 * W - 0.3) / cols, dh = (Y1 - Y0 - 0.3) / rows;
  const lights = [];
  let n = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    n++;
    const x0 = -W + 0.15 + c * dw + 0.06, x1 = x0 + dw - 0.12;
    const y1 = Y1 - 0.15 - r * dh - 0.06, y0 = y1 - dh + 0.12;
    const col = colors[(r + c) % 3];
    if (n === 1) {
      for (let x = x0; x <= x1; x += 0.09) for (let y = y0; y <= y1; y += 0.09) P(x, y, Z, '#ffd27a', 0.08);
      P((x0 + x1) / 2, (y0 + y1) / 2, Z + 0.06, '#c8843c', 0.18);
      for (let t = 0; t <= dw - 0.12; t += 0.09) for (let y = y0; y <= y1; y += 0.09) P(x0 - t * 0.3, y, Z + 0.05 + t * 0.9, col, 0.08);
      lights.push([(x0 + x1) / 2, (y0 + y1) / 2, Z + 0.25]);
    } else {
      for (let x = x0 + 0.04; x <= x1 - 0.03; x += 0.1) for (let y = y0 + 0.04; y <= y1 - 0.03; y += 0.1) P(x, y, Z + 0.06, col, 0.09);
      for (let x = x0; x <= x1; x += 0.07) { P(x, y0, Z + 0.09, '#f6e9c8', 0.045); P(x, y1, Z + 0.09, '#f6e9c8', 0.045); }
      for (let y = y0; y <= y1; y += 0.07) { P(x0, y, Z + 0.09, '#f6e9c8', 0.045); P(x1, y, Z + 0.09, '#f6e9c8', 0.045); }
      P(x1 - 0.1, (y0 + y1) / 2, Z + 0.12, '#e0b84a', 0.07);
    }
  }
  const sy = Y1 + 0.15 + (W + 0.4) * 0.35 + 0.45;
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + Math.PI / 2, rr = k % 2 === 0 ? 0.4 : 0.17;
    for (let t = 0; t <= 1; t += 0.2) P(Math.cos(a) * rr * t, sy + Math.sin(a) * rr * t, 0, '#ffd85a', 0.08);
  }
  for (let i = 0; i < 700; i++) {
    const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * 4.2;
    P(Math.cos(a) * rr, 0.02 + rnd() * 0.05, Math.sin(a) * rr * 0.8 + 0.6, rnd() < 0.85 ? '#eef1f4' : '#cfd8e0', 0.09);
  }
  for (let z = 2.5; z <= 5.7; z += 0.16) for (let x = -0.6; x <= 0.6; x += 0.2) P(x + (rnd() - 0.5) * 0.08, 0.02, z, rnd() < 0.5 ? '#a08262' : '#8c6e50', 0.09);
  const flakes = [];
  for (let i = 0; i < 140; i++) flakes.push([rnd() * 11 - 5.5, 0.5 + rnd() * 9, rnd() * 11 - 5.5, rnd()]);
  const per = base.length + flakes.length + lights.length;
  const F = Math.max(1, Math.min(8, Math.floor(29800 / per)));
  console.log('base', base.length, 'frames', F);
  const frames = [];
  for (let f = 0; f < F; f++) {
    const fr = base.slice();
    const ph0 = (f / F) * Math.PI * 2;
    for (const [x, y, z, ph] of flakes) fr.push([+(x + Math.sin(ph0 + ph * 6.28) * 0.2).toFixed(2), +(y + Math.cos(ph0 + ph * 6.28) * 0.15).toFixed(2), +z.toFixed(2), '#ffffff', 0.05]);
    for (const [lx, ly, lz] of lights) fr.push([lx, ly, lz, f % 2 ? '#fff1b8' : '#ffd27a', f % 2 ? 0.24 : 0.16]);
    frames.push(fr);
  }
  return { frames, fps: 3 };
}
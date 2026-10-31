// A small pond south of the house: still water, lily pads, cattails and a ring
// of smooth stones.
export default function build() {
  let s = 2468;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const d = [];
  const shade = (hex, k) => '#' + [1, 3, 5].map((i) => Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * k)).toString(16).padStart(2, '0')).join('');
  const [cx, cz, rx, rz] = [0.6, 0.4, 3.6, 2.7];
  const inside = (x, z) => ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2;

  // Grass around the pond.
  for (let i = 0; i < 2300; i++) {
    const x = (r() - 0.5) * 11.4, z = (r() - 0.5) * 11.4;
    if (inside(x, z) < 1.25) continue;
    d.push([x, 0.04 + r() * 0.16, z, shade(['#3f5f2e', '#4c7038', '#55793d', '#5f8544'][Math.floor(r() * 4)], 0.85 + r() * 0.3), 0.05 + r() * 0.025]);
  }

  // Water, deeper toward the middle, with a few glints.
  for (let i = 0; i < 3600; i++) {
    const a = r() * Math.PI * 2, k = Math.sqrt(r());
    const x = cx + Math.cos(a) * rx * k, z = cz + Math.sin(a) * rz * k;
    const glint = r() < 0.04;
    d.push([x, 0.02, z, glint ? '#9cc4d0' : shade(k > 0.8 ? '#3d6a7a' : '#2b4f5e', 0.8 + (1 - k) * 0.1 + r() * 0.2), glint ? 0.05 : 0.08]);
  }

  // Smooth stones around the rim.
  for (let a = 0; a < Math.PI * 2; a += 0.28 + r() * 0.12) {
    const sx = cx + Math.cos(a) * (rx + 0.35), sz = cz + Math.sin(a) * (rz + 0.35), sr = 0.22 + r() * 0.16;
    const c = ['#8d8a80', '#a7a397', '#7d7a72'][Math.floor(r() * 3)];
    for (let i = 0; i < 40; i++) {
      const b = r() * Math.PI * 2, k = Math.sqrt(r());
      d.push([sx + Math.cos(b) * sr * k, 0.04 + (1 - k) * 0.16, sz + Math.sin(b) * sr * k, shade(c, 0.85 + (1 - k) * 0.3), 0.07]);
    }
  }

  // Lily pads, two with flowers.
  for (const [lx, lz, flower] of [[-0.8, -0.4, true], [1.6, 1.3, false], [2.4, -0.6, true], [-1.9, 1.2, false], [0.4, 1.9, false]]) {
    for (let i = 0; i < 90; i++) {
      const a = 0.35 + r() * (Math.PI * 2 - 0.7), k = Math.sqrt(r()) * 0.42;
      d.push([lx + Math.cos(a) * k, 0.05, lz + Math.sin(a) * k, shade('#4f7d3c', 0.85 + r() * 0.3), 0.07]);
    }
    if (flower) for (let i = 0; i < 24; i++) d.push([lx + (r() - 0.5) * 0.22, 0.12 + r() * 0.12, lz + (r() - 0.5) * 0.22, i < 18 ? '#e7a3b5' : '#e9bd62', 0.06]);
  }

  // Cattails at the west end.
  for (let i = 0; i < 9; i++) {
    const x = cx - rx - 0.1 + (r() - 0.5) * 0.9, z = cz + (r() - 0.5) * 2.6, h = 2.2 + r() * 1.2;
    for (let y = 0; y < h; y += 0.07) d.push([x + y * 0.03, y, z, '#6b8a45', 0.05]);
    for (let y = h - 0.6; y < h - 0.1; y += 0.05) for (let a = 0; a < Math.PI * 2; a += 1.2) d.push([x + h * 0.03 + Math.cos(a) * 0.07, y, z + Math.sin(a) * 0.07, '#5a3b22', 0.06]);
  }

  return d;
}

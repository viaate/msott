// Charlie's front yard, just outside her door (which opens onto this plot's
// east edge): a stepping-stone path, a shade tree, a mailbox and clover.
export default function build() {
  let s = 1234;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const d = [];
  const shade = (hex, k) => '#' + [1, 3, 5].map((i) => Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * k)).toString(16).padStart(2, '0')).join('');

  // Grass, thicker away from the path.
  const path = [];
  for (let t = 0; t <= 1.0001; t += 1 / 11) {
    const x = (1 - t) ** 2 * 5.2 + 2 * (1 - t) * t * 0 + t * t * -5.5;
    const z = (1 - t) ** 2 * 2.6 + 2 * (1 - t) * t * 2.6 + t * t * 0;
    path.push([x, z]);
  }
  const nearPath = (x, z) => path.some(([px, pz]) => Math.hypot(x - px, z - pz) < 0.7);
  for (let i = 0; i < 2600; i++) {
    const x = (r() - 0.5) * 11.4;
    const z = (r() - 0.5) * 11.4;
    if (nearPath(x, z)) continue;
    const g = ['#3f5f2e', '#4c7038', '#55793d', '#5f8544'][Math.floor(r() * 4)];
    d.push([x, 0.04 + r() * 0.18, z, shade(g, 0.85 + r() * 0.3), 0.045 + r() * 0.03]);
  }
  // Clover patches.
  for (const [cx, cz] of [[-4.2, 3.8], [1.5, -4.4], [3.6, -1.2]]) {
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * 0.7;
      d.push([cx + Math.cos(a) * rr, 0.2, cz + Math.sin(a) * rr, r() < 0.7 ? '#f1ece2' : '#e7a3b5', 0.06]);
    }
  }

  // Stepping stones from the door, curving out to the middle of the west edge.
  for (const [px, pz] of path) {
    const rx = 0.42 + r() * 0.08, rz = 0.32 + r() * 0.06;
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2, k = Math.sqrt(r());
      d.push([px + Math.cos(a) * rx * k, 0.05, pz + Math.sin(a) * rz * k, shade(['#b9ab94', '#a89a83', '#cfc3ad'][i % 3], 0.9 + r() * 0.15), 0.07]);
    }
  }

  // A shade tree: trunk, then a canopy of overlapping leafy clumps.
  const [tx, tz] = [-2.6, -2.9];
  for (let i = 0; i < 520; i++) {
    const y = r() * 3.4, a = r() * Math.PI * 2, rad = 0.36 - y * 0.04;
    d.push([tx + Math.cos(a) * rad, y, tz + Math.sin(a) * rad, shade('#6b4a2f', 0.8 + r() * 0.35), 0.07]);
  }
  for (const [cx, cy, cz, cr] of [[0, 4.6, 0, 1.9], [1.1, 4.2, 0.6, 1.4], [-1.0, 4.3, -0.5, 1.4], [0.2, 5.6, -0.2, 1.3], [-0.4, 4.0, 1.0, 1.2]]) {
    for (let i = 0; i < 900; i++) {
      let x = r() - 0.5, y = r() - 0.5, z = r() - 0.5;
      const l = Math.hypot(x, y, z) || 1;
      const k = cr * (0.75 + 0.25 * r());
      x = (x / l) * k; y = (y / l) * k * 0.85; z = (z / l) * k;
      const top = (y / cr + 1) / 2;
      d.push([tx + cx + x, cy + y, tz + cz + z, shade(top > 0.6 ? '#6a9447' : '#4f7d3c', 0.7 + top * 0.45 + r() * 0.1), 0.08]);
    }
  }
  // Its shadow.
  for (let i = 0; i < 260; i++) {
    const a = r() * Math.PI * 2, k = Math.sqrt(r()) * 2.1;
    d.push([tx + 0.4 + Math.cos(a) * k, 0.02, tz + 0.3 + Math.sin(a) * k * 0.8, '#22301b', 0.07]);
  }

  // A mailbox by the path, flag up.
  const [mx, mz] = [3.1, 4.0];
  for (let y = 0; y < 2.9; y += 0.07) for (const [ox, oz] of [[-0.06, -0.06], [0.06, -0.06], [-0.06, 0.06], [0.06, 0.06]]) d.push([mx + ox, y, mz + oz, '#7a5a3c', 0.06]);
  for (let u = -0.5; u <= 0.5; u += 0.06) {
    for (let a = 0; a <= Math.PI; a += 0.16) {
      d.push([mx + u, 3.0 + Math.sin(a) * 0.3, mz + Math.cos(a) * 0.3, '#d9d0c0', 0.06]);
      if (Math.abs(u) > 0.47) for (let k = 0; k < 0.3; k += 0.07) d.push([mx + u, 3.0 + Math.sin(a) * k, mz + Math.cos(a) * k, '#cbc1b0', 0.06]);
    }
    d.push([mx + u, 3.0, mz + 0.3, '#d9d0c0', 0.06], [mx + u, 3.0, mz - 0.3, '#d9d0c0', 0.06]);
  }
  for (let y = 3.0; y < 3.7; y += 0.06) d.push([mx - 0.35, y, mz - 0.34, '#c8553d', 0.06]);
  for (let u = 0; u < 0.3; u += 0.06) for (let y = 3.5; y < 3.7; y += 0.06) d.push([mx - 0.35 + u, y, mz - 0.34, '#c8553d', 0.06]);

  return d;
}

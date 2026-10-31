// A little garden behind the house (this plot's south edge meets the house's
// window wall): three raised beds of sunflowers, tomatoes and lavender.
export default function build() {
  let s = 4321;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const d = [];
  const shade = (hex, k) => '#' + [1, 3, 5].map((i) => Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * k)).toString(16).padStart(2, '0')).join('');
  const beds = [-3.4, -0.6, 2.2];
  const inBed = (x, z) => Math.abs(x) < 4.5 && beds.some((bz) => Math.abs(z - bz) < 0.95);

  // Grass around the beds, packed dirt between them.
  for (let i = 0; i < 2200; i++) {
    const x = (r() - 0.5) * 11.4, z = (r() - 0.5) * 11.4;
    if (inBed(x, z)) continue;
    const between = Math.abs(x) < 4.6 && z > -4.6 && z < 3.4;
    if (between) d.push([x, 0.03, z, shade('#6e5a44', 0.75 + r() * 0.3), 0.05]);
    else d.push([x, 0.04 + r() * 0.16, z, shade(['#3f5f2e', '#4c7038', '#55793d'][Math.floor(r() * 3)], 0.85 + r() * 0.3), 0.05 + r() * 0.025]);
  }

  // Raised beds: a wooden frame full of dark soil.
  for (const bz of beds) {
    for (let x = -4.3; x <= 4.3; x += 0.09) {
      for (let y = 0; y <= 0.32; y += 0.09) for (const z of [bz - 0.75, bz + 0.75]) d.push([x, y, z, shade('#7a5636', 0.85 + r() * 0.2), 0.07]);
    }
    for (let z = bz - 0.75; z <= bz + 0.75; z += 0.09) for (let y = 0; y <= 0.32; y += 0.09) for (const x of [-4.3, 4.3]) d.push([x, y, z, '#6c4b2f', 0.07]);
    for (let i = 0; i < 520; i++) d.push([(r() - 0.5) * 8.4, 0.3, bz + (r() - 0.5) * 1.4, shade('#4a3526', 0.8 + r() * 0.3), 0.06]);
  }

  // Sunflowers along the back bed.
  for (let i = 0; i < 6; i++) {
    const x = -3.6 + i * 1.45 + (r() - 0.5) * 0.3, z = beds[0] + (r() - 0.5) * 0.4, h = 3.6 + r() * 1.3;
    for (let y = 0.3; y < h; y += 0.07) d.push([x, y, z, '#5b7f41', 0.06]);
    for (const side of [-1, 1]) for (let k = 0; k < 40; k++) d.push([x + side * (0.1 + r() * 0.35), h * 0.5 + r() * 0.3, z + (r() - 0.5) * 0.25, '#4f7d3c', 0.07]);
    for (let k = 0; k < 140; k++) {
      const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * 0.55;
      const petal = rr > 0.3;
      d.push([x + Math.cos(a) * rr, h + Math.sin(a) * rr, z + 0.12, petal ? shade('#e9bd62', 0.9 + r() * 0.2) : '#5a3a1e', 0.07]);
    }
  }
  // Tomato bushes in the middle bed.
  for (let i = 0; i < 5; i++) {
    const x = -3.4 + i * 1.7, z = beds[1];
    for (let k = 0; k < 230; k++) {
      const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * 0.6, y = 0.35 + r() * 1.5;
      d.push([x + Math.cos(a) * rr * (1.2 - y / 2.2), y, z + Math.sin(a) * rr * 0.8, shade('#4c7038', 0.8 + r() * 0.35), 0.07]);
    }
    for (let k = 0; k < 6; k++) {
      const cx = x + (r() - 0.5) * 0.8, cy = 0.6 + r() * 0.9, cz = z + (r() - 0.5) * 0.6;
      for (let j = 0; j < 14; j++) d.push([cx + (r() - 0.5) * 0.14, cy + (r() - 0.5) * 0.14, cz + (r() - 0.5) * 0.14, '#c8452f', 0.07]);
    }
  }
  // Lavender in the front bed.
  for (let i = 0; i < 26; i++) {
    const x = -4.0 + i * 0.32 + (r() - 0.5) * 0.15, z = beds[2] + (r() - 0.5) * 1.0, h = 0.9 + r() * 0.6;
    for (let y = 0.3; y < h; y += 0.08) d.push([x, y, z, '#5f8544', 0.05]);
    for (let y = h; y < h + 0.45; y += 0.05) d.push([x + (r() - 0.5) * 0.06, y, z + (r() - 0.5) * 0.06, shade('#9b7fc8', 0.9 + r() * 0.2), 0.06]);
  }

  // A watering can at the end of the path.
  const [wx, wz] = [4.9, 1.0];
  for (let y = 0; y < 0.75; y += 0.06) for (let a = 0; a < Math.PI * 2; a += 0.3) d.push([wx + Math.cos(a) * 0.32, y, wz + Math.sin(a) * 0.32, '#7f9aa8', 0.06]);
  for (let t = 0; t < 1; t += 0.06) d.push([wx - 0.3 - t * 0.6, 0.35 + t * 0.55, wz, '#7f9aa8', 0.06]);
  for (let a = 0; a <= Math.PI; a += 0.15) d.push([wx + Math.cos(a) * 0.3, 0.78 + Math.sin(a) * 0.35, wz, '#6c8794', 0.06]);

  return d;
}

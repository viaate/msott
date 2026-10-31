import * as THREE from 'three';
import { Dots, dotMaterial, decodePoints, hex, scale } from './dots.js';

const GROUND = hex('#2f2b27');
const FREE = hex('#26231f');
const HAZARD = hex('#d6834a');
const GRID = hex('#2a2622');
const STONES = ['#8c8170', '#9a8e7b', '#a69a86', '#7f7566'].map(hex);
// Quarters of a plot (north is −z), where a build is shown at half size.
const QUARTERS = { nw: [-1, -1], ne: [1, -1], sw: [-1, 1], se: [1, 1] };

// Everything outside the house: the plot grid and the things Charlie builds.
export class WorldView {
  constructor(scene, plotSize, pointsUrl) {
    this.scene = scene;
    this.plotSize = plotSize;
    this.pointsUrl = pointsUrl;
    this.objects = new Map();
    this.ground = null;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.pickables = [];
  }

  plotCenter([px, pz]) {
    return new THREE.Vector3(px * this.plotSize, 0, pz * this.plotSize);
  }

  // Where a build sits: the middle of its plot, or of its quarter.
  spotCenter(meta) {
    const c = this.plotCenter(meta.plot);
    const q = QUARTERS[meta.spot];
    return q ? c.add(new THREE.Vector3((q[0] * this.plotSize) / 4, 0, (q[1] * this.plotSize) / 4)) : c;
  }

  spotScale(meta) {
    return (QUARTERS[meta.spot] ? 0.5 : 1) * (meta.scale || 1);
  }

  bounds() {
    const box = new THREE.Box3(new THREE.Vector3(-6, 0, -6), new THREE.Vector3(6, 6, 6));
    for (const o of this.objects.values()) {
      const c = this.plotCenter(o.meta.plot);
      box.expandByPoint(c.clone().addScalar(-this.plotSize / 2));
      box.expandByPoint(c.clone().addScalar(this.plotSize / 2));
    }
    return box;
  }

  setGround(objects, buildable) {
    if (this.ground) {
      this.group.remove(this.ground);
      this.ground.geometry.dispose();
    }
    const d = new Dots(99);
    const half = this.plotSize / 2;
    const r = d.r;
    const edges = new Set();
    for (const o of objects) {
      const c = this.plotCenter(o.plot);
      if (!o.builtin) {
        for (let x = -half + 0.3; x < half; x += 0.6) {
          for (let z = -half + 0.3; z < half; z += 0.6) {
            d.add(c.x + x + (r() - 0.5) * 0.2, 0, c.z + z + (r() - 0.5) * 0.2, scale(GROUND, 0.8 + r() * 0.4), 0.05);
          }
        }
      }
      // A stone path around every lot, so her world reads as neat blocks
      // joined by walkways, whatever she puts on them.
      for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [-1, 1, 1, 1], [-1, -1, -1, 1], [1, -1, 1, 1]]) {
        const k = [c.x + ax * half, c.z + az * half, c.x + bx * half, c.z + bz * half].map((v) => Math.round(v)).join(',');
        if (edges.has(k)) continue;
        edges.add(k);
        for (let t = -half - 0.4; t <= half + 0.4; t += 0.34) {
          for (const off of [-0.24, 0.24]) {
            const jx = (r() - 0.5) * 0.12, jz = (r() - 0.5) * 0.12;
            const x = c.x + (ax === bx ? ax * half + off : t) + jx;
            const z = c.z + (ax === bx ? t : az * half + off) + jz;
            d.add(x, 0.01, z, scale(STONES[Math.floor(r() * STONES.length)], 0.55 + r() * 0.25), 0.09);
          }
        }
      }
    }
    for (const p of buildable) {
      const c = this.plotCenter(p);
      for (let t = -half; t <= half; t += 0.5) {
        if (Math.abs(t) > half - 1.6) {
          for (const [x, z] of [[t, -half], [t, half], [-half, t], [half, t]]) d.add(c.x + x, 0, c.z + z, FREE, 0.05);
        }
      }
      for (let x = -half + 1.5; x < half; x += 1.5) {
        for (let z = -half + 1.5; z < half; z += 1.5) d.add(c.x + x, 0, c.z + z, FREE, 0.04);
      }
    }
    // A faint dotted grid out to the horizon, so the land reads at ground level.
    const claimed = new Set(objects.map((o) => `${o.plot[0]},${o.plot[1]}`));
    const ext = 60 + this.plotSize * Math.max(1, ...objects.map((o) => Math.max(Math.abs(o.plot[0]), Math.abs(o.plot[1]))));
    const isClaimed = (x, z) => claimed.has(`${Math.round(x / this.plotSize)},${Math.round(z / this.plotSize)}`);
    for (let a = -ext; a <= ext; a += 3) {
      for (let b = -ext; b <= ext; b += 0.6) {
        for (const [x, z] of [[a, b], [b, a]]) {
          if (x * x + z * z > ext * ext || isClaimed(x, z)) continue;
          const fade = 1 - Math.sqrt(x * x + z * z) / ext;
          d.add(x, -0.01, z, scale(GRID, 0.55 + 0.45 * fade), 0.045);
        }
      }
    }
    if (!d.count) d.add(0, -100, 0, FREE, 0);
    this.ground = d.points();
    this.group.add(this.ground);
  }

  // Sync with the server's list. `from` is where new dots fly in from (Charlie).
  async sync(list, buildable, from) {
    this.setGround(list, buildable);
    const seen = new Set();
    for (const meta of list) {
      if (meta.builtin) continue;
      seen.add(meta.name);
      const existing = this.objects.get(meta.name);
      const same = (k) => String(existing.meta[k]) === String(meta[k]);
      if (existing && ['version', 'status', 'plot', 'spot', 'scale'].every(same)) {
        existing.meta = meta;
        continue;
      }
      await this.place(meta, from, existing);
    }
    for (const [name, obj] of this.objects) {
      if (!seen.has(name)) this.remove(name);
    }
  }

  async place(meta, from, existing) {
    let geometry;
    let broken = false;
    if (meta.status === 'ok' && meta.count > 0) {
      const res = await fetch(this.pointsUrl(meta));
      if (!res.ok) return;
      geometry = decodePoints(await res.arrayBuffer());
    } else {
      geometry = construction(this.plotSize).geometry();
      broken = true;
    }
    const center = this.spotCenter(meta);
    const size = this.spotScale(meta);
    const n = geometry.attributes.position.count;
    const start = new Float32Array(n * 3);
    const src = from ? from.clone().sub(center).divideScalar(size) : new THREE.Vector3(0, 8, 0);
    for (let i = 0; i < n; i++) {
      start[i * 3] = src.x + (Math.random() - 0.5) * 2;
      start[i * 3 + 1] = src.y + 1 + Math.random() * 3;
      start[i * 3 + 2] = src.z + (Math.random() - 0.5) * 2;
    }
    geometry.setAttribute('start', new THREE.BufferAttribute(start, 3));
    const material = dotMaterial({ assemble: true, frames: !broken && meta.frames > 1 });
    material.uniforms.uAssemble.value = from ? 0 : 1;
    material.uniforms.uTwinkle.value = meta.motion === 'twinkle' ? 1 : 0;
    const pts = new THREE.Points(geometry, material);
    pts.frustumCulled = false;
    const holder = new THREE.Group();
    holder.position.copy(center);
    holder.scale.setScalar(size);
    holder.add(pts);
    this.group.add(holder);
    if (existing) this.dispose(existing);

    geometry.computeBoundingBox();
    const box = geometry.boundingBox.clone();
    box.min.y = Math.min(box.min.y, 0);
    box.max.y = Math.max(box.max.y, 1.5);
    box.expandByScalar(0.3);
    const obj = { meta, holder, pts, material, box, broken, size, assembling: Boolean(from), t0: performance.now() };
    this.objects.set(meta.name, obj);
    return obj;
  }

  remove(name) {
    const obj = this.objects.get(name);
    if (!obj) return;
    obj.removing = 1;
  }

  dispose(obj) {
    this.group.remove(obj.holder);
    obj.pts.geometry.dispose();
    obj.material.dispose();
  }

  // Hover/click testing against each build's box.
  pick(ray) {
    let best = null;
    const local = new THREE.Ray();
    const inv = new THREE.Matrix4();
    const hit = new THREE.Vector3();
    for (const obj of this.objects.values()) {
      if (obj.removing) continue;
      inv.copy(obj.holder.matrixWorld).invert();
      local.copy(ray).applyMatrix4(inv);
      if (local.intersectBox(obj.box, hit)) {
        const d = hit.applyMatrix4(obj.holder.matrixWorld).distanceTo(ray.origin);
        if (!best || d < best.d) best = { d, obj };
      }
    }
    return best?.obj ?? null;
  }

  update(dt, t) {
    for (const [name, obj] of this.objects) {
      const u = obj.material.uniforms;
      if (obj.removing) {
        obj.removing -= dt;
        u.uDensity.value = Math.max(0, obj.removing);
        if (obj.removing <= 0) {
          this.dispose(obj);
          this.objects.delete(name);
        }
        continue;
      }
      if (u.uAssemble.value < 1) u.uAssemble.value = Math.min(1, u.uAssemble.value + dt / 4.5);
      const m = obj.meta.motion;
      const h = obj.holder;
      if (m === 'spin') h.rotation.y += dt * 0.35;
      if (m === 'bob') h.position.y = (Math.sin(t * 1.2 + name.length) * 0.35 + 0.35) * obj.size;
      if (m === 'pulse') h.scale.setScalar(obj.size * (1 + Math.sin(t * 2) * 0.04));
      if (obj.meta.frames > 1) u.uFrame.value = Math.floor(t * (obj.meta.fps || 8)) % obj.meta.frames;
      if (obj.broken) u.uBright.value = 0.75 + 0.25 * Math.sin(t * 3);
    }
  }
}

// A dotted scaffold shown while a build's code is broken.
function construction(plotSize) {
  const d = new Dots(5);
  const s = 2.4;
  const r = d.r;
  const edges = [
    [[-s, 0, -s], [s, 0, -s]], [[s, 0, -s], [s, 0, s]], [[s, 0, s], [-s, 0, s]], [[-s, 0, s], [-s, 0, -s]],
    [[-s, 2 * s, -s], [s, 2 * s, -s]], [[s, 2 * s, -s], [s, 2 * s, s]], [[s, 2 * s, s], [-s, 2 * s, s]], [[-s, 2 * s, s], [-s, 2 * s, -s]],
    [[-s, 0, -s], [-s, 2 * s, -s]], [[s, 0, -s], [s, 2 * s, -s]], [[s, 0, s], [s, 2 * s, s]], [[-s, 0, s], [-s, 2 * s, s]],
    [[-s, 0, -s], [s, 2 * s, s]], [[s, 0, -s], [-s, 2 * s, s]],
  ];
  for (const [a, b] of edges) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    for (let t = 0; t <= len; t += 0.18) {
      const k = t / len;
      const stripe = Math.floor(t / 0.54) % 2 === 0;
      d.add(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, stripe ? HAZARD : hex('#e8dcc6'), 0.07);
    }
  }
  for (let i = 0; i < 300; i++) d.add((r() - 0.5) * plotSize * 0.6, 0.02, (r() - 0.5) * plotSize * 0.6, hex('#5a4d40'), 0.05);
  return d;
}

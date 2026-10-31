import * as THREE from 'three';
import { Dots, dotMaterial, hex, mix, scale } from './dots.js';

const S = 1.45; // Charlie is drawn a little larger than life so she reads at diorama scale.

const FUR = { dark: hex('#7a3618'), base: hex('#ad5628'), light: hex('#d4824a') };
const EAR = { dark: hex('#6c2f15'), base: hex('#984720'), light: hex('#bf6a37') };
const NOSE = hex('#120c0a');
const EYE = hex('#0c0807');
const GLINT = hex('#f6efe6');

function gauss(r) {
  return Math.sqrt(-2 * Math.log(1 - r() + 1e-9)) * Math.cos(2 * Math.PI * r());
}

function curl(x, y, z) {
  return Math.sin(x * 1.7 + Math.sin(y * 2.3) * 1.5) * Math.sin(z * 1.9 + Math.sin(x * 2.1) * 1.4) * Math.cos(y * 1.3 + z * 0.7);
}

function furColor(palette, t) {
  return t < 0.5 ? mix(palette.dark, palette.base, t * 2) : mix(palette.base, palette.light, (t - 0.5) * 2);
}

// Fluffy dots on an ellipsoid, pushed out along the normal by a curl pattern.
function fluff(dots, r, { c, rad, n, palette = FUR, size = 0.042, k = 22, fluff: f = 0.12, below = -Infinity, bright = 0 }) {
  for (let i = 0; i < n; i++) {
    let dx = gauss(r), dy = gauss(r), dz = gauss(r);
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len; dy /= len; dz /= len;
    const px = dx * rad[0], py = dy * rad[1], pz = dz * rad[2];
    if (py + c[1] < below) continue;
    const cv = curl((c[0] + px) * k, (c[1] + py) * k, (c[2] + pz) * k);
    const depth = 0.9 + r() * 0.12;
    const push = depth + f * (0.5 + 0.5 * cv);
    let nx = px / (rad[0] * rad[0]), ny = py / (rad[1] * rad[1]), nz = pz / (rad[2] * rad[2]);
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    const t = Math.min(1, Math.max(0, 0.45 + 0.38 * cv + (r() - 0.5) * 0.35 + bright));
    dots.add(c[0] + px * push, c[1] + py * push, c[2] + pz * push, furColor(palette, t), size * S * (0.8 + r() * 0.5), nx, ny, nz);
  }
}

function blob(dots, r, c, radius, n, color, size) {
  for (let i = 0; i < n; i++) {
    let dx = gauss(r), dy = gauss(r), dz = gauss(r);
    const len = Math.hypot(dx, dy, dz) || 1;
    const k = radius * Math.cbrt(r());
    dots.add(c[0] + (dx / len) * k, c[1] + (dy / len) * k, c[2] + (dz / len) * k, color, size * S, 0, 0, 0);
  }
}

function leg(dots, r, front) {
  const len = 0.56;
  for (let i = 0; i < 300; i++) {
    const t = r();
    const a = r() * Math.PI * 2;
    const rad = (front ? 0.058 : 0.068) * (1 - t * 0.15) + (t < 0.25 ? 0.02 * (1 - t / 0.25) : 0);
    const cv = curl(Math.cos(a) * 3, t * 14, Math.sin(a) * 3);
    const rr = rad * (1 + 0.25 * (0.5 + 0.5 * cv));
    const col = furColor(FUR, Math.min(1, Math.max(0, 0.42 + 0.4 * cv + (r() - 0.5) * 0.3)));
    dots.add(Math.cos(a) * rr, -t * len, Math.sin(a) * rr, col, 0.042 * S * (0.8 + r() * 0.5), Math.cos(a), 0, Math.sin(a));
  }
  fluff(dots, r, { c: [0.025, -len - 0.005, 0], rad: [0.08, 0.04, 0.068], n: 90, size: 0.04, below: -len - 0.04 });
}

function tail(dots, r) {
  // A feathery plume that sweeps back and up from the pivot.
  for (let i = 0; i < 700; i++) {
    const t = Math.pow(r(), 0.8);
    const cx = -0.34 * t;
    const cy = 0.2 * Math.sin(t * 1.9) - 0.02 * t;
    const spread = 0.035 + 0.075 * Math.sin(Math.PI * Math.min(1, t * 1.1));
    const a = r() * Math.PI * 2;
    const rr = spread * Math.sqrt(r());
    const droop = -0.06 * t * t * (0.5 + r());
    const col = furColor(FUR, Math.min(1, Math.max(0, 0.35 + r() * 0.6)));
    dots.add(cx + (r() - 0.5) * 0.03, cy + Math.cos(a) * rr + droop, Math.sin(a) * rr, col, 0.04 * S * (0.7 + r() * 0.6), 0, 1, 0);
  }
}

function ear(dots, r) {
  for (let i = 0; i < 620; i++) {
    const t = r();
    const y = -t * 0.42;
    const w = 0.065 + 0.04 * Math.sin(Math.PI * Math.min(1, t * 1.2));
    const a = r() * Math.PI * 2;
    const wave = 0.018 * Math.sin(t * 22 + a * 2);
    const x = Math.cos(a) * w * 0.9 + wave - 0.02 * t;
    const z = Math.sin(a) * w * 0.45 + 0.02 * t;
    const col = furColor(EAR, Math.min(1, Math.max(0, 0.4 + 0.35 * Math.sin(t * 19 + a) + (r() - 0.5) * 0.4)));
    dots.add(x, y, z, col, 0.04 * S * (0.75 + r() * 0.5), Math.cos(a) * 0.4, 0, Math.sin(a));
  }
}

function part(parent, build, seed, material, at = [0, 0, 0]) {
  const g = new THREE.Group();
  g.position.set(...at);
  const d = new Dots(seed);
  build(d);
  const pts = d.points(material);
  g.add(pts);
  parent.add(g);
  return g;
}

const POSES = {
  stand: { by: 0, bz: 0, bx: 0, hy: 0, hz: 0.05, hx: 0, fl: 0, bl: 0, tz: -0.35, ear: 0 },
  sit: { by: -0.27, bz: 0.55, bx: 0, hy: 0, hz: -0.45, hx: 0, fl: -0.36, bl: 0.82, tz: 0.55, ear: 0.05 },
  sploot: { by: -0.4, bz: 0, bx: 0, hy: -0.22, hz: -0.18, hx: 0.32, fl: 1.42, bl: -1.38, tz: 0.15, ear: 0.25 },
  sleep: { by: -0.38, bz: 0, bx: 1.3, hy: -0.12, hz: -0.1, hx: -0.15, fl: 0.55, bl: -0.35, tz: 0.6, ear: 0.3 },
  sniff: { by: -0.04, bz: -0.12, bx: 0, hy: -0.1, hz: 0.62, hx: 0, fl: 0.12, bl: 0, tz: -0.25, ear: 0.12 },
  play: { by: -0.12, bz: -0.38, bx: 0, hy: 0.02, hz: -0.25, hx: 0, fl: 0.95, bl: 0.05, tz: -0.95, ear: -0.05 },
};

// Charlie's dot body and everything she does with it.
export class Charlie {
  constructor() {
    const r = (() => {
      let s = 4242;
      return () => {
        s = (s * 16807) % 2147483647;
        return s / 2147483647;
      };
    })();
    this.material = dotMaterial();
    const m = this.material;

    this.root = new THREE.Group();
    this.root.scale.setScalar(S);
    this.body = new THREE.Group();
    this.body.position.set(-0.25, 0.55, 0);
    this.root.add(this.body);
    const inner = new THREE.Group();
    inner.position.set(0.25, -0.55, 0);
    this.body.add(inner);

    part(inner, (d) => {
      fluff(d, r, { c: [-0.02, 0.69, 0], rad: [0.43, 0.2, 0.19], n: 2600 });
      fluff(d, r, { c: [0.28, 0.72, 0], rad: [0.2, 0.22, 0.18], n: 800, bright: 0.05 });
      fluff(d, r, { c: [0.36, 0.86, 0], rad: [0.13, 0.17, 0.14], n: 520 });
    }, 1, m);

    this.head = new THREE.Group();
    this.head.position.set(0.38, 0.92, 0);
    inner.add(this.head);
    part(this.head, (d) => {
      fluff(d, r, { c: [0.1, 0.12, 0], rad: [0.16, 0.16, 0.165], n: 1000, bright: 0.05 });
      fluff(d, r, { c: [0.07, 0.25, 0], rad: [0.13, 0.085, 0.14], n: 380, fluff: 0.22, bright: 0.1 });
      fluff(d, r, { c: [0.25, 0.05, 0], rad: [0.115, 0.08, 0.09], n: 460, bright: 0.12, k: 30 });
      fluff(d, r, { c: [0.19, -0.01, 0], rad: [0.1, 0.075, 0.12], n: 280, fluff: 0.2 });
      blob(d, r, [0.37, 0.085, 0], 0.036, 90, NOSE, 0.034);
    }, 2, m);

    this.eyes = new THREE.Group();
    this.eyes.position.set(0.232, 0.172, 0);
    this.head.add(this.eyes);
    part(this.eyes, (d) => {
      for (const z of [0.098, -0.098]) {
        blob(d, r, [0, 0, z], 0.03, 70, EYE, 0.032);
        d.add(0.022, 0.012, z * 1.12, GLINT, 0.02 * S);
      }
    }, 3, m);

    this.ears = [0.16, -0.16].map((z, i) => {
      const g = part(this.head, (d) => ear(d, r), 4 + i, m, [0.04, 0.2, z]);
      g.rotation.x = z > 0 ? -0.12 : 0.12;
      return g;
    });

    this.tail = part(inner, (d) => tail(d, r), 6, m, [-0.42, 0.8, 0]);

    this.legs = [
      [0.27, 0.1, true], [0.27, -0.1, true], [-0.3, 0.1, false], [-0.3, -0.1, false],
    ].map(([x, z, front], i) => {
      const g = part(inner, (d) => leg(d, r, front), 7 + i, m, [x, 0.6, z]);
      g.userData.front = front;
      g.userData.phase = i === 0 || i === 3 ? 0 : Math.PI;
      return g;
    });

    // Motion state
    this.pos = new THREE.Vector3(-3.5, 0, -3.4);
    this.heading = Math.PI * 0.25;
    this.path = [];
    this.speed = 2.3;
    this.walkPhase = 0;
    this.moving = 0;
    this.poseName = 'sleep';
    this.p = { ...POSES.sleep };
    this.wagAmp = 0.15;
    this.excite = 0;
    this.tilt = 0;
    this.tiltTarget = 0;
    this.look = 0;
    this.lookTarget = 0;
    this.blinkT = 2;
    this.floor = 0;
    this.onArrive = null;
    this.headWorld = new THREE.Vector3();
  }

  get object() {
    return this.root;
  }

  setPose(name) {
    if (POSES[name]) this.poseName = name;
  }

  // speed: about 1.2 for a sniffing stroll, 2.3 to walk, 4 to run.
  walkTo(points, onArrive, speed = 2.3) {
    this.path = points.map((p) => new THREE.Vector3(p.x, 0, p.z));
    this.onArrive = onArrive ?? null;
    this.speed = speed;
  }

  get walking() {
    return this.path.length > 0;
  }

  pet() {
    this.excite = 1;
    this.tiltTarget = (Math.random() < 0.5 ? -1 : 1) * 0.35;
  }

  wiggle(amount = 0.6) {
    this.excite = Math.max(this.excite, amount);
  }

  tiltHead(v) {
    this.tiltTarget = v;
  }

  // Where speech bubbles and hearts come from.
  headPosition(out = this.headWorld) {
    this.head.updateWorldMatrix(true, false);
    return out.set(0.15, 0.32, 0).applyMatrix4(this.head.matrixWorld);
  }

  update(dt, t, cameraYaw) {
    // Walking along the path.
    if (this.path.length) {
      const target = this.path[0];
      const dx = target.x - this.pos.x;
      const dz = target.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.08) {
        this.path.shift();
        if (!this.path.length && this.onArrive) {
          const fn = this.onArrive;
          this.onArrive = null;
          fn();
        }
      } else {
        const want = Math.atan2(dz, dx);
        let diff = ((want - this.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        this.heading += diff * Math.min(1, dt * 7);
        const facing = Math.cos(diff);
        const step = Math.min(dist, this.speed * dt * Math.max(0, facing));
        this.pos.x += Math.cos(this.heading) * step;
        this.pos.z += Math.sin(this.heading) * step;
      }
    }
    const movingTarget = this.path.length ? 1 : 0;
    this.moving += (movingTarget - this.moving) * Math.min(1, dt * 6);

    // Blend toward the pose (walking always uses the standing pose, nose down if she's sniffing).
    const goal = POSES[this.path.length ? (this.poseName === 'sniff' ? 'sniff' : 'stand') : this.poseName];
    const k = Math.min(1, dt * 3.2);
    for (const key of Object.keys(goal)) this.p[key] += (goal[key] - this.p[key]) * k;
    const p = this.p;

    this.walkPhase += dt * 9.5 * this.moving * Math.max(0.7, this.speed / 2.3);
    const swing = 0.5 * this.moving;
    this.excite = Math.max(0, this.excite - dt * 0.35);
    this.tilt += (this.tiltTarget - this.tilt) * Math.min(1, dt * 4);
    if (this.excite < 0.05) this.tiltTarget *= 1 - Math.min(1, dt * 0.6);

    const sleeping = this.poseName === 'sleep' && !this.path.length;
    const breathe = Math.sin(t * (sleeping ? 1.4 : 2.6)) * (sleeping ? 0.025 : 0.012);

    this.root.position.set(this.pos.x, this.floor + Math.abs(Math.sin(this.walkPhase)) * 0.035 * this.moving, this.pos.z);
    this.root.rotation.y = -this.heading;

    this.body.position.y = 0.55 + p.by;
    this.body.rotation.set(p.bx, 0, p.bz);
    this.body.scale.set(1, 1 + breathe, 1 + breathe * 0.6);

    // Head: idle glances, a tilt when curious, looking toward the camera now and then.
    if (!sleeping && Math.random() < dt * 0.25) this.lookTarget = (Math.random() - 0.5) * 1.1;
    this.look += (this.lookTarget - this.look) * Math.min(1, dt * 2.5);
    this.head.position.y = 0.92 + p.hy;
    this.head.rotation.set(p.hx + this.tilt, sleeping ? 0 : this.look * (1 - this.moving), p.hz + Math.sin(this.walkPhase * 2) * 0.04 * this.moving);

    for (const [i, earG] of this.ears.entries()) {
      const side = i === 0 ? 1 : -1;
      earG.rotation.z = p.ear * 0.5 + Math.sin(this.walkPhase * 2 + i) * 0.12 * this.moving + this.excite * 0.1 * Math.sin(t * 9);
      earG.rotation.x = side * (-0.12 - p.ear * 0.3 - this.moving * 0.1);
    }

    // Tail: wags harder when she's happy or excited.
    const wag = (this.wagAmp + this.excite * 0.6 + this.moving * 0.2) * (sleeping ? 0.15 : 1);
    this.tail.rotation.set(0, Math.sin(t * (7 + this.excite * 9)) * wag, p.tz - this.excite * 0.3);

    for (const legG of this.legs) {
      const base = legG.userData.front ? p.fl : p.bl;
      legG.rotation.z = base + Math.sin(this.walkPhase + legG.userData.phase) * swing;
    }

    // Blink.
    this.blinkT -= dt;
    let eyeScale = sleeping ? 0.12 : 1;
    if (!sleeping && this.blinkT < 0.12) eyeScale = 0.15;
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 4;
    this.eyes.scale.y += (eyeScale - this.eyes.scale.y) * Math.min(1, dt * 25);
  }
}

import * as THREE from 'three';
import { dotMaterial, hex } from './dots.js';

const MAX = 1600;

// One shared pool of short-lived dots: hearts, Zs, sparks, treats.
export class Particles {
  constructor() {
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.seed = new Float32Array(MAX).fill(0);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX);
    this.base = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
    g.setAttribute('seed', new THREE.BufferAttribute(this.seed, 1));
    this.geometry = g;
    this.points = new THREE.Points(g, dotMaterial());
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
  }

  spawn(x, y, z, vx, vy, vz, color, size, life, gravity = 0) {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.col.set(color, i * 3);
    this.base[i] = size;
    this.size[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grav[i] = gravity;
  }

  heart(at, color = hex('#ef8f8f')) {
    const drift = (Math.random() - 0.5) * 0.4;
    for (let i = 0; i < 46; i++) {
      const t = (i / 46) * Math.PI * 2;
      const hx = 16 * Math.sin(t) ** 3;
      const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      this.spawn(at.x + hx * 0.014, at.y + hy * 0.014 + 0.25, at.z + hx * 0.006, drift, 0.7, 0, color, 0.06, 1.8);
    }
  }

  zee(at) {
    const pts = [];
    for (let i = 0; i <= 4; i++) pts.push([i / 4, 1], [i / 4, 0]);
    for (let i = 1; i < 4; i++) pts.push([1 - i / 4, i / 4]);
    const s = 0.22 + Math.random() * 0.1;
    for (const [u, v] of pts) this.spawn(at.x + (u - 0.5) * s, at.y + v * s + 0.2, at.z, 0.12, 0.32, 0.05, hex('#aab8c8'), 0.045, 3.2);
  }

  sparks(at, n = 6, color = hex('#d6834a')) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.spawn(at.x + Math.cos(a) * 0.3, at.y + Math.random() * 0.2, at.z + Math.sin(a) * 0.3,
        Math.cos(a) * 0.25, 0.5 + Math.random() * 0.6, Math.sin(a) * 0.25, color, 0.04 + Math.random() * 0.03, 1.4 + Math.random());
    }
  }

  // Dots flowing from `from` toward `to`, used when Charlie reaches out to the internet.
  stream(from, to, n = 3, color = hex('#93b6d8')) {
    for (let i = 0; i < n; i++) {
      const life = 1.6 + Math.random() * 0.6;
      const j = () => (Math.random() - 0.5) * 0.6;
      this.spawn(from.x + j() * 0.3, from.y + j() * 0.3, from.z + j() * 0.3,
        (to.x - from.x) / life + j(), (to.y - from.y) / life + 0.3 + j(), (to.z - from.z) / life + j(), color, 0.045, life, 0.35);
    }
  }

  treat(from, to) {
    const life = 0.9;
    const vx = (to.x - from.x) / life;
    const vz = (to.z - from.z) / life;
    const g = 9;
    const vy = (to.y - from.y) / life + 0.5 * g * life;
    for (let i = 0; i < 26; i++) {
      const j = () => (Math.random() - 0.5) * 0.12;
      this.spawn(from.x + j(), from.y + j() * 0.5, from.z + j(), vx, vy, vz, i % 5 === 0 ? hex('#b98a52') : hex('#ead9b4'), 0.05, life, g);
    }
  }

  burst(at, n = 30, color = hex('#e9bd62')) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const u = Math.random() * 2 - 1;
      const s = Math.sqrt(1 - u * u);
      const v = 1 + Math.random() * 1.6;
      this.spawn(at.x, at.y, at.z, Math.cos(a) * s * v, u * v + 1, Math.sin(a) * s * v, color, 0.05, 1 + Math.random(), 2.5);
    }
  }

  // Kibble tumbling into her bowl.
  pour(at) {
    for (let i = 0; i < 40; i++) {
      const delay = Math.random() * 0.6;
      const j = () => (Math.random() - 0.5) * 0.25;
      this.spawn(at.x + j(), at.y + 2.2 + delay * 3, at.z + j(), j(), -1.5, j(), [0.66, 0.44, 0.24], 0.06, 1.1 + delay, 4);
    }
  }

  // An expanding ring of dots: a squeak, a tap, a ding.
  ring(at, color) {
    for (let w = 0; w < 3; w++) {
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        const v = 1.2 + w * 0.5;
        this.spawn(at.x, at.y, at.z, Math.cos(a) * v, Math.sin(a) * v * 0.6, Math.sin(a) * v * 0.3, color, 0.05, 0.7 + w * 0.15);
      }
    }
  }

  puff(at) {
    for (let i = 0; i < 50; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 1.2;
      this.spawn(at.x + Math.cos(a) * r, at.y, at.z + Math.sin(a) * r, Math.cos(a) * 0.3, 0.6 + Math.random() * 0.8, Math.sin(a) * 0.3, [0.93, 0.91, 0.87], 0.07, 1.3 + Math.random() * 0.6, 0.6);
    }
  }

  // A dotted ball that rolls to her.
  ball(from, to) {
    const life = 1.8;
    const vx = (to.x - from.x) / life;
    const vz = (to.z - from.z) / life;
    for (let i = 0; i < 60; i++) {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const color = i % 3 ? [0.86, 0.42, 0.33] : [0.95, 0.9, 0.8];
      this.spawn(from.x + Math.cos(a) * s * 0.18, from.y + u * 0.18, from.z + Math.sin(a) * s * 0.18, vx, 0, vz, color, 0.05, life);
    }
  }

  update(dt) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) {
        this.size[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const i3 = i * 3;
      this.vel[i3 + 1] -= this.grav[i] * dt;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const k = this.life[i] / this.maxLife[i];
      this.size[i] = this.life[i] > 0 ? this.base[i] * Math.min(1, k * 3) : 0;
    }
    const a = this.geometry.attributes;
    a.position.needsUpdate = true;
    a.size.needsUpdate = true;
    a.color.needsUpdate = true;
  }
}

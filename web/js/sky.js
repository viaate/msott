import * as THREE from 'three';
import { Dots, dotMaterial, hex, mix, scale } from './dots.js';

// The ground-level view's horizon: a night sky of dots, a dotted moon, and
// soft hills far away. Only shown in the 3D view.
export function buildSky() {
  const group = new THREE.Group();
  const d = new Dots(31);
  const r = d.r;
  const R = 170;
  for (let i = 0; i < 2600; i++) {
    const a = r() * Math.PI * 2;
    const el = Math.asin(0.05 + r() * 0.95);
    const x = Math.cos(a) * Math.cos(el) * R;
    const y = Math.sin(el) * R;
    const z = Math.sin(a) * Math.cos(el) * R;
    const warm = r() < 0.15;
    const c = warm ? hex('#f0d9a8') : mix(hex('#8b97b0'), hex('#e4e8f0'), r());
    d.add(x, y, z, scale(c, 0.45 + r() * 0.55), 0.25 + r() * 0.55);
  }
  const stars = d.points(dotMaterial());
  stars.material.uniforms.uTwinkle.value = 0.7;
  group.add(stars);

  const moon = new Dots(32);
  const dir = new THREE.Vector3(-0.55, 0.42, -0.72).normalize().multiplyScalar(150);
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, dir).normalize();
  for (let u = -7; u <= 7; u += 0.42) {
    for (let v = -7; v <= 7; v += 0.42) {
      const dd = Math.hypot(u, v);
      if (dd > 7) continue;
      const crater = Math.sin(u * 0.9 + 1) * Math.cos(v * 1.1) > 0.55 ? 0.78 : 1;
      const lit = 0.65 + 0.35 * Math.max(0, (u + v * 0.3) / 7 + 0.4);
      const p = dir.clone().addScaledVector(right, u).addScaledVector(up, v);
      moon.add(p.x, p.y, p.z, scale(hex('#efe4c9'), crater * Math.min(1, lit)), 0.5);
    }
  }
  group.add(moon.points());

  const hills = new Dots(33);
  const H = 120;
  for (let a = 0; a < Math.PI * 2; a += 0.0075) {
    const h = 5 + 4 * Math.sin(a * 3) + 2.5 * Math.sin(a * 7 + 1) + 1.5 * Math.sin(a * 13 + 2);
    for (let y = 0; y < h; y += 0.9) {
      const k = y / h;
      const rr = H + (hills.r() - 0.5) * 2;
      hills.add(Math.cos(a) * rr, y, Math.sin(a) * rr, scale(hex('#3a3546'), 0.55 + 0.45 * k), 0.55);
    }
  }
  group.add(hills.points());
  for (const child of group.children) child.material.uniforms.uFogAmt.value = 0;
  group.visible = false;
  return group;
}

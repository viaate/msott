import * as THREE from 'three';

// Colors are used exactly as written (no color management), so the hex
// values here are what ends up on screen.
THREE.ColorManagement.enabled = false;

export const BG = 0x0e0d0c;

export const globals = {
  uScale: { value: 40 },
  uMinPx: { value: 1.25 },
  uTime: { value: 0 },
  uBg: { value: new THREE.Color(BG) },
  uFogNear: { value: 40 },
  uFogFar: { value: 120 },
  uLight: { value: new THREE.Vector3(0.45, 0.85, 0.35).normalize() },
  uPersp: { value: 0 },
  uMaxPx: { value: 64 },
};

const vertex = /* glsl */ `
  attribute vec3 color;
  attribute float size;
  attribute float seed;
  #ifdef ASSEMBLE
    attribute vec3 start;
    uniform float uAssemble;
  #endif
  #ifdef FRAMES
    attribute float frame;
    uniform float uFrame;
  #endif
  uniform float uScale;
  uniform float uMinPx;
  uniform float uPersp;
  uniform float uMaxPx;
  uniform float uTime;
  uniform float uDensity;
  uniform float uTwinkle;
  uniform float uBright;
  uniform vec3 uLight;
  varying vec3 vColor;
  varying float vDepth;

  void main() {
    if (seed > uDensity || size <= 0.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      return;
    }
    #ifdef FRAMES
      // A build that moves: only the dots of the current frame show.
      if (abs(frame - uFrame) > 0.5) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        gl_PointSize = 0.0;
        return;
      }
    #endif
    vec3 pos = position;
    float grow = 1.0;
    #ifdef ASSEMBLE
      float k = clamp(uAssemble * 1.7 - seed * 0.7, 0.0, 1.0);
      k = k * k * (3.0 - 2.0 * k);
      pos = mix(start, position, k);
      grow = 0.6 + 0.4 * k;
    #endif
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    vDepth = -mv.z;

    float shade = 1.0;
    if (dot(normal, normal) > 0.01) {
      vec3 n = normalize(mat3(modelMatrix) * normal);
      float l = dot(n, uLight);
      shade = 0.55 + 0.5 * max(l, 0.0) + 0.12 * min(l, 0.0);
    }
    vColor = color * shade * uBright;

    float tw = 1.0 + uTwinkle * 0.45 * sin(uTime * 2.3 + seed * 61.0);
    float px = size * uScale * grow * tw;
    if (uPersp > 0.5) {
      // Ground-level view: dots shrink with distance, and vanish right at the lens.
      if (vDepth < 0.3) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        gl_PointSize = 0.0;
        return;
      }
      px /= vDepth;
    }
    gl_PointSize = clamp(px, uMinPx, uMaxPx);
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uBg;
  uniform float uFogAmt;
  uniform float uFogNear;
  uniform float uFogFar;
  varying vec3 vColor;
  varying float vDepth;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    if (dot(c, c) > 0.25) discard;
    float f = smoothstep(uFogNear, uFogFar, vDepth) * uFogAmt;
    gl_FragColor = vec4(mix(vColor, uBg, f), 1.0);
  }
`;

export function dotMaterial({ assemble = false, frames = false } = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    defines: { ...(assemble ? { ASSEMBLE: '' } : {}), ...(frames ? { FRAMES: '' } : {}) },
    uniforms: {
      ...globals,
      uFrame: { value: 0 },
      uDensity: { value: 1 },
      uTwinkle: { value: 0 },
      uBright: { value: 1 },
      uAssemble: { value: 1 },
      uFogAmt: { value: 0.65 },
    },
  });
}

// Deterministic randomness so every visitor sees the same house.
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hex(c) {
  const n = typeof c === 'string' ? parseInt(c.replace('#', ''), 16) : c;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function scale(c, k) {
  return [c[0] * k, c[1] * k, c[2] * k];
}

// Accumulates dots, then turns them into a THREE.Points.
export class Dots {
  constructor(seed = 7) {
    this.p = [];
    this.c = [];
    this.s = [];
    this.n = [];
    this.r = rng(seed);
  }

  get count() {
    return this.s.length;
  }

  add(x, y, z, color, size = 0.08, nx = 0, ny = 0, nz = 0) {
    this.p.push(x, y, z);
    this.c.push(color[0], color[1], color[2]);
    this.s.push(size);
    this.n.push(nx, ny, nz);
    return this;
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    const n = this.count;
    const seeds = new Float32Array(n);
    for (let i = 0; i < n; i++) seeds[i] = this.r();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('size', new THREE.Float32BufferAttribute(this.s, 1));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }

  points(material = dotMaterial()) {
    const pts = new THREE.Points(this.geometry(), material);
    pts.frustumCulled = false;
    return pts;
  }
}

// Turns a points.bin from the server into geometry (see server/brain/world.js).
export function decodePoints(buffer) {
  const view = new DataView(buffer);
  const count = view.getUint32(0, true);
  const version = view.getUint32(4, true);
  const positions = new Float32Array(buffer, 8, count * 3);
  const colorsU8 = new Uint8Array(buffer, 8 + count * 12, count * 3);
  const sizesU8 = new Uint8Array(buffer, 8 + count * 15, count);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i++) colors[i] = colorsU8[i] / 255;
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i++) sizes[i] = sizesU8[i] / 500;
  const seeds = new Float32Array(count);
  const r = rng(count);
  for (let i = 0; i < count; i++) seeds[i] = r();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
  if (version >= 2) g.setAttribute('frame', new THREE.BufferAttribute(Float32Array.from(new Uint8Array(buffer, 8 + count * 16, count)), 1));
  g.computeBoundingBox();
  return g;
}

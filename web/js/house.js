import * as THREE from 'three';
import { Dots, dotMaterial, hex, mix, scale } from './dots.js';

export const HALF = 6; // the house fills plot [0,0]: x,z in [-6, 6]
export const WALL_H = 6.5;
const DOOR = { z0: 1.3, z1: 3.9, h: 6.0 };
const WINDOW = { x0: -0.4, x1: 3.4, y0: 2.1, y1: 5.3 };

// Places Charlie can be sent to with the `go` tool.
export const PLACES = {
  bed: { x: -3.5, z: -3.4, face: Math.PI * 0.25 },
  window: { x: 1.5, z: -4.7, face: -Math.PI / 2 },
  door: { x: -4.7, z: 2.6, face: Math.PI },
  bowl: { x: 3.6, z: -3.9, face: -Math.PI * 0.25 },
  toy: { x: -1.2, z: -1.4, face: Math.PI * 0.75 },
  rug: { x: 1.2, z: 1.8, face: Math.PI * 0.25 },
  center: { x: 0, z: 0, face: Math.PI * 0.25 },
};
export const DOOR_IN = { x: -5.0, z: 2.6 };
export const DOOR_OUT = { x: -7.2, z: 2.6 };

const C = {
  woods: ['#5a4434', '#6f543f', '#4b392b', '#7b5f47', '#433226', '#654c3a', '#83664c'].map(hex),
  wall: hex('#6f6b66'),
  wallTop: hex('#a39d95'),
  trim: hex('#ddd7cc'),
  sun: hex('#f3d29a'),
  glass: hex('#8fa6b6'),
  curtain: hex('#7b746d'),
  bedBase: hex('#b3a385'),
  blanket: hex('#ebe6dd'),
  blanketShade: hex('#c9c2b6'),
  steel: hex('#a6aeb3'),
  water: hex('#6f8ea3'),
  crust: hex('#c9914c'),
  lemon: hex('#f1cc4a'),
  lemonPale: hex('#f6e6a0'),
  rug: [hex('#cdc2ab'), hex('#b2a68f'), hex('#8e8573'), hex('#7d8b93')],
};

// Herringbone tiling with 1×n planks: H_k = [k, k+n]×[k, k+1],
// V_k = [k, k+1]×[k+1, k+n+1], repeated along (n, -n).
function herringbone(dots, r) {
  const w = 0.5;
  const n = 4;
  const R = (HALF * Math.SQRT2 + 1) / w;
  const K = Math.ceil(R + n + 2);
  const M = Math.ceil((2 * R) / n) + 2;
  const cos = 1;
  const sin = 0;
  const spacing = 0.1;
  const inset = 0.06;
  for (let m = -M; m <= M; m++) {
    for (let k = -K; k <= K; k++) {
      for (const vertical of [false, true]) {
        const u0 = (vertical ? k : k) + m * n;
        const v0 = (vertical ? k + 1 : k) - m * n;
        const du = vertical ? 1 : n;
        const dv = vertical ? n : 1;
        if (Math.abs(u0) > R + n || Math.abs(v0) > R + n) continue;
        const tone = C.woods[Math.floor(r() * C.woods.length)];
        const grainK = 6 + r() * 10;
        const grainP = r() * 10;
        const lenU = du * w;
        const lenV = dv * w;
        for (let a = inset; a < lenU - inset; a += spacing) {
          for (let b = inset; b < lenV - inset; b += spacing) {
            const pu = u0 * w + a + (r() - 0.5) * 0.03;
            const pv = v0 * w + b + (r() - 0.5) * 0.03;
            const x = pu * cos - pv * sin;
            const z = pu * sin + pv * cos;
            if (Math.abs(x) > HALF - 0.08 || Math.abs(z) > HALF - 0.08) continue;
            const along = vertical ? b : a;
            const grain = 0.84 + 0.16 * Math.sin(along * grainK + grainP + Math.sin(along * 3.1) * 1.5) + (r() - 0.5) * 0.08;
            let col = scale(tone, grain);
            const s = sunlight(x, z);
            if (s > 0) col = mix(col, scale(C.sun, 0.95), 0.45 * s);
            dots.add(x, 0, z, col, 0.072 + r() * 0.012);
          }
        }
      }
    }
  }
}

// The patch of afternoon sun the window throws on the floor.
function sunlight(x, z) {
  if (z < -HALF || z > -1.2) return 0;
  const t = (z + HALF) / (HALF - 1.2);
  const sx = x - t * 2.2;
  if (sx < WINDOW.x0 + 0.1 || sx > WINDOW.x1 - 0.1) return 0;
  const mullion = Math.abs(sx - (WINDOW.x0 + WINDOW.x1) / 2) < 0.12 ? 0.25 : 1;
  const fade = Math.min(1, (1 - t) * 2.2) * Math.min(1, t * 6 + 0.3);
  return fade * mullion;
}

// A wall is drawn on its inside face. `axis` is the wall's direction.
function wall(r, { axis, at, normal, holes = [] }) {
  const wallDots = new Dots(Math.floor(r() * 1e6));
  const trimDots = new Dots(Math.floor(r() * 1e6));
  const inHole = (u, y) => holes.some((h) => u > h.u0 && u < h.u1 && y > h.y0 && y < h.y1);
  const place = (u, y, offset = 0) => (axis === 'x' ? [u, y, at + normal[2] * offset] : [at + normal[0] * offset, y, u]);
  for (let u = -HALF; u <= HALF; u += 0.19) {
    for (let y = 0.55; y < WALL_H - 0.1; y += 0.19) {
      const uu = u + (r() - 0.5) * 0.05;
      const yy = y + (r() - 0.5) * 0.05;
      if (inHole(uu, yy)) continue;
      const g = 0.82 + 0.18 * (yy / WALL_H) + (r() - 0.5) * 0.08;
      const [x, Y, z] = place(uu, yy);
      wallDots.add(x, Y, z, scale(C.wall, g), 0.068, normal[0], 0, normal[2]);
    }
    const [x, Y, z] = place(u, WALL_H, 0.05);
    trimDots.add(x, Y, z, C.wallTop, 0.08, 0, 1, 0);
  }
  // Baseboard and the frames around openings.
  for (let u = -HALF; u <= HALF; u += 0.09) {
    for (let y = 0.06; y < 0.5; y += 0.11) {
      if (inHole(u, y)) continue;
      const [x, Y, z] = place(u, y, 0.06);
      trimDots.add(x, Y, z, scale(C.trim, 0.92 + r() * 0.1), 0.07, normal[0], 0, normal[2]);
    }
  }
  for (const h of holes) {
    const edge = (u, y) => {
      const [x, Y, z] = place(u, y, 0.07);
      trimDots.add(x, Y, z, C.trim, 0.075, normal[0], 0, normal[2]);
    };
    for (let y = Math.max(0.05, h.y0); y <= h.y1; y += 0.09) {
      edge(h.u0, y);
      edge(h.u1, y);
    }
    for (let u = h.u0; u <= h.u1; u += 0.09) {
      edge(u, h.y1);
      if (h.y0 > 0.2) edge(u, h.y0);
    }
  }
  return { wallDots, trimDots };
}

function bed(dots, r) {
  const { x: cx, z: cz } = { x: -3.5, z: -3.4 };
  const R = 1.35;
  const tube = 0.32;
  for (let i = 0; i < 2600; i++) {
    const a = r() * Math.PI * 2;
    const b = r() * Math.PI * 2;
    const rr = R + tube * Math.cos(b);
    const y = 0.3 + tube * Math.sin(b);
    if (y < 0.02) continue;
    const nx = Math.cos(a) * Math.cos(b);
    const ny = Math.sin(b);
    const nz = Math.sin(a) * Math.cos(b);
    dots.add(cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr, scale(C.bedBase, 0.95 + r() * 0.08), 0.07, nx, ny, nz);
  }
  // The white waffle blanket, rumpled into the middle.
  for (let gx = -1.15; gx <= 1.15; gx += 0.075) {
    for (let gz = -1.15; gz <= 1.15; gz += 0.075) {
      const d = Math.hypot(gx, gz);
      if (d > 1.2) continue;
      const waffle = (Math.abs((gx * 6.5) % 1) < 0.22 || Math.abs((gz * 6.5) % 1) < 0.22) ? 1 : 0.86;
      const y = 0.2 + 0.1 * Math.sin(gx * 2.6 + 1) * Math.cos(gz * 2.1) + 0.12 * Math.max(0, 1 - d) + (d > 1.0 ? (d - 1.0) * 0.7 : 0);
      const col = mix(C.blanketShade, C.blanket, waffle * (0.85 + r() * 0.15));
      dots.add(cx + gx + (r() - 0.5) * 0.02, y, cz + gz + (r() - 0.5) * 0.02, col, 0.066, 0, 1, 0);
    }
  }
}

function bowl(dots, r) {
  const cx = 4.4;
  const cz = -4.6;
  for (let i = 0; i < 520; i++) {
    const a = r() * Math.PI * 2;
    const y = r() * 0.26;
    const rr = 0.34 + y * 0.35;
    dots.add(cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr, scale(C.steel, 0.8 + r() * 0.35), 0.055, Math.cos(a), 0.3, Math.sin(a));
  }
  for (let i = 0; i < 260; i++) {
    const a = r() * Math.PI * 2;
    const rr = Math.sqrt(r()) * 0.38;
    dots.add(cx + Math.cos(a) * rr, 0.19, cz + Math.sin(a) * rr, scale(C.water, 0.85 + r() * 0.3), 0.05, 0, 1, 0);
  }
}

function lemonTart(dots, r) {
  const cx = -1.7;
  const cz = -2.1;
  for (let i = 0; i < 420; i++) {
    const a = r() * Math.PI * 2;
    const rr = Math.sqrt(r()) * 0.34;
    const edge = rr > 0.25;
    const y = edge ? 0.06 + r() * 0.1 : 0.13;
    dots.add(cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr, edge ? scale(C.crust, 0.85 + r() * 0.3) : scale(C.lemon, 0.9 + r() * 0.15), 0.05, 0, 1, 0);
  }
  // a lemon slice on top
  for (let i = 0; i < 90; i++) {
    const a = r() * Math.PI;
    const rr = Math.sqrt(r()) * 0.13;
    dots.add(cx + 0.05 + Math.cos(a) * rr, 0.17, cz - 0.03 + Math.sin(a) * rr * 0.9, r() < 0.2 ? C.lemon : C.lemonPale, 0.04, 0, 1, 0);
  }
}

function rug(dots, r) {
  const cx = 1.3;
  const cz = 1.9;
  const w = 4.6;
  const d = 3.3;
  for (let x = -w / 2; x <= w / 2; x += 0.085) {
    for (let z = -d / 2; z <= d / 2; z += 0.085) {
      const diamond = (Math.abs(((x + 10) % 0.9) - 0.45) + Math.abs(((z + 10) % 0.9) - 0.45)) < 0.2;
      const row = Math.floor((z + d / 2) / 0.17) % 2;
      let col = C.rug[row];
      if (diamond) col = C.rug[2];
      if (Math.abs(x) > w / 2 - 0.2 || Math.abs(z) > d / 2 - 0.2) col = C.rug[3];
      dots.add(cx + x + (r() - 0.5) * 0.02, 0.025, cz + z + (r() - 0.5) * 0.02, scale(col, 0.88 + r() * 0.16), 0.064, 0, 1, 0);
    }
  }
}

function windowDetail(dots, r) {
  const z = -HALF + 0.04;
  const { x0, x1, y0, y1 } = WINDOW;
  for (let x = x0; x <= x1; x += 0.14) {
    for (let y = y0; y <= y1; y += 0.14) {
      if (r() < 0.55) continue;
      const sky = mix(C.glass, hex('#c7d3da'), (y - y0) / (y1 - y0));
      dots.add(x + (r() - 0.5) * 0.06, y + (r() - 0.5) * 0.06, z - 0.08, sky, 0.05);
    }
  }
  const mid = (x0 + x1) / 2;
  for (let y = y0; y <= y1; y += 0.08) dots.add(mid, y, z + 0.03, C.trim, 0.07, 0, 0, 1);
  for (let x = x0; x <= x1; x += 0.08) dots.add(x, (y0 + y1) / 2, z + 0.03, C.trim, 0.07, 0, 0, 1);
  // Sill
  for (let x = x0 - 0.3; x <= x1 + 0.3; x += 0.07) {
    for (let d = 0; d <= 0.3; d += 0.07) dots.add(x, y0 - 0.06, z + d, C.trim, 0.07, 0, 1, 0);
  }
  // Curtains, gathered on both sides
  for (const side of [x0 - 0.55, x1 + 0.55]) {
    for (let y = 0.7; y <= WALL_H - 0.3; y += 0.1) {
      for (let u = -0.45; u <= 0.45; u += 0.09) {
        const fold = Math.sin(u * 14 + y * 0.4) * 0.1;
        dots.add(side + u, y, z + 0.18 + fold, scale(C.curtain, 0.78 + 0.3 * (0.5 + 0.5 * Math.sin(u * 14)) + (r() - 0.5) * 0.08), 0.065, 0, 0, 1);
      }
    }
  }
}

function door(dots) {
  // The white door, standing open into the room.
  const hingeZ = DOOR.z1;
  const open = 1.15;
  const width = DOOR.z1 - DOOR.z0;
  for (let t = 0; t <= width; t += 0.09) {
    for (let y = 0.05; y <= DOOR.h - 0.05; y += 0.09) {
      const x = -HALF + Math.sin(open) * t;
      const z = hingeZ - Math.cos(open) * t;
      const panel = (Math.abs(t - width * 0.5) < width * 0.36 && ((y > 0.6 && y < 2.7) || (y > 3.2 && y < 5.5))) ? 0.88 : 1;
      dots.add(x, y, z, scale(C.trim, panel), 0.07, Math.cos(open), 0, Math.sin(open));
    }
  }
  // Outside the door: a little welcome mat and a path into the world.
  for (let x = -HALF - 1.6; x <= -HALF - 0.2; x += 0.1) {
    for (let z = DOOR.z0 + 0.2; z <= DOOR.z1 - 0.2; z += 0.1) {
      dots.add(x, 0.02, z, scale(hex('#7a6a55'), 0.9), 0.06, 0, 1, 0);
    }
  }
}

export function buildHouse() {
  const group = new THREE.Group();
  const r = (() => {
    let s = 1337;
    return () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
  })();

  const floor = new Dots(11);
  herringbone(floor, r);
  group.add(floor.points());

  const things = new Dots(12);
  bed(things, r);
  bowl(things, r);
  lemonTart(things, r);
  rug(things, r);
  windowDetail(things, r);
  door(things);
  group.add(things.points());

  // Four walls; whichever ones face the camera thin out so you can see in.
  const walls = [
    { axis: 'x', at: -HALF, normal: [0, 0, 1], holes: [{ u0: WINDOW.x0, u1: WINDOW.x1, y0: WINDOW.y0, y1: WINDOW.y1 }] },
    { axis: 'z', at: -HALF, normal: [1, 0, 0], holes: [{ u0: DOOR.z0, u1: DOOR.z1, y0: -1, y1: DOOR.h }] },
    { axis: 'x', at: HALF, normal: [0, 0, -1], holes: [] },
    { axis: 'z', at: HALF, normal: [-1, 0, 0], holes: [] },
  ].map((spec) => {
    const { wallDots, trimDots } = wall(r, spec);
    const mat = dotMaterial();
    const pts = wallDots.points(mat);
    group.add(pts);
    group.add(trimDots.points());
    return { pts, mat, normal: new THREE.Vector3(...spec.normal), density: 1 };
  });

  const view = new THREE.Vector3();
  return {
    group,
    update(camera, dt) {
      camera.getWorldDirection(view);
      for (const w of walls) {
        // The wall faces into the room; if we're looking at its back, fade it.
        const facing = w.normal.dot(view);
        const target = facing > 0.15 ? 0 : 1;
        w.density += (target - w.density) * Math.min(1, dt * 4);
        w.mat.uniforms.uDensity.value = w.density;
      }
    },
  };
}

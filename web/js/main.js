import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { globals, BG } from './dots.js';
import { buildHouse, PLACES, DOOR_IN, DOOR_OUT, HALF } from './house.js';
import { Charlie } from './charlie.js';
import { Particles } from './fx.js';
import { WorldView } from './world.js';
import { buildSky } from './sky.js';
import { Minimap } from './minimap.js';
import { UI } from './ui.js';
import { createNet } from './net.js';

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setClearColor(BG, 1);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

const scene = new THREE.Scene();
const house = buildHouse();
scene.add(house.group);
const charlie = new Charlie();
scene.add(charlie.object);
const fx = new Particles();
scene.add(fx.points);
const sky = buildSky();
scene.add(sky);
const net = createNet();
const ui = new UI(net);
const minimap = new Minimap(document.getElementById('minimap'));
let world = null;

// ---------------------------------------------------------------- two views
// 2.5D: an orthographic diorama from above. 3D: a perspective camera down at
// ground level that follows Charlie around.
const VIEW = 13.5;
const DIST = 70;
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
const orthoControls = new OrbitControls(ortho, canvas);
orthoControls.target.set(0, 1.2, 0);
{
  const polar = 0.98;
  const az = Math.PI / 4;
  ortho.position.set(Math.sin(polar) * Math.sin(az), Math.cos(polar), Math.sin(polar) * Math.cos(az)).multiplyScalar(DIST).add(orthoControls.target);
}
Object.assign(orthoControls, { enableDamping: true, dampingFactor: 0.08, minPolarAngle: 0.45, maxPolarAngle: 1.32, minZoom: 0.25, maxZoom: 4, screenSpacePanning: false, zoomSpeed: 1.2 });
orthoControls.update();

const persp = new THREE.PerspectiveCamera(52, 1, 0.1, 600);
const perspControls = new OrbitControls(persp, canvas);
Object.assign(perspControls, { enableDamping: true, dampingFactor: 0.1, enablePan: false, minDistance: 2.2, maxDistance: 24, minPolarAngle: 0.35, maxPolarAngle: 1.52, rotateSpeed: 0.6 });
persp.position.set(-3.5, 2.5, 2);
perspControls.target.set(-3.5, 1, -3.4);
perspControls.enabled = false;

let view = '2.5d';
try {
  if (localStorage.getItem('charlie-view') === '3d') view = '3d';
} catch {}
const cam = () => (view === '3d' ? persp : ortho);

function setView(v, { save = true } = {}) {
  view = v;
  if (save) {
    try {
      localStorage.setItem('charlie-view', v);
    } catch {}
  }
  orthoControls.enabled = v !== '3d';
  perspControls.enabled = v === '3d';
  sky.visible = v === '3d';
  globals.uPersp.value = v === '3d' ? 1 : 0;
  // Up close, keep dots dots: cap their size so near surfaces stay airy.
  globals.uMaxPx.value = v === '3d' ? 22 * renderer.getPixelRatio() : 64;
  globals.uFogNear.value = v === '3d' ? 16 : DIST + 4;
  globals.uFogFar.value = v === '3d' ? 85 : DIST + 60;
  if (v === '3d') followCam(0, performance.now(), true);
  ui.setView(v);
  minimap.setVisible(v === '3d');
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  const aspect = w / h;
  const v = w < 760 ? VIEW * 1.25 : VIEW;
  Object.assign(ortho, { left: (-v * aspect) / 2, right: (v * aspect) / 2, top: v / 2, bottom: -v / 2 });
  ortho.updateProjectionMatrix();
  persp.aspect = aspect;
  persp.fov = w < 760 ? 62 : 52;
  persp.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- framing
// On a phone the controls cover a good part of the screen, so her world is
// centered in what they leave free: between the ones along the top and the
// bottom, and on a phone turned sideways, between the columns at either side.
const free = { top: 0, bottom: 0, left: 0, right: 0, at: -Infinity };
const EDGES = ['.brand h1', '.status', '#feelings', '#tokens', '#mind', '.center-dock', '.actions'];
const sideways = matchMedia('(orientation: landscape) and (max-width: 1020px), (orientation: landscape) and (max-height: 500px)');
window.addEventListener('resize', () => Object.assign(free, { top: NaN, at: -Infinity }));

// However crowded it gets, her world keeps at least 40% of each direction.
function squeeze(a, b, size) {
  const over = a + b - size * 0.6;
  return over > 0 ? [a - (over * a) / (a + b), b - (over * b) / (a + b)] : [a, b];
}

function measureFree(now) {
  free.at = now;
  const w = innerWidth;
  const h = innerHeight;
  let [top, bottom, left, right] = [0, 0, 0, 0];
  const rect = (sel) => {
    const r = document.querySelector(sel)?.getBoundingClientRect();
    return r?.height ? r : null;
  };
  if (!following) {
    for (const sel of EDGES) {
      const r = rect(sel);
      // Only what covers the middle of the screen is in the way.
      if (!r || r.right < w * 0.45 || r.left > w * 0.55) continue;
      if (r.top + r.height / 2 < h / 2) top = Math.max(top, r.bottom);
      else bottom = Math.max(bottom, h - r.top);
    }
    if (sideways.matches) {
      // Her thoughts run down the left, and the controls down the right.
      left = rect('#mind')?.right ?? 0;
      right = w - Math.min(rect('.center-dock')?.left ?? w, rect('.actions')?.left ?? w);
    }
    [top, bottom] = squeeze(top, bottom, h);
    [left, right] = squeeze(left, right, w);
  }
  const same = (a, b) => Math.abs(a - b) < 1;
  if (same(top, free.top) && same(bottom, free.bottom) && same(left, free.left) && same(right, free.right)) return;
  Object.assign(free, { top, bottom, left, right });
  const dx = (left - right) / 2;
  const dy = (top - bottom) / 2;
  for (const c of [ortho, persp]) {
    if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1) c.setViewOffset(w, h, -dx, -dy, w, h);
    else c.clearViewOffset();
  }
}

// ---------------------------------------------------------------- moving around
function boxHit(a, b, m = HALF + 0.6) {
  let t0 = 0;
  let t1 = 1;
  for (const k of ['x', 'z']) {
    const d = b[k] - a[k];
    if (Math.abs(d) < 1e-9) {
      if (a[k] < -m || a[k] > m) return false;
      continue;
    }
    let u0 = (-m - a[k]) / d;
    let u1 = (m - a[k]) / d;
    if (u0 > u1) [u0, u1] = [u1, u0];
    t0 = Math.max(t0, u0);
    t1 = Math.min(t1, u1);
    if (t0 > t1) return false;
  }
  return true;
}

function around(a, b) {
  if (!boxHit(a, b)) return [];
  const c = HALF + 1.2;
  const corners = [{ x: c, z: c }, { x: c, z: -c }, { x: -c, z: c }, { x: -c, z: -c }];
  const len = (pts) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) : 0), 0);
  let best = null;
  for (const k of corners) {
    if (!boxHit(a, k) && !boxHit(k, b)) {
      const l = len([a, k, b]);
      if (!best || l < best.l) best = { l, pts: [k] };
    }
  }
  if (best) return best.pts;
  for (const k1 of corners) {
    for (const k2 of corners) {
      if (k1 === k2 || boxHit(a, k1) || boxHit(k1, k2) || boxHit(k2, b)) continue;
      const l = len([a, k1, k2, b]);
      if (!best || l < best.l) best = { l, pts: [k1, k2] };
    }
  }
  return best?.pts ?? [];
}

const inside = (p) => Math.abs(p.x) < HALF - 0.2 && Math.abs(p.z) < HALF - 0.2;

function route(to) {
  const from = { x: charlie.pos.x, z: charlie.pos.z };
  const a = inside(from);
  const b = inside(to);
  if (a && b) return [to];
  if (a) return [DOOR_IN, DOOR_OUT, ...around(DOOR_OUT, to), to];
  if (b) return [...around(from, DOOR_OUT), DOOR_OUT, DOOR_IN, to];
  return [...around(from, to), to];
}

function placeFor(name) {
  if (PLACES[name]) return PLACES[name];
  // Anywhere on her land, as "[x,z]".
  const plot = /^\[(-?\d+),(-?\d+)\]$/.exec(name ?? '');
  if (plot && world) {
    const c = world.plotCenter([Number(plot[1]), Number(plot[2])]);
    return { x: c.x, z: c.z };
  }
  const obj = world?.objects.get(name);
  if (!obj) return null;
  const c = world.plotCenter(obj.meta.plot);
  const dir = new THREE.Vector3(-c.x, 0, -c.z).normalize();
  const p = c.clone().addScaledVector(dir, world.plotSize / 2 - 0.6);
  return { x: p.x, z: p.z, face: Math.atan2(c.z - p.z, c.x - p.x) };
}

function placePoint(name, y = 0.4) {
  if (name === 'bowl') return new THREE.Vector3(4.4, y, -4.6);
  if (name === 'toy') return new THREE.Vector3(-1.7, y, -2.1);
  if (name === 'bed') return new THREE.Vector3(-3.5, y, -3.4);
  if (name === 'window') return new THREE.Vector3(1.5, 3.7, -5.9);
  if (name === 'door') return new THREE.Vector3(-5.9, 4.5, 2.6);
  if (name === 'rug') return new THREE.Vector3(1.3, y, 1.9);
  const obj = world?.objects.get(name);
  return obj ? world.plotCenter(obj.meta.plot).setY(1.5) : null;
}

let currentPlace = 'bed';
function goTo(name, then) {
  const place = placeFor(name);
  if (!place) return;
  currentPlace = name;
  charlie.walkTo(route(place), () => {
    if (place.face != null) charlie.heading = place.face;
    then?.();
  });
}

// ---------------------------------------------------------------- her body
// The server says where she is and what she's doing; this only decides how
// that looks. It never moves her anywhere she didn't choose to go.
const B = { status: 'sleeping', activity: 'sleeping', paused: false, location: 'bed', poseAt: 0, fxT: 0 };

function asleep() {
  return B.status !== 'awake' || B.paused;
}

function settle() {
  if (asleep()) return charlie.setPose(currentPlace === 'bed' ? 'sleep' : 'sploot');
  if (B.activity === 'coding') return charlie.setPose('sploot');
  if (B.activity === 'skill' || B.activity === 'waking' || B.activity === 'browsing') return charlie.setPose('stand');
  charlie.setPose('sit');
}

function applyActivity() {
  if (asleep() && currentPlace !== 'bed') return goTo('bed', settle);
  if (B.activity === 'waking') charlie.wiggle(0.4);
  if (!charlie.walking) settle();
}

function idlePoses(now) {
  if (asleep() || charlie.walking || B.activity !== 'thinking' || now < B.poseAt) return;
  B.poseAt = now + 12000 + Math.random() * 14000;
  charlie.setPose(['sit', 'sit', 'stand', 'sploot'][Math.floor(Math.random() * 4)]);
}

// ---------------------------------------------------------------- server
let selfPets = 0;
let selfTreats = 0;

function headScreen() {
  const v = charlie.headPosition(new THREE.Vector3()).project(cam());
  return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, visible: v.z < 1 && v.z > -1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 };
}

function petEffect() {
  charlie.pet();
  for (let i = 0; i < 2; i++) setTimeout(() => fx.heart(charlie.headPosition(new THREE.Vector3())), i * 260);
}

function treatEffect() {
  const head = charlie.headPosition(new THREE.Vector3());
  const from = view === '3d' ? head.clone().lerp(persp.position, 0.6).add(new THREE.Vector3(0, 1, 0)) : head.clone().add(new THREE.Vector3(3, 2.5, 3));
  fx.treat(from, head);
  setTimeout(() => {
    charlie.wiggle(1);
    fx.sparks(head, 10, [0.92, 0.85, 0.7]);
  }, 900);
}

function actionEffect(a) {
  const at = placePoint(a.place);
  if (at) {
    if (a.id === 'fill_bowl') fx.pour(at);
    else if (a.id === 'squeak_toy') fx.ring(at.clone().setY(0.3), [0.95, 0.8, 0.3]);
    else if (a.id === 'roll_ball') fx.ball(new THREE.Vector3(3.4, 0.2, 3.3), charlie.pos.clone().setY(0.2));
    else if (a.id === 'tap_window') fx.ring(at, [0.6, 0.72, 0.85]);
    else if (a.id === 'ring_bell') fx.ring(at, [0.95, 0.85, 0.55]);
    else if (a.id === 'fluff_bed') fx.puff(at);
    else fx.sparks(at, 18, [0.58, 0.71, 0.85]);
  }
  setTimeout(() => {
    charlie.tiltHead((Math.random() < 0.5 ? -1 : 1) * 0.3);
    charlie.wiggle(a.ate ? 1 : 0.5);
  }, 500);
}

// Clicking her is always a pet you can see. On GitHub Pages it also goes in
// her mailbox, and she feels it at her next check-in.
let mailHinted = false;

function mailed(r) {
  if (net.kind !== 'static' || !r) return;
  if (r.error) ui.toast(r.error);
  else if (r.sent && !mailHinted) {
    ui.toast('She felt that. Charlie checks in every 15 minutes or so, and remembers who was nice to her.');
    mailHinted = true;
  }
}

async function pet() {
  petEffect();
  selfPets++;
  mailed(await net.pet());
}

async function treat() {
  treatEffect();
  selfTreats++;
  const r = await net.treat();
  if (r && r.counted === false) ui.toast("Charlie loved it (that's enough treats from you for today, though)");
  mailed(r);
}

async function act(id) {
  if (id === 'pet') return pet();
  if (id === 'treat') return treat();
  const r = await net.act(id);
  if (r.error) return ui.toast(r.error);
  if (net.kind === 'static') {
    const a = ui.state?.actions?.find((x) => x.id === id);
    if (a) actionEffect(a);
    mailed(r);
  }
}

function connect() {
  const on = (type, fn) => net.on(type, fn);

  on('hello', async (s) => {
    ui.load(s);
    house.setBowl(s.feelings.bowl);
    Object.assign(B, { status: s.charlie.status, activity: s.charlie.activity, paused: s.charlie.paused, location: s.charlie.location });
    const first = !world;
    if (first) world = new WorldView(scene, s.world.plotSize, (meta) => net.pointsUrl(meta));
    await world.sync(s.world.objects, s.world.buildable, null);
    if (first) {
      const where = asleep() ? 'bed' : s.charlie.location;
      const p = placeFor(where) ?? PLACES.bed;
      charlie.pos.set(p.x, 0, p.z);
      if (p.face != null) charlie.heading = p.face;
      currentPlace = placeFor(where) ? where : 'bed';
      settle();
      setView(view, { save: false });
    } else applyActivity();
  });
  on('charlie', (c) => {
    const changed = c.status !== B.status || c.activity !== B.activity || c.paused !== B.paused;
    Object.assign(B, { status: c.status, activity: c.activity, paused: c.paused, location: c.location });
    ui.setCharlie(c);
    if (changed) applyActivity();
  });
  on('go', ({ to }) => {
    if (to !== currentPlace || !charlie.walking) goTo(to, settle);
  });
  on('feed', (item) => ui.addFeed(item));
  on('thought_delta', (d) => ui.thoughtDelta(d));
  on('code_start', (d) => ui.codeStart(d));
  on('code_title', (d) => ui.codeTitle(d));
  on('code_delta', (d) => ui.codeDelta(d));
  on('code_end', (d) => ui.codeEnd(d));
  on('balance', (d) => {
    ui.balanceEvent(d);
    if (d.delta > 0 && d.key?.startsWith('github.')) fx.burst(charlie.headPosition(new THREE.Vector3()), 24);
  });
  on('prices', (p) => ui.setPrices(p));
  on('skills', (list) => {
    ui.setSkills(list);
    fx.burst(charlie.headPosition(new THREE.Vector3()), 40, [0.84, 0.51, 0.29]);
  });
  on('world', async (w) => {
    ui.setWorld({ objects: w.objects, buildable: w.buildable });
    const from = charlie.headPosition(new THREE.Vector3());
    await world?.sync(w.objects, w.buildable, from);
    if (w.changed && world?.objects.get(w.changed)) recentBuild = { name: w.changed, t: performance.now() };
  });
  on('feelings', (f) => {
    ui.setFeelings(f);
    house.setBowl(f.bowl);
  });
  on('diary', (entry) => ui.addDiary(entry));
  on('site', (site) => ui.setSite(site));
  on('requests', (list) => ui.setRequests(list));
  on('actions', (list) => ui.setActions(list));
  on('action', actionEffect);
  on('visitor_note', () => ui.refreshMe());
  on('viewers', ({ count }) => ui.setViewers(count));
  on('pet', () => {
    if (selfPets > 0) selfPets--;
    else petEffect();
  });
  on('treat', () => {
    if (selfTreats > 0) selfTreats--;
    else treatEffect();
  });
  on('say', ({ text, to }) => {
    ui.say(to ? `@${to} ${text}` : text);
    charlie.tiltHead(0.18);
    charlie.wiggle(0.3);
  });
  on('touch', ({ name }) => {
    const obj = world?.objects.get(name);
    if (obj) fx.sparks(world.plotCenter(obj.meta.plot).add(new THREE.Vector3(0, 1, 0)), 14, [0.58, 0.71, 0.85]);
  });
  on('replay', (r) => ui.setReplay(r));
  on('connection', (ok) => ui.setConnection(ok));
}

// ---------------------------------------------------------------- cameras in motion
const focusBox = new THREE.Box3();
const goalTarget = new THREE.Vector3();
const tmpV = new THREE.Vector3();
const sph = new THREE.Spherical();
let recentBuild = null;
let framed = false;

// 2.5D: frame the house plus wherever Charlie is and whatever she just built.
function autoFrame(dt, now) {
  focusBox.set(new THREE.Vector3(-HALF, 0, -HALF), new THREE.Vector3(HALF, 0, HALF));
  const P = world.plotSize;
  const half = P / 2;
  if (!inside(charlie.pos)) {
    const px = Math.round(charlie.pos.x / P);
    const pz = Math.round(charlie.pos.z / P);
    focusBox.expandByPoint(tmpV.set(px * P - half, 0, pz * P - half));
    focusBox.expandByPoint(tmpV.set(px * P + half, 0, pz * P + half));
  }
  if (recentBuild && now - recentBuild.t < 40000 && world.objects.get(recentBuild.name)) {
    const c = world.plotCenter(world.objects.get(recentBuild.name).meta.plot);
    focusBox.expandByPoint(tmpV.set(c.x - half, 0, c.z - half));
    focusBox.expandByPoint(tmpV.set(c.x + half, 0, c.z + half));
  }
  const size = focusBox.getSize(tmpV);
  const diag = (size.x + size.z) * Math.SQRT1_2;
  const aspect = innerWidth / innerHeight;
  const v = ortho.top - ortho.bottom;
  const roomX = 1 - (free.left + free.right) / innerWidth;
  const roomY = 1 - (free.top + free.bottom) / innerHeight;
  const zoom = Math.min(1, (v * aspect * 0.8 * roomX) / diag, (v * 0.85 * roomY) / (diag * 0.62 + 5));
  focusBox.getCenter(goalTarget).setY(1.2);
  const k = framed ? Math.min(1, dt * 0.8) : 1;
  framed = true;
  const delta = goalTarget.sub(orthoControls.target).multiplyScalar(k);
  orthoControls.target.add(delta);
  ortho.position.add(delta);
  ortho.zoom += (zoom - ortho.zoom) * k;
  ortho.updateProjectionMatrix();
}

// 3D: stay with her. While she walks, swing round behind her; while she's
// still, drift round to see her face.
function followCam(dt, now, snap = false) {
  const t = tmpV.set(charlie.pos.x, charlie.floor + 1.0, charlie.pos.z);
  const delta = t.sub(perspControls.target);
  perspControls.target.add(delta);
  persp.position.add(delta);
  if (!snap && now - lastInteract < 6000) return;
  const offset = persp.position.clone().sub(perspControls.target);
  sph.setFromVector3(offset);
  const h = charlie.heading;
  const want = charlie.walking ? Math.atan2(-Math.cos(h), -Math.sin(h)) : Math.atan2(Math.cos(h), Math.sin(h)) + 0.8;
  const diff = ((want - sph.theta + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  const k = snap ? 1 : Math.min(1, dt * (charlie.walking ? 1.1 : 0.35));
  sph.theta += diff * k;
  sph.phi += (1.28 - sph.phi) * k;
  if (snap) sph.radius = 6.5;
  persp.position.copy(perspControls.target).add(offset.setFromSpherical(sph));
}

// ---------------------------------------------------------------- input
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let downAt = null;
let lastInteract = -Infinity;

function pickAt(x, y) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, cam());
  const ray = raycaster.ray;
  if (ray.distanceToPoint(charlie.pos.clone().setY(0.9)) < 1.1) return { charlie: true };
  const obj = world?.pick(ray);
  return obj ? { obj } : null;
}

canvas.addEventListener('pointermove', (e) => {
  if (e.buttons || e.pointerType !== 'mouse') return;
  const hover = pickAt(e.clientX, e.clientY);
  canvas.classList.toggle('hovering', Boolean(hover));
  if (hover?.obj) ui.showTip(e.clientX, e.clientY, hover.obj.meta);
  else if (hover?.charlie) ui.showTip(e.clientX, e.clientY, { name: 'Charlie', description: 'click to pet her' });
  else ui.showTip(0, 0, null);
});
canvas.addEventListener('pointerleave', (e) => {
  // A finger "leaves" every time it lifts, so only a mouse leaving hides the tip.
  if (e.pointerType === 'mouse') ui.showTip(0, 0, null);
});
canvas.addEventListener('pointerdown', (e) => {
  downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
  lastInteract = performance.now();
  document.getElementById('hint').classList.add('gone');
});
// On a touchscreen there's no hovering, so the first tap on a build shows what
// it is and a second tap follows its link.
let tapped = null;
let tapTimer = 0;

canvas.addEventListener('pointerup', (e) => {
  lastInteract = performance.now();
  if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6 || performance.now() - downAt.t > 600) return;
  const hit = pickAt(e.clientX, e.clientY);
  const touch = e.pointerType !== 'mouse';
  if (hit?.charlie) pet();
  else if (hit?.obj) {
    const meta = hit.obj.meta;
    if (touch && tapped !== meta.name) {
      tapped = meta.name;
      ui.showTip(e.clientX, e.clientY, meta, { touch });
      net.touch(meta.name);
      clearTimeout(tapTimer);
      tapTimer = setTimeout(() => {
        tapped = null;
        ui.showTip(0, 0, null);
      }, 4000);
      return;
    }
    // Opened during the tap itself, so Safari doesn't block it as a popup.
    if (meta.link) window.open(meta.link, '_blank', 'noopener');
    if (!touch) net.touch(meta.name);
  }
  tapped = null;
  if (touch) ui.showTip(0, 0, null);
});
canvas.addEventListener('wheel', () => {
  lastInteract = performance.now();
}, { passive: true });

ui.onAction = act;
ui.onView = (v) => setView(v);

// ---------------------------------------------------------------- follow mode
// Nothing on screen but her world, with the ground-level camera staying with
// her. Moving the mouse or tapping shows a way out for a moment.
let following = false;
let viewBefore = view;
let stirTimer = 0;

function stir() {
  if (!following) return;
  document.body.classList.add('stirred');
  clearTimeout(stirTimer);
  stirTimer = setTimeout(() => document.body.classList.remove('stirred'), 2500);
}

function setFollowing(on) {
  if (on === following) return;
  following = on;
  document.body.classList.toggle('following', on);
  if (on) {
    viewBefore = view;
    setView('3d', { save: false });
    lastInteract = -Infinity;
    ui.showTip(0, 0, null);
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else {
    clearTimeout(stirTimer);
    document.body.classList.remove('stirred');
    setView(viewBefore, { save: false });
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }
}

document.getElementById('follow-btn').addEventListener('click', () => setFollowing(true));
document.getElementById('follow-exit').addEventListener('click', () => setFollowing(false));
document.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'f' || e.key === 'F') setFollowing(!following);
  else if (e.key === 'Escape') setFollowing(false);
});
// Leaving fullscreen (the browser's own Esc) leaves follow mode too.
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && following) setFollowing(false);
});
addEventListener('pointermove', stir);
addEventListener('pointerdown', stir);

// Owner controls: open the site with ?admin
if (net.kind === 'live' && new URLSearchParams(location.search).has('admin')) {
  let token = '';
  try {
    token = localStorage.getItem('charlie-admin') || '';
  } catch {}
  const bar = document.getElementById('admin');
  bar.hidden = false;
  bar.addEventListener('click', async (e) => {
    const action = e.target.dataset?.admin;
    if (!action) return;
    if (!token) {
      token = prompt('Admin token (ADMIN_TOKEN from your .env):') || '';
      try {
        localStorage.setItem('charlie-admin', token);
      } catch {}
    }
    let body = {};
    if (action === 'grant') {
      const amount = Number(prompt('How many tokens?', '10'));
      if (!amount) return;
      body = { amount, reason: prompt('Why? (Charlie will see this)', 'a gift from your human') || undefined };
    }
    if (action === 'answer') {
      const id = Number(prompt('Which request number are you answering? (see her stuff → web)'));
      if (!id) return;
      const reply = prompt('Your answer (she reads it next time she wakes):') ?? '';
      body = { id, reply, status: confirm('OK = done / granted, Cancel = declined') ? 'done' : 'declined' };
    }
    const res = await fetch(`api/admin/${action}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (res.status === 403) {
      try {
        localStorage.removeItem('charlie-admin');
      } catch {}
      token = '';
      ui.toast('That admin token was rejected.');
    } else ui.toast(`${action}: ${res.ok ? 'done' : 'failed'}`);
  });
}

// ---------------------------------------------------------------- loop
const clock = new THREE.Timer();
setTimeout(() => document.getElementById('hint').classList.add('gone'), 14000);

function frame(time) {
  clock.update(time);
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.getElapsed();
  const now = performance.now();

  const camera = cam();
  (view === '3d' ? perspControls : orthoControls).update();
  globals.uTime.value = t;
  const h = renderer.domElement.height;
  globals.uScale.value = view === '3d' ? h / (2 * Math.tan(THREE.MathUtils.degToRad(persp.fov) / 2)) : (h / (ortho.top - ortho.bottom)) * ortho.zoom;

  idlePoses(now);
  const onBed = currentPlace === 'bed' && !charlie.walking && Math.hypot(charlie.pos.x - PLACES.bed.x, charlie.pos.z - PLACES.bed.z) < 0.6;
  charlie.floor += ((onBed ? 0.22 : 0) - charlie.floor) * Math.min(1, dt * 4);
  charlie.update(dt, t);
  if (world) world.update(dt, t);
  house.update(camera, dt);

  B.fxT -= dt;
  if (B.fxT <= 0) {
    const head = charlie.headPosition(new THREE.Vector3());
    if (asleep() && !charlie.walking) {
      fx.zee(head);
      B.fxT = 2.4;
    } else if (B.activity === 'coding' || B.activity === 'building') {
      fx.sparks(head, 2);
      B.fxT = 0.25;
    } else if (B.activity === 'browsing' && !charlie.walking) {
      fx.stream(new THREE.Vector3(1.5, 3.7, -7), head, 2, [0.6, 0.72, 0.85]);
      B.fxT = 0.15;
    } else if (B.activity === 'skill' && !charlie.walking) {
      fx.stream(head, new THREE.Vector3(DOOR_OUT.x - 4, 3, DOOR_OUT.z), 3);
      B.fxT = 0.12;
    } else B.fxT = 0.5;
  }
  fx.update(dt);

  if (now - free.at > 500) measureFree(now);
  if (world) {
    if (view === '3d') followCam(dt, now);
    else if (now - lastInteract > 12000) autoFrame(dt, now);
  }

  renderer.render(scene, camera);
  const hs = headScreen();
  ui.placeBubble(hs.x, hs.y, hs.visible);
  if (view === '3d' && !following) minimap.draw(now, { charlie, world, camera: persp });
  requestAnimationFrame(frame);
}

if (new URLSearchParams(location.search).has('debug')) {
  window.__charlie = { charlie, ortho, persp, orthoControls, perspControls, fx, ui, scene, goTo, setView, B, get world() { return world; } };
}

if (matchMedia('(pointer: coarse)').matches) document.getElementById('hint').textContent = 'drag to look around · pinch to zoom · tap charlie to pet her';

connect();
net.start();
net.hello().then((me) => ui.setMe(me));
requestAnimationFrame(frame);

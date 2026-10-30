import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { globals, BG } from './dots.js';
import { buildHouse, PLACES, DOOR_IN, DOOR_OUT, HALF } from './house.js';
import { Charlie } from './charlie.js';
import { Particles } from './fx.js';
import { WorldView } from './world.js';
import { UI } from './ui.js';

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setClearColor(BG, 1);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

const scene = new THREE.Scene();
const VIEW = 13.5; // world units visible vertically at zoom 1
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
const DIST = 70;
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1.2, 0);
{
  const polar = 0.98;
  const az = Math.PI / 4;
  camera.position.set(Math.sin(polar) * Math.sin(az), Math.cos(polar), Math.sin(polar) * Math.cos(az)).multiplyScalar(DIST).add(controls.target);
}
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minPolarAngle = 0.45;
controls.maxPolarAngle = 1.32;
controls.minZoom = 0.25;
controls.maxZoom = 4;
controls.screenSpacePanning = false;
controls.zoomSpeed = 1.2;
controls.update();
globals.uFogNear.value = DIST + 4;
globals.uFogFar.value = DIST + 60;

const house = buildHouse();
scene.add(house.group);
const charlie = new Charlie();
scene.add(charlie.object);
const fx = new Particles();
scene.add(fx.points);
const ui = new UI();
let world = null;

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  const aspect = w / h;
  const v = w < 760 ? VIEW * 1.25 : VIEW;
  camera.left = (-v * aspect) / 2;
  camera.right = (v * aspect) / 2;
  camera.top = v / 2;
  camera.bottom = -v / 2;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- moving around
function boxHit(a, b, m = HALF + 0.6) {
  // Does segment a→b cross the house square?
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
  const obj = world?.objects.get(name);
  if (!obj) return null;
  const c = world.plotCenter(obj.meta.plot);
  const dir = new THREE.Vector3(-c.x, 0, -c.z).normalize();
  const p = c.clone().addScaledVector(dir, world.plotSize / 2 - 0.6);
  return { x: p.x, z: p.z, face: Math.atan2(c.z - p.z, c.x - p.x) };
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

// ------------------------------------------------- what Charlie does with her body
// The server says what she's doing (sleeping, thinking, coding, using a skill);
// this decides how that looks. It never changes what she decides.
const B = { status: 'sleeping', activity: 'sleeping', paused: false, manualUntil: 0, wanderAt: 0, fxT: 0 };

function applyActivity() {
  const asleep = B.status !== 'awake' || B.paused;
  if (asleep) {
    if (currentPlace !== 'bed' || charlie.walking) goTo('bed', () => charlie.setPose('sleep'));
    else charlie.setPose('sleep');
    return;
  }
  if (B.activity === 'waking') {
    charlie.setPose('stand');
    charlie.wiggle(0.4);
    B.wanderAt = performance.now() + 2500;
  } else if (B.activity === 'skill') {
    goTo('door', () => charlie.setPose('stand'));
  } else if (B.activity === 'coding') {
    if (performance.now() > B.manualUntil) goTo('rug', () => charlie.setPose('sploot'));
    else charlie.setPose('sploot');
  } else if (B.activity === 'building') {
    charlie.setPose('sit');
  } else if (!charlie.walking) {
    charlie.setPose('sit');
  }
}

function wander(now) {
  if (B.status !== 'awake' || B.paused || charlie.walking) return;
  if (!['thinking', 'waking'].includes(B.activity) || now < B.manualUntil || now < B.wanderAt) return;
  B.wanderAt = now + 9000 + Math.random() * 14000;
  const options = ['window', 'rug', 'toy', 'center', 'bowl', 'door'].filter((p) => p !== currentPlace);
  const next = options[Math.floor(Math.random() * options.length)];
  goTo(next, () => charlie.setPose(['sit', 'sploot', 'stand', 'sit'][Math.floor(Math.random() * 4)]));
}

// ---------------------------------------------------------------- server
let selfPets = 0;
let selfTreats = 0;
async function post(path, body) {
  try {
    const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
    return await res.json().catch(() => ({}));
  } catch {
    return { error: 'offline' };
  }
}

function headScreen() {
  const v = charlie.headPosition(new THREE.Vector3()).project(camera);
  return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, visible: v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 };
}

function petEffect() {
  charlie.pet();
  for (let i = 0; i < 2; i++) setTimeout(() => fx.heart(charlie.headPosition(new THREE.Vector3())), i * 260);
}

function treatEffect() {
  const head = charlie.headPosition(new THREE.Vector3());
  const from = head.clone().add(new THREE.Vector3(3, 2.5, 3));
  fx.treat(from, head);
  setTimeout(() => {
    charlie.wiggle(1);
    fx.sparks(head, 10, [0.92, 0.85, 0.7]);
  }, 900);
}

async function pet() {
  petEffect();
  selfPets++;
  await post('/api/pet');
}

async function treat() {
  treatEffect();
  selfTreats++;
  const r = await post('/api/treat');
  if (r && r.counted === false) ui.toast("Charlie loved it (that's enough treats from you for today, though)");
}

function connect() {
  const es = new EventSource('/api/events');
  const on = (type, fn) => es.addEventListener(type, (e) => fn(JSON.parse(e.data)));

  on('hello', async (s) => {
    ui.load(s);
    B.status = s.charlie.status;
    B.activity = s.charlie.activity;
    B.paused = s.charlie.paused;
    if (!world) {
      world = new WorldView(scene, s.world.plotSize);
      if (s.charlie.status === 'awake' && s.charlie.location && placeFor(s.charlie.location)) {
        const p = placeFor(s.charlie.location);
        charlie.pos.set(p.x, 0, p.z);
        currentPlace = s.charlie.location;
        charlie.setPose('sit');
      }
      await world.sync(s.world.objects, s.world.buildable, null);
    } else {
      await world.sync(s.world.objects, s.world.buildable, null);
    }
    applyActivity();
  });
  on('charlie', (c) => {
    const changed = c.status !== B.status || c.activity !== B.activity || c.paused !== B.paused;
    B.status = c.status;
    B.activity = c.activity;
    B.paused = c.paused;
    ui.setCharlie(c);
    if (changed) applyActivity();
  });
  on('feed', (item) => ui.addFeed(item));
  on('thought_delta', (d) => ui.thoughtDelta(d));
  on('code_start', (d) => ui.codeStart(d));
  on('code_title', (d) => ui.codeTitle(d));
  on('code_delta', (d) => ui.codeDelta(d));
  on('code_end', (d) => ui.codeEnd(d));
  on('balance', (d) => {
    ui.balanceEvent(d);
    if (d.delta > 0 && !['site.pet', 'site.visitor'].includes(d.key)) fx.burst(charlie.headPosition(new THREE.Vector3()), 24);
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
    if (w.changed && world?.objects.get(w.changed)) {
      recentBuild = { name: w.changed, t: performance.now() };
      B.manualUntil = performance.now() + 20000;
      goTo(w.changed, () => {
        charlie.setPose('sit');
        charlie.wiggle(0.8);
      });
    }
  });
  on('viewers', ({ count }) => ui.setViewers(count));
  on('pet', () => {
    if (selfPets > 0) selfPets--;
    else petEffect();
  });
  on('treat', () => {
    if (selfTreats > 0) selfTreats--;
    else treatEffect();
  });
  on('say', ({ text }) => {
    ui.say(text);
    charlie.tiltHead(0.18);
    charlie.wiggle(0.3);
  });
  on('go', ({ to }) => {
    B.manualUntil = performance.now() + 45000;
    goTo(to, () => charlie.setPose('sit'));
  });
  on('touch', ({ name }) => {
    const obj = world?.objects.get(name);
    if (obj) fx.sparks(world.plotCenter(obj.meta.plot).add(new THREE.Vector3(0, 1, 0)), 14, [0.58, 0.71, 0.85]);
  });
  es.onerror = () => {
    document.getElementById('status-text').textContent = 'reconnecting…';
  };
}

const focusBox = new THREE.Box3();
const goalTarget = new THREE.Vector3();
const tmpV = new THREE.Vector3();
let recentBuild = null;
let framed = false;

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
  const v = camera.top - camera.bottom;
  const zoom = Math.min(1, (v * aspect * 0.8) / diag, (v * 0.85) / (diag * 0.62 + 5));
  focusBox.getCenter(goalTarget).setY(1.2);
  const k = framed ? Math.min(1, dt * 0.8) : 1;
  framed = true;
  const delta = goalTarget.sub(controls.target).multiplyScalar(k);
  controls.target.add(delta);
  camera.position.add(delta);
  camera.zoom += (zoom - camera.zoom) * k;
  camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------- input
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let hover = null;
let downAt = null;
let lastInteract = -Infinity;

function pickAt(x, y) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const c = charlie.pos.clone().setY(0.9);
  const ray = raycaster.ray;
  if (ray.distanceToPoint(c) < 1.1) return { charlie: true };
  const obj = world?.pick(ray);
  if (obj) return { obj };
  const housePt = ray.intersectBox(new THREE.Box3(new THREE.Vector3(-HALF, 0, -HALF), new THREE.Vector3(HALF, 0.6, HALF)), new THREE.Vector3());
  if (housePt) return { house: true };
  return null;
}

canvas.addEventListener('pointermove', (e) => {
  if (e.buttons) return;
  hover = pickAt(e.clientX, e.clientY);
  canvas.classList.toggle('hovering', Boolean(hover?.charlie || hover?.obj));
  if (hover?.obj) ui.showTip(e.clientX, e.clientY, hover.obj.meta);
  else if (hover?.charlie) ui.showTip(e.clientX, e.clientY, { name: 'Charlie', description: 'click to pet her' });
  else ui.showTip(0, 0, null);
});
canvas.addEventListener('pointerleave', () => ui.showTip(0, 0, null));
canvas.addEventListener('pointerdown', (e) => {
  downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
  lastInteract = performance.now();
  document.getElementById('hint').classList.add('gone');
});
canvas.addEventListener('pointerup', async (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6 || performance.now() - downAt.t > 600) return;
  const hit = pickAt(e.clientX, e.clientY);
  if (hit?.charlie) pet();
  else if (hit?.obj) {
    const meta = hit.obj.meta;
    const r = await post('/api/touch', { name: meta.name });
    if (meta.link && r?.link) window.open(meta.link, '_blank', 'noopener');
  }
});
canvas.addEventListener('wheel', () => {
  lastInteract = performance.now();
}, { passive: true });

document.getElementById('pet-btn').addEventListener('click', pet);
document.getElementById('treat-btn').addEventListener('click', treat);
document.getElementById('msg-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('msg');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  const r = await post('/api/message', { text });
  ui.toast(r.error ? r.error : 'Charlie got your message. She reads them when she wakes up.');
});

// Owner controls: open the site with ?admin
if (new URLSearchParams(location.search).has('admin')) {
  let token = localStorage.getItem('charlie-admin') || '';
  const bar = document.getElementById('admin');
  bar.hidden = false;
  bar.addEventListener('click', async (e) => {
    const action = e.target.dataset?.admin;
    if (!action) return;
    if (!token) {
      token = prompt('Admin token (ADMIN_TOKEN from your .env):') || '';
      localStorage.setItem('charlie-admin', token);
    }
    let body = {};
    if (action === 'grant') {
      const amount = Number(prompt('How many tokens?', '10'));
      if (!amount) return;
      body = { amount, reason: prompt('Why? (Charlie will see this)', 'a gift from your human') || undefined };
    }
    const res = await fetch(`/api/admin/${action}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (res.status === 403) {
      localStorage.removeItem('charlie-admin');
      token = '';
      ui.toast('That admin token was rejected.');
    } else ui.toast(`${action}: ${res.ok ? 'done' : 'failed'}`);
  });
}

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
setTimeout(() => document.getElementById('hint').classList.add('gone'), 14000);

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;
  const now = performance.now();

  controls.update();
  globals.uTime.value = t;
  const h = renderer.domElement.height;
  globals.uScale.value = (h / (camera.top - camera.bottom)) * camera.zoom;

  wander(now);
  const onBed = currentPlace === 'bed' && !charlie.walking && Math.hypot(charlie.pos.x - PLACES.bed.x, charlie.pos.z - PLACES.bed.z) < 0.6;
  charlie.floor += ((onBed ? 0.22 : 0) - charlie.floor) * Math.min(1, dt * 4);
  charlie.update(dt, t);
  if (world) world.update(dt, t);
  house.update(camera, dt);

  // Ambient effects that follow what she's doing.
  B.fxT -= dt;
  if (B.fxT <= 0) {
    const head = charlie.headPosition(new THREE.Vector3());
    const asleep = B.status !== 'awake' || B.paused;
    if (asleep && !charlie.walking) {
      fx.zee(head);
      B.fxT = 2.4;
    } else if (B.activity === 'coding' || B.activity === 'building') {
      fx.sparks(head, 2);
      B.fxT = 0.25;
    } else if (B.activity === 'skill' && !charlie.walking) {
      fx.stream(head, new THREE.Vector3(DOOR_OUT.x - 4, 3, DOOR_OUT.z), 3);
      B.fxT = 0.12;
    } else B.fxT = 0.5;
  }
  fx.update(dt);

  // Once nobody has touched the camera for a while, frame the house plus
  // wherever Charlie is and whatever she just built.
  if (now - lastInteract > 12000 && world) autoFrame(dt, now);

  renderer.render(scene, camera);
  const hs = headScreen();
  ui.placeBubble(hs.x, hs.y, hs.visible);
  requestAnimationFrame(frame);
}

if (new URLSearchParams(location.search).has('debug')) window.__charlie = { charlie, camera, controls, fx, ui, scene, goTo, get world() { return world; }, B };

connect();
post('/api/visit');
requestAnimationFrame(frame);

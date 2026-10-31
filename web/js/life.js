// Charlie's body between the times she wakes up to think. By day she drifts
// between her habits and the places in her world; at night she sleeps in her
// bed. It's worked out from the clock and her world rather than rolled fresh in
// each browser, so everyone watching at the same moment sees the same thing.

const BEAT = 70_000; // roughly how long she spends on one thing

const AROUND_THE_HOUSE = [
  { place: 'window', doing: 'watching the world go by' },
  { place: 'rug', doing: 'stretched out on the rug' },
  { place: 'toy', doing: 'chewing on her lemon tart toy' },
  { place: 'bowl', doing: 'checking her bowl for crumbs' },
  { place: 'bed', doing: 'curled up for a doze' },
  { place: 'outside', doing: 'sitting on her doorstep' },
];

// What she gets up to at the places her world started with.
const AT = {
  front_yard: ['rolling in the clover', 'sniffing around the yard', 'lying in the shade of the tree'],
  garden: ['sniffing the flowers', 'poking around the garden beds'],
  pond: ['watching the water', 'sniffing along the pond'],
};

// A pose that fits what she says she's doing.
export function poseFor(doing) {
  const d = doing.toLowerCase();
  if (/nap|doze|sleep|snooz|curl/.test(d)) return 'sleep';
  if (/lying|lie |stretch|sun|rest|flop|lounge|sprawl/.test(d)) return 'sploot';
  if (/sniff|explor|dig|check|smell|poke|patrol|forag|nose/.test(d)) return 'sniff';
  if (/play|chew|chas|zoom|roll|pounc|toss|fetch|wrestl/.test(d)) return 'play';
  if (/watch|sit|look|wait|guard|listen|gaz/.test(d)) return 'sit';
  return 'stand';
}

export function hourIn(tz, t = Date.now()) {
  try {
    return Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: tz || undefined }).format(t));
  } catch {
    return new Date(t).getHours();
  }
}

export function isNight(tz, t = Date.now()) {
  const h = hourIn(tz, t);
  return h >= 22 || h < 7;
}

function rand(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), a | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// Everything she might do right now, with how likely each is.
function options({ habits = [], builds = [], energy = 70 }) {
  const out = [];
  for (const h of habits) out.push({ place: h.place, doing: h.doing, weight: 4 });
  for (const b of builds) {
    const ideas = AT[b.name] ?? [`sniffing around ${b.name.replace(/_/g, ' ')}`, `admiring ${b.name.replace(/_/g, ' ')}`];
    for (const doing of ideas) out.push({ place: b.name, doing, weight: 1.6 / ideas.length });
  }
  for (const h of AROUND_THE_HOUSE) out.push({ ...h, weight: 1 });
  // A tired dog lies down more.
  const tired = energy < 35 ? 3 : energy < 60 ? 1.6 : 1;
  for (const o of out) if (['sleep', 'sploot'].includes(poseFor(o.doing))) o.weight *= tired;
  return out;
}

function pick(list, r) {
  const total = list.reduce((s, o) => s + o.weight, 0);
  let x = r() * total;
  for (const o of list) if ((x -= o.weight) <= 0) return o;
  return list[list.length - 1];
}

// What she's doing during the beat that contains time t.
export function planAt(t, world) {
  const list = options(world).filter((o) => world.canGo(o.place));
  if (!list.length) return null;
  const slot = Math.floor(t / BEAT);
  const prev = pick(list, rand(slot - 1));
  let choice = pick(list, rand(slot));
  // She doesn't do the same thing twice in a row.
  if (choice === prev && list.length > 1) choice = list[(list.indexOf(choice) + 1) % list.length];
  const pose = poseFor(choice.doing);
  return { slot, key: `${choice.place}|${choice.doing}`, place: choice.place, doing: choice.doing, pose, wander: pose === 'sniff', seed: slot };
}

export { rand };

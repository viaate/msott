// Things visitors can do around Charlie's house. These change her world and
// how she feels; what she does about it is up to her.
export const HOUSE_ACTIONS = [
  { id: 'fill_bowl', place: 'bowl', label: 'fill her bowl', past: 'filled your food bowl', effects: {} },
  { id: 'squeak_toy', place: 'toy', label: 'squeak the lemon tart', past: 'squeaked your lemon tart toy', effects: { joy: 4, curiosity: 2 } },
  { id: 'roll_ball', place: 'rug', label: 'roll her a ball', past: 'rolled you a ball across the rug', effects: { joy: 5, energy: -2 } },
  { id: 'tap_window', place: 'window', label: 'tap on the window', past: 'tapped on your window', effects: { curiosity: 5, calm: -1 } },
  { id: 'ring_bell', place: 'door', label: 'ring the doorbell', past: 'rang your doorbell', effects: { curiosity: 5, calm: -3 } },
  { id: 'fluff_bed', place: 'bed', label: 'fluff her blanket', past: 'fluffed your blanket', effects: { calm: 6 } },
];

// Builds can offer up to three actions of Charlie's own design.
export function buildActions(world) {
  const out = [];
  for (const o of world.list()) {
    if (o.builtin || !Array.isArray(o.actions)) continue;
    o.actions.forEach((label, i) => out.push({
      id: `build:${o.name}:${i}`,
      place: o.name,
      label,
      past: `did "${label}" at ${o.name}`,
      effects: { joy: 2, curiosity: 2 },
      build: true,
    }));
  }
  return out;
}

export function allActions(world) {
  return [...HOUSE_ACTIONS, ...buildActions(world)];
}

// Names for visitors who haven't picked one. Shared by the page and the server.
const ADJ = ['sleepy', 'brave', 'curious', 'gentle', 'zippy', 'cozy', 'sunny', 'fuzzy', 'quiet', 'bouncy', 'clever', 'lucky', 'mellow', 'wobbly', 'dapper', 'humble', 'tiny', 'nimble', 'jolly', 'misty'];
const ANIMALS = ['Badger', 'Otter', 'Sparrow', 'Beagle', 'Hedgehog', 'Heron', 'Moth', 'Fox', 'Newt', 'Wren', 'Puffin', 'Vole', 'Ferret', 'Lark', 'Gecko', 'Marmot', 'Quail', 'Bison', 'Owl', 'Toad'];

export function randomName(rand = Math.random) {
  const pick = (list) => list[Math.floor(rand() * list.length)];
  return `${pick(ADJ)}${pick(ANIMALS)}${10 + Math.floor(rand() * 90)}`;
}

export function cleanName(raw) {
  return String(raw ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20);
}

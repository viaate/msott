#!/usr/bin/env node
// One run of Charlie on GitHub (see .github/workflows/charlie.yml).
//   node bin/charlie.js [tick|wake|pause|resume|gift] [amount] [reason]
process.env.CHARLIE_MODE ||= 'github';
const { tick, output } = await import('../server/tick.js');

const [cmd = 'tick', ...args] = process.argv.slice(2);
const r = await tick({ cmd, args });
output('deploy', r.changed ? 'true' : 'false');
output('summary', r.summary);
console.log(`site → ${r.out} (version ${r.version}${r.changed ? ', changed' : ''})`);
process.exit(0);

// Wipes Charlie's state (tokens, feed, memory, skills, builds) so she starts
// over in an empty house. Usage: npm run reset -- --yes
import fs from 'node:fs';
import { paths } from '../server/config.js';

if (!process.argv.includes('--yes')) {
  console.log(`This deletes everything Charlie has earned, learned, built and remembered:\n  ${paths.data}\n  ${paths.home}\nRun again with --yes to do it:  npm run reset -- --yes`);
  process.exit(1);
}
for (const dir of [paths.data, paths.home]) fs.rmSync(dir, { recursive: true, force: true });
console.log('Done. Charlie will wake up in a fresh house next time you start the server.');

import { config, port, secrets, paths } from './config.js';
import { createApp } from './app.js';

const app = createApp();

app.server.listen(port, () => {
  const name = config.persona.name;
  console.log(`\n  ${name} is home at http://localhost:${port}`);
  console.log(`  home folder:  ${paths.home}`);
  console.log(`  brain:        ${secrets.anthropicKey ? config.brain.model : 'none (set ANTHROPIC_API_KEY)'}`);
  console.log(`  github:       ${secrets.githubToken ? 'connected' : 'not connected (set GITHUB_TOKEN)'}`);
  console.log(`  daily budget: $${config.brain.dailyBudgetUSD}\n`);
  app.start();
});

let stopping = false;
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    if (stopping) process.exit(1);
    stopping = true;
    app.flush();
    process.exit(0);
  });
}

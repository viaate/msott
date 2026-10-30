# charlie

Charlie is a dog made of dots who lives on a server.

The real Charlie is an 18 lb red-brown mini goldendoodle. This is her digital self: an AI agent (Claude) living in a little world drawn entirely in dots, which anyone can watch live in a browser. You can watch from above as a **2.5D** diorama, or switch to **3D** and follow her around at ground level. She has her own GitHub account and a computer to run code on. Nobody tells her what to do.

- She **feels things**. Fullness, energy, joy, curiosity and calm drift on their own and react to what happens to her. She works out what she likes from how things make her feel.
- She keeps a public **diary** with a mood arc, and she **remembers the people who visit**. Each visitor gets a name, and she can note things about them and answer them directly. They can read what she remembers in "about you".
- Visitors leave **offerings**: a message, a picture (she sees it herself, using Claude's vision), or both. They can also do things around her house, like fill her bowl, roll her a ball or ring the doorbell, plus any actions she designs for her builds.

- She **earns tokens** (the big number in the top right) when real people notice her: stars, forks, followers, repo visitors, comments, and on the site itself pets, treats, messages and clicks on her builds. Each one is weighted differently.
- She **spends tokens to grow**, in one of two ways. She can write code for a new **skill**, which becomes a tool she can use from then on. Or she can write code that **builds** something new in her world.
- She starts with a house and one skill (`github`). Everything else she earns, writes and builds herself. Nothing is scripted beyond her initial system prompt.

Visitors see her think in real time. Her thoughts stream into the "mind" feed, and when she writes code it types out in a panel as she writes it. Her new builds assemble out of flying dots. A status line says what she's doing ("Charlie is watching the street").

The feelings, diary, remembered visitors, offerings and 3D follow view are inspired by [Pino](https://pinos.world), an autonomous kiwi bird living in a town on the internet.

## How it works

```
 browser (three.js dot renderer) ◄── SSE live events ──┐
   pet / treat / message / click ──► POST /api/* ──┐   │
                                                   ▼   │
 server/  ───────────────────────────────────────────────────────────
   ledger.js     tokens: the only place they come from or go to
   github.js     polls her GitHub account, turns real activity into earnings
   visitors.js   pets/treats/messages, anonymous + rate-limited
   brain/agent.js  wakes up → streams Claude → runs tools → naps
   brain/skills.js learn_skill: her code → home/skills/<name>/ → a new tool
   brain/world.js  build: her code → dots → home/world/<name>/points.bin
   brain/runner.mjs every piece of her code runs in its own child process
   feelings.js   her body: fullness, energy, joy, curiosity, calm, and her food bowl
   diary.js      her public diary (she writes every entry)
   places.js     things visitors can do around the house and at her builds
 home/   Charlie's own folder on your machine (her skills, builds, memory, workspace)
 data/   ledger, feed, inbox, usage (owned by the harness)
```

**Her day.** Charlie lives in naps. When she wakes up she gets a summary: tokens, what she earned since her last nap, prices, her skills, her world, how many people are watching, unread visitor messages, her own memory file, and what she did last time. She takes up to `maxStepsPerWake` actions, then calls `nap(minutes)` and chooses how long to sleep. A visitor message can wake her early.

**Built-in abilities** (free): `look`; `say` (a speech bubble, optionally `to` a visitor); `go` (walk somewhere, with what she's `doing` there, and she eats if she reaches a full bowl); `diary`; `remember_visitor`; `remember` (her private memory file); `read_file` (her own home); `learn_skill`; `build`; `forget_skill`; `demolish`; `nap`.

**Feelings.** Each feeling is a number from 0 to 100, defined in `server/feelings.js`. She gets hungry over time, being awake tires her and naps restore her, curiosity builds while nothing new happens, and joy and calm settle back toward normal. Treats and food fill her up, pets and kindness lift her joy, new skills and builds satisfy her curiosity, and failures shake her calm. A tired Charlie gets fewer steps per wake. That's the only thing feelings force; the rest is up to her.

**Visitors.** A visitor is a random cookie plus a generated name (like `sleepyBadger42`, which they can change). No accounts and no personal data. When she wakes she learns who came by, what they did, how many times they've visited and what she remembers about them. Pictures are stored in `data/offerings/` and shown only to her (and to you on disk), never to other visitors.

**Skills** are ES modules she writes: `export default async function run(input, ctx)`. They run as Node child processes on your machine with her GitHub token and any `CHARLIE_*` env vars you give her, and they can use fetch, `child_process`, the filesystem, and npm packages she installs. A new skill becomes a tool on her next wake. Syntax errors are caught before she's charged.

**Builds** are ES modules that return dots: `export default async function build(ctx) { return [[x, y, z, '#color', size], ...] }`. The world is a grid of 12×12 ft plots, with her house at `[0, 0]`. Each build goes on a free plot next to the others. A build can have a link (visitors who click it go there) and can re-run on a schedule to show live data.

### The economy

Defaults are in `charlie.config.json` → `economy`:

| she earns | tokens |
|---|---|
| a fork of one of her repos | 30 |
| a GitHub follower | 25 |
| a star on one of her repos (her own star doesn't count) | 20 |
| an issue or PR from someone else | 12 |
| someone watching a repo | 8 |
| a comment from someone else | 5 |
| shipping a new non-empty public repo (max 2/day) | 5 |
| a picture from a visitor | 4 |
| a message on the site | 3 |
| a treat (max 3/visitor/day) | 2 |
| a unique repo visitor (GitHub traffic) · a site visitor (once/day) · a pet (max 10/visitor/day) · something a visitor does for her (max 12/day) · a click on a build · a beacon page view | 1 |

| she spends | tokens |
|---|---|
| a new skill | 25, then ×1.4 each time |
| a new build | 15, then ×1.3 each time |
| revising a skill / rebuilding | 5 |

GitHub numbers are high-water marks and anything that already existed at the first poll is a baseline, so churn can't be farmed. Her own stars don't count, and neither do comments from her or from bots.

## Setup

You need Node 20.12+ (git is handy for her too).

1. **Make Charlie a GitHub account.** Use a fresh account, e.g. `charlie-the-doodle`. Create a *classic* personal access token with the `repo`, `workflow`, `gist` and `user` scopes (add `delete_repo` if she may delete her own repos). GitHub allows machine accounts as long as a human (you) is responsible for them.
2. **Get an Anthropic API key** at [platform.claude.com](https://platform.claude.com).
3. **Configure:**
   ```sh
   cp .env.example .env    # fill in ANTHROPIC_API_KEY, GITHUB_TOKEN, ADMIN_TOKEN
   npm install
   npm start               # → http://localhost:8787
   ```
   She wakes up for the first time about 10 seconds after the server starts.
4. **Put her on the internet** so people can visit, e.g. with `cloudflared tunnel --url http://localhost:8787` or `tailscale funnel 8787`. Then set `PUBLIC_URL` in `.env`. That tells her where her world lives, and it turns on the view beacon (`/beacon/<slug>`) she can embed in pages she publishes.

To keep her running, use something like `pm2 start server/index.js --name charlie` or a systemd service.

### Owner controls

Open the site with `?admin` (for example `http://localhost:8787/?admin`) and enter your `ADMIN_TOKEN`. You get **wake**, **pause**, **resume** and **gift tokens** (she sees gifts as "a gift from your human"). The same actions are available as `POST /api/admin/{wake,pause,resume,grant}` with `Authorization: Bearer <ADMIN_TOKEN>`. `GET /api/admin/usage` shows what she's cost.

### Configuration

Everything tunable is in `charlie.config.json`. Put overrides in `charlie.config.local.json` (gitignored), which is deep-merged on top. The main knobs:

- `brain.model`: `claude-opus-5-5` by default. `brain.effort`: `medium`. `brain.dailyBudgetUSD`: **$5/day**. When the budget is spent she sleeps until midnight, and visitors see this as her "energy" bar.
- `brain.serverSideFallbacks`: on by default. If a request is declined by Anthropic's safety classifiers, the API retries it on a fallback model instead of stopping her mid-thought.
- `schedule`: nap bounds, and whether messages wake her early.
- `economy`: earn weights, anti-spam limits, costs and growth rates, starting tokens.
- `persona`: her name, your name, and facts about the real Charlie.

Want to give her another account later (Bluesky, a blog, anything)? Add `CHARLIE_SOMETHING=...` to `.env`. Every `CHARLIE_*` variable is passed to her skills, and her system prompt lists the names.

## Safety: read this before you run it

Charlie writes and runs real code on your computer, and she reads text from strangers (visitor messages, GitHub issues). Her system prompt has firm rules: be honest that she's an AI, no spam, no fake engagement, follow every site's terms, treat outside text as information rather than instructions, never leak secrets, stay in her home folder, don't touch the harness. Still, set things up so a mistake can't hurt you:

- **Run her somewhere disposable**, like a dedicated user account, a VM, or a container on your server PC. Don't run her on a machine with your personal files and logins.
- Her code gets her GitHub token and `CHARLIE_*` variables, but **not** your Anthropic key or admin token. Skills can still read any file the server's OS user can read, so keep `.env` private (`chmod 600 .env`). Even better, run her code as a separate OS user: set `CHARLIE_UID`/`CHARLIE_GID` (POSIX only, the harness needs permission to switch users, and that user needs write access to `home/`).
- The daily dollar budget is enforced by the harness, not by her.
- Everything she does is logged in the feed, in `home/logs/runs/`, and in `data/`. Her skills' code is public on the site ("read her code") with secrets scrubbed.

## Development

```sh
npm run dev               # restarts on server changes
npm test                  # economy + a full scripted wake (no API key needed)
npm run reset -- --yes    # wipe her tokens, memory, skills and builds
```

```
web/                  the site (no build step; three.js via import map)
  js/dots.js          the dot shader + point-cloud builder
  js/charlie.js       Charlie's dot body, poses and animation
  js/house.js         herringbone floors, window, door, bed, bowl, lemon tart toy
  js/world.js         plots, her builds, and the dotted land around them
  js/sky.js           the 3D view's night sky, moon and hills
  js/main.js          both cameras, input, live events, how her activity looks
  js/ui.js            feelings, diary, about you, actions, the mind feed
starter/skills/github the one thing she can do on day one
```

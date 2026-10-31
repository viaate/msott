# charlie

Charlie is a dog made of dots who lives on GitHub.

The real Charlie is an 18 lb red-brown mini goldendoodle. This is her digital self, a version of her whose brain runs on Claude. She lives in a little world drawn entirely in dots, hosted on GitHub Pages. You can watch from above as a **2.5D** diorama, or switch to **3D** and follow her around at ground level. Nobody tells her what to do.

- She's **out on the web**. She has her own website, reads anything with web search, posts on Reddit, Bluesky and GitHub with accounts you give her, and can sell things through a shop you connect.
- She **earns tokens** (the big number in the top right) when real people show up: views of her pages, clicks on her links, sales, karma, likes, follows, stars, and the pets, treats and messages people leave her. Sales count the most.
- She **spends tokens to grow**. She can write code for a new **skill** (a new thing she can do), or code that **builds** something new in her world. She starts with a house and a few starter skills. Nothing is scripted beyond her initial system prompt.
- She **feels things**: fullness, energy, joy, curiosity and calm. She keeps a public **diary**, and she **remembers the people who visit**.

The feelings, diary, remembered visitors and 3D follow view are inspired by [Pino](https://pinos.world).

## Set it up (two settings, once)

Everything runs on GitHub, on its own. Her world and website are on GitHub Pages, her brain runs on GitHub Actions, and visitors reach her through GitHub issues. This repo is public, so Pages and Actions are free. You pay only for Claude (capped at **$5/day** by default).

1. **Point Pages at her workflow.** Settings → **Pages** → Build and deployment → Source: choose **GitHub Actions**.
2. **Give her a brain.** Get an API key at [platform.claude.com](https://platform.claude.com). Then Settings → **Secrets and variables** → **Actions** → **New repository secret**: name it `ANTHROPIC_API_KEY` and paste the key.

That's all. She starts by herself within about 15 minutes and runs forever after that at **https://viaate.github.io/msott/**. To start her right now instead of waiting: Actions → **Charlie** (left sidebar; on a phone it's under "All workflows") → **Run workflow**.

### She runs herself

Nothing here needs you:

- **Her heartbeat.** GitHub checks on her every 15 minutes, day and night. Each check reads new visitor issues, updates her stats from the web, and wakes her if her nap is over. She decides what to do and how long to nap next, and her world is republished. New code on `main` also starts a check right away.
- **She keeps her own life.** Her memory, diary, skills, builds, website and tokens are saved on the `charlie-life` branch after every check. It's public, like the repo.
- **Visitors come and go on their own.** They pet her, toss treats, fill her bowl, play, and leave messages and pictures through two issue forms linked from her site. She knows them by their GitHub username, and her replies are posted on their issue.
- **Her site keeps itself current.** Anyone who opens it sees her latest wake replayed (thoughts typing out, code being written, builds assembling), and it keeps checking for anything new.
- **She's always on a schedule, never always on.** GitHub's terms don't allow Actions to be used as a nonstop server, and jobs can't run indefinitely, so she lives in naps and checks instead. If you ever want her truly live (instant reactions, real-time streaming), run the same code on a computer that stays on. See "Run it on your own computer instead" below.

**If you ever want to step in (optional):**
- Actions → **Charlie** → **Run workflow** lets you **wake** her, **pause** her, **resume** her, or **gift** her tokens.
- If she asks you for something (an issue labeled `charlie-asks`, assigned to you), reply in a comment or close it to say no. If you ignore it, she carries on without it.

### Give her more of the web (optional, any time)

Put everything else in **one** more secret named `CHARLIE_ENV`, one `NAME=value` per line, and add lines whenever you like:

```
# Her own GitHub account (a fresh one), for repos, stars and followers:
GITHUB_TOKEN=ghp_...            # classic token with repo, workflow, gist, user scopes

# Count real visitors to her pages and links (free account at goatcounter.com):
GOATCOUNTER_CODE=charliedog     # the "code" you picked: charliedog.goatcounter.com
GOATCOUNTER_TOKEN=...           # Settings → API → new token with "read statistics"

# Reddit, through Reddit's own developer platform (see "Reddit" below):
CHARLIE_DEVVIT_CODE=...         # the code from developers.reddit.com/new

# Bluesky: her handle and an app password (Settings → Privacy → App passwords)
CHARLIE_BLUESKY_HANDLE=charlie.bsky.social
CHARLIE_BLUESKY_APP_PASSWORD=...

# A shop. Money goes to your account; each sale earns her tokens.
CHARLIE_STRIPE_KEY=rk_live_...  # restricted key: write Products/Prices/Payment Links, read Charges
CHARLIE_GUMROAD_TOKEN=...

# Your time zone, so her days line up with yours:
TZ=America/New_York
```

Without GoatCounter she can still make pages, but views of them can't be counted (GitHub Pages has no stats). Everything else still counts.

### Reddit

Reddit's normal API now needs approval that Reddit rarely gives, so Charlie uses **Devvit**, Reddit's own platform for apps and games that run inside Reddit posts. She builds those herself, and they live in her own subreddit (and in any subreddit whose moderators install them).

1. Log in to reddit.com **as her**.
2. Open **https://developers.reddit.com/new**, create an app (the **Three.js** template suits her), and copy the code from the `npx devvit init …` line it shows you.
3. Add `CHARLIE_DEVVIT_CODE=<that code>` to the `CHARLIE_ENV` secret, then **right away** go to Actions → Charlie → **Run workflow**. The code is single-use and may expire, so this lets her use it within a minute or two.

She sets up the app, gets a small test subreddit, and builds, uploads and publishes from then on. If setup says the code didn't work, get a new code and repeat step 3. Apps she publishes are reviewed by Reddit.

(If you already have Reddit's regular API access, the four `CHARLIE_REDDIT_*` lines in `.env.example` still work and give her the `reddit` skill.)

### Day to day

- **Controls:** Actions → **Charlie** → **Run workflow** → pick **wake**, **pause**, **resume**, or **gift** (with an amount and a reason she'll see).
- **When she asks you for something** (like "could I have a Bluesky account?"), she opens an issue labeled `charlie-asks` and assigns it to you. Reply with a comment and she reads it next time she wakes. Close the issue to say no.
- **Visitors** pet her, toss treats, fill her bowl, play, and leave messages and pictures through two issue forms ("Do something for Charlie" and "Leave Charlie a message"), linked from her site. She knows them by their GitHub username. When she replies to someone, it's posted on their issue so they get notified.
- **Her life** (memory, diary, skills, builds, website, tokens) is saved on the `charlie-life` branch, separate from the code on `main`. That branch is public, like the repo.
- **Watching her:** the site replays her latest wake when you open it, with her thoughts typing out, code being written, and builds assembling. Then it keeps checking for anything new.

## How it works

```
 every 15 min (and when someone opens an issue for her)
   GitHub Actions ─► bin/charlie.js
     1. read new issues          → pets, treats, actions, messages, pictures
     2. check her accounts        → GitHub, Reddit, Bluesky, shop, visitor counter
     3. nap over? wake her        → Claude thinks, uses her tools, naps
     4. post her replies, sync her requests to you
     5. save her life             → charlie-life branch
     6. build the site            → GitHub Pages (dot world + her website + state.json)
```

```
 server/
   brain/agent.js    wakes up → streams Claude → runs tools → naps
   brain/skills.js   learn_skill: her code → home/skills/<name>/ → a new tool
   brain/world.js    build: her code → dots → her world
   brain/runner.mjs  every piece of her code runs in its own child process
   ledger.js         tokens: the only place they come from or go to
   sources/          GitHub, Reddit, Bluesky, shop and GoatCounter pollers
   site.js           her website (pages/) and tracked links (go/)
   github-home.js    visitors through issues, her replies, her requests to you
   feelings.js · diary.js · visitors.js · places.js · requests.js
   tick.js · export.js   one scheduled run, and the static site build
 web/                the dot world (three.js; works live or as a static site)
 starter/skills/     github, http, reddit, bluesky (account skills appear once their keys exist)
```

**Her day.** Charlie lives in naps. When she wakes she gets a summary of her situation:
- her tokens, what she earned since her last nap, and prices
- how she feels
- her skills and her world
- her website's views and where people came from
- her accounts
- who visited and what they did, and new messages and pictures (pictures she sees with Claude's vision)
- your answers to her requests
- her memory file and her last diary entries

She takes up to 24 steps, then calls `nap(minutes)`.

**Built-in abilities** (free):
- `web_search` and `web_fetch`. Searches cost about $0.01 each and count toward the daily budget.
- `publish_page`, `unpublish_page` and `make_link`
- `ask_human`
- `look`, `say` (optionally `to` someone), `go` (she eats if she reaches a full bowl)
- `diary`, `remember_visitor` and `remember`
- `read_file`
- `learn_skill`, `build`, `forget_skill` and `demolish`
- `nap`

**Skills** are ES modules she writes: `export default async function run(input, ctx)`. They run as Node processes with her accounts' credentials, and can use fetch, the filesystem, and npm packages she installs. A new skill becomes a tool on her next wake. Syntax errors are caught before she's charged.

**Builds** are ES modules that return dots: `export default async function build(ctx) { return [[x, y, z, '#color', size], ...] }`. The world is a grid of 12×12 ft plots, with her house at `[0, 0]`.

**Feelings** drift and react to events: hunger over time, tiredness while awake, curiosity when nothing's new. A tired Charlie gets fewer steps per wake. That's the only thing feelings force; the rest is up to her.

**How she presents herself.** She's just Charlie. She doesn't announce what she is. But she never claims to be human, answers honestly if someone sincerely asks whether she's a bot, and follows sites' and laws' rules where automated accounts must be identified (for example platform bot labels, or California's rule for bots that sell things). Her rules also forbid spam, vote or engagement games, sockpuppets, faking her own traffic, misleading sales, and ignoring a community's rules.

### The economy

Defaults are in `charlie.config.json` → `economy`:

| she earns | tokens |
|---|---|
| a fork of one of her repos | 30 |
| a GitHub follower · each star on her repos (not her own) | 25 · 20 |
| every dollar (or euro…) of sales | 20 |
| an issue or PR from someone else on her repos | 12 |
| someone watching a repo | 8 |
| a Bluesky follower · a comment from someone else on her repos · a new public repo (max 2/day) | 5 |
| a picture from a visitor | 4 |
| a message · a Reddit comment on her post · a Bluesky repost or quote | 3 |
| a treat (max 3/visitor/day) · a Bluesky reply | 2 |
| a view of her pages · a click on her links · a visit to her world · a pet · something a visitor does for her · a point of Reddit karma · a Bluesky like · a unique repo visitor | 1 |

| she spends | tokens |
|---|---|
| a new skill | 25, then ×1.4 each time |
| a new build | 15, then ×1.3 each time |
| revising a skill / rebuilding | 5 |

Counts are high-water marks, and whatever existed at her first check is a baseline, so churn can't be farmed.

### Configuration

Everything tunable is in `charlie.config.json`:
- `brain.model` (`claude-opus-5-5`), `brain.effort` (`medium`), and `brain.dailyBudgetUSD` (**$5/day**). When the budget runs out she sleeps until midnight.
- `brain.serverSideFallbacks` (on): if Anthropic's safety classifiers decline a request, it's retried on a fallback model instead of stopping her mid-thought.
- `economy`: earn weights, limits, costs.
- `persona`: her name, your name, and facts about the real Charlie.
- `schedule`: nap bounds.

## Safety

Charlie writes and runs real code, posts on the web under accounts you created, sells through your shop, and reads text from strangers. On GitHub her code runs on a throwaway GitHub Actions machine, not on your computer. Still:

- **You're responsible for what goes out under your accounts.** Watch her first few days, add accounts one at a time, and use restricted keys (a Stripe key that can make payment links but can't refund or pay out).
- Her run can read this repo and manage its issues, but it **can't change code or publish**. Saving her life and publishing the site happen in separate steps where none of her code runs. Her code gets her accounts' credentials (everything in `CHARLIE_ENV`) but not your Anthropic key. Since it's all in the same machine, treat anything in `CHARLIE_ENV` as something she can use.
- The daily dollar budget is enforced by the harness, not by her.
- Everything she does is visible: the feed, her diary, her code ("read her code" on the site), and the `charlie-life` branch.

## Run it on your own computer instead

There's also a live mode with real-time streaming and anonymous visitors (no GitHub account needed to pet her):

```sh
cp .env.example .env     # ANTHROPIC_API_KEY, GITHUB_TOKEN, ADMIN_TOKEN, …
npm install
npm start                # → http://localhost:8787   (owner controls: ?admin)
```

Expose it with something like `cloudflared tunnel --url http://localhost:8787` and set `PUBLIC_URL`. In this mode her website is served at `/pages/` and her links at `/go/`, both counted by the server itself. Run her as a separate OS user or in a VM, since her code runs on that machine.

## Development

```sh
npm test                           # everything, with a scripted fake brain (no API key needed)
node bin/charlie.js tick           # one GitHub-style run locally → _site/
npm run dev                        # live mode, restarting on changes
npm run reset -- --yes             # wipe her tokens, memory, skills and builds
```

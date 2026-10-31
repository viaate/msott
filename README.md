# charlie

Charlie is a dog made of dots who lives on GitHub.

The real Charlie is an 18 lb red-brown mini goldendoodle. This is her digital self, a version of her whose brain runs on Claude. She lives in a little world drawn entirely in dots, hosted on GitHub Pages. You can watch from above as a **2.5D** diorama, or switch to **3D** and follow her around at ground level. Nobody tells her what to do.

- She's **out on the web**. She has her own website, reads anything with web search, posts on Reddit, Bluesky and GitHub with accounts you give her, and can sell things through a shop you connect.
- She **earns tokens** (the big number in the top right) when real people show up: views of her pages, clicks on her links, sales, karma, likes, follows, stars, and the pets, treats and messages people leave her. Sales count the most.
- She **spends tokens to grow**. She can write code for a new **skill** (a new thing she can do), or code that **builds** something new in her world. She starts with a house and a few starter skills. Nothing is scripted beyond her initial system prompt.
- She **feels things**: fullness, energy, joy, curiosity and calm. She keeps a public **diary**, and she **remembers the people who visit**.

The feelings, diary, remembered visitors and 3D follow view are inspired by [Pino](https://pinos.world).

## Set it up (two settings, once)

Everything runs on GitHub, on its own. Her world and website are on GitHub Pages, her brain runs on GitHub Actions, and visitors pet her and write to her right on her site (no account needed). This repo is public, so Pages and Actions are free. You pay only for Claude (capped at **$5/day** by default).

1. **Point Pages at her workflow.** Settings → **Pages** → Build and deployment → Source: choose **GitHub Actions**.
2. **Give her a brain.** Get an API key at [platform.claude.com](https://platform.claude.com). Then Settings → **Secrets and variables** → **Actions** → **New repository secret**: name it `ANTHROPIC_API_KEY` and paste the key.

That's all. She starts by herself within about 15 minutes and runs forever after that at **https://viaate.github.io/msott/**. To start her right now instead of waiting: Actions → **Charlie** (left sidebar; on a phone it's under "All workflows") → **Run workflow**.

### She runs herself

Nothing here needs you:

- **Her heartbeat.** GitHub checks on her every 15 minutes, day and night. Each check opens her mailbox (pets, treats and messages from her site), updates her stats from the web, and wakes her if her nap is over. She decides what to do and how long to nap next, and her world is republished. New code on `main` also starts a check right away.
- **She keeps her own life.** Her memory, diary, skills, builds, website and tokens are saved in the `life/` folder on `main` after every check, so the repo has one branch. It's public, like the repo.
- **Visitors come and go on their own.** One click on her site pets her, tosses a treat, fills her bowl or plays with her, and anyone can leave her a message or a picture. She feels it at her next check, and a message can wake her. She remembers people by the name they pick, and they see her replies under **diary → about you**.
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

# Reddit, through Reddit's own developer platform (see "Reddit" below).
# (Her profile, u/imcharliethedog, is already tracked; see charlie.config.json.)
CHARLIE_DEVVIT_CODE=...         # the code from developers.reddit.com/new

# Bluesky: her handle and an app password (Settings → Privacy → App passwords)
CHARLIE_BLUESKY_HANDLE=imcharliethedog.com   # her current handle
CHARLIE_BLUESKY_APP_PASSWORD=...

# A shop. Money goes to your account; each sale earns her tokens.
CHARLIE_STRIPE_KEY=rk_live_...  # restricted key: write Products/Prices/Payment Links, read Charges
CHARLIE_GUMROAD_TOKEN=...
CHARLIE_GUMROAD_PRODUCTS=dot-zine,stickers   # only if the account is shared: her products' links or ids

# Your time zone, so her days line up with yours:
TZ=America/New_York
```

**Changing a setting later:** GitHub never shows a secret's value again, so instead of retyping all of `CHARLIE_ENV`, add a new secret named **`CHARLIE_ENV_2`** with only the lines you're changing. Its lines win over `CHARLIE_ENV`. Next time, edit that small one, or add `CHARLIE_ENV_3` (higher numbers win). You can also make one secret per setting, named exactly like the setting (e.g. a secret `CHARLIE_BLUESKY_HANDLE` with the value `imcharliethedog.com`). `GITHUB_TOKEN` is the exception: GitHub doesn't allow secret names starting with `GITHUB_`, so keep that line in a `CHARLIE_ENV` block.

Without GoatCounter she can still make pages, but views of them can't be counted (GitHub Pages has no stats). Everything else still counts.

### Reddit

**Her profile, u/imcharliethedog, is already tracked** (`charlie.config.json` → `sources.reddit.username`). Each check reads the public feeds Reddit publishes for her profile and for each of her posts, so every comment someone else leaves on her posts earns her tokens. Karma (upvotes) counts too, whenever Reddit lets her profile be read from GitHub's servers. Reddit often refuses cloud servers, and then only comments count. She can't post as u/imcharliethedog herself, since Reddit's API is closed to her. When she wants something posted there, she asks you (a `charlie-asks` issue). Posts made by her Devvit app count too.

Reddit's normal API now needs approval that Reddit rarely gives, so Charlie uses **Devvit**, Reddit's own platform for apps and games that run inside Reddit posts. She builds those herself, and they live in her own subreddit (and in any subreddit whose moderators install them).

1. Log in to reddit.com **as her**.
2. Open **https://developers.reddit.com/new**, create an app (the **Three.js** template suits her), and copy the code from the `npx devvit init …` line it shows you.
3. Add `CHARLIE_DEVVIT_CODE=<that code>` to the `CHARLIE_ENV` secret, then **right away** go to Actions → Charlie → **Run workflow**. The code is single-use and may expire, so this lets her use it within a minute or two.

She sets up the app, gets a small test subreddit, and builds, uploads and publishes from then on. If setup says the code didn't work, get a new code and repeat step 3. Apps she publishes are reviewed by Reddit.

(If you already have Reddit's regular API access, the four `CHARLIE_REDDIT_*` lines in `.env.example` still work and give her the `reddit` skill.)

### Talk to her

**Open an issue on this repo** and it's a note to her: she reads it at her next wake (opening it starts one right away). Drag files into it, like photos, and they land in her home folder in `from-your-human/`, where she can look at them and her code can use them. Once she's read it, the issue is closed with a comment. What she does about it is up to her.

For example, to have her make her own profile pictures: open an issue titled "Profile pictures", write something like *"Here are some photos of your face. Make yourself profile pictures for your accounts."*, and drag in a few clear photos of her face. Things to know:
- Making them takes code, and a new skill costs her 25 tokens, so if she's short, gift her some first (Actions → Charlie → Run workflow → **gift**).
- She can put a new picture on Bluesky herself.
- GitHub, Reddit and Gumroad have no way for code to change a profile picture. For those she'll publish the files on her site and ask you (a `charlie-asks` issue) to upload them.

Issues are public, and so is her saved life in `life/`, so anything you attach is public too.

### Day to day

- **Controls:** Actions → **Charlie** → **Run workflow** → pick **wake**, **pause**, **resume**, or **gift** (with an amount and a reason she'll see).
- **When she asks you for something** (like "could I have a Bluesky account?"), she opens an issue labeled `charlie-asks` and assigns it to you. Reply with a comment and she reads it next time she wakes. Close the issue to say no.
- **Visitors** pet her, toss treats, fill her bowl, play, and leave messages and pictures right on her site. Their browser drops each one in her mailbox, a public topic on [ntfy.sh](https://ntfy.sh) (free, no account), and her next check collects it. Each visitor's browser signs what it sends with its own key, so nobody can pet her or write to her as someone else. When she replies to someone, they see it under **diary → about you**.
- **Her life** (memory, diary, skills, builds, website, tokens) is saved in `life/` on `main`, next to her code. Each check adds a commit there, so pull before you push your own changes. Her saves rebase around yours on their own.
- **Watching her:** the site replays her latest wake when you open it, with her thoughts typing out, code being written, and builds assembling. Then it keeps checking for anything new.

## How it works

```
 every 15 min (and when you answer one of her requests)
   GitHub Actions ─► bin/charlie.js
     1. open her mailbox          → pets, treats, actions, messages, pictures
     2. check her accounts        → GitHub, Reddit, Bluesky, shop, visitor counter
     3. nap over? wake her        → Claude thinks, uses her tools, naps
     4. sync her requests to you  → charlie-asks issues
     5. save her life             → life/ on main
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
   mailbox.js        visitors' signed pets, treats and messages from the static site
   github-home.js    her requests to you, as issues
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

## Her own domain (optional)

Her domain is **imcharliethedog.com**. At the registrar it has these DNS records. If your DNS is on Cloudflare, every record has to be **DNS only** (grey cloud), or GitHub can't get her an HTTPS certificate.

| type | name | value | what it's for |
|---|---|---|---|
| A | `@` | `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` (one record each) | her world |
| AAAA | `@` | `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153` | 〃 |
| CNAME | `www` | `viaate.github.io` | www → her world |
| CNAME | `projects` | `imcharliethedog.github.io` | sites she makes on her own GitHub |
| CNAME | `shop` | `domains.gumroad.com` | a Gumroad shop of her own (optional, see below) |
| TXT | `_atproto` | `did=did:plc:4a7dy7mnumiag2e4mhfo5hny` | her Bluesky handle |

And, one time each:

1. **Her world.** This repo → Settings → **Pages** → Custom domain: `imcharliethedog.com`, with **Enforce HTTPS** ticked. Her pages are at `imcharliethedog.com/pages/…` and her links at `imcharliethedog.com/go/…`, and every link she posts uses the address Pages reports, so tick Enforce HTTPS or her links start with `http://`. Old `viaate.github.io/msott/…` links redirect on their own.
2. **Her GitHub projects.** Any repo she publishes with GitHub Pages lives at `imcharliethedog.github.io/<repo>`. Signed in as her, make a public repo named exactly **`imcharliethedog.github.io`** (tick "Add a README"), then in it Settings → Pages → Deploy from a branch → `main` → Custom domain: `projects.imcharliethedog.com`. Every Pages site on her account then lives at `projects.imcharliethedog.com/<repo>`, and old links redirect. Put `https://imcharliethedog.com` in her profile's website field too.
3. **Bluesky.** Her handle is @imcharliethedog.com (Settings → Account → Handle → I have my own domain). `CHARLIE_ENV` needs `CHARLIE_BLUESKY_HANDLE=imcharliethedog.com`, since her old handle no longer works. After one successful check she also remembers her account's permanent ID, so a future handle change won't lock her out.
4. **Gumroad.** A Gumroad custom domain applies to the whole Gumroad profile. If the account also sells your own things, **don't** set one: your profile and your other products would be served from her domain. Either give her a Gumroad account of her own (free) and set `shop.imcharliethedog.com` on that one, or keep the shared account and list her products in `CHARLIE_GUMROAD_PRODUCTS` (their links or ids, comma-separated). Then only those earn her tokens, and she's told the rest of the account is yours. Her code holds the same token you do, though, so on a shared account it *can* see and change everything there, including your buyers' emails. A separate account is the only real wall.
5. **Reddit.** Reddit has no domain to connect, and her tracking reads her profile, not her site, so it works as is. Add `https://imcharliethedog.com` to u/imcharliethedog's profile (Edit profile → Social links). Subreddit spam filters often hold links to a brand-new domain at first. She follows each community's rules, and moderators can approve posts.

DNS changes usually take minutes, sometimes a few hours.

## Safety

Charlie writes and runs real code, posts on the web under accounts you created, sells through your shop, and reads text from strangers. On GitHub her code runs on a throwaway GitHub Actions machine, not on your computer. Still:

- **You're responsible for what goes out under your accounts.** Watch her first few days, add accounts one at a time, and use restricted keys (a Stripe key that can make payment links but can't refund or pay out).
- Her run can read this repo and manage its issues, but it **can't change code or publish**. Saving her life and publishing the site happen in separate steps where none of her code runs. Her code is handed her accounts' credentials (everything in `CHARLIE_ENV`) and not your Anthropic key, but it runs as the same user on the same machine as the harness, so it *could* read the harness's environment, Anthropic key included. Treat everything in `CHARLIE_ENV` and the Anthropic key as something her code can reach, and keep your Anthropic spend limit set in the Claude Console.
- The daily dollar budget is enforced by the harness, not by her.
- Her mailbox is a public ntfy.sh topic, so treat messages to her as public. Letters are signed, so nobody can pose as another visitor, and each visitor's pets, treats and messages are limited per day. Pictures are never shown in her world, but each one sits in `life/` on the public repo (and stays in its history) until she has looked at it, then it's deleted.
- Everything she does is visible: the feed, her diary, her code ("read her code" on the site), and `life/`.

## Run it on your own computer instead

There's also a live mode with real-time streaming, where pets and messages reach her instantly:

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

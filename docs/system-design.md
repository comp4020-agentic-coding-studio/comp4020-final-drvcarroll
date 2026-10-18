# System design

Everything about the backend: stack, storage, real-time sync, the
server↔client message contract (§14), rendering budget, accounts. Mechanics
live in [game-design.md](game-design.md). Why each decision was made, the
options weighed and what it costs: [docs/adr/](adr/README.md) (S01 to S10).

## 1. Constraints that shape everything

| Constraint | Source | Consequence |
|---|---|---|
| 1 shared vCPU, 256 MB RAM | `fly.toml` | Server does rules and fan-out only; never renders. Ticks only while someone is connected |
| One volume at `/data`, no DB server | `fly.toml` | Embedded database on the volume |
| Machine auto-stops when idle | `fly.toml` | World must be computable from stored state at any later time |
| Change visible to others within ~1 s | Brief | Server push, not polling |
| Tick is fixed at 500 ms, never adaptive | Brief: "about a second"; goals.md S1 | 500 ms tick + round trip stays under 1 s even in the worst case; the server must never slow the tick under load to shed work, only do less per tick |
| Survives restarts and redeploys | Brief | Durable write before acknowledging any command |
| Slow connection, keyboard, 390×844 | Marking | Small first load, DOM mirror of the canvas, responsive panels |
| `/readme/` headings in server HTML | `spec/` | README rendered on the server |

## 2. Stack

| Layer | Choice | Why, over the obvious alternative |
|---|---|---|
| Language | TypeScript everywhere | One `rules/` module shared by server, client and sim, so they cannot disagree |
| Server runtime | Node 24, run `.ts` directly (native type stripping) | No server build step; the template's harness already runs this way |
| HTTP | Hono on `@hono/node-server` | Small and fast with a tiny memory footprint; Express is heavier, Fastify's plugin model buys nothing here |
| WebSocket | `ws` | The reference Node implementation, low memory per socket |
| Database | SQLite via built-in `node:sqlite`, WAL mode, on `/data` | No native module to compile, synchronous (fits single-threaded command serialisation), atomic. Postgres needs a server the course setup excludes; a JSON file has no atomic writes |
| Client build | Vite | Fast dev server, hashed asset names for immutable caching |
| 3D | Three.js, imperative | Direct control of the render loop and GPU memory; react-three-fiber adds a reconciler for a scene that rarely changes shape |
| UI | Preact + signals | 4 KB React-compatible API; signals update only the numbers that change, which matters with six ticking stock counters |
| Passwords | `node:crypto` scrypt | Built in, memory-hard, no native dependency |
| Markdown | `marked` on the server | `/readme/` must be in the HTML the server sends |
| World assets (build time only) | `world-atlas` (Natural Earth 1:50m, ISC) + Natural Earth 1:10m admin-1, `topojson-client`; `sharp` for resizing, tinting and WebP | Real borders rasterised once into region maps; nothing geographic ships to the browser but images. A runtime vector globe library (three-globe, Cesium) would bring its own renderer and blow the 3 MB budget |
| Planet imagery | Solar System Scope (CC BY 4.0), USGS Astrogeology mosaics (public domain) | The closest-to-real free global maps: NASA-derived for the planets, mission mosaics for the moons |
| Fonts | Rajdhani, Share Tech Mono (OFL), self-hosted woff2 subsets | The command console look (game-design.md §12) without a Google Fonts round trip |

## 3. Repo layout

```
rules/        pure game logic and data, imported by everything below
  data/       every balance number
server/       HTTP, WebSocket, auth, persistence, logging
client/       Vite app: scene/ (Three.js), ui/ (Preact), net/ (socket)
sim/          headless runner, bots, LLM playtest driver, balance tests
scripts/      worlds.ts: downloads the sources, writes textures and region maps
client/public/worlds/  generated: <body>.<tier>.webp, <body>.regions.png (committed)
spec/         black-box checks against the running app
docs/         design, ADRs, balance log
```

`rules/` imports nothing outside itself: no I/O, no clock, no randomness. Time
is always a parameter.

**Client shape (game-design.md §12, goals.md P10).** The game shell is one
full-screen Three.js canvas (`client/src/scene/`) with a Preact HUD layered
over it (`client/src/ui/`). Numbers the HUD shows about your economy (per
region output, each resource's income and expense breakdown) come from
`economy().lines` in `rules/economy.ts`, run on the mirror: one signed,
post-shortfall amount per flow (region, source, resource) that sums to the
rate the engine integrates, never a client-side re-derivation. Both read the same signals store fed by the socket
(`client/src/net.ts`); the scene never owns game state. The HUD calls
`rules.validate` on a mirror of the visible state so every disabled action
shows the server's own reason; the server's answer still decides.

## 4. Persistence: command log plus snapshots

The world lives in memory as one state object. Durability comes from an
append-only log of commands, with periodic snapshots to keep replay short.

### Schema

```sql
users      (id, username UNIQUE, password_hash, created_at)
sessions   (token_hash PRIMARY KEY, user_id, created_at, expires_at)
seasons    (id, started_at, ended_at, winner_nation_id, rules_version)  -- one row per world
stages     (season_id, n, ended_at, ranking JSON)  -- top three by gain, names
nations    (id, season_id, user_id, name, colour_primary, colour_secondary,
            UNIQUE(season_id, name), UNIQUE(season_id, user_id))
commands   (seq PRIMARY KEY, season_id, nation_id, at, type, payload JSON,
            result, client_cmd_id)
snapshots  (season_id, seq, at, rules_version, state BLOB)
```

A `seasons` row is one world. The table and the `Season` type keep their
names so the schema and protocol need no rename; the docs say world. Each
stage end writes a `stages` row (game-design.md §10); the old `seasonEnd`
event becomes a `stageEnd` event, scheduled 20 min ahead each time, that
records the ranking, resets `base` and applies the next stage modifier from
`rules/data/victory.ts` (`STAGES`).

### Write path

1. Commands queue as they arrive; each tick applies them in arrival order
   with `applyInPlace` (the server owns its state), inside one transaction.
2. Rejected: the state is left as an advance alone would leave it, and the
   reason goes back. Nothing is stored.
3. Accepted: `INSERT` into `commands`. The tick's transaction commits
   (WAL, `synchronous = FULL`: one fsync per tick, not per command) before
   anyone hears of any of it; then results and changes broadcast. If the
   commit fails, the world rebuilds from the log and the tick's accepted
   commands report a failure, so state and log never disagree.

### Boot path

Load the running world's latest snapshot, replay later commands through
`rules.apply`, then `advanceTo(now)`. Replay is deterministic because the
rules are pure. A world whose `rules_version` isn't the current one is
closed instead (`ended_at` set, no winner) and the next arrival starts a
fresh one, empire names and colours carried over: commands never replay
under rules they weren't accepted by.

### Snapshots

Every 60 s while state has changed, and on `SIGTERM`/`SIGINT` (Fly sends one
before stopping). Snapshots record `rules_version`. A deploy that changes
rules first snapshots under the old version, so commands are never replayed
under different rules.

### Why event sourcing here

- Exact replay of any incident, locally, from a copy of the database.
- The command log **is** the activity log crit 10 asks for.
- Real games feed straight into the sim as test fixtures.
- The cost is discipline: rules must stay pure and versioned. `CLAUDE.md`
  enforces that.

## 5. The server loop: a 500 ms tick

The server is the ground truth. It runs the same headless engine as the sim
(`rules/`) and feeds clients the result. Clients send commands; they never
decide outcomes.

### While anyone is connected, every 500 ms

1. `advanceTo(now)`: resolve every event due since the last tick, each at its
   exact due time (an arrival at 12.3 s resolves as of 12.3 s, not 12.5 s).
2. Apply queued commands **in arrival order**, each stamped `at = now`.
   Accepted commands are appended to `commands` (synchronous, WAL).
3. Collect what changed per client: its vision-filtered view is compared,
   entity by entity, with what that client was last sent. At 74 regions and
   a few hundred fleets this is cheap, and it treats an entity leaving
   vision exactly like any other change.
4. Send each client one `tick` message: its command results, globally public
   changes (news, presence, scores, war declarations), changes to what that
   nation currently has vision on (sensors and Envoys, filtered per
   game-design.md §11), and its own private state.

### While nobody is connected

The loop stops. Nothing is computed; the machine can auto-stop. The next
connection calls `advanceTo(now)` and the world catches up exactly, because
the time model is analytic (game-design.md §3).

### Why batch commands into ticks

- **One ordering point:** every client sees the same commands applied in the
  same order in the same tick. That is the crit 9 contention rule, made
  structural.
- **One message per client per tick**, whatever happens.
- **Latency stays inside the brief:** worst case is 500 ms waiting for the
  tick plus the round trip, about 0.6 s on Australian links, under the
  "about a second" requirement.
- **500 ms is a ceiling, not a default:** it never lengthens under load. Tick
  processing is budgeted at ≤ 20 ms p99 of that 500 ms (goals.md S1), so if a
  tick is ever at risk of overrunning, the fix is to do less work per tick
  (batch persistence more aggressively, trim what gets logged) never to tick
  less often. The per-nation vision filter is a handful of set lookups (owned
  bodies for sensors, held nation ids for Envoys, at most 24 of each),
  nowhere near that budget.

### Why one thread, and why 500 ms

The server is one Node process: socket I/O is concurrent on the event loop,
but every state change goes through the tick, one writer, no locks. Only
scrypt runs off the loop (libuv pool, capped at 2, §7).

| Option | Verdict |
|---|---|
| **Single writer, arrival order** (current) | One order to log and replay; ties go to the lower-latency link |
| Intake threads → shared queue → writer, a sender thread per client | The current design with OS threads in place of event-loop callbacks. One shared vCPU means threads take turns, not run in parallel; each `worker_thread` is a V8 isolate (~10 to 30 MB of 256 MB) and isolates can't share the world, so senders need a copy per tick, costlier than the diff they'd take over |
| Thread per client, round-robin writes to the world | Same thread costs. The round-robin half is sound without threads: one queue per client, one command each in turn, rotating who goes first. Removes the latency edge on contested actions (claims, invasions, trades); costs a less intuitive rule (a later command can win) and a rotation replay must reproduce. Irrelevant to commands that touch only the sender |
| 250 ms tick | Halves the tick wait (p95 visibility ~250 to 300 ms, from 501 ms). Fixed per-tick work (advance, one view, scoring, per-client diff) runs every tick, so CPU per second doubles: ~8% of a core at load, above shared-cpu-1x's ~6% baseline (verify against Fly's docs), so a sustained showcase load risks throttling. Twice the fsyncs and messages. Players gain little: the client already interpolates between ticks (§6); only command confirmation speeds up, ~0.3 s from ~0.5 s |

Load is not the constraint: tick processing is 14 ms p50, 20 ms p99 of
500 ms (`docs/measurements.md`), so the loop idles ~96% of the time. 500 ms
stays: about half the brief's second, inside the CPU baseline. If commands
feel slow in play, try 333 ms and rerun `pnpm load` before changing S1.

### Clock

Every `tick` carries the server time. The client keeps the offset from the
last few ticks (corrected by measured round-trip time) and runs every
animation on server time.

## 6. Real-time sync

### Transport: WebSocket

| Option | Verdict |
|---|---|
| Polling | Two requests a second per client for a 500 ms cadence, and commands need a second channel anyway |
| SSE + POST | Viable, but splits each interaction across two channels and cannot see presence from the command path |
| **WebSocket** | One ordered channel both ways; disconnect is presence |

`permessage-deflate` is **off**: each zlib context costs hundreds of KB per
socket, too much at 256 MB. Tick messages are small enough without it.

### The server sends state; the client draws between ticks

Ticks give authoritative values twice a second, but the screen draws at
60 fps. The client fills the gaps from the formulas in the tick, never from
its own decisions:

| On screen | Ground truth in the tick | Drawn between ticks from |
|---|---|---|
| Stock counters | value, rate, cap | `value + rate × elapsed`, clamped to cap |
| Fleet positions | launch time, arrival time, origin, target | position along the transfer arc |
| Planets and moons | world start time | `position(body, t)` |
| Build and research progress | start time, duration | elapsed ÷ duration |

If the next tick disagrees with what was drawn, the tick wins.

The full message contract is in §14.

### Visibility filter

Three tiers, per game-design.md §11. This is why `observe(state, nationId)`
takes a nation: there is no single "public world" broadcast any more, only a
per-nation view computed from it.

| Tier | What | Who |
|---|---|---|
| **Globally public** | Wars declared, alliances, members, invites and sanctions, the stage, scores, presence, news ticker, a region's existence and slot count (not its owner), which region is each nation's capital | Every client, unfiltered |
| **Vision-gated, full** | A region's owner, its buildings, its garrison and any ground battle on it, fleets present or in transit there, Armies marching to or from it | Only a nation with a **sensor** there: owns any region on that body |
| **Vision-gated, partial** | A region's owner, garrison and battle, fleets and marches (never buildings) | Only a nation with an active **Envoy** on the region's owning nation — empire-wide, not body-specific |
| **Private to the owner** | Stocks and rates, queues, research, trade offers it is party to, its own Envoys' targets and upkeep | That nation alone |

A region with neither a sensor on its body nor an Envoy on its owner renders
identically to an unclaimed one: no owner, no buildings, no fleets, no stale
"last seen" data. This is a hard rule, not a UI choice: the server never
sends a client data it has no vision on, so there is nothing for the client
to leak or mis-render. `observe()` computes this per connected nation every
tick (§5): a set lookup of owned bodies (sensors) unioned with a set lookup
of nation ids it holds an Envoy on, each at most 24 entries — not a new
source of state, and cheaper than the old per-body version since an Envoy is
one lookup per relationship, not one per body it reveals.

A nation's capital identity has to be public (tier one) or an Envoy could
never be targeted at it in the first place; what's built there is not, and
stays vision-gated like anywhere else.

Stocks stay private regardless of vision, including inside your own sensor
range on contested ground: owning a region tells you what's built on it and
what fleets are there, never a rival's stockpile.

### Reconnection and slow connections

- Every (re)connect gets a full `welcome` snapshot: that nation's complete
  vision-filtered view (globally public state plus everything it currently
  senses or has an Envoy on), 30 to 60 KB for a developed empire, much less
  early on. That is simpler than replaying missed ticks and costs under a
  second on slow 4G.
- Reconnect with exponential backoff and jitter (0.5 s to 15 s), with a
  visible "reconnecting" state; the scene keeps animating from the last tick.
- Commands carry a client-generated `id`, so a retry after a dropped
  connection never applies twice.
- A command shows as pending until its result arrives. No optimistic state
  changes, so a slow link never shows something that didn't happen.

## 7. Server efficiency budget

| Item | Budget |
|---|---|
| Node baseline | ~60 MB |
| World state | < 5 MB (24 nations, 74 regions, a few hundred fleets) |
| SQLite page cache | 16 MB |
| Sockets | ~50 KB each × 60 = 3 MB |
| scrypt | 16 MB per hash, **at most 2 concurrent** (queue the rest) |
| Headroom | ~100 MB |

Node runs with `--max-old-space-size=160 --max-semi-space-size=4` (the
small young generation trims ~30 MB of RSS; the JS heap itself is ~20 MB at
30 clients). The scrypt limit matters: 30 people signing up at once at the
showcase would otherwise need ~500 MB.

**CPU per tick** (measured by `pnpm load`, `docs/measurements.md`):
- The server owns its state, so it advances and applies commands in place
  (`applyInPlace`); a rejection restores the stocks it settled, so the state
  is exactly what replay builds. Rules callers that share state keep the
  copying `apply`.
- One settled view and one scoring per tick, shared by every client's
  `observe` through a `ViewCache`: every nation that sees a region, fleet
  or nation alike gets the same object, so the hub serialises it once
  (identity-keyed). Economies are memoised while the view is frozen
  (`frozen()` in `rules/economy.ts`).
- `advance` and `settle` return at once when time hasn't moved and nothing
  is due, so a burst of commands in one tick doesn't rerun every economy.

**Static assets:**
- Content-hashed names with `Cache-Control: immutable`; Brotli precompressed
  at build.
- Planet maps ship in the image (6.6 MB of WebP) and download once per visitor.
- Fly egress costs a few cents per GB.

## 8. Client rendering budget

The target is a consumer laptop with integrated graphics, not a gaming GPU.

| Technique | Effect |
|---|---|
| Texture tiers 512 / 2K / 4K | Only the focused body holds its top tier; the last one is disposed back to 512 |
| ~40 draw calls total | Orbits in one `LineSegments`; fleets and icons instanced; region borders merged per body |
| Region maps | One 8-bit equirectangular index image per body (2048×1024 Earth, 1024×512 others, lossless PNG): Earth from real Natural Earth borders, others a weighted Voronoi on real feature centres (game-design.md §12). Owner tints are per-region uniform arrays indexed by the map's value, so a claim updates one uniform, not the mesh; borders are drawn in the shader where the index changes |
| Picking by region map | Raycast the body sphere once, convert the hit to lat/lon, read the index from a CPU copy of the region map: no per-region meshes to test. Index 0 (ocean) selects the body |
| Real textures streamed | Procedural surfaces draw first; WebP tiers load from 2 s after the scene starts, top tier only for the focused body (Earth 4K day, 2K night and clouds; others 2K), 512 for the rest. WebP over KTX2: the browser decodes it natively, no transcoder in the bundle and no native encoder in the toolchain; tiering keeps GPU memory near 175 MB with Earth focused. Seams: gradients from whichever of u, u + ½ is continuous |
| Bloom at half resolution | Glow without full-resolution post-processing cost; off on phones |
| Decorative bodies on the GPU | Asteroid belt, Trojans and Kuiper belt are one `Points` cloud each (`scene/decor.ts`); each rock's orbit (a, phase, rate, eccentricity, tilt) is a vertex attribute and the shader moves and sun-shades it, so ~34k rocks (a third on phones) cost three draw calls and no CPU per frame. The six comets and fourteen named minor bodies are few enough to move on the CPU; minor bodies reuse the region material with zero regions |
| Shaders write the log depth buffer | Custom materials include Three's logdepth chunks, so depth sorting is right and bodies are opaque |
| Quality tiers | High (pixel ratio 2, bloom, Earth 4K day), medium (1.5, bloom, 4K), low (1, no bloom, Earth 2K): each step drops pixel ratio, then bloom, then texture tier. Bloom is off on phones at every tier. Auto starts high on desktop, medium on phone; the user menu's Graphics item picks a tier instead, kept in localStorage |
| Adaptive quality | In auto, the render loop counts frames over 20 ms in 3 s windows and steps one tier down when they are the majority; it never steps up, so it can't oscillate. Single hitches (a texture decoding) don't count |
| Pause | Render loop stops when the tab is hidden or a full-screen panel covers the scene |

Targets: 60 fps on a 2020 laptop with integrated graphics at 1080p (medium
tier), 30 fps on a phone, GPU memory under 300 MB, first render under 3 MB
(textures excluded: they stream after interactive).

## 9. Accounts and sessions

| Rule | Value |
|---|---|
| Username | 3 to 20 characters, `a–z 0–9 _`, case-insensitive unique |
| Password | 8+ characters, checked against a short common-password list |
| Hash | scrypt (N = 2¹⁴, r = 8, p = 1), 16-byte salt per user |
| Session | 32 random bytes in an `HttpOnly; Secure; SameSite=Lax` cookie; only its SHA-256 is stored; 30-day sliding expiry |
| WebSocket auth | Same cookie on upgrade; `Origin` checked to block cross-site socket hijacking |
| Rate limit | 5 failed logins per username per 15 min, 20 per IP; in memory |
| Recovery | None (no email collected). Stated in the README; an admin CLI can reset a password |

**Account vs empire:** an account lasts across worlds. An empire (name,
colours, nation) belongs to one world and can be renamed or recoloured any
time; a reset carries the name and colours into the next world.

**Admin:** boot ensures an account `admin` with password `platypus`
(hardcoded in `server/auth.ts`, hashed like any other; the user asked for
it, and it is a coursework server). Sign-up refuses the name. `admin` is
always an admin, alongside `ADMIN_USERS`.

## 10. Pages and flows

| Route | Rendered | Purpose |
|---|---|---|
| `/` | Server | Logged out: login and sign-up. Logged in: the game shell, a full-screen map with the HUD over it |
| `/readme/` | Server | README rendered from markdown |
| `/empire` | Server | Create or edit empire name and colours (a plain form) |
| `/api/*` | Server | Auth form posts, health |
| `/ws` | Server | Game socket |

The login and sign-up forms are plain HTML `POST`s that work before (and
without) JavaScript, so a slow connection can sign in while the 3D bundle is
still loading.

Onboarding, the tutorial and the in-game Guide are specified in
game-design.md §11; the Guide is a client overlay, not a route.

## 11. Logging and the live view (crit 10)

- One JSON line per user action to stdout (`server/log.ts`):
  `{ts, user, nation, action, target, result, reason?, ms}`, `result` "ok"
  or the rejection code, `ms` the time to apply it. Also login, sign-up,
  logout, connect and disconnect. `fly logs` tails them.
- `/admin`, for the usernames in the `ADMIN_USERS` env var (comma
  separated; a Fly secret) and a 404 for everyone else: a plain page fed by
  one SSE stream (`/api/admin/stream`, once a second). Online players,
  sockets, commands per minute, rejections by reason, recent actions, tick
  p50/p99 and RSS. SSE rather than the game socket, so watching the server
  never joins the world or counts as a player.
- **Reset world** on `/admin` posts `/api/admin/reset` (admin only, a
  confirm step in the page). The server snapshots and closes the current
  world (`ended_at` set, no winner), creates a new `seasons` row and
  `newSeason(now)`, closes every socket with `4004` "World reset", and logs
  `{action: "reset"}`. Clients reconnect to the empty world; the server
  re-issues each returning account's `setEmpire` as it already does.
- The `commands` table holds the same history durably.

## 12. Deploy

- Multi-stage `Dockerfile` on `node:24-slim`: stage 1 runs `pnpm build`
  (Vite) for the client; stage 2 has production dependencies, `rules/`,
  `server/`, the built `client/dist` and the README, run as `.ts` directly.
- Boot: run SQL migrations (numbered files, applied in a transaction), load
  the snapshot, replay, listen on `0.0.0.0:$PORT`.
- `/` answers within a second of boot, so CI and Fly's health check pass.

## 13. Every claim and its check

Each promise this document makes names the check behind it. **Enforced**
rows name a test; Measured rows live in `docs/measurements.md`, Judged rows
in `docs/checks.md`. `scripts/claims.test.ts` fails if a row is
**owed** or cites a file or test name that doesn't exist; a claim that
can't be checked is reworded, not left standing. Why each decision was made is in `docs/adr/`.

| Promise | Kind | Check |
|---|---|---|
| README at `/readme/`, `/` answers | Enforced | `spec/invariants.test.ts` (shipped) |
| Real-time: a command reaches other clients < 1 s | Enforced | `spec/game.test.ts` "delivers one client's command to another within 1 s"; `server/server.test.ts` "is multi-user and real-time" |
| Persists: across a fresh login and a restart | Enforced | `spec/game.test.ts` "shows a command after a fresh login and connect"; `server/server.test.ts` "persists across a restart" |
| Accounts: sign-up, wrong password, duplicate name, 4001 without a session | Enforced | `spec/game.test.ts` "signs up, logs in…"; `server/server.test.ts` "rejects wrong passwords…" |
| Isolation: no other nation's stocks or offers | Enforced | `spec/game.test.ts` "never sends another nation's private state" |
| Fog of war (§6) | Enforced | `spec/game.test.ts` "sends nothing about regions on bodies it has no sensor on"; `rules/observe.test.ts` |
| No negative stocks; every rejection has a reason; repeated id applies once | Enforced | `spec/game.test.ts` "rejects overspending…"; `server/server.test.ts` "applies a repeated client id once…" |
| Replay is deterministic (S5) | Enforced | `rules/apply.test.ts`; `rules/alliance.test.ts` "replay through alliances, sanctions and a stage change" |
| Contention: same-tick claims, first wins, second `TAKEN` (§5, S03) | Enforced | `server/server.test.ts` "gives a region claimed twice in one tick to the first…" |
| 10 commands per client per tick, then `RATE_LIMIT` (§14.3) | Enforced | `server/server.test.ts` "accepts 10 commands per client per tick…" |
| Who may change what: `NOT_OWNER` on another's region, others' fleets and offers refused (S07) | Enforced | `rules/authorisation.test.ts` |
| Admin routes 404 to others; reset kicks with 4004, keeps accounts | Enforced | `server/server.test.ts` "is 404 for others…", "is 404 on every admin route for a player" |
| WebSocket `Origin` checked; expired session 4002 (§9, §14.3) | Enforced | `server/server.test.ts` "refuses a socket from a foreign Origin…" |
| Login rate limit 5 per name, 20 per IP, then 429 (§9) | Enforced | `server/server.test.ts` "returns 429 after 5 bad logins…" |
| Cookie `HttpOnly; Secure; SameSite=Lax`; only token hashes and scrypt hashes stored; common passwords refused (§9) | Enforced | `server/server.test.ts` "refuses a common password; sets a Secure HttpOnly Lax cookie…" |
| One JSON log line per action with its user; never a password or token (§11) | Enforced | `server/server.test.ts` "writes one JSON line per action…", "logs login, logout, connect and disconnect…" |
| Loop stops when the last socket closes (S2) | Enforced | `server/server.test.ts` "logs login, logout… and idle when the last socket closes" |
| The world keeps going with nobody connected (§5) | Enforced | `server/server.test.ts` "keeps the world going while nobody is connected" |
| Message sizes: quiet 500 B, busy 3 KB, welcome 60 KB (S3, S11) | Enforced | `spec/game.test.ts` "keeps welcome ≤ 60 KB…"; at load, `docs/measurements.md` |
| A region leaving vision is resent without owner; every tab streams (§6, S05) | Enforced | `server/server.test.ts` "resends a region without its owner…", "streams to every tab of one account" |
| Latency, tick time, RSS, append, boot (S1, S2, S4, S5) | Measured | `docs/measurements.md` (`pnpm load`) |
| `rules/` is pure: no I/O, clock or randomness (S08) | Enforced | `rules/purity.test.ts` (a source scan) |
| Reconnect restores the view < 3 s; no optimistic UI (§6, P9) | Enforced | `e2e/client.test.ts` "reconnects after a dropped socket…", "changes nothing for a pending command…" |
| A world's story from logs alone (S7) | Judged | `docs/checks.md` S7 |
| Frame rate and GPU memory (§8) | Judged | `docs/checks.md` P8 |

## 14. Message contract

Everything the server and client agree on: types live in `rules/protocol.ts`,
shared by both sides. The server validates every incoming message against a
runtime schema before it touches the engine.

```
  client                                server (rules/ engine, SQLite)
    │  HTTP: sign up, log in, empire       │
    │ ───────────────────────────────────► │
    │  WS /ws (session cookie)             │
    │ ◄─────────────── welcome ─────────── │  your vision-filtered state, once
    │ ── cmd ────────────────────────────► │  queued until the next tick
    │ ◄─────────────── tick ────────────── │  every 500 ms
    │ ◄─────────────── tick ────────────── │
```

### 14.1 Conventions

| Thing | Format |
|---|---|
| Time | Server epoch milliseconds (`Ms`). Game date is derived: 1 game day = 1000 ms from world start |
| Ids | Short strings: `n_…` nation, `r_…` region, `f_…` fleet, `w_…` war, `o_…` trade offer |
| Bodies and techs | Stable ids from `rules/data/` (`mars`, `europa`, `voidcraft.2`) |
| Resources | `E M V A R Mt` (Energy, Metals, Volatiles, Alloys, Research, Materiel — game-design.md §5) |
| Encoding | JSON text frames, one message per frame, `t` field names the type |

```ts
type Resource = "E" | "M" | "V" | "A" | "R" | "Mt";
type Goods = Partial<Record<Resource, number>>;
```

### 14.2 HTTP

Forms post as `application/x-www-form-urlencoded` and get a `303` redirect,
so they work without JavaScript. The same routes accept JSON and answer JSON.

| Method | Route | Body | Success | Failure |
|---|---|---|---|---|
| GET | `/` | | Login page, or game shell if signed in | |
| GET | `/readme/` | | README as HTML | |
| POST | `/api/signup` | `username, password` | Session cookie set; `→ /empire` | `400 {field, reason}`, `409` username taken |
| POST | `/api/login` | `username, password` | Session cookie set; `→ /` | `401` (same message for wrong user or password), `429` rate limited |
| POST | `/api/logout` | | Cookie cleared; `→ /` | |
| GET | `/api/me` | | `{username, empire?}` | `401` |
| POST | `/api/empire` | `name, primary, secondary` | `{empire}` | `400 {field, reason}`, `409` name taken or colour clash |
| GET | `/api/season` | | `{season, stage, hallOfFame}` (public; shown on login): hall of fame is past stage rankings | |
| POST | `/api/admin/reset` | | `{ok: true}`; resets the world (§11) | `404` for non-admins |
| GET | `/healthz` | | `200 ok` | |

Joining the world and everything in play happens over the socket.

### 14.3 WebSocket `/ws`

- **Auth:** the session cookie on upgrade. `Origin` must match the site.
- **Close codes:** `4001` not signed in, `4002` session expired,
  `4003` server restarting, `4004` world reset (client reconnects to the
  start screen).
- Several tabs per account are allowed; each gets its own stream.

#### Server → client

##### `welcome`: once per connection

```ts
{
  t: "welcome",
  build: string,          // client reloads if this differs from its bundle
  serverTime: Ms,
  tickMs: 500,
  tick: number,
  season: Season,
  world: VisibleWorld,    // vision-filtered per your nation (§6's visibility filter), plus everything globally public
  you: PrivateState | null // null until you join the world
}
```

##### `tick`: every 500 ms to every client

Always sent, even when nothing happened, so it doubles as a heartbeat. Fields
other than `t`, `n`, `at` and `you.stocks` appear only when they changed.

```ts
{
  t: "tick",
  n: number,                      // tick number, strictly increasing
  at: Ms,                         // server time this tick was computed for
  results?: CommandResult[],      // your commands applied this tick
  changes?: {
    nations?: NationPublic[],     // changed or new, whole entity
    regions?: Region[],           // whole entity; owner/buildings/armies present only where you have vision
    fleets?: Fleet[],             // only fleets you have vision on
    wars?: War[],
    battles?: Battle[],           // started, or reinforced (counts and endsAt reset)
    marches?: March[],
    removed?: { fleets?: Id[]; wars?: Id[]; battles?: Id[]; marches?: string[] }  // ended, arrived, or left your vision; battles by region, marches by `${from}>${to}@${departAt}`
  },
  scores?: Record<Id, Score>,     // when any total changed
  presence?: Id[],                // online nation ids, when it changed
  news?: News[],
  season?: Season,                // when the stage changed
  you?: Partial<PrivateState>     // stocks every tick; the rest when changed
}
```

Whole entities, not field diffs: a region or fleet is a few hundred bytes, and
replacing it whole means the client can never drift out of step. When a
region leaves your vision (you lose the sensor, or recall the Envoy on its
owner) it is resent whole with `owner`/`buildings`/`armies` absent, not put in
`removed` — the region itself still exists, only what you can see of it
changed. A fleet that leaves vision has no partial form, so it goes in
`removed.fleets` exactly as a destroyed one would.

##### `pong`

```ts
{ t: "pong", clientTime: Ms, serverTime: Ms }
```

#### Client → server

```ts
{ t: "cmd", id: string, cmd: Command }   // id: client-generated UUID
{ t: "ping", clientTime: Ms }            // every 10 s; for RTT and clock offset
```

Commands queue until the next tick, then apply in arrival order across all
clients. Each produces exactly one `CommandResult` in the sender's next
`tick`. Repeating an `id` returns the original result without applying again.
Limit: 10 commands per client per tick; the rest are rejected `RATE_LIMIT`.

### 14.4 State shapes

```ts
interface Season {         // one world, from creation to an admin reset
  id: Id; startedAt: Ms;
  status: "running" | "ended"; // "ended" only by a reset
  stage: number;             // 1-based; stage n began at startedAt + (n − 1) × 20 min
  stageEndsAt: Ms;
  base: Record<Id, number>;  // each nation's score at this stage's start (or its join)
  winners: { stage: number; ranking: { nation: Id; gain: number }[] }[]; // past stages, top three
}

interface Alliance { id: Id; members: Id[]; sanctions: Id[]; invites: Id[] } // public

interface VisibleWorld {
  nations: NationPublic[];
  regions: Region[];       // all 74, but owner/buildings/armies populated only where you have vision
  fleets: Fleet[];         // only fleets you have vision on (sensor, or an Envoy on their owner)
  wars: War[];
  alliances: Alliance[];
  battles: Battle[];       // ground battles on regions you have vision on
  marches: March[];        // Armies on the move between regions you have vision on
  scores: Record<Id, Score>;
  presence: Id[];
  news: News[];            // last 50
}

interface NationPublic {
  id: Id; name: string; primary: string; secondary: string; // "#rrggbb"
  capital: Id | null;      // which region; always public, so an Envoy can be targeted (system-design.md §6)
  protectedUntil: Ms;      // no war before this
  boostUntil: Ms;          // ×2 production (late join, respawn)
  eliminated: boolean;
}

interface Region {
  id: Id; body: string; slots: number;     // always public: a region's existence and slot count
  owner?: Id; rev?: number;                // present with a sensor on this body, or an Envoy on the owner
  buildings?: { slot: number; type: Building; mode?: string }[]; // present only with a sensor; never via Envoy
  armies?: number;                         // garrison; present with a sensor, or an Envoy on the owner
}

interface Fleet {
  id: Id; owner: Id; rev: number;
  units: Partial<Record<Unit, number>>;  // armies count as cargo in transports
  at?: string;                            // body id, if in orbit
  transit?: { from: string; to: string; departAt: Ms; arriveAt: Ms };
}

interface War { id: Id; a: Id; b: Id; declaredAt: Ms; activeAt: Ms; peaceFrom?: Id } // peaceFrom: who has offered peace

// game-design.md §7: counts at `at`; the client draws them to endsAt with
// rules' battleCounts(battle, now), the same analytic solution the server uses
interface Battle {
  id: Id;                  // the region it is fought on
  attacker: Id; defender: Id; at: Ms; endsAt: Ms;
  atk: number; def: number; // side totals, as of `at`
  atkBy: Record<Id, number>; defBy: Record<Id, number>; // per nation on each side
  home: Record<Id, Id>;    // allied nations' Armies return here after
}

interface March { owner: Id; from: Id; to: Id; count: number; departAt: Ms; arriveAt: Ms }

interface Score { territory: number; economy: number; tech: number; total: number }

interface News { at: Ms; kind: string; text: string; refs: Id[] }

interface PrivateState {
  nation: Id;
  stocks: Record<Resource, { v: number; rate: number; cap: number }>; // v at tick.at
  efficiency: number;      // 1 = all consumers fully supplied
  techs: string[];
  research: { tech: string; startAt: Ms; finishAt: Ms } | null;
  queues: Record<Id, { item: string; startAt: Ms; finishAt: Ms; slot?: number }[]>; // slot: pinned by replace
  trades: TradeOffer[];    // offers you sent or received
  envoys: { nation: Id; since: Ms }[]; // Envoy relationships you maintain (private: targets are never public)
}

interface TradeOffer { id: Id; from: Id; to: Id; give: Goods; get: Goods; expiresAt: Ms }
```

The client draws stocks between ticks as `v + rate × (now − tick.at)`, clamped
to `cap`, and fleets along their arc from `departAt` to `arriveAt`.

### 14.5 Commands

```ts
type Command =
  // joining
  | { type: "setEmpire"; name: string; primary: string; secondary: string } // server-issued by POST /api/empire, never accepted over the socket; logged so replay rebuilds empires
  | { type: "join"; region: Id }                                   // pick an Earth start region
  // economy
  | { type: "build"; region: Id; building: Building }
  | { type: "demolish"; region: Id; slot: number }
  | { type: "replace"; region: Id; slot: number; building: Building } // demolish + build in that slot, atomic
  | { type: "cancelBuild"; region: Id; index: number }
  | { type: "setMode"; region: Id; slot: number; mode: string }    // Power Plant only (Solar/Fission/Fusion)
  | { type: "research"; tech: string }
  | { type: "cancelResearch" }
  // military
  | { type: "train"; region: Id; count: number }                   // Armies, any owned region
  | { type: "buildShip"; region: Id; unit: Unit; count: number }   // at a Spaceport
  | { type: "launch"; from: string; to: string; units: Partial<Record<Unit, number>> }
  | { type: "colonise"; fleet: Id; region: Id }                    // Colony Ship in orbit
  | { type: "invade"; fleet: Id; region: Id }                      // land Armies from Transports
  | { type: "march"; from: Id; to: Id; count: number }             // Earth only, adjacent
  // diplomacy
  | { type: "declareWar"; nation: Id }
  | { type: "offerPeace"; nation: Id }
  | { type: "acceptPeace"; war: Id }
  | { type: "inviteAlly"; nation: Id }
  | { type: "acceptAlly"; alliance: Id }
  | { type: "declineAlly"; alliance: Id }
  | { type: "leaveAlliance" }
  | { type: "sanction"; nation: Id }
  | { type: "liftSanction"; nation: Id }
  // trade
  | { type: "offerTrade"; to: Id; give: Goods; get: Goods }
  | { type: "acceptTrade"; offer: Id }
  | { type: "declineTrade"; offer: Id }
  | { type: "cancelTrade"; offer: Id }
  | { type: "gift"; to: Id; goods: Goods }
  | { type: "exchange"; give: Resource; amount: number; get: Resource } // Earth Exchange
  // intelligence
  | { type: "sendEnvoy"; nation: Id }                              // needs Signals Intelligence, a free slot
  | { type: "recallEnvoy"; nation: Id };
```

#### Results

```ts
type CommandResult =
  | { id: string; ok: true }
  | { id: string; ok: false; code: RejectCode; reason: string };
```

Every rejection carries a sentence a player can act on. The client shows the
same reasons on disabled buttons ahead of time by calling the same rules
function; the server's answer is still the one that counts.

| Code | Example `reason` |
|---|---|
| `INVALID` | "Unknown building type"; "Unknown region; free on Luna: r_luna_shackleton (Shackleton), ..."; malformed: "colonise needs fleet (id), region (id); nations are ids like n_3, regions like r_luna_shackleton" |
| `NOT_JOINED` | "Join the world first" |
| `NOT_OWNER` | "You don't control Mars North" (regions only; see below) |
| `INSUFFICIENT` | "Needs 20 more Metals"; when nothing you hold makes it, "Needs 10 more Materiel; a Factory makes it" |
| `LOCKED` | "Needs Ion Drives" |
| `NO_SLOT` | "No free slot in Siberia; replace a building to use its slot" |
| `NO_ENVOY_SLOT` | "All your Envoy slots are in use" |
| `NOT_ADJACENT` | "Canada doesn't border India" |
| `PROTECTED` | "Nova Terra is protected for 40 more seconds" |
| `NOT_AT_WAR` | "You aren't at war with Nova Terra"; in the activation minute, "War with Nova Terra is active in 42s" |
| `TAKEN` | "US West was claimed this tick" |
| `ALLIED` | "You can't declare war on an ally" |
| `SANCTIONED` | "Your alliance sanctions Nova Terra" |
| `EARTH_FULL` | "Every Earth start region is held; joining reopens when one frees up" |
| `SEASON_OVER` | "The world was reset" |
| `RATE_LIMIT` | "Too many commands; wait a moment" |

Nations are always addressed by their `n_N` id, never a username or bare
number; a malformed command's reason names the field and the shape it
wanted, so a client or agent can correct it without docs (P2).

Another nation's fleet or trade offer is `INVALID` "Unknown fleet" or
"Unknown offer", not `NOT_OWNER`: fleets you can't see and offers not
addressed to you must not be confirmed to exist (S06, S07). Regions are
public, so `NOT_OWNER` leaks nothing there. `launch` only ever draws on the
sender's own ships at that body.

There is deliberately no "destination out of reach" code: every zone is
reachable from the start (game-design.md §7), Voidcraft only changes the
cost and time, so a launch is never rejected for where it's going, only for
what it costs.

### 14.6 Sizes

| Message | Typical size |
|---|---|
| `welcome` | 30 to 60 KB for a developed empire, much less early on (§6) |
| `tick`, quiet | ~300 B (stocks only) |
| `tick`, busy | 1 to 3 KB |
| `tick` that opens a body's vision (a join, a first claim) | the `welcome` budget, ≤ 60 KB (ADR S11) |

At 30 clients that is roughly 20 to 200 KB/s of egress in total, well within
one small machine.

### 14.7 Example

A player builds a Mine; the next tick confirms it. (Stocks trimmed to one
resource here; real ticks carry all six.)

```json
{ "t": "cmd", "id": "6f1c…", "cmd": { "type": "build", "region": "r_siberia", "building": "mine" } }
```

```json
{
  "t": "tick", "n": 4182, "at": 1791234567500,
  "results": [{ "id": "6f1c…", "ok": true }],
  "you": {
    "stocks": { "M": { "v": 170, "rate": 9.6, "cap": 1500 } },
    "queues": { "r_siberia": [{ "item": "mine", "startAt": 1791234567500, "finishAt": 1791234587500 }] }
  }
}
```

When the Mine finishes 20 s later, every client with vision on Siberia gets
the region in `changes`, and the owner's `you.stocks.M.rate` rises.

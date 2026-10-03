# System design

Everything about the backend: stack, storage, real-time sync, the
server↔client message contract (§14), rendering budget, accounts. Mechanics
live in [game-design.md](game-design.md).

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

## 3. Repo layout

```
rules/        pure game logic and data, imported by everything below
  data/       every balance number
server/       HTTP, WebSocket, auth, persistence, logging
client/       Vite app: scene/ (Three.js), ui/ (Preact), net/ (socket)
sim/          headless runner, bots, LLM playtest driver, balance tests
spec/         black-box checks against the running app
docs/         design, ADRs, balance log
```

`rules/` imports nothing outside itself: no I/O, no clock, no randomness. Time
is always a parameter.

**Client shape (game-design.md §12, goals.md P10).** The game shell is one
full-screen Three.js canvas (`client/src/scene/`) with a Preact HUD layered
over it (`client/src/ui/`). Numbers the HUD shows about your economy (per
region output, each resource's income and expense breakdown) come from pure
`rules/economy.ts` functions, the same flows the engine integrates, never a
client-side re-derivation. Both read the same signals store fed by the socket
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
seasons    (id, started_at, ended_at, winner_nation_id, rules_version)
nations    (id, season_id, user_id, name, colour_primary, colour_secondary,
            UNIQUE(season_id, name), UNIQUE(season_id, user_id))
commands   (seq PRIMARY KEY, season_id, nation_id, at, type, payload JSON,
            result, client_cmd_id)
snapshots  (season_id, seq, at, rules_version, state BLOB)
```

### Write path

1. Command arrives; `rules.apply(state, nation, cmd, now)` validates it.
2. Rejected: reply with the reason. Nothing is stored.
3. Accepted: `INSERT` into `commands` (WAL, synchronous, sub-millisecond),
   then swap in the new state, broadcast, acknowledge.

### Boot path

Load the latest snapshot, replay later commands through `rules.apply`, then
`advanceTo(now)`. Replay is deterministic because the rules are pure.

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
| Planets and moons | season start time | `position(body, t)` |
| Build and research progress | start time, duration | elapsed ÷ duration |

If the next tick disagrees with what was drawn, the tick wins.

The full message contract is in §14.

### Visibility filter

Three tiers, per game-design.md §11. This is why `observe(state, nationId)`
takes a nation: there is no single "public world" broadcast any more, only a
per-nation view computed from it.

| Tier | What | Who |
|---|---|---|
| **Globally public** | Wars declared, scores, presence, news ticker, a region's existence and slot count (not its owner), which region is each nation's capital | Every client, unfiltered |
| **Vision-gated, full** | A region's owner, its buildings, fleets present or in transit there | Only a nation with a **sensor** there: owns any region on that body |
| **Vision-gated, partial** | A region's owner, fleets present or in transit there (never buildings) | Only a nation with an active **Envoy** on the region's owning nation — empire-wide, not body-specific |
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

Node runs with `--max-old-space-size=160`. The scrypt limit matters: 30
people signing up at once at the showcase would otherwise need ~500 MB.

**Static assets:**
- Content-hashed names with `Cache-Control: immutable`; Brotli precompressed
  at build.
- Textures ship in the image (~40 MB) and download once per visitor.
- Fly egress costs a few cents per GB.

## 8. Client rendering budget

The target is a consumer laptop with integrated graphics, not a gaming GPU.

| Technique | Effect |
|---|---|
| KTX2/Basis textures | GPU-native compression, ~4× less GPU memory, decoded in a worker |
| Texture tiers 512 / 2K / 8K by distance | Only the focused body holds 8K; others are disposed down |
| ~40 draw calls total | Orbits in one `LineSegments`; fleets and icons instanced; region borders merged per body |
| Regions as a spherical Voronoi | Each body's regions are patches around seed points (Earth's at real lat/long, from `rules/data/map.ts`); colouring is a per-vertex attribute, borders one line mesh per body |
| Picking by nearest seed | Raycast the body sphere once, then the nearest region seed to the hit point is the region: no per-region meshes to test |
| Bloom at half resolution | Glow without full-resolution post-processing cost; off on phones |
| Decorative bodies on the GPU | Asteroid belt, Trojans and Kuiper belt are one `Points` cloud each (`scene/decor.ts`); each rock's orbit (a, phase, rate, eccentricity, tilt) is a vertex attribute and the shader moves and sun-shades it, so ~34k rocks (a third on phones) cost three draw calls and no CPU per frame. The six comets and fourteen named minor bodies are few enough to move on the CPU; minor bodies reuse the region material with zero regions |
| Shaders write the log depth buffer | Custom materials include Three's logdepth chunks, so depth sorting is right and bodies are opaque |
| Adaptive quality | Watch frame time; drop pixel ratio, then bloom, then texture tier if frames exceed 20 ms |
| Quality tiers | High, medium, low; auto-detected, user-overridable |
| Pause | Render loop stops when the tab is hidden or a full-screen panel covers the scene |

Targets: 60 fps on a 2020 laptop with integrated graphics at 1080p (medium
tier), 30 fps on a phone, GPU memory under 300 MB, first render under 3 MB.

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

**Account vs empire:** an account lasts across seasons. An empire (name,
colours, nation) belongs to one season and can be renamed or recoloured any
time.

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

Onboarding and the tutorial are specified in game-design.md §11.

## 11. Logging and the live view (crit 10)

- One JSON line per user action to stdout:
  `{ts, user, nation, action, target, result, ms}`. Also login, sign-up,
  connect, disconnect, resync. `fly logs` tails them.
- `/admin` (admin users only): a live stats page over the same socket.
  Online players, commands per minute, recent actions, rejections by reason,
  memory and socket count.
- The `commands` table holds the same history durably.

## 12. Deploy

- Multi-stage `Dockerfile` on `node:24-slim`: stage 1 runs `pnpm build`
  (Vite) for the client; stage 2 has production dependencies, `rules/`,
  `server/`, the built `client/dist` and the README, run as `.ts` directly.
- Boot: run SQL migrations (numbered files, applied in a transaction), load
  the snapshot, replay, listen on `0.0.0.0:$PORT`.
- `/` answers within a second of boot, so CI and Fly's health check pass.

## 13. What `spec/` checks against the running app

| Promise | Check |
|---|---|
| Real-time | Two socket clients; a command from one reaches the other within 1 s |
| Persists | A command, then a fresh login and connect, sees it |
| Accounts | Sign-up, login, wrong password rejected, duplicate username rejected |
| Isolation | A client never receives another nation's stocks or offers |
| Fog of war | A client never receives fleet, building or ownership data for a region whose body it has no sensor on and whose owner it has no Envoy on; an Envoy never reveals buildings |
| No negative stocks | Spend-more-than-you-have is rejected with a reason |
| Idempotent commands | The same `clientCmdId` twice applies once |
| Every rejection explains itself | Every rejected command carries a human-readable reason |
| README | Shipped invariant |

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
| Time | Server epoch milliseconds (`Ms`). Game date is derived: 1 game day = 1000 ms from season start |
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
| GET | `/api/season` | | `{season, hallOfFame}` (public; shown on login) | |
| GET | `/healthz` | | `200 ok` | |

Joining a season and everything in play happens over the socket.

### 14.3 WebSocket `/ws`

- **Auth:** the session cookie on upgrade. `Origin` must match the site.
- **Close codes:** `4001` not signed in, `4002` session expired,
  `4003` server restarting (client reconnects).
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
  you: PrivateState | null // null until you join the season
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
    removed?: { fleets?: Id[]; wars?: Id[] }  // destroyed/arrived, or left your vision
  },
  scores?: Record<Id, Score>,     // when any total changed
  presence?: Id[],                // online nation ids, when it changed
  news?: News[],
  season?: Season,                // when status changed (ending, ended)
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
interface Season {
  id: Id; startedAt: Ms; endsAt: Ms;     // endsAt = startedAt + 60 min
  threshold: number;
  status: "running" | "ended";
  winner?: Id;
}

interface VisibleWorld {
  nations: NationPublic[];
  regions: Region[];       // all 74, but owner/buildings/armies populated only where you have vision
  fleets: Fleet[];         // only fleets you have vision on (sensor, or an Envoy on their owner)
  wars: War[];
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

interface Score { territory: number; economy: number; tech: number; total: number }

interface News { at: Ms; kind: string; text: string; refs: Id[] }

interface PrivateState {
  nation: Id;
  stocks: Record<Resource, { v: number; rate: number; cap: number }>; // v at tick.at
  efficiency: number;      // 1 = all consumers fully supplied
  techs: string[];
  research: { tech: string; startAt: Ms; finishAt: Ms } | null;
  queues: Record<Id, { item: string; startAt: Ms; finishAt: Ms }[]>;
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
| `INVALID` | "Unknown building type" |
| `NOT_JOINED` | "Join the season first" |
| `NOT_OWNER` | "You don't control Mars North" |
| `INSUFFICIENT` | "Needs 20 more Metals" |
| `LOCKED` | "Needs Ion Drives" |
| `NO_SLOT` | "No free slot in Siberia" |
| `NO_ENVOY_SLOT` | "All your Envoy slots are in use" |
| `NOT_ADJACENT` | "Canada doesn't border India" |
| `PROTECTED` | "Nova Terra is protected for 3 more minutes" |
| `NOT_AT_WAR` | "You aren't at war with Nova Terra" |
| `TAKEN` | "US West was claimed this tick" |
| `SEASON_OVER` | "The season has ended" |
| `RATE_LIMIT` | "Too many commands; wait a moment" |

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

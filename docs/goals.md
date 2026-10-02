# Goals: what good means

**The core idea: grow.** Growth is the drive, and the player is dropped into a
solar system to chase it however they see fit: conqueror, trader, builder,
researcher, or any mix. The solar system is the theatre; the game mechanics
are the mechanisms. Growth is measured three ways, not one: **Territory**,
**Economy**, **Tech**. Military and trade are instruments toward those three,
never scores in themselves. Everything below exists to serve that: a feature
ships only if it grows one of the three, directly or as an instrument toward
it.

Part of that world is a harsh one. Territory you don't hold, and haven't paid
to watch, is a blank on your map, exactly like space nobody has claimed yet.
What you can see of your rivals, and what you choose to go and find out, is
itself a choice, not a given.

The definition of good the README argues, `CLAUDE.md` enforces and `spec/`
tests. Goals fall into two groups: **player-oriented** (is it good to play)
and **systems-oriented** (is it built well enough to stay that way on one
small machine). Every goal has a target, a check, and a line of the brief it
serves.

**Fixed baseline, not ours to change:** `spec/invariants.test.ts` ships with
the starter repo and checks two things independent of every goal below: `/`
answers 200, and `/readme/` serves `README.md`'s headings in order
(`spec/README.md` says to keep both). Every goal's Enforced check in this
file is additional to that baseline, never a replacement for it.

**Scope rule:** a feature ships only if it serves a goal here.

## How goals are checked

| Kind | Where | Runs |
|---|---|---|
| **Enforced** | `spec/` against the running app (HTTP, WebSocket, Playwright) | `pnpm check`, CI on every push |
| **Simulated** | `sim/` over thousands of seeded headless games | `pnpm sim:test` |
| **Measured** | Load test and server logs, results committed to `docs/measurements.md` | Before each crit and after changes that could move them |
| **Judged** | Manual passes, recorded with date, device and result in `docs/checks.md` | Before each crit |

## Player-oriented

| # | Goal | Target | Check | Brief |
|---|---|---|---|---|
| **P1** | **Easy to start** | Sign-up to playing < 60 s. First build queued < 30 s after joining. Tutorial ≤ 5 goals, one sentence each | Enforced: sign-up → join → build flow. Judged: timed stranger first runs at crits | Crit 8: a stranger does the core thing; markers' 10-minute visit |
| **P2** | **Self-explaining** | 100% of rejected commands carry an actionable reason. Every disabled control shows why | Enforced: every rejection code returns a non-empty reason. Simulated: fuzz every command type; none rejected without a reason | Markers arrive with no instructions |
| **P3** | **Every path is a real path** | Territory, Economy and Tech are each individually sufficient to win: 6 bot strategies (Expander, Builder, Trader, Conqueror, Researcher, Random) each win 10 to 35%. In mixed games ≥ 70% of nations trade or fight at least once | Enforced: a command exists and is rewarded for every route into a score: claim and attack (Territory), build and trade offer (Economy), research (Tech). Simulated: win and interaction rates per strategy | The one idea: no single mechanic is the game |
| **P4** | **Distance and time are a real cost** | Off-window trip costs ≥ 2× the in-window cost. A fleet six minutes out is a live tension, not a formality | Enforced: launches at two times differ in `arriveAt` and cost, matching Hohmann | Supports P3: expansion and conquest are paced by the theatre, not free |
| **P5** | **The frontier is real** | Owning any region of a body gives instant, full, live sensor vision of that body (fleets, buildings, ownership). Everywhere else renders exactly like unclaimed space: no ownership, no stale "last seen" data, nothing live. A Science-unlocked Envoy, sent to a rival's capital for an ongoing Energy upkeep, gives live vision of that nation's fleets and territory empire-wide, but never any building, and opens a trade multiplier between the two nations | Enforced: a client never receives fleet, building or ownership data for a body it neither owns a region on nor whose owning nation it has an active Envoy on; Envoy vision appears by the next `tick` after the command is accepted, and lapses the tick its upkeep goes unpaid. Simulated: Envoy upkeep cost vs. the value of the intel plus the trade multiplier it unlocks, tuned so scouting is a real decision, not free or wasted | The harsh-competition idea: what you know about your rivals is earned, not given |
| **P6** | **Well paced** | Voidcraft's Thrust Vectoring ~2 min; first colony 4 to 7 min; Mars 12 to 25 min. Dead time < 20% in the first 30 min. Threshold at 50 ± 10 min. A 30-min joiner reaches 25% of median score. No deadlocks | Simulated: balance suite. Judged: LLM playtest rubric | 1-hour season; the showcase room |
| **P7** | **Works everywhere** | 1920×1080 and 390×844. Every action reachable by keyboard alone, camera included (arrows/WASD pan, `+`/`−` zoom, `[`/`]` cycle bodies). Mouse, trackpad and touch all navigate the map (drag, scroll, pinch). Resize mid-action loses nothing. Touch targets ≥ 44 px. UI text WCAG AA contrast | Enforced: Playwright completes the core loop at both viewports, keyboard only. Judged: resize, touch and screen-reader passes | Marking: viewports, keyboard pass, resize |
| **P8** | **Fast on ordinary hardware** | First interactive view ≤ 3 MB and ≤ 5 s on Chrome's slow 4G preset. 60 fps at 1080p on integrated graphics (medium tier); 30 fps on a phone. GPU memory ≤ 300 MB. Pending feedback ≤ 100 ms after a command | Enforced: Playwright under throttling checks transfer size and time to interactive. Judged: fps on a named laptop and phone | HD: a slow connection |
| **P9** | **Never lose progress** | Reconnect restores the view < 3 s. No acknowledged action is ever lost. A next-day return shows history: past seasons, results, your empire | Enforced: command, then fresh connection, sees it; `/api/season` returns history. Judged: next-day return pass | Persists; HD: a session resumed the next day |
| **P10** | **Plays like a game: the map is the screen** | User-friendliness is a design principle. The main screen is the full-screen solar system, Stellaris-like: zoom continuously from the whole system down to a planet's surface and back, pan and drag like Google Maps. Everything is done from the thing on the map: click a planet, region or fleet and its actions appear beside it. The HUD is thin (resources, an outliner, the selection panel, notifications); no screen is a page of forms or lists. A stranger finds the core loop (claim, build, launch, colonise) without reading anything outside the game | Enforced: Playwright, after joining, sees a canvas filling the viewport; drag and scroll move the camera; clicking a body opens its panel; the core loop completes through map clicks. Judged: a timed stranger run at each crit, recorded in `docs/checks.md` | Crit 8: a stranger does the core thing; "a website that's good" |

## Systems-oriented

| # | Goal | Target | Check | Brief |
|---|---|---|---|---|
| **S1** | **Low latency** | Command visible to all other clients ≤ 600 ms p95 at 30 clients (brief: 1 s). Tick jitter ≤ 50 ms. Tick processing ≤ 20 ms p99 | Enforced: two clients, change arrives < 1 s. Measured: 30-bot WebSocket load test, p50/p95/p99 | Real-time |
| **S2** | **Lean compute** | Server RSS ≤ 180 MB at 30 clients (of 256 MB). Zero work with nobody connected, so the machine can auto-stop. Tick CPU ≤ 10% of the 500 ms budget, filtering each client's fog-of-war view included | Measured: load test and `/admin` stats. Enforced: loop stops when the last socket closes (logged) | Fly: 256 MB, shared CPU, auto-stop |
| **S3** | **Lean network** | Quiet tick ≤ 500 B, busy ≤ 3 KB, `welcome` ≤ 60 KB, each already filtered to what that nation can see. Egress ≤ 200 KB/s at 30 clients. Hashed static assets cached immutably; repeat visit ≤ 50 KB | Enforced: message sizes and `Cache-Control` headers. Measured: load-test egress | Slow connections; cost |
| **S4** | **Every event tracked, stored efficiently** | Every accepted command stored exactly once, before anyone is told it happened. Append ≤ 1 ms p99. ≤ 200 B per command on average; a 30-player season < 5 MB; the 1 GB volume holds 200+ seasons. One structured log line per user action | Enforced: repeated command id applies once; log line format. Measured: append latency, bytes per command and per season | Persists; crit 10 logging |
| **S5** | **Deterministic and recoverable** | Replaying the log reproduces state exactly. Boot (snapshot + replay) ≤ 1 s. Snapshots every 60 s and on shutdown. All clients see the same commands in the same tick order | Simulated: replay real season logs, compare state hashes. Measured: boot time in logs | Persists across restarts and redeploys; crit 9 ordering decision |
| **S6** | **Isolated and safe** | No client receives another nation's private state, and none receives fog-of-war data it hasn't earned through territory or an envoy. Passwords scrypt-hashed, ≤ 2 hashes at once. Failed logins rate-limited. WebSocket `Origin` checked | Enforced: a second client never sees the first's stocks, offers, or un-sensed fleets/buildings; bad logins get 401 then 429 | Multi-user: distinguishing people; P5's fog of war depends on this holding |
| **S7** | **Observable** | Live view: online players, commands per minute, rejections by reason, tick duration, memory, sockets. A season's story can be told from logs alone | Judged: crit 10 blind demo | Crit 10 |

## How the goals carry through

| Artefact | Role |
|---|---|
| `README.md` | Argues the goals: good is P1 to P10 for players, kept affordable by S1 to S7. States which are enforced and which judged, and how |
| `CLAUDE.md` | Turns goals into rules the agent must follow, each citing its goal (e.g. rejections carry reasons: P2; no feature grants vision outside sensors/envoys: P5, S6; no optimistic UI: S1, P9; `rules/` stays pure: S5; budgets are hard limits: P8, S2, S3) |
| `spec/` | One test file per goal (`p1-onboarding.test.ts`, `p5-fog-of-war.test.ts`, `s1-latency.test.ts`, …) so any claim traces to its check |
| `sim/` | Balance and determinism tests for P3, P4, P6, S5; the WebSocket load-test bot for S1 to S4 |
| `docs/measurements.md`, `docs/checks.md` | The record behind every Measured and Judged goal |

## Tooling these goals need

- **Playwright in `spec/`**, so P1, P7 and P8 are enforced, not only judged.
  The CI runner can run headless Chrome.
- **A load-test bot in `sim/`** that plays over real WebSockets, for S1 to S4.
- **A separate vitest project for `sim/`**; the shipped config includes only
  `spec/`.

## Changing a goal

Goals can move when evidence says they should. A change edits this file, the
README and the matching `CLAUDE.md` rule and `spec/` test in the same commit,
with the reason in the commit message, so the four never disagree.

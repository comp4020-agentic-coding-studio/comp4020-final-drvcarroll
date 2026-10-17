# Build process

How we get from `goals.md` / `game-design.md` / `system-design.md` to a
deployed app. This is stage gates and standing rules, not a task list: each
stage says what must be objectively true to call it done, and cites which
goals it serves. How to get there within a stage is left to whoever (or
whichever agent) is executing it.

That's deliberate, not an oversight. A prescriptive line-by-line plan reads
well but produces worse code from this model than a looser one with clear
checkpoints — the restriction doesn't buy the safety it looks like it does,
it just removes the judgment that would have caught the real problems. So
this document is the opposite shape from `/execute_plan`'s one-subagent-per-
atomic-step decomposition: fewer, bigger-grained checkpoints, each verified
by running tests rather than by re-reading a transcript.

## How a session picks this up

Context resets between sessions; this process has to survive that without
re-deriving itself from scratch, and without re-reading everything either
(that's just a slower way to do the same thing). On starting work here:

1. Read this file.
2. Read `docs/progress.md` — the ledger. It names the current stage, the
   last verified checkpoint, and the next unit of work.
3. Read only the ground-truth section(s) the ledger points at for that next
   unit (e.g. "game-design.md §7, Military" for a combat task), not the
   whole of `goals.md`/`game-design.md`/`system-design.md` again.
4. Do the work, run its tests, update the ledger, commit.

Don't re-read a doc you already hold in context just to "be sure." Trust the
ledger; it exists so you don't have to re-verify the whole project's state
every session.

## Standing rules (every stage, always)

- **Scope rule, inherited:** a feature ships only if it serves a goal in
  `goals.md`. If you can't cite one, it doesn't go in yet.
- **Tests before "done":** every goal names its Check kind. Enforced goals
  get a `spec/*.test.ts`; Simulated goals get a `sim/` test. A checkpoint
  isn't complete until its tests exist and pass — not "look like they'd
  pass," actually green.
- **Numbers live in `rules/data/` only.** Tuning a balance number is a data
  edit. If you find yourself changing a number inside `rules/` logic itself,
  stop — that's a rule change, and rule changes need a reason beyond
  balance, cited against a goal or a design doc section.
- **Docs and code never drift.** If building something surfaces a gap or a
  bad call in `goals.md`/`game-design.md`/`system-design.md` (a number
  doesn't balance, a rule turns out unimplementable as written), fix the doc
  in the **same commit** as the code that needed it, with the reason in the
  message. Never let the code quietly diverge from what the docs claim.
- **Atomic, tested, cited commits.** One commit is one concrete, verifiable
  unit: a building implemented and its test, not "implement all buildings."
  The message cites the goal or doc section it serves, the way the doc
  commits so far have.
- **Commit as you go.** Commit each unit the moment its test goes green,
  before starting the next. Work never piles up uncommitted across units,
  and a session never ends with tested work uncommitted: the commit history
  is the build's progress record, and an uncommitted unit is lost to the
  next session. Stage files by name; leave the user's own edits out.
- **Update the ledger at the end of each unit**, not after every file edit —
  after each piece that's complete and tested. Terse: stage, checkpoint,
  next, any flagged assumptions. It's a pointer for the next session, not a
  diary.
- **Don't gold-plate.** Build to the cited goal's target, not past it. A
  goal with a target of "60 fps on medium tier" doesn't need 120 fps work.
- **When genuinely blocked by a gap the docs don't resolve,** make the
  smallest reasonable call yourself, log it as a flagged assumption in the
  ledger, and keep moving. Stop and ask only when it's a real preference
  fork the user would actually want to weigh in on (the same bar used
  throughout this project so far) — not for every small implementation
  choice.

## Stages

Dependency-ordered, not calendar-ordered: each stage exists because the one
before it de-risks it. The crit calendar (brief: weeks 9–11) is noted per
stage as a soft cross-reference, not the actual gate — the actual gate is
each stage's exit criteria, independently checkable by anyone, any session.

### A. Rules engine and data (`rules/`)

Pure TypeScript: `apply`, `advanceTo`, `observe`, `legalActions`. No I/O, no
clock, no randomness, no `rules/` logic that reads a number — every number
comes from `rules/data/`, per `game-design.md`'s own opening line.

**Exit criteria:** the four functions exist and are pure; every number in
`game-design.md` lives in `rules/data/`, nowhere else; invariants hold under
test (stocks never negative, replay is deterministic, Lanchester resolves
combat with no randomness).
**Serves:** foundation for P3, P4, P6, S5 — nothing user-facing yet, so
nothing to demo.

### B. Headless sim and balance (`sim/`)

The six bot archetypes (Expander, Builder, Trader, Conqueror, Researcher,
Random) play the rules engine with no server, no client, no renderer. This
is the cheapest point to catch a dead strategy or a deadlock, before any UI
work has been spent on top of a broken design.

**Exit criteria:** `pnpm sim:test` runs; the balance targets table
(`game-design.md` §13) is measured for every target, even where a target
isn't met yet — the harness existing and reporting real numbers is the gate
here, not every number being perfect (that's the ongoing loop, stage G).
**Serves:** P3, P4, P6, S5 (Simulated checks).

### C. Server (`server/`)

HTTP + WebSocket per `system-design.md` §14's message contract, SQLite
command log and snapshots, the 500 ms tick loop, auth. The course's own
`spec/invariants.test.ts` (`/` answers, `/readme/` serves the README) must
pass here even before a graphical client exists — a bare response is enough.

**Exit criteria:** `spec/invariants.test.ts` green; the brief's three hard
requirements (multi-user, real-time, persists) demonstrable at the protocol
level — two raw socket connections, one command, both see it, a restart
doesn't lose it.
**Serves:** S1 through S7, P9, P2 (every rejection already carries a reason
at this layer, before there's a UI to display it).

### D. The game client: map first (`game-design.md` §12, goals.md P10)

The client is a game, not a web app, from its first version: the solar
system map is the main screen (Three.js, full-screen), navigated like Google
Maps (zoom from system to surface, pan, drag, rotate), with a thin
Stellaris-like HUD and a selection panel that appears for whatever you click.
Every command is reachable from the map: join, build, research, launch,
colonise, trade, declare war, invade. Visuals are never deferred behind a
"functional DOM client"; a page of forms fails P10 however correct it is.
Region shapes started as Voronoi patches; Stage E2 replaces them with real
borders and features.

**Exit criteria:** after joining, the canvas fills the viewport and the
camera moves by drag, scroll and keys; clicking a body or region opens its
panel; the core loop (claim, build, launch, colonise) completes through map
clicks at 1920×1080 and 390×844, and keyboard-only via the DOM mirror; P1's
"first build queued < 30 s" holds. Screenshots are judged as a player would
before calling it done.
**Serves:** P1, P2, P7, P9, P10.
**Crit 8 needs the map-first slice:** navigable system, clickable bodies and
regions, the core loop playable through it. Full keyboard/viewport
completeness is the Crit 9 bar.

### D2. HUD revision: playtest feedback (`game-design.md` §11, §12)

Players asked for two things: clearer instructions, and a less cluttered,
more polished HUD. This revises the D client in place, no new client:

- **Icons, never letters:** SVG icons for the six resources (with accessible
  names and hover tooltips) replace every resource letter or name in the
  UI; detailed SVG icons for every building, Power Plant mode, ship and Army.
- **Selection panel without tabs:** the slot grid (empty `+` tiles, built
  tiles with produce/consume per day underneath, a tile menu for replace,
  upgrade, demolish, and ships and Armies at a Spaceport), then Forces here.
  `replace` is one atomic command (system-design.md §14.5).
- **Empire menu:** Territory, Armies, Fleets, Tech tree.
- **Empires overlay:** rank, war status and trade deals per nation, and the
  Earth Exchange. The Tech and Trade top-bar drawers go.
- **The Guide:** the in-game wiki, one click from the top bar, numbers read
  from `rules/data/`.

**Exit criteria:** no resource letter is left in the rendered UI (an e2e
check scans the HUD text); every resource icon has an accessible name; a
held region shows `slotsOf` tiles and its build, replace, upgrade and
demolish work from them; `replace` is refused with a reason when the new
building can't be afforded after the refund (rules test); the Guide opens from the
top bar with its pages; the core loop still completes at both viewports and
by keyboard; screenshots judged as a player would before calling it done.
**Serves:** P1, P2, P7, P10.

### D3. War you can see, a cleaner menu (`game-design.md` §7, §11, §12; system-design.md §14)

Playtest feedback: war was opaque, the left menu cluttered, and new-player
protection too long. Revises the rules and the D2 client in place:

- **Rules:** protection 1 min (`WAR.protectionS` 60). Spaceport 70 M,
  25 A, 240 s (§6). Starts on Earth only: off-Earth joins and the
  `offEarthPower` kit rule go, a full Earth refuses with `EARTH_FULL`. Ground combat becomes a
  timed battle (§7): a `battle` per region with analytic counts, a scheduled
  end, reinforcements joining; `battleCounts(battle, t)` exported for the
  client. Marches and battles go in `VisibleWorld`, vision-gated like
  garrisons.
- **Map:** army icons with counts on visible garrisons, moving marches,
  a crossed-swords marker on battles.
- **Panel:** the Battle block with live draining bars; a rival's region
  offers Declare war or Attack in place.
- **Empire menu:** three dropdowns, Territory, Military (Armies, Fleets),
  Research.

**Exit criteria:** rules tests: a 10 vs 10 garrison battle lasts 21 ± 1 s
and its survivors equal the old instant result for the same forces;
reinforcements extend a battle; a second attacker is turned back; protection
ends at 60 s; a join or respawn on an off-Earth region is refused, and on a
full Earth gets `EARTH_FULL`. Sim: no bot claims off Earth before 5 min, and
first colony lands in 5 to 8 min. A client without vision on a region never receives its battle
or marches (P5 spec). e2e: the Empire menu has exactly three dropdowns; a
march into a garrison shows a battle whose counts fall between two ticks; a
rival's region at peace offers Declare war, and Attack once the war is
active. Sim balance suite rerun and logged (respawn and conqueror targets).
All existing tests still green; screenshots judged as a player would.
**Serves:** P2, P4, P5, P6, P10.

### D4. A world that keeps going: stages, alliances, admin reset (`game-design.md` §7, §9, §10, §11; system-design.md §4, §11, §14)

The user's playtest: the game just stopped at the season's end, there was
no way to reset the server, and no diplomacy beyond war and trade. Builds
on D3 (battles become per-nation sides here):

- **Stages:** the world never ends; a `stageEnd` event every 20 min ranks
  score gained, writes a `stages` row, and adds the next global modifier
  (`STAGES` in `rules/data/victory.ts`, read by the same `mods()` path tech
  uses). The 40% category cap, the threshold, the 60 min end and the minute
  50 join cutoff go. Top bar shows the stage; Empires shows gains and past
  winners.
- **Alliances:** invite, accept, decline, leave; forced peace; fleets and
  Armies of allies at war with the same nation fight as one side; sanctions
  block offers, accepts and gifts. All in Empires.
- **Admin reset:** the hardcoded `admin` / `platypus` account; `/admin`'s
  Reset world button; sockets closed with 4004.

**Exit criteria:** rules tests: at 20 min the stage advances, the ranking is
by gain, and a stage modifier changes the matching output, cost or time
(Mines +25% at stage 2, Spaceport cost and time at stage 3); nothing ends
the world at 60 min; joining an alliance ends wars between members and
`declareWar` on an ally is refused `ALLIED`; two allies' fleets beat a fleet
neither beats alone; an ally's Armies join an attack and survivors return
home; a sanction refuses offers, accepts and gifts both ways with
`SANCTIONED`. Server test: `admin` / `platypus` logs in on a fresh database;
`/api/admin/reset` is 404 for others, and for admin closes sockets with
4004, empties the world, and every account still logs in. Spec: replay
reproduces a world with an alliance, a sanction and a stage change. e2e:
the top bar shows the stage; Empires invites and accepts an ally. Sim:
stage win rates per strategy logged, P3 and P6 targets measured.
**Serves:** P3, P6, P9, S5, S7, P10.

### E. Visual fidelity and budgets (`game-design.md` §12, system-design.md §8)

Polish on top of the map client, not a separate client: textures,
the Earth day/night shader and city lights, atmospheres, bloom, rings,
texture tiers, adaptive quality, and meeting the rendering budgets.

**Exit criteria:** budgets in `game-design.md` §12 and `system-design.md` §8
are met (first render, frame rate, GPU memory); fog of war, sensors and
Envoy beacons render per spec.
**Serves:** P8, and the judged half of P1/P7/P10.

### E2. Real worlds and the command console (`game-design.md` §4, §12; system-design.md §2, §8)

The user asked for the real solar system and a look that feels like
commanding an empire, not another web app. Two halves, each its own run
of units:

- **Real worlds:** `scripts/worlds.ts` fetches Solar System Scope and USGS
  maps and writes WebP tiers; it rasterises Earth's region map from Natural
  Earth (countries, plus admin-1 for the US, Russia and China, membership
  in `rules/data/map.ts`) and every other body's from a weighted Voronoi on
  real feature centres and diameters (USGS Gazetteer, also in `map.ts`).
  The region shader and picking move from seeds to region maps; gas-giant
  orbital regions become bands. Credits go in the Guide footer and the
  user menu.
- **Command console:** gunmetal plates, console-key tabs and buttons,
  corner brackets and designation strips, Rajdhani and Share Tech Mono
  self-hosted, reticle selection, mechanical motion with a reduced-motion
  off switch. Layout and behaviour stay exactly as D2 left them.

**Exit criteria:** every playable body but Psyche and Ceres renders its real map
when focused; a unit test reads Earth's region map at the cities named in
goals.md P10 and gets their regions, and open ocean gets none; every
off-Earth region's anchor is within 5° of its gazetteer centre; clicking a
country on the globe selects its region; first render still < 3 MB and
GPU memory < 300 MB with Earth focused (Playwright measures transfer size);
all e2e tests still pass; text contrast stays WCAG AA; screenshots at both
viewports judged as a player would before calling it done.
**Serves:** P8, P10, P7.

### F. Logging and observability (crit 10 ask)

One structured log line per action; `/admin` live stats.

**Exit criteria:** S4 and S7's targets met; a season's story can be told from
logs alone, per S7's judged check.

### G. Balance and playtest loop (continuous, from B onward)

Not a stage with an end: the loop in `game-design.md` §13. Two instruments:

- **Scripted bots** (`pnpm sim:test`): free, seeded, run after any change to
  `rules/data/`. They measure the §13 targets.
- **`/playtest`** (`.claude/workflows/playtest.js`): a workflow, run once
  after `comp4020-resume` finishes, never per unit. Six Haiku players, one per
  score path (Territory, Economy, Tech) and stance (aggressive, cooperative),
  play a fresh local server through `scripts/play.ts` over the real socket;
  a Sonnet analyst runs the bot suite, watches as admin, and stops the run at
  stage 1's end or when one nation passes 50% of the score after minute 10.
  A synthesis agent returns one report: results per path, a goal-alignment
  table (P1 to P6, S7), the rubric, and at most five ranked recommendations
  tagged ACT or LOG. The script holds the agents' output, so only the report
  enters the main session.

**Loop rule, so it ends.** A recommendation is **ACT** only if it breaks a
numeric target in `goals.md` or §13, or is a P1, P2 or P10 confusion two or
more players report, or touches multi-user, real-time or persistence.
Everything else is **LOG**, recorded as open in `docs/balance-log.md`. ACT
items go through `comp4020-update`, then `comp4020-resume`. The loop stops
when a cycle moves no target, and after two cycles per crit regardless.
Playability past the targets is not worth marks; the targets are.

### H. Evidence: a check behind every claim (crit 10 ask)

Every claim in `system-design.md` names its check (system-design.md §13):
a test by file and name, or Measured / Judged with where the record is. The
claims below had none when the ADRs were written (`docs/adr/`); each gets an
Enforced test, or is reworded to say how it is measured or judged.

- **Contention (S03):** two clients claim one region in the same tick; the
  first is accepted, the second gets `TAKEN` with a reason. 11 commands in
  one tick: the 11th is `RATE_LIMIT`.
- **Authorisation (S07):** client B's `build`, `train`, `march` and `demolish`
  on A's region get `NOT_OWNER`; B can't launch A's fleet or accept an offer
  addressed to A; a non-admin gets 404 on `/admin`, `/api/admin/stream` and
  `/api/admin/reset`; a WebSocket upgrade with a foreign `Origin` is refused;
  an expired session closes 4002.
- **Accounts (S07):** 5 bad logins then 429; a common password refused; the
  cookie is `HttpOnly; SameSite=Lax` (and `Secure` in production); the DB
  holds only the token's hash and scrypt password hashes.
- **Logging (S09):** login, logout, connect, disconnect and every command
  write one line with `user`; no line contains a password or token; the loop
  logs `idle` when the last socket closes.
- **Sync (S05):** message sizes under S3's limits in a spec run; a region
  leaving vision is resent without owner; several tabs each get a stream.
- **Purity (S08):** `rules/` imports no `node:` module and calls no
  `Date.now` or `Math.random` (a test scans the source).
- **Client:** reconnect restores the view under 3 s; a pending command
  changes nothing until its result (e2e).

**Exit criteria:** every row of system-design.md §13 cites a check that
exists and passes; the tests above are green; `NOT_JOINED`'s reason matches
§14.5 (or §14.5 matches the code); acting on another nation's fleet or offer
returns `NOT_OWNER` or the doc says why `INVALID` is right.
**Serves:** S1 to S7, P5, P9; the brief's "checks protect the promises".

## Crit calendar (hard deadlines)

Stages above are dependency-ordered; crits are calendar-forced and don't wait
for a stage to fully finish. Each row is the bar for that date — a **subset**
of the relevant stage's exit criteria where there isn't time for all of it,
never a replacement for it. Whatever doesn't make a crit's bar still has to
be hit eventually; it just slips to the next one.

| Crit | When | Bar to clear | Stages |
|---|---|---|---|
| **Crit 8 — "It's alive!"** | Next week | Stage A done. Stage B: harness running and reporting real numbers — they don't need to be tuned yet. Stage C: full exit criteria, no slipping this one — "backend polished" means the server, persistence and protocol are actually right. Stage D: the map-first slice — the solar system as the main screen, navigable, bodies and regions clickable, the core loop playable through it. First `README.md` (400–600 words) live at `/readme/`. First `PROCESS.md`. | A, B (partial), **C (full)**, D (map-first slice) |
| **Crit 9 — "All at once"** | Week 10 | Real-time fully wired end to end, not just the protocol — the client reflects it live. Stage D's full exit criteria: both viewports, keyboard-only. Stage D2 done (the playtest HUD revision). One documented decision on multi-user contention behaviour (system-design.md §5's ordering rule already is that decision — cite it, don't re-decide it). | **D (full)**, **D2** |
| **Crit 10 — "Fly by instruments"** | Week 11 | Stage F done: logging, `/admin` live view. Stage E substantially in, E2 and D3 done. **Stage H's authorisation, contention and logging tests green**, and who may see and change what written down with why (`docs/adr/S07`). Deployed, so two people in separate Chrome profiles play from the URL alone while the logs say who did what. | E, **E2**, **F**, **D3**, **H** (auth, contention, logging) |
| **Target: done** prerequisite | Week 12 | Stage D4 (stages, alliances, admin reset) done, Stage H done, one `/playtest` cycle folded in, before the final pass. | **D4**, **H**, G |
| **Target: done** | End of week 12 | Self-imposed, ahead of the real deadline (noon Mon 9 Nov 2026) on purpose — a buffer, not a guess at the actual due date. Stage G's numbers in a reasonable place (never "finished" — that's the point of a loop). Final `README.md`/`PROCESS.md` pass, everything deployed and green. | G, polish |

The map is the game from the first client on (goals.md P10): Stage E adds
fidelity to a map client that already plays, it never stands in for one.

## The harness: what runs, and who holds the plan

| Piece | Where | Holds the plan |
|---|---|---|
| `comp4020-update` | `.claude/skills/` | A change (the user's, or a playtest's ACT items) into the docs, ADRs and this plan. No code |
| `comp4020-resume` | `.claude/skills/` | Builds stage by stage from the ledger, delegating long-output work to subagents; ends with one `/playtest` |
| `/playtest` | `.claude/workflows/playtest.js` | The script: six `playtester` agents (Haiku) and an `analyst` (Sonnet), then a synthesis |
| `playtester`, `analyst` | `.claude/agents/` | Agent definitions: model, tools, how to play and what to report |
| `scripts/play.ts` | repo | The text client agents play through, against a real local server |
| `docs/adr/` | repo | Why each design decision was made, and what it costs |

The loop: the user plays and says what to change, `comp4020-update` writes
it down, `comp4020-resume` builds it, `/playtest` checks it against the
goals, and the main agent decides whether anything goes round again (the
loop rule in G).

## The ledger: `docs/progress.md`

Lives alongside this file, stays short. Format:

```markdown
# Progress

**Stage:** <A–G>
**Last verified checkpoint:** <what's actually done and tested>
**Next:** <the next unit of work, one or two sentences>
**Flagged assumptions:** <calls made to unblock, with a one-line reason each — remove once the docs are updated to match, or reverted>
**Last updated:** <date, by whom/which session>
```

Whoever finishes a unit of work updates this before stopping, even mid-stage.
A session that opens this file should trust it over re-deriving state from
the repo — if it's wrong, that's a bug in the process (fix the ledger, note
why), not a reason to re-audit everything from scratch every time.

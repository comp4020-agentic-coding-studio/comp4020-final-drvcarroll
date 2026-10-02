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

### D. Minimal functional client

A bare client — DOM is enough, no Three.js yet — that can do everything:
join, build, research, launch, trade, declare war, invade. This proves the
full command surface and passes the Playwright core-loop check at both
viewports and keyboard-only, before spending any effort on how it looks.

**Exit criteria:** the core loop is completable end to end through this
client, at 1920×1080 and 390×844, keyboard-only; P1's "first build queued
< 30 s" is achievable using it.
**Serves:** P1, P2, P7 (functionally; visually comes next), P9.

### E. Rendering (Three.js, `game-design.md` §12)

The 3D scene, camera, fog-of-war rendering (regions you can't see render
flat and unlit, exactly like unclaimed space), budgets. This is sequenced
last on purpose — it has no bearing on whether the mechanics are correct,
only on whether they're legible and good to look at — not because it's
optional scope. Nothing in `game-design.md`'s map or mechanics gets cut to
make room for this; it's an addition on top of a client that already works.

**Exit criteria:** budgets in `game-design.md` §12 and `system-design.md` §8
are met (first render, frame rate, GPU memory); fog of war, sensors and
Envoy beacons render per spec, not just the DOM mirror.
**Serves:** P8, and the "judged" half of P1/P7's passes.

### F. Logging and observability (crit 10 ask)

One structured log line per action; `/admin` live stats.

**Exit criteria:** S4 and S7's targets met; a season's story can be told from
logs alone, per S7's judged check.

### G. Balance and playtest loop (continuous, from B onward)

Not a stage with an end — the loop in `game-design.md` §13: run bots (and
occasionally a short LLM playtest), read the numbers, change one value in
`rules/data/`, rerun, record before/after in `docs/balance-log.md`. Runs
short (15–20 simulated minutes by default, per §13) to stay cheap. Revisit
after any change to `rules/data/`, not on a schedule.

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

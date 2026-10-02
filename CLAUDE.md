# This repo

## Brief and spec

[Final project brief](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/):
a multi-user, real-time website that's good. Three fixed requirements:
**multi-user** (shared state, distinguishes people), **real-time** (changes
propagate to other open sessions within about a second, no reload),
**persists** (survives sessions, restarts, redeploys). Everything else —
what the app does, what good means — is ours to decide; that decision is
`docs/goals.md`.

`spec/invariants.test.ts` is the one fixed, non-negotiable check (ships with
the starter repo): `/` answers 200, `/readme/` serves `README.md`'s headings
in order. Never delete or weaken it. Everything else in `spec/` is ours,
written against the goals below.

## The game

Grow is the core drive. The player builds an empire across the solar system
however they choose — conqueror, trader, builder, researcher, any mix.
Growth is measured three ways: **Territory**, **Economy**, **Tech**. Military
and trade are instruments toward those three, never scores themselves. Part
of the world is a harsh one: territory you haven't sensed or paid an Envoy to
watch is a blank on your map, same as unclaimed space.

It plays like a game, not a web app: Stellaris-like, the solar system map is
the main screen, navigated like Google Maps at solar-system scale (zoom, pan,
drag), with a sleek HUD over it and panels that appear for what you select.
User-friendliness is a design principle, not polish (goals.md P10).

## Ground truth (read in this order)

| Doc | Answers |
|---|---|
| `docs/goals.md` | What good means. Every goal has a target, a check, and a brief citation. **Scope rule: a feature ships only if it serves a goal here.** |
| `docs/game-design.md` | Mechanics: map, resources, buildings, military, tech, trade, victory, visuals |
| `docs/system-design.md` | Backend: stack, persistence, the tick loop, the server↔client message contract (§14) |

If something you're building isn't covered by one of these, it isn't scoped
yet — don't invent scope, update the doc first (same commit as the code that
needed it).

**Every change goes into these three docs.** Any change of direction, a
design decision, a user correction or preference ("the map is the main
screen"), a new mechanic, a stack choice: write it into `goals.md`,
`game-design.md` and `system-design.md`, each where it applies, before or in
the same commit as the code. Check all three every time; a change that touches
only one usually means the other two are now stale. Memory, chat and commit
messages are not a substitute: if it isn't in these docs, the next session
won't know it.

## How we build it

`docs/build-process.md` is the stage plan: rules engine → headless sim →
server → minimal client → rendering → logging → the ongoing balance loop.
Each stage has objective exit criteria and cites its goals, not a prescriptive
step list — use judgment inside a stage, verify with tests at its boundary.

`docs/progress.md` is the ledger: current stage, last verified checkpoint,
next unit, flagged assumptions. **Read it before starting work, update it
before stopping.** It's how a session with no memory of this one picks up
correctly.

Standing rules, every stage:

- Every number lives in `rules/data/`. Tuning balance is a data edit, never a
  rule edit.
- Nothing is "done" without its test green: Enforced goals get `spec/`,
  Simulated goals get `sim/`.
- Commit atomically, one tested unit at a time, citing the goal or doc
  section it serves.
- **Commit as you go.** Commit each unit the moment its test is green,
  before starting the next one. Never batch units or leave tested work
  uncommitted at the end of a session. Stage files by name; leave the
  user's own uncommitted edits out.
- Docs and code never drift: if reality disagrees with a doc, fix the doc in
  the same commit.

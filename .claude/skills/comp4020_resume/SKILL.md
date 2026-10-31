---
name: comp4020-resume
description: Resume building this project from wherever it was left off. Reads CLAUDE.md and the ledger, checks the crit calendar, then keeps building with judgment until every stage's exit criteria are met, and ends with one /playtest. Use for "resume", "keep building", "continue", or at the start of a session here.
---

## Read (and no more)

`CLAUDE.md`, `docs/progress.md`, `docs/build-process.md`'s crit calendar.
Then only the doc sections and ADRs `progress.md` points at, not all of
`goals.md`/`game-design.md`/`system-design.md` again. Check today's date
against the calendar: a near crit's bar overrides a stage's full criteria.

## Build

Not a step list; use judgment. `CLAUDE.md`'s standing rules apply: numbers
only in `rules/data/`, nothing done without a green test, one atomic commit
per unit citing its goal, docs and code never drift.

- **Commit as you go.** The moment a unit's test is green, commit it with its
  ledger update, then start the next. Stage files by name; leave the user's
  own uncommitted edits out.
- **Corrections land in the harness.** When a test or review catches a
  mistake of yours, fix the cause where the next session will read it: a rule
  in `CLAUDE.md`, a check in `spec/`, or a sentence in the design doc. Say so
  in the commit message. A retry until green is not a fix.
- **Decisions get an ADR.** A unit that makes or reverses a design decision
  adds or supersedes a file in `docs/adr/` (context, options, decision,
  cost) in the same commit. Never edit an accepted ADR's decision; supersede it.
- **Blocked by a real gap:** make the smallest reasonable call, log it in the
  ledger's flagged assumptions, keep going.

## Keep context small

- Delegate work whose output you won't reread to a subagent and keep only its
  conclusion: e2e runs, `pnpm sim:test`, `pnpm load`, screenshot judging,
  broad searches. Ask for a verdict plus the lines that failed, not a log.
- Run the fast suites yourself (`pnpm typecheck`, `pnpm test:rules`,
  `pnpm test:server`); they're short.
- Keep `progress.md` under 40 lines. When a flagged assumption is settled,
  write it into the design doc (or an ADR) and delete it from the ledger.

## Don't stop for the user

Never pause to ask, report or wait between units or stages. After each unit,
read the ledger's **Next** and start it. Stop only when every stage in
`build-process.md` has met its exit criteria, or when truly blocked on
something only the user can do (a login, a secret, a paid service): log it,
skip to the next unblocked unit, and stop only when nothing is left.

## Finish: one playtest

When every stage is done, run `/playtest` once (not after each unit: it
costs credits). Then apply `build-process.md`'s loop rule to its report:
fold the **ACT** items in with `/comp4020_update`, record the **LOG** items
as open in `docs/balance-log.md`, and resume. Stop the loop when a cycle
moves no target, or after the second cycle for this crit. Report once, at
the end: what was built, the playtest verdicts, and what was left open.

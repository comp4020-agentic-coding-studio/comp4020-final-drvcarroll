---
name: comp4020-update
description: Fold a change to the game (a redesign, new feature, mechanic tweak, UI change, player feedback, a /playtest report's ACT items, anything) into the ground-truth docs, ADRs and build plan, so comp4020-resume picks it up and builds it. Docs only, no code. Use for "update the design", "change X in the game", "players said Y", "add a feature", or any change of direction.
---

The input is a change to the game: the user's words, or the **ACT** items of
a `/playtest` report. This skill writes it into the docs that
`comp4020-resume` builds from. It does not write code.

A playtest item is already scoped and evidenced: take its change, goal and
evidence as given, and cite the report's numbers in the balance-log entry.
Don't widen it.

## Read

`CLAUDE.md`, `docs/progress.md`, `docs/build-process.md`. Then only the
sections of `docs/goals.md`, `docs/game-design.md` and
`docs/system-design.md` the change touches. When it touches the client,
also skim the relevant client files, so the docs describe a change to what
is actually built, not to what the docs remember.

## Decide

- **Scope rule:** the change must serve a goal in `goals.md`. If none fits,
  edit or add the goal first.
- **Fill gaps with judgment.** Read vague words in the user's request
  ("garrison", "upgrade") against the existing rules, take the reading that
  fits, and log it as a flagged assumption. Ask (AskUserQuestion) only for a
  real preference fork that would change the design.
- **Prefer modifying to adding.** Fold the change into existing mechanics,
  sections and stages where it fits. A small tweak is a few edits; a
  pivot of a core idea is a rewrite of the affected sections, never a patch
  on the old structure.
- **Keep what the user didn't ask to change.** "Everything else stays" means
  it.

## Write

Check all of these every time; a change that touches only one usually
leaves the others stale.

| Doc | Gets |
|---|---|
| `goals.md` | Targets and Enforced checks that the change moves |
| `game-design.md` | The mechanic, numbers, UI, layout: the what |
| `system-design.md` | Protocol, commands, state shapes, persistence: the how |
| `build-process.md` | Where it's built: an existing stage's exit criteria, or a new stage with objective exit criteria and the goals it serves. Update the crit calendar row it lands in |
| `docs/adr/` | A change that reverses or makes a design decision: a new ADR (context, options, decision, cost), or a new one that supersedes the old (mark the old **Superseded by**). Add it to `docs/adr/README.md`. The user's reasons go in verbatim where they gave them; ask for the reason if a game decision has none |
| `balance-log.md` | For a playtest item: the loop entry, with the report's before numbers and the target it should move |
| `progress.md` | **Next:** names the new work and the doc sections to read; any flagged assumptions; the date |

Numbers in docs must match `rules/data/`. When the change alters one, the
doc says the new value and `progress.md` says the data edit is pending.

Style: concise and plain, no em dashes, no hedging. Match the existing docs.

## Finish

Commit the doc changes as one commit citing the goals served (stage files
by name; leave the user's own edits out). Tell the user in a few lines what
changed, which calls you made, and that `/comp4020_resume` will build it.
Run `comp4020_resume` only if the user asked for it.

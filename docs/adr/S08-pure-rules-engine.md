# S08. A pure rules engine shared by server, sim and client

**Status:** Accepted 2026-10-02 (bc62799).
**Serves:** S5, P2, P3, P6.

## Context

The server, the headless sim and the client must agree on every rule
(system-design.md §2). The command log must replay to the exact same state
(S02, S5). Balance is tuned over thousands of seeded headless games (P3,
P6). The client must show the server's own rejection reason before a
command is sent (P2).

## Options

| Option | For | Against |
|---|---|---|
| **One pure `rules/` module: no I/O, no clock, no randomness; numbers in `rules/data/`** | Deterministic replay; the same code runs headless in `sim/` and in the browser; plain unit tests | Every caller passes time in; impure helpers can't creep in |
| Rules inside the server, client re-implements what it needs | No discipline needed up front | Client and server disagree; no headless sim; replay depends on server internals |
| Rules with a seeded RNG and clock injected | Allows chance mechanics | Replay must reproduce the seed stream exactly |

## Decision

`rules/` imports nothing outside itself: no I/O, no clock, no randomness;
time is always a parameter (§3). Its surface (`rules/index.ts`) is
`advanceTo`, `apply`, `applyInPlace` for the server's sole-owner state,
`validate`, `observe` and `legalActions`. Every balance number lives in
`rules/data/`, so tuning is a data edit, never a rule edit (`CLAUDE.md`).
`RULES_VERSION` is bumped when rule logic changes so commands never replay
under other rules (S02).

## Consequences

- The client's HUD calls `rules.validate` on its mirror, so disabled
  controls show the reason the server would give (§3).
- `applyInPlace` must leave state exactly as `apply` would, rejections
  included, or live play and replay drift.
- Chance mechanics are ruled out unless derived from state.
- Checked by `rules/economy.test.ts` "replays deterministically, including
  through a JSON snapshot" and "gives identical state whether advanced every
  tick or command to command"; `rules/apply.test.ts` "matches apply over a
  random mix of accepted and rejected commands"; `rules/alliance.test.ts`
  "gives identical state live (every tick) and command to command";
  `sim/balance.test.ts` "replays a seed identically". No test enforces the
  purity itself (that `rules/` imports no `node:` module and calls no
  `Date.now` or `Math.random`), and none checks that every number lives in
  `rules/data/`.

**Check added 2026-10-17 (Stage H):** `rules/purity.test.ts` scans every
non-test file in `rules/` for imports outside it and for clock, randomness,
timer or `process` use. That every number lives in `rules/data/` is still
review-only.

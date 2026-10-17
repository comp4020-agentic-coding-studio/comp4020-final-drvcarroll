# S02. Persistence: a command log plus snapshots

**Status:** Accepted 2026-10-02 (8745d21, built in 82870a0).
**Serves:** S4, S5, P9, S7.

## Context

The world must survive restarts and redeploys, and the machine auto-stops
when idle, so the world must be computable from stored state at any later
time (system-design.md §1). No acknowledged action may be lost (P9). Crit 10
asks for an activity log.

## Options

| Option | For | Against |
|---|---|---|
| **Append-only command log plus periodic snapshots** | Exact replay of any incident from a copy of the DB; the log is the activity log; real games become sim fixtures (§4) | Rules must stay pure and versioned, or replay diverges |
| Current-state rows (one table per entity, updated in place) | Simple reads; no replay | Loses history; no replay of incidents; every rule change becomes a schema change |
| A document store (whole state as one blob) | One write per change | No history; a JSON file has no atomic writes (§2) |

## Decision

The world lives in memory as one state object. Each tick's accepted commands
are `INSERT`ed into `commands` inside one transaction, committed (WAL,
`synchronous = FULL`, one fsync per tick) before anyone is told
(`World.batch`, `server/world.ts`). Rejected commands are not stored. A
snapshot is written every 60 s while state has changed and on
`SIGTERM`/`SIGINT`. Boot loads the latest snapshot, replays later commands
through `applyInPlace`, then advances to now (§4). A world whose
`rules_version` differs from `RULES_VERSION` is closed, not replayed, and
the next arrival starts a fresh one with empire names and colours kept.

## Consequences

- If the commit fails, the world rebuilds from the log and the tick's
  accepted commands report failure, so state and log never disagree (§4).
- Replay divergence throws (`replay diverged at command N`) rather than
  silently booting a different world.
- Measured: append p99 0.6 ms, 110.7 B per command, boot 2.9 ms after 456
  commands (docs/measurements.md).
- A rules change ends the running world. Bumping `RULES_VERSION` is a manual
  discipline.
- Checked by `server/server.test.ts` "persists across a restart" and "starts
  a fresh world rather than replay under other rules, keeping empires";
  `rules/economy.test.ts` "replays deterministically, including through a
  JSON snapshot"; `rules/alliance.test.ts` "gives identical state live
  (every tick) and command to command"; `spec/game.test.ts` "shows a command
  after a fresh login and connect". No test covers the commit-failure
  rebuild path or the 60 s snapshot timer.

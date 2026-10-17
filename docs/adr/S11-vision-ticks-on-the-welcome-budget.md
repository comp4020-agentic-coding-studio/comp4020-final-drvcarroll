# S11. A tick that opens a body's vision is held to the welcome budget

**Status:** Accepted 2026-10-17.
**Serves:** S3, S1, P5.

## Context

S3 caps a busy tick at 3 KB. Stage H's size spec found one tick at 4.3 KB:
the one after a `join`. Joining gives a sensor on Earth, so every Earth
region arrives in full at once (24 regions, about 2 KB, more as Earth fills).
Any first claim on a body does the same. That tick is a partial `welcome`,
not ordinary play.

## Options

| Option | For | Against |
|---|---|---|
| Spread the new regions over several ticks | Every tick ≤ 3 KB | The map fills in late after a join; a second code path in the hub |
| Trim regions to changed fields | Smaller ticks | Breaks S05's whole-entity diffs, which keep clients in step |
| **Hold a vision-opening tick to the `welcome` budget (60 KB)** | No code change; it is the same data a `welcome` would carry | 3 KB no longer bounds every tick |

## Decision

A tick whose `changes.regions` brings a body into this nation's vision is
held to the `welcome` budget (≤ 60 KB). Every other tick keeps ≤ 3 KB busy,
≤ 500 B quiet. Checked by `spec/game.test.ts` "keeps welcome ≤ 60 KB, quiet
ticks ≤ 500 B and busy ticks ≤ 3 KB".

## Consequences

- A slow connection pays a few KB once per new body, as it would on reconnect.
- `pnpm load`'s busy-tick p95 is unaffected: joins are rare among ticks.

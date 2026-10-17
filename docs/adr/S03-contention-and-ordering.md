# S03. Contention: one writer, a 500 ms tick, arrival order

**Status:** Accepted 2026-10-02 (8745d21); alternatives weighed 2026-10-13 (ef7d524).
**Serves:** S1, S5, S4.

## Context

This is the Crit 9 multi-user contention decision. Many players act on one
shared world: two may claim the same region, accept the same trade, or
invade the same planet at once. Every client must see the same commands
applied in the same order, and replay must reproduce that order (S5). The
brief wants changes visible within about a second (system-design.md §1).

## Options

From system-design.md §5:

| Option | For | Against |
|---|---|---|
| **Single writer, arrival order, 500 ms tick** | One order to log and replay; no locks | Ties go to the lower-latency link |
| Intake threads, shared queue, a sender thread per client | Same model on OS threads | One shared vCPU means threads take turns; each `worker_thread` is a V8 isolate of ~10 to 30 MB of 256 MB and can't share the world, so senders need a copy per tick |
| Thread per client, round-robin writes | Removes the latency edge on contested actions | Same thread costs; a later command can win; replay must reproduce the rotation |
| 250 ms tick | p95 visibility ~250 to 300 ms from 501 ms | CPU per second doubles, ~8% of a core, above shared-cpu-1x's ~6% baseline; twice the fsyncs and messages; confirmation only speeds from ~0.5 s to ~0.3 s |

## Decision

One Node process; socket I/O is concurrent on the event loop, but every state
change goes through the tick (`Hub.tick`, `server/hub.ts`). Commands queue as
they arrive. Every 500 ms the server advances to now, then applies the queue
in arrival order, each stamped `at = now`, inside one transaction. Each
command is validated against the state the previous one left. So when two
players claim the same region in one tick, the first is accepted and the
second is rejected `TAKEN` with a reason ("Canada is taken"). Commands carry
a client `id`; a repeated id returns the original result without applying
again. The tick never lengthens under load; at risk, the server does less
per tick (§5). Limit: 10 commands per client per tick, the rest `RATE_LIMIT`.

## Consequences

- No locks, no races: contention is resolved by order, not by timing inside
  a handler.
- Measured: tick p50 14.27 ms, p99 19.97 ms of 500 ms; claim visible to
  others p95 501 ms (docs/measurements.md).
- The faster link wins ties. Accepted as intuitive; round-robin stays the
  documented fallback.
- Checked by `server/server.test.ts` "applies a repeated client id once, and
  explains every rejection"; `rules/economy.test.ts` "refuses a taken region,
  and names before joining" (sequential, rules level);
  `rules/apply.test.ts` "matches apply over a random mix of accepted and
  rejected commands". No test sends two same-tick claims from two clients
  and checks that the first wins and the second gets `TAKEN`, and none
  checks the `RATE_LIMIT` cap.

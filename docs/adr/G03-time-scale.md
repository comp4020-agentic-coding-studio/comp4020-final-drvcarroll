# G03. One game day is one real second

**Status:** Accepted (7549419).
**Serves:** P4, P6, P9, S2, S5.

## Context

G02 puts the game on real orbits, but real time is unplayable: Mars takes
months to reach. Too fast and orbits blur and windows stop mattering. The
clock sets every pace target in P6 and whether a fleet in flight is a live
tension (P4).

## Options

| Option | For | Against |
|---|---|---|
| Real time | Maximum realism | Nothing happens within a session |
| Turn-based | Easy to reason about | Not real-time, which the brief requires |
| 1 day = 0.1 s or faster | Brisk travel | Orbits spin; windows come too often to plan around; a session spans centuries |
| **1 day = 1 s (1 year ≈ 6 min)** | Mars window every 13 min, Mars orbit 11.5 min, Luna 27 s; trips take minutes | Outer bodies take hours to orbit, so the far system changes slowly |

## Decision

1 game day is 1 real second, starting 1 Jan 2050. The author's reasoning:
time is a resource, but at intra solar system scales it has to be playable.
The clock strikes a balance between real time as a mechanic and letting
players operate on a large time scale, so you essentially live forever,
which makes the player feel god-like, while things still move fast enough
to be engaging.

## Consequences

Long spans mean the world must run when nobody is watching, on a machine
that auto-stops (S2). So time is analytic: state is a snapshot, constant
rates and a queue of scheduled events; `stock(t) = min(cap, stock₀ + rate ×
(t − t₀))`, and due events apply in time then id order. The 500 ms tick only
decides when commands apply and updates go out. Outcomes never depend on a
loop running, which also makes replay exact (S5) and lets the sim jump
between decision points, running an hour in milliseconds.

Checks: `rules/economy.test.ts` ("identical state whether advanced every
tick or command to command", replay through a JSON snapshot);
`sim/balance.test.ts` ("replays a seed identically"); `server/server.test.ts`
(the world keeps going while nobody is connected, catching up its stages).
The cost: every mechanic must be expressible as rates and events.

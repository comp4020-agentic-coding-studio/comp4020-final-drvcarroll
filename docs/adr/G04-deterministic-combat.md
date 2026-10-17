# G04. Deterministic combat: Lanchester, no dice, timed ground battles

**Status:** Accepted (Lanchester and flat strength in 7549419; timed ground
battles in 488872e, rules in 974a928).
**Serves:** S5, P3, P10, P2.

## Context

Combat decides Territory for conquerors. The rules engine is pure, with no
randomness (S5), and every outcome must be explainable to a player who
arrives with no instructions (P2). Early drafts had a counter triangle
between unit types.

## Options

| Option | For | Against |
|---|---|---|
| Dice or random rolls | Drama and upsets | Breaks exact replay unless seeded; losses feel arbitrary |
| Rock-paper-scissors counters | Composition matters | Extra rules to learn; punishes players who cannot see the enemy (G05) |
| Instant deterministic resolution everywhere | Simple | Ground war is invisible; a region just changes hands |
| **Lanchester square law, flat strength; space instant, ground timed** | Plannable, replayable, watchable | Fewer surprises; larger force always wins |

## Decision

Each unit has a flat strength, no counters. The stronger side wins and keeps
√(1 − (L/W)²) of each stack; equal sides annihilate. Space combat resolves
instantly. Ground battles play the same law out over time (`dA/dt = −0.05625
× D`, `dD/dt = −0.025 × A`, with the garrison's +50%), so 10 attackers
against 10 defenders lose in about 21 s, reinforcements join and recompute
the end, and both sides' counts drain live on the map.

The author agreed with the reasoning: replays are identical (S5), and
outcomes can be planned, so losses feel fair.

## Consequences

No upsets: a weaker side cannot get lucky, so the game rewards scouting and
timing over gambling. Timed battles add a scheduled event type (G03) and
ally bookkeeping. Checks: `rules/war.test.ts` (the survivor formula; 10 vs
10 lasts about 21 s and leaves the instant result's survivors;
reinforcements); `rules/alliance.test.ts` (allies fight as one side); the
e2e test that a battle's counts drain live. The conqueror bot still wins
0% of stages in the latest sim report, judged a bot-play gap in balance
loop 3, not a combat rule.

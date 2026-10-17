# G11. New-player protection, respawn and the late-join boost

**Status:** Accepted (respawn and late-join boost in 7549419; protection cut
from 5 min to 1 min in 488872e, rules in b9258ae).
**Serves:** P6, P1, P3.

## Context

The world never ends (G06) and is always open, so players arrive at any
time against rivals who may be an hour ahead, and a conquered player could
be knocked out for good. Without help, the first minutes are a target and a
late arrival is hopeless.

## Options

| Option | For | Against |
|---|---|---|
| No help | Pure competition | New players are farmed; late joiners and the eliminated leave |
| Long protection (the earlier 5 min) | Very safe start | Shields a player through the whole opening; delays war for everyone |
| Close joining after a cutoff | Fair field | Breaks the showcase room, where visitors arrive at any time |
| **1 min protection, respawn on Earth, ×2 production for 5 min** | Safe first minute; nobody is out for good; late starts can catch up | Boost and respawn must be tuned so they help without being farmed |

## Decision

New and respawned nations are untouchable for 1 minute and cannot declare
war, with the timer visible. A nation that loses every region respawns on a
free Earth start region; while none is free, it waits. Anyone joining 5+
minutes into the world, and every respawn, gets ×2 production for the first
5 minutes.

The author's reasoning: it balances players who come in late, and helps
people establish themselves at the start of the game.

## Consequences

Stage rankings by gain (G06) work with the boost: a late joiner can top a
stage. Checks: `rules/war.test.ts` (war on or by a protected nation is
refused, then activates after 1 min); `rules/economy.test.ts` (protection
placed with the kit; a late joiner can top a stage); the sim's late joiner
target (25% of median score by 60 min: 26%, met, after loops 3 and 4) and
respawn target (holds a region 10 min on in 80% of runs: not measured, as
the latest runs had no eliminations).

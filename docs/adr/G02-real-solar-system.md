# G02. The real solar system as the theatre

**Status:** Accepted (orbits and Earth regions in 7549419; real imagery and
borders in 8a964fa; Spaceport gate and Earth-only starts in 2fa2325).
**Serves:** P4, P6, P10, P3.

## Context

The map shapes travel, pacing, visuals and how much the player cares about
what they hold.

## Options

| Option | For | Against |
|---|---|---|
| Invented or procedural star map | Free to tune distances and layouts | No real place to care about; the player conquers nothing they know |
| Real bodies, abstract travel (fixed hop times) | Recognisable, simple | Loses launch windows, so distance and time stop being a cost (P4) |
| **Real orbits, Hohmann travel, real Earth and real imagery** | Feels like the real thing; windows make timing a decision | Real geography is uneven, so fairness and pacing need rules of their own |

## Decision

Bodies orbit on real periods and semi-major axes. Travel takes the Hohmann
time, and launch energy carries a window penalty from 1x in the window to 3x
at worst, so Earth to Mars opens every 13 minutes. Every start is on one of
24 Earth regions built from real countries with their real Natural Earth
borders; each start's M + V + S sums to 3.3, so geography is flavour, not
advantage. Off-Earth regions are real IAU features. Every playable body
wears real imagery. The Spaceport (70 M, 25 A, 240 s) gates the way off
Earth, putting the earliest off-Earth claim at about 5 minutes.

The author's reasoning: good games have a magic circle the player steps
into (Huizinga's concept, brought to game design by Salen and Zimmerman,
*Rules of Play*, 2003). To hold it, the game needs to feel realistic, and so
connects with the player. It is also a visual spectacle, which adds to the
realism. It should really feel like you personally are conquering the real
solar system.

## Consequences

Real data costs build tooling (`scripts/worlds.ts`) and texture budget
(P8). Checks: `rules/fleets.test.ts` (Hohmann time, window penalty, launch
cost); `scripts/worlds.test.ts` (real cities in the right region, ocean in
none); `rules/economy.test.ts` (off-Earth starts refused); the sim's Earth
fairness and first colony targets. Balance loop 4 tuned the Spaceport so the
first colony lands at 7.3 min median, never before 5 (1ac5713).

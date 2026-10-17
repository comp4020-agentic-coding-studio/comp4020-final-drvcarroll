# G07. Six resources and seven buildings

**Status:** Accepted (cut from nine resources in 7549419; numbers tuned in
balance loop 1, 379d005, and loop 4, 1ac5713).
**Serves:** P1, P3, P6, P2.

## Context

The economy is where builders and traders grow (G01), and where every other
path gets its inputs. Too few resources and there is nothing to manage or
trade; too many and the economy becomes the whole game. An earlier draft had
nine resources and dual-mode buildings.

## Options

| Option | For | Against |
|---|---|---|
| Two or three resources | Learnable in seconds | No production chains, little to trade, nothing to optimise |
| Nine resources, dual-output buildings | Rich chains | Slow to learn; managing stocks becomes a full time job |
| **Six resources, one building each, plus a Spaceport** | Two short chains to optimise; gaps worth trading for; one icon per building | Some tension on four Earth slots, which balance had to tune |

## Decision

Energy, Metals, Volatiles, Alloys, Research and Materiel, each made by
exactly one building (Power Plant, Mine, Refinery, Foundry, Lab, Factory),
plus the Spaceport, which builds ships and Armies and gates the way off
Earth (G02). Alloys come from Metals; Materiel from Alloys and Volatiles;
Energy pays upkeep and launches. Industry tech raises yields, never gates a
building. Slots are 4 on Earth, 3 on large bodies, 2 on small.

The author's reasoning, from playtester feedback: there need to be enough
resources for a dynamic experience, and enough complexity that
micromanaging the economy brings real benefits, but not so much that
managing resources becomes a full time job.

## Consequences

Four start slots against six building types forces real choices, and
Replace exists so a full capital can change its mind (42e2946). Balance loop
1 found the early game starved (Lab upkeep draining Materiel, Mines too
weak, Alloys capping colony ships) and fixed it with data edits only, taking
met targets from 6 to 9 of 12. Checks: `rules/economy.test.ts` (the
analytic stock model, shortfall throttling, stocks never negative, replace
and demolish refunds); the sim's dead time target (0% in the first 30 min,
met) and deadlock target (95% reach Voidcraft 2, not yet all). Whether
managing it feels like a job is judged by playtest.

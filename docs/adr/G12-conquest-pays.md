# G12. Conquest pays: plunder and a capital Materiel trickle

**Status:** Accepted (2026-10-18; built in Stage G2).
**Serves:** P3, P6.

## Context

The Conqueror bot wins 0% of stages (target 10 to 35%). Cheaper Armies
(10 → 7 → 5 Materiel) moved it to 0, 0 and 1%; a weaker garrison bonus
(+50% → +25%) to 0%. Traced over 8 seeds, the Conqueror never grows in 4
(one region, peak 6 Armies): the start kit makes no Materiel, so after the
starting 50 it cannot train. In the other 4 it scores 125 to 325. Live
players hit the same wall ("Materiel-starved min 4 to 13", both playtests).
A captured region also pays only its 5 Territory and its output, while war
costs Armies, a minute's warning and protection timers.

## Options

| Option | For | Against |
|---|---|---|
| Cheaper Armies | One number | Measured: no effect without Materiel income |
| Weaker garrisons | Attacks succeed more | Measured: no effect; punishes defenders |
| Factory in the start kit | Uses an existing building | Loses the Refinery, starving Volatiles and the Factory itself |
| **Capital makes 2 Materiel/min; capture takes a share of the loser's stocks** | Every nation can train from the start; war is a growth route, not only a cost | Capital is the one building-free output; plunder can snowball (watch the 40% leader-share target) |

## Decision

The user chose: "capturing should give you their stockpiles", plus a trickle
of Materiel at the start. A capital produces `ECONOMY.capitalMt` (2)
Materiel per minute on its own. Conquering a region moves
`MILITARY.plunder` (25%) of the loser's stock of every resource, scaled by
that region's share of the loser's regions, to the conqueror (capped at
the conqueror's stock cap). The Conqueror bot trains with any Materiel on
hand and declares war at 4 Armies on a neighbour with fewer.

## Cost

One exception to "one resource per building" (§5). Plunder rewards the
leader too, so the snowball and stage-sweep targets are rechecked with it.

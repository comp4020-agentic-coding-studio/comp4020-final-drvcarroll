# Balance log

Stage G loop (game-design.md §13): run `pnpm sim:test`, pick one problem,
change one number in `rules/data/`, rerun, record before and after here.

## Baseline, 2026-10-02 (Stage B harness, no tuning yet)

24 seasons × 60 min, 6 bots + a late joiner at 30 min.

| Target | Want | Measured | Met |
|---|---|---|---|
| Thrust Vectoring researched | ~2 min | 6.5 min (median) | no |
| First off-Earth colony | 4 to 7 min | never (median) | no |
| First Mars colony | 12 to 25 min | never (median) | no |
| Dead time, first 30 min | < 20% | 1% | yes |
| Deadlock: reaches Voidcraft 2 | every sensible bot | 10% | no |
| Strategy win rates | each 10 to 35% | expander 17%, builder 25%, trader 25%, conqueror 13%, researcher 17%, random 4% | no |
| Snowball: leader share at 30 min | < 40% | 29% (median) | yes |
| Late joiner (at 30 min) vs median | >= 25% by 60 min | 102% (median) | yes |
| Respawn holds a region 10 min on | 80% of runs | 3/3 | yes |
| Season length | threshold at 50 ± 10 min, or the cap | 0/24 hit the threshold; ends 60.0 min (median) | yes |
| Progression | winner ~10 rungs; no ladder done < 40 min | winner tech score 6.0; first ladder done never | yes |
| Earth fairness | every start M+V+S = 3.3 | all 3.3 | yes |

**Read:** the early game is Alloy-starved. A first colony needs 60 A
(Spaceport 20 + Colony Ship 40) against a 30 A kit and 2 A/min per
Foundry, and Foundries compete for the four full start slots. No colony
lands in 60 min, Materiel drains (Armies, Lab upkeep) and throttles Labs,
so Voidcraft 2 is rarely reached. First candidate edits: more Alloys in
the starting kit, or a cheaper Colony Ship.

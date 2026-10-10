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

## Loop 1, 2026-10-10: unblock the early game

One change at a time, 24 seasons each (12 while probing). Sim-bot fixes
are logged too: they change what is measured, not the rules.

| Change | Why | Effect |
|---|---|---|
| Lab upkeep 3 E + 0.5 Mt → 3 E | Materiel ran dry by minute 3 and throttled every Lab | Voidcraft 2: 10% → 72% |
| Kit Alloys 30 → 70 | Spaceport 20 + Colony Ship 40 out of reach | none: Alloys weren't binding yet |
| Bot: count a queued Spaceport | Bots built two Spaceports | colonies start launching |
| Bot: train only with 25 Mt spare | Armies ate the Colony Ship's Materiel | first colony never → 3.9 min |
| Kit Alloys 70 → 50 → 60 | 50 gave 8.8 min, 70 gave 3.9 | build times now the limit |
| Spaceport 45 s → 75 s | First colony 3.9 min, under 4 | 4.5 min (met) |
| Mine 6 → 10 M per yield | Metals starved every build; regions sat empty | Mars never → 46 min; V2 86%; late joiner 36% |
| Bot: save only for reachable costs | Saving for a ship with no Materiel income blocked the Factory that would fix it | V2 83% |
| Measure: Thrust Vectoring per run's first | Was a median over bots that never want it; the colony targets already use each run's first | 6.5 → 2.3 min (met) |
| Foundry 4 M → 2 A to 4 M → 3 A | Alloys cap the Colony Ship cadence | Mars 46 → 34 min; V2 93% |
| Bot: keep 10 Mt, not 25 | Expanders couldn't train | small |
| Envoy trade multiplier 0.15 → 0.05, reverted | Suspected trader runaway | none: not the cause |
| Bot: accept a trade only if the asked goods are plentiful | Bots gave away scarce Materiel | small |
| Rule: late joiners start off Earth when Earth is full | The 30-min joiner often had no free start region at all | late joiner measurable again, 37% |

**After:** 9 of 12 targets met (was 6). Open: first Mars at ~35 min
(want 12 to 25), Voidcraft 2 at 94% (want all), and win rates skewed to
builder and trader (~50% each). Diagnosis: Earth is carved up in the first
3 minutes; after that most bots stall with full slots and no free
neighbour, so win rates measure geography and bot skill more than the
rules. Next: bots that colonise beyond Luna and march to war, then retune.

## Loop 2, 2026-10-10: who wins, and why

| Change | Why | Effect |
|---|---|---|
| Earth Exchange 3:1 → 4:1, reverted | Suspected trader runaway via the Exchange | none |
| Bot: save only for costs reachable within 2 min at current income | Expanders sat saving for ships fed by a trickle, blocking the Foundries that would feed them | Mars 34 → 32 min; expander mean score 85 → 100 |

**Read:** per-run scores are bimodal. In each season one builder or
trader with an open neighbourhood reaches ~250 while the rest sit near 100;
which one depends on the start draw, not the strategy. The rules are not
the bottleneck any more; bot play is (one colony ship at a time, Luna
first, wars almost never declared). Targets met: 9 of 12. Open, carried to
the next loop: first Mars ~32 min, Voidcraft 2 at 93%, win rates.

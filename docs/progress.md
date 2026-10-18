# Progress

**Stage:** G1 met (second `/playtest` 2026-10-18). A to H, D2 to D4 met.
G loops 5 and 6 logged in docs/balance-log.md.
**Last verified checkpoint:** 2026-10-18. `pnpm typecheck`, `pnpm test:rules`
(79), `pnpm test:server` (20), spec (9), `pnpm sim:test` (2; dead time 10%,
researcher 17%). e2e 14 of 17 in one run: the G1 tests pass; the battle
drain and pending-command tests time out in the full run and pass alone
(see flagged). Every §13 row cites a check that exists.
The harness is in the repo: `.claude/skills/` (comp4020_resume,
comp4020_update, playtest), `.claude/agents/` (playtester, analyst),
`scripts/play.ts`. ADRs S01 to S11 and G01 to G11 in `docs/adr/`.
**Next:** the final README.md/PROCESS.md pass (Target: done, end of week
12). The `/playtest` loop is spent for this target (two cycles). Its five
open ACT items are in balance-log.md Loop 6; fold them in with
`comp4020_update` before the next crit, if time allows.
**Flagged assumptions:** e2e tests time out under host load in a full run
(swiftshader WebGL); each passes alone. Rerun on an idle machine before
calling e2e green. Settled calls live in game-design.md §14 (incl. G1's:
Replace is P1's first build, Earth-wide Army counts are intended vision);
foreign fleets/offers stay `INVALID` (§14.5, S07); a vision-opening tick
gets the welcome budget (S11).
**Last updated:** 2026-10-18 (G1 met, playtest 2 logged).

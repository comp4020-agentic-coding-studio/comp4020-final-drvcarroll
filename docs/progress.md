# Progress

**Stage:** H (evidence) met. A to H, D2 to D4 met their exit criteria.
G loop 4 logged in docs/balance-log.md.
**Last verified checkpoint:** 2026-10-17. `pnpm typecheck`, `pnpm test:rules`
(77, incl. `scripts/claims.test.ts`), `pnpm test:server` (20), spec (9).
e2e: 15 to 16 of 17 under load (see flagged). Every §13 row cites a check that exists (`scripts/claims.test.ts`).
The harness is in the repo: `.claude/skills/` (comp4020_resume,
comp4020_update, playtest), `.claude/agents/` (playtester, analyst),
`scripts/play.ts`. ADRs S01 to S11 and G01
to G11 in `docs/adr/`. The game is named Interstellar Expansion.
**Next:** Stage G1 (build-process.md G1): the first `/playtest`'s ACT
items, folded in 2026-10-18. Read balance-log.md Loop 5, game-design.md
§12 Selection panel (Replace, fleet) and §14 (dead time, Earth vision),
system-design.md §14.4 `Battle` and §14.5 Results. Order: `play.ts` battle
id and colonise targets, rejection reasons, Replace warning, sim dead-time
measure, then data edits one at a time (`SCORE.techPer` is new in
`rules/data/victory.ts`, default 1). Then the second `/playtest`, then the
final README.md/PROCESS.md pass (Target: done, end of week 12).
**Flagged assumptions:** (G1) a Replace counts as P1's first build (user,
2026-10-18), so the 4-building kit stays. Rival Army counts across Earth are
intended vision (P5), not a leak. The playtest's "Battle at undefined" is
`play.ts` reading `b.region` where the protocol has `id`.
e2e onboarding times out under host CPU load
(swiftshader WebGL; load avg 8 on 2026-10-17, VPN at 136%): every failure was
a "stable" wait at the start screen, and each test passes alone. Rerun on an
idle machine before calling e2e green. Settled calls from earlier stages live
in game-design.md §14; foreign fleets/offers stay `INVALID` (§14.5, S07);
a vision-opening tick gets the welcome budget (S11).
**Last updated:** 2026-10-18 (playtest 1 folded in as G1).

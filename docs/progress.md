# Progress

**Stage:** H (evidence) met. A to H, D2 to D4 met their exit criteria.
G loop 4 logged in docs/balance-log.md.
**Last verified checkpoint:** 2026-10-17. `pnpm typecheck`, `pnpm test:rules`
(77, incl. `scripts/claims.test.ts`), `pnpm test:server` (20), spec (9).
e2e: 15 to 16 of 17 under load (see flagged). Every §13 row cites a check that exists (`scripts/claims.test.ts`).
The harness is in the repo: `.claude/skills/` (comp4020_resume,
comp4020_update), `.claude/agents/` (playtester, analyst),
`.claude/workflows/playtest.js`, `scripts/play.ts`. ADRs S01 to S11 and G01
to G11 in `docs/adr/`. The game is named Interstellar Expansion.
**Next:** deploy (system-design.md §12; `/comp4020:ship` checks the live
URL), then run `/playtest` once and apply build-process.md's G loop rule:
ACT items via `comp4020_update`, LOG items open in docs/balance-log.md. Then
the final README.md/PROCESS.md pass (Target: done, end of week 12).
**Flagged assumptions:** e2e onboarding times out under host CPU load
(swiftshader WebGL; load avg 8 on 2026-10-17, VPN at 136%): every failure was
a "stable" wait at the start screen, and each test passes alone. Rerun on an
idle machine before calling e2e green. Settled calls from earlier stages live
in game-design.md §14; foreign fleets/offers stay `INVALID` (§14.5, S07);
a vision-opening tick gets the welcome budget (S11).
**Last updated:** 2026-10-17 (Stage H done).

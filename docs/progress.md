# Progress

**Stage:** H (evidence) next. A to G, D2 to D4 met their exit criteria
(D4 unit 3, admin reset: 49677d0). G loop 4 logged in docs/balance-log.md.
**Last verified checkpoint:** 2026-10-17. `pnpm typecheck`, `pnpm test:rules`
(71), `pnpm test:server` (11), spec (8) green. The harness is in the repo:
`.claude/skills/` (comp4020_resume, comp4020_update), `.claude/agents/`
(playtester, analyst), `.claude/workflows/playtest.js`, `scripts/play.ts`.
ADRs S01 to S10 and G01 to G11 in `docs/adr/`. The game is named
Interstellar Expansion.
**Next:** Stage H's rest (build-process.md): authorisation, contention,
accounts and logging are green (server.test.ts, rules/authorisation.test.ts), and purity (rules/purity.test.ts).
Left: sync/sizes spec bound (S05, S3; §14.6), client
e2e rows (reconnect < 3 s, no optimistic UI). Then every §13 row cites an
existing check; then deploy and run `/playtest` once (G loop rule).
**Flagged assumptions:** none open. Settled calls from earlier stages live
in game-design.md §14; foreign fleets/offers stay `INVALID` (§14.5, S07).
**Last updated:** 2026-10-17 (harness into the repo, ADRs, Stage H staged).

# Progress

**Stage:** H (evidence) next. A to G, D2 to D4 met their exit criteria
(D4 unit 3, admin reset: 49677d0). G loop 4 logged in docs/balance-log.md.
**Last verified checkpoint:** 2026-10-17. `pnpm typecheck`, `pnpm test:rules`
(71), `pnpm test:server` (11), spec (8) green. The harness is in the repo:
`.claude/skills/` (comp4020_resume, comp4020_update), `.claude/agents/`
(playtester, analyst), `.claude/workflows/playtest.js`, `scripts/play.ts`.
ADRs S01 to S10 and G01 to G11 in `docs/adr/`. The game is named
Interstellar Expansion.
**Next:** Stage H in build-process.md, Crit 10's part first: the
contention test (two same-tick claims; `RATE_LIMIT` at 11), authorisation
tests (`NOT_OWNER` on another's region, others' fleets and offers, admin
404s, foreign `Origin`, 4002), accounts (429 after 5, cookie flags, hashes
only) and logging (login/logout/connect lines carry `user`, no secrets,
`idle`). Then purity, sizes and the client rows. Read system-design.md §13
(the owed rows), §9, §11, §14.3, §14.5, and docs/adr/S03, S07, S09. Then
deploy, and run `/playtest` once (build-process.md G loop rule).
**Flagged assumptions:** acting on another nation's fleet or offer returns
`INVALID` "Unknown fleet/offer", not `NOT_OWNER` (it looks like it doesn't
exist to you, which leaks nothing): decide in Stage H and make §14.5 match.
`NOT_JOINED` reads "Join the season first" in code, "Join the world first"
in §14.5: make the code match. Settled calls from earlier stages now live
in game-design.md §14.
**Last updated:** 2026-10-17 (harness into the repo, ADRs, Stage H staged).

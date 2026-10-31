# Progress

**Stage:** G2 met (conquest pays). A to H, D2 to D4, G1 met.
G loops 5 to 7 logged in docs/balance-log.md.
**Last verified checkpoint:** 2026-10-18. `pnpm typecheck`, `pnpm test:rules`
(80), `pnpm test:server` (20), spec (9), `pnpm sim:test` (2; conqueror 10%,
Mars 22.5 min, dead time 4%). e2e 14 of 17 in one run: the G1 tests pass; the battle
drain and pending-command tests time out in the full run and pass alone
(see flagged). Every §13 row cites a check that exists.
The harness is in the repo: `.claude/skills/` (comp4020_resume,
comp4020_update, playtest), `.claude/agents/` (playtester, analyst),
`scripts/play.ts`. ADRs S01 to S11 and G01 to G11 in `docs/adr/`.
**Next:** Stage I, chat (build-process.md I; read game-design.md §9 Chat,
system-design.md §4, §6 visibility tier, §14.3). The user is editing
README.md and PROCESS.md: don't touch them. Open balance items: balance-log.md Loop 6 (playtest 2) and Loop 7
(researcher 6%, late joiner 15%), via `comp4020_update` next crit.
**Flagged assumptions:** (I) 280 characters, 5 per 10 s, 50 per channel
on connect and 200 kept are my numbers; direct messages are open across
war and sanctions; an alliance channel's history shows to a new member. (G2) plunder 25%, scaled by the region's share
of the loser's regions, and a 2 Mt/min capital trickle are my numbers for
the user's "their stockpiles" and "a trickle". e2e tests time out under host load in a full run
(swiftshader WebGL); each passes alone. Rerun on an idle machine before
calling e2e green. Settled calls live in game-design.md §14 (incl. G1's:
Replace is P1's first build, Earth-wide Army counts are intended vision);
foreign fleets/offers stay `INVALID` (§14.5, S07); a vision-opening tick
gets the welcome budget (S11).
**Last updated:** 2026-10-31 (Stage I, chat, scoped).

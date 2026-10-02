# Progress

**Stage:** A — Rules engine and data (`rules/`)
**Last verified checkpoint:** `rules/data/` holds every number in
`game-design.md` (map, economy, military, tech, victory), with tests green
(`pnpm test:rules`). No engine logic yet.
**Next:** `rules/state.ts` + `rules/economy.ts` + `rules/advance.ts`: state
shape, rates and the shortfall rule, `advanceTo` with stock-depletion
events, then `join`/`build` through `apply`. Then orbits/fleets, combat and
war, trade and Envoys, `observe`, `legalActions`. **Crit 8 is next week**:
Stage A done, Stage B harness running, Stage C full, Stage D slice (see
"Crit calendar" in `build-process.md`).
**Flagged assumptions** (numbers missing from `game-design.md`, all in
`rules/data/`, sim-tunable):
- Envoy upkeep 3 E/min (`economy.ts`).
- Research takes 15 s × rung after paying its cost (`tech.ts`).
- Trade offers expire after 5 min (`victory.ts`).
- Season threshold 300 points, first guess (`victory.ts`).
- Launch to a Terrestrial body costs 10 E/mass, like Cislunar (`military.ts`).
- Torch Ships' "almost none" window penalty = coefficient 0.2 (`tech.ts`).
- Tech bonuses stack additively (`tech.ts`).
- Colour clash = RGB distance < 60 (`victory.ts`).
- Off-Earth region names and asteroid J2000 longitudes are invented or
  approximate (`map.ts`).
**Last updated:** 2026-10-02, resume session.

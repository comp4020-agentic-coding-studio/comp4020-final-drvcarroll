# Progress

**Stage:** A — Rules engine and data (`rules/`)
**Last verified checkpoint:** `rules/data/` holds every number; the engine
core is in: `apply`/`advanceTo`/`validate` (`rules/index.ts`), rates and the
shortfall rule (`economy.ts`), the analytic event loop with depletion events
(`advance.ts`), scores and season end, and the economy commands (setEmpire,
join, build, demolish, cancelBuild, setMode, research, cancelResearch,
train). Orbits and fleets (`orbit.ts`, `fleets.ts`): positions, Hohmann
time, window penalty, launch energy, buildShip, launch, arrival with the
first-arrival colonise rule. War (`war.ts`): declare/activate/peace,
protection, Lanchester space combat on arrival, activation and ship
completion, invasion with orbital superiority, ground combat by march,
capital moves, elimination, respawn. Tests green: stocks never negative,
deterministic replay, combat outcomes.
**Next:** trade (offer/accept with escrow and delivery, gift, Earth
Exchange, Trade Multiplier) and Envoys. Then `observe` (vision filter),
`legalActions`; that closes Stage A. **Crit 8 is next week**:
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
- Cancelling a build or research refunds in full (only demolish is 50%).
- "Late join" boost goes to anyone joining 5+ min into the season.
- Launching needs no Spaceport at the origin, only ships in orbit there.
- Armies launched off a body come from your garrisons there, in region-id
  order.
- A march onto a region no longer valid on arrival returns home (or is lost
  if home fell).
- Combat with 3+ nations in one orbit resolves pairwise, lowest owner ids
  first. Army cargo has no space strength.
- A capital moves to the remaining region with the most buildings, then
  slots, then lowest id. A conquered region's build queue is lost.
- Respawn resets stocks to the starting kit.
- Off-Earth region names and asteroid J2000 longitudes are invented or
  approximate (`map.ts`).
**Last updated:** 2026-10-02, resume session.

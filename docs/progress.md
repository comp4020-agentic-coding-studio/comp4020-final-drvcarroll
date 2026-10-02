# Progress

**Stage:** B — Headless sim and balance (`sim/`). Stage A done.
**Last verified checkpoint:** Stage A exit criteria met (`pnpm test:rules`,
46 tests): `apply`/`advanceTo`/`observe`/`legalActions` (plus `validate`)
are pure and exported from `rules/index.ts`; every balance number lives in
`rules/data/`; stocks never go negative, replay is deterministic (also
through a JSON snapshot), Lanchester combat has no randomness. Every
command in system-design.md §14.5 is implemented; `observe` applies the
§11 vision filter (sensors, Envoys, fog).
**Next:** Stage B: `sim/` runner jumping between decision points, the six
bot archetypes (Expander, Builder, Trader, Conqueror, Researcher, Random),
`pnpm sim:test` reporting every balance target in game-design.md §13 with
real numbers (tuning is Stage G). Then Stage C (server). **Crit 8 is next week**:
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
- Off-Earth trades need no Freighter trip modelled: the sender must own
  enough Freighters for the goods (500 each), and delivery takes the
  capital-to-capital Hohmann time.
- The Earth Exchange settles instantly.
- An Envoy recalls when its owner's Energy stock runs dry.
- Respawn resets stocks to the starting kit.
- Off-Earth region names and asteroid J2000 longitudes are invented or
  approximate (`map.ts`).
**Last updated:** 2026-10-02, resume session.

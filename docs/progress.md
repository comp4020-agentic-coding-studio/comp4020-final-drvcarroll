# Progress

**Stage:** D done, E (visual fidelity) largely done (build-process.md).
A done, B harness running, C done.
**Last verified checkpoint:** the client is a full-screen Three.js solar
system with a glass HUD (game-design.md §12, goals.md P10):
- Map: Google-Maps navigation, fly-to and follow, Voronoi region patches
  with owner tints; procedural opaque surfaces per body (oceans, clouds,
  craters, bands, ice, volcanoes, city lights), atmospheres, rings, bloom;
  radius^0.75 sizes, wider orbits.
- A busy system: GPU-orbited asteroid belt (Kirkwood gaps), Trojans,
  Kuiper belt; dwarf planets and minor moons in real order; six comets on
  real Kepler orbits with tails (`scene/decor.ts`, `scene/layout.ts`).
- HUD: top bar totals with +X/day buttons opening per-source breakdowns
  (`economy().lines`); left empire bar (regions by body, dropdown slots and
  per-day output/upkeep, fleets, goals, all bodies); right selection panel;
  bottom news ticker; Tech/Empires/Trade drawers; phone bottom sheets.
`pnpm test` (63) and `pnpm test:e2e` (6, headless Chrome) green. `pnpm dev`
serves it on :8080. Screenshots: a scratch Playwright script (untracked).
**Next:** the user plays it and reports. Crit 8 still needs README
(400–600 words), PROCESS.md (user's), deploy to fly.dev, repo public at the
cutoff. `reflections/crit-8.md` is the user's. Balance: the early game is
Alloy-starved (docs/balance-log.md).
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
- Sim "dead time" counts decision points where no build, research, train,
  ship, launch, colonise, invade, march, war, Envoy or trade-accept is legal.
- A nation choosing its start sees Earth start-region owners (documented).
- Respawn resets stocks to the starting kit.
- Off-Earth region names and asteroid J2000 longitudes are invented or
  approximate (`map.ts`).
**Last updated:** 2026-10-03.

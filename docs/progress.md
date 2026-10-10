# Progress

**Stage:** D2 (playtest HUD revision) done. A, C, D done; E largely done;
B harness running; G ongoing (build-process.md).
**Last verified checkpoint:** D2 per game-design.md §11–12:
- SVG icons for resources (aria-label + tooltip), buildings, Power Plant
  modes, ships and Armies (`client/src/ui/icons.tsx`); no resource letters
  left in the HUD (e2e scans for them).
- Selection panel with no tabs: slot grid, tile menu (replace, upgrade,
  demolish; Spaceport builds ships and Armies), Forces here (garrison,
  train, march, orbit, inbound, last battle). Atomic `replace` command with
  a pinned slot (rules). Space battle news refs carry the body.
- Empire menu: Territory, Armies (incl. marches, new `PrivateState.marches`),
  Fleets, Tech tree (four-column overlay, only the next rung researchable).
- Empires overlay: rank, war status, Envoy, trade deals per nation, Earth
  Exchange. Tech/Trade drawers removed.
- The Guide (`ui/Guide.tsx`): nine pages, numbers from `rules/data/`, top
  bar button or `?`; goals and empty states link to it.
`pnpm test` (66, needs a server on a fresh `DATA_DIR`), `pnpm test:e2e` (8),
`pnpm sim:test` (2) green.
**Next:** Stage E2 (build-process.md E2; read game-design.md §4 Earth and
Off-Earth, §12 "The command console look", "Rendering", "Regions on the
surface"; system-design.md §2, §3, §8). Start with the real-worlds half:
`scripts/worlds.ts`, country/province membership and gazetteer
coordinates in `rules/data/map.ts`, then the region-map shader and
picking. Crit 9's keyboard-only pass (Stage D full) must still land before
week 10. Balance: early game Alloy-starved (docs/balance-log.md).
**Flagged assumptions** (E2: Psyche keeps a procedural look, no global
map exists; greyscale USGS mosaics are colourised and gaps filled; the
US, Russia and China splits follow the lines in game-design.md §4; borderline
countries (Turkey, the Caucasus, Greenland, Mongolia, Pakistan) are
assigned in `map.ts` by the existing region names and adjacency; gas-giant
orbital regions become bands. D2: the user's "garrison" building = the Spaceport;
"upgrade" = Power Plant modes, other buildings upgrade via Industry rungs;
single-slot produce/consume = the region's flows for that type ÷ its count.
Numbers missing from `game-design.md`, all in
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
- Asteroid J2000 longitudes are approximate (`map.ts`). Off-Earth region
  names are IAU features; E2 replaces invented ones and their placement.
**Last updated:** 2026-10-10 (E2 scoped).

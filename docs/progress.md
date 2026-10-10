# Progress

**Stage:** E done: Envoy beacons (amber pip on the host capital's labels,
sender only), quality tiers with auto step-down and a Graphics menu item
(system-design.md §8), P8 judged in docs/checks.md (60 fps, ~210 MB on an
M4). D full done (keyboard-only core loop at both viewports). F done.
Next: G loops.
**Last verified checkpoint:** E2 per game-design.md §4, §12:
- `pnpm worlds` (`scripts/worlds.ts`) builds `client/public/worlds/`:
  region maps (Earth from Natural Earth countries and admin-1 per
  `EARTH_MEMBERS`; others a weighted Voronoi on gazetteer features in
  `map.ts`) and WebP tiers (512 / 2K, Earth 4K day) from Solar System
  Scope, USGS and Commons; tinted and gap-filled. Sources cache in
  `.cache/worlds/` (~2 GB, gitignored).
- Client draws, borders and picks regions from the maps
  (`scene/worlds.ts`); textures stream after 2 s, focused body at top tier;
  gas-giant regions are orbital bands (`layout.ts` BANDS).
- Gunmetal command console in `app.css`; Rajdhani and Share Tech Mono
  self-hosted; designation strips; credits in the Guide and user menu.
`pnpm test` (71, needs a server on a fresh `DATA_DIR`), `pnpm test:e2e`
(13, incl. first render < 3 MB and the keyboard loop, which runs last so
earlier players aren't late joiners), `pnpm sim:test` green.
**Next:** Stage G loops (Mars time, Voidcraft 2, win-rate spread;
docs/balance-log.md), one `rules/data/` or bot change at a time with
`pnpm sim:test`, each logged. A real-phone fps check is owed before
Crit 10 (needs the user's phone). F detail:
`server/log.ts` lines and stats; `/admin` for `ADMIN_USERS` (set the Fly
secret before Crit 10); `pnpm load` writes docs/measurements.md (all met);
docs/checks.md holds judged checks.
**Flagged assumptions** (E2: Psyche and Ceres stay procedural, no
usable global albedo map; Titania, Oberon and Triton gaps are filled from
mirrors and column blends and look smeared up close; Triton's map keeps
USGS's own fill; GPU memory with Earth focused is ~175 MB by arithmetic,
not measured; borderline countries assigned in `EARTH_MEMBERS`; Triton
feature coordinates approximate. D2: the user's "garrison" building = the Spaceport;
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

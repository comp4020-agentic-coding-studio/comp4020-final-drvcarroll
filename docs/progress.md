# Progress

**Stage:** D3 done; D4 next. Every earlier stage met its exit criteria
(G loop 4 logged in docs/balance-log.md).
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
**D3 done** (b9258ae, 974a928, 1ac5713, 099ba6e and the fix after): 1 min
protection; Earth-only starts with `EARTH_FULL`; Spaceport 70 M, 25 A,
240 s (loop 4: first colony 7.3 min, never before 5); timed ground battles
(`battleCounts`, `battle` event, reinforcements, one attacker per region),
rules v2; battles and marches in `VisibleWorld`, vision-gated; map army
badges, march markers and an SVG swords marker on battles; Battle panel
with draining bars; Declare war in place; Empire menu as Territory,
Military, Research. `pnpm test` 77, `pnpm test:e2e` 14 (on an idle
machine; under load single tests stall), `pnpm sim:test` green.
Screenshots judged: battle bars and swords icon fixed after the first look.
**Next:** Stage D4 (build-process.md D4). Read game-design.md §7 Combat, §9 Alliances and sanctions, §10, §11 Admin reset, §12 Top bar and
Empires; system-design.md §4 (stages), §9 Admin, §11 reset, §14.2, §14.4,
§14.5. Data edits pending: `SEASON.lengthS` and `lateJoinCutoffS` go,
new `SEASON.stageS` 1200; `SCORE.categoryCap` and `threshold` go; new
`STAGES` table (game-design.md §10); new `ALLIANCE.maxMembers` 4.
**Flagged assumptions** (D4: stage length 20 min, ranking by gain, and
allies keep their own wars, all chosen by the user. Stage modifiers and
their numbers are first guesses for the sim to tune. "Combine forces" =
one side per orbit and per ground battle, losses shared in proportion.
Sanctions block player trade only, not the Exchange or Envoys. Reset ends
the world with no winner; names and colours carry over. The admin
password is hardcoded at the user's request. Code keeps the `Season` and
`seasons` names for the world. D3: "safe cooldown" = protection, both new and
respawned nations; the ×2 boost stays 5 min. "Battle going on" = ground
combat only; space combat stays instant with its orbit flash. Battle speed
0.025/s is a first guess so a typical fight lasts 15 to 30 s. Marches leave
`PrivateState` for `VisibleWorld` so rivals see Armies coming. Research
dropdown shows each ladder's next rung; the full tree stays an overlay.
"A little more expensive" alone can't hold a 5 min floor (the Exchange
converts starting Energy into Alloys), so the Spaceport's build time is
the floor and its cost makes a Foundry worth building first. With
Earth-only starts, a full Earth means no new joins or respawns until a
start region frees up (rare: 24 start regions, at most 24 nations).
E2: Psyche and Ceres stay procedural, no
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
**Last updated:** 2026-10-15 (D3 done and verified; D4 next).
Earlier: 2026-10-14 (D3 staged: visible war, 1 min protection,
three-dropdown menu).
Earlier: 2026-10-10 (D, E done; G loop 3).

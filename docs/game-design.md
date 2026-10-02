# Game design

Source of truth for mechanics, visuals and balance testing. Every number here is
a starting value; the headless sim (§13) tunes them. Numbers live in code in
one data module (`rules/data/`), so tuning is a data edit, never a rule edit.

## 1. The idea

**Grow is the core human drive, and the game is built to let it out in
whatever shape a player wants.** The player is dropped into a solar system and
builds an empire across it however they see fit: conqueror, trader, builder,
researcher, or any mix. The solar system is the theatre; the game mechanics
are the mechanisms.

Growth is measured three ways, not one: **Territory**, **Economy**, and
**Tech**. Nothing forces which you chase. Military and trade are instruments
toward those three, never scores in themselves: a fleet that never takes
ground is worth nothing, and a trade surplus only matters once it's spent on
something that grows one of the three.

Part of that world is a harsh one. Territory you don't hold, and haven't paid
to watch, is a blank on your map, exactly like space nobody has claimed yet.
What you can see of your rivals, and what you choose to go and find out, is
itself a choice, not a given.

Every mechanic is held to three tests:

1. Does it serve Territory, Economy or Tech, directly or as an instrument
   (military, trade, production, exploration) toward one of them?
2. Can a new player do something meaningful in their first minute, and see
   another player's effect live within ten?
3. Does it keep the analytic time model (§3) intact, so outcomes never depend
   on a loop running?

## 2. Pace and orbits

| Rule | Value |
|---|---|
| Game clock | **1 game day = 1 real second** (1 game year ≈ 6 min), starting 1 Jan 2050 |
| Orbits | Circular, coplanar, real periods and semi-major axes |
| Positions | Pure function `position(body, t)`; never stored |
| Moons | Share their parent's heliocentric position for travel purposes |

| Thing | Real | In game |
|---|---|---|
| Luna orbit | 27 days | 27 s |
| Mercury orbit | 88 days | 88 s |
| Mars orbit | 687 days | 11.5 min |
| Earth→Mars window | every 780 days | every 13 min |
| Jupiter orbit | 12 yr | 72 min |
| Neptune orbit | 165 yr | 16.5 h |

## 3. Time model (analytic)

The Fly machine auto-stops when idle, so outcomes cannot depend on a running
loop. State is a snapshot plus rates plus a queue of scheduled events. The
server's 500 ms tick (system-design.md §5) only sets when commands apply and
when updates are sent; an event due at 12.3 s resolves as of 12.3 s.

- **Stocks:** `stock(t) = min(cap, stock₀ + rate × (t − t₀))`. Rates are
  constant between events.
- **Events:** building complete, unit complete, fleet arrival, war becomes
  active, protection ends, **stock depleted** (scheduled at
  `t = stock ÷ −rate` when a rate is negative).
- **Processing:** on any read or command, due events are applied in order of
  time, then event id. Deterministic.
- **Shortfall:** when a consumed stock hits zero, every consumer of it runs at
  supply ÷ demand from then on.
- **Invariant:** stocks never go negative. Spends are checked at command time;
  drains are throttled at depletion.

## 4. Map

25 bodies and 74 regions. Each region has building slots and yield multipliers
for Metals (M), Volatiles (V) and Solar (S). Solar output off Earth is
`10 × 1/d²` (d in AU). **Body control:** owning every region of a body gives
+25% to all yields there.

### Zones (reach is a cost curve, not a gate — §7)

| Zone | Bodies |
|---|---|
| Terrestrial | Earth, Antarctica |
| Cislunar | Luna |
| Inner | Mercury, Venus, Mars, Phobos, Deimos |
| Belt | Ceres, Vesta, Psyche |
| Jovian | Jupiter orbital, Io, Europa, Ganymede, Callisto |
| Saturnian | Saturn orbital, Titan, Enceladus |
| Outer | Uranus orbital, Titania, Oberon, Neptune orbital, Triton, Pluto |

### Off-Earth bodies

| Body | Regions | Slots | M | V | Notes |
|---|---|---|---|---|---|
| Luna | 4 | 3 | 1.0 | 0.5 | Fusion-mode Energy bonus |
| Mercury | 2 | 3 | 2.0 | 0.2 | Solar ×6.6 |
| Venus | 2 | 2 | 0.8 | 1.5 | Cloud-top cities |
| Mars | 8 | 3 | 1.2 | 1.0 | The prize |
| Phobos | 1 | 2 | 1.2 | 0.3 | |
| Deimos | 1 | 2 | 1.0 | 0.3 | |
| Ceres | 2 | 2 | 1.0 | 2.0 | Ice |
| Vesta | 1 | 2 | 2.0 | 0.2 | |
| Psyche | 1 | 2 | 3.0 | 0.1 | Metal world |
| Jupiter orbital | 2 | 2 | 0 | 1.0 | Fusion-mode Energy bonus |
| Io | 2 | 3 | 1.5 | 0.5 | |
| Europa | 3 | 3 | 0.5 | 3.0 | Subsurface ocean |
| Ganymede | 3 | 3 | 1.0 | 2.0 | |
| Callisto | 3 | 3 | 1.0 | 1.5 | |
| Saturn orbital | 2 | 2 | 0 | 1.0 | Fusion-mode Energy bonus |
| Titan | 4 | 3 | 0.5 | 3.0 | |
| Enceladus | 1 | 2 | 0.2 | 3.0 | Subsurface ocean |
| Uranus orbital | 1 | 2 | 0 | 1.0 | Fusion-mode Energy bonus |
| Titania | 1 | 2 | 1.0 | 1.5 | |
| Oberon | 1 | 2 | 1.0 | 1.5 | |
| Neptune orbital | 1 | 2 | 0 | 1.0 | Fusion-mode Energy bonus |
| Triton | 2 | 2 | 0.8 | 2.0 | |
| Pluto | 1 | 2 | 0.5 | 2.0 | |

### Earth: 24 start regions plus Antarctica

Grouped from Natural Earth country borders. Slots 4. **Fairness rule:** every
start region's M + V + S sums to 3.3, so geography is flavour, not advantage.

| Region | M | V | S |
|---|---|---|---|
| Canada | 1.3 | 1.3 | 0.7 |
| US West | 1.2 | 0.9 | 1.2 |
| US East | 1.1 | 1.1 | 1.1 |
| Mexico & Central America | 1.1 | 1.0 | 1.2 |
| Brazil | 1.1 | 1.1 | 1.1 |
| Andean States | 1.4 | 0.7 | 1.2 |
| Southern Cone | 1.2 | 1.1 | 1.0 |
| Western Europe | 1.0 | 1.3 | 1.0 |
| Northern Europe | 1.2 | 1.4 | 0.7 |
| Eastern Europe | 1.2 | 1.2 | 0.9 |
| Western Russia | 1.2 | 1.4 | 0.7 |
| Siberia | 1.6 | 1.2 | 0.5 |
| North Africa | 0.8 | 1.1 | 1.4 |
| West Africa | 1.0 | 1.1 | 1.2 |
| East Africa | 1.1 | 0.9 | 1.3 |
| Southern Africa | 1.5 | 0.6 | 1.2 |
| Arabia | 0.4 | 1.5 | 1.4 |
| Iran & Central Asia | 1.0 | 1.1 | 1.2 |
| India | 1.1 | 0.9 | 1.3 |
| North China | 1.4 | 0.9 | 1.0 |
| South China | 1.1 | 1.1 | 1.1 |
| Southeast Asia | 1.0 | 1.2 | 1.1 |
| Japan & Korea | 1.0 | 1.3 | 1.0 |
| Australia & New Zealand | 1.5 | 0.6 | 1.2 |
| *Antarctica (not a start)* | 1.3 | 2.0 | 0.3 |

Antarctica has 2 slots and can only be settled, never started on.

**Adjacency** follows real land borders, plus sea links: Bering (Siberia–Canada),
Gibraltar (Western Europe–North Africa), Malacca (Southeast Asia–Australia & NZ),
Tasman/Drake (Antarctica–Southern Cone, Australia & NZ, Southern Africa). Every
continent connects. Unclaimed Earth regions are settled by marching an Army in;
off-Earth regions need a Colony Ship.

## 5. Resources (6)

One resource per building; no building has two outputs.

| Resource | Kind | Building | Role |
|---|---|---|---|
| **Energy** | Stock | Power Plant | Building upkeep, every launch, everywhere |
| **Metals** | Stock | Mine | Basic buildings, Foundry input |
| **Volatiles** | Stock | Refinery | Factory input |
| **Alloys** | Stock | Foundry (from Metals) | Hulls, advanced buildings, Factory input |
| **Research** | Stock | Lab | Tech |
| **Materiel** | Stock | Factory (from Alloys + Volatiles) | Ships, Armies, colony upkeep |

```
Power Plant ─► Energy ─────────────────► everything (upkeep, launches)
Mine ───────► Metals ──┬► Foundry ─► Alloys ─┬► hulls, advanced buildings
                       │                     └► Factory ─► Materiel ─► ships, Armies, colony upkeep
Refinery ───► Volatiles┴─────────────────────┘
Lab ────────► Research (standalone; funds Tech)
```

Stock cap: 1000 + 500 per region held, per resource.

## 6. Buildings (7)

Six resource buildings, each producing exactly one resource, plus the
Spaceport, which builds ships and Armies rather than producing a resource. All
six are available to everyone from the start; Industry tech (§8) adds yield
and modes, never gates the building itself. One build queue per region.
Demolish refunds 50%. Slots: Earth 4, large bodies 3, small bodies 2.

| Building | Cost | Time | Output /min | Upkeep /min |
|---|---|---|---|---|
| Power Plant | 40 M | 20 s | Solar: 10 E × S · Fission [Industry 5]: 15 E flat · Fusion [Industry 6]: 25 E flat, +50% at Fusion-flagged bodies | none |
| Mine | 30 M | 20 s | 6 M × region M | 2 E |
| Refinery | 30 M | 20 s | 4 V × region V | 3 E |
| Foundry | 50 M | 30 s | 4 M → 2 A | 4 E |
| Lab | 40 M, 10 V | 30 s | 5 R | 3 E, 0.5 Materiel |
| Factory | 60 M, 10 V | 30 s | 2 A + 1 V → 3 Materiel | 5 E |
| Spaceport | 60 M, 20 A | 45 s | Builds ships and Armies; launches from this body | 2 E |

Each off-Earth region costs **1 Materiel/min** colony upkeep; a shortfall
halves its output. Society tech (§8) reduces both this and building Energy
upkeep.

**Starting kit:** capital with Power Plant, Mine, Refinery, Lab; 2 Armies;
200 M, 100 V, 30 A, 50 Materiel, 30 R, 500 E.

## 7. Military

Military strength is instrumental: it scores nothing by itself, it's what you
spend to take or hold Territory. Every ship and Army has a flat **strength**
value, no counters, no rock-paper-scissors — higher tiers cost more but are
more resource-efficient per strength point, so late-game fleets are smaller in
hull count but disproportionately stronger. Numbers below are a first pass,
explicitly subject to sim tuning (§13).

| Unit | Built at | Cost | Time | Strength | Efficiency (pts/resource) | Mass | Speed | E upkeep |
|---|---|---|---|---|---|---|---|---|
| Army | Any owned region | 10 Materiel | 15 s | 10 (ground) | — | n/a | 30 s per Earth hop | 0.5 |
| Colony Ship | Spaceport | 40 A, 10 Materiel | 45 s | n/a | — | 2 | 1.0 | 0 |
| Freighter (holds 500) | Spaceport | 30 A, 10 Materiel | 30 s | n/a | — | 1 | 1.0 | 0.5 |
| Troop Transport (4 Armies) | Spaceport | 40 A, 15 Materiel | 30 s | n/a | — | 2 | 1.0 | 0.5 |
| Corvette | Spaceport | 20 A, 10 Materiel | 20 s | 10 | 0.33 | 1 | 1.25 | 1 |
| Destroyer [Voidcraft 2] | Spaceport | 40 A, 40 Materiel | 40 s | 30 | 0.38 | 2 | 1.0 | 2 |
| Battleship [Voidcraft 4] | Spaceport | 80 A, 80 Materiel | 80 s | 90 | 0.56 | 4 | 0.85 | 4 |
| Dreadnought [Voidcraft 6] | Spaceport | 160 A, 160 Materiel | 150 s | 270 | 0.84 | 8 | 0.65 | 8 |

Colony Ship, Freighter and Troop Transport are available from the start,
ungated: expansion and trade are never blocked by tech, only sped up. Corvette
is likewise available immediately so every nation can defend itself from
minute one; Destroyer, Battleship and Dreadnought unlock in sequence off the
Voidcraft ladder.

### Travel

- **Interplanetary:** Hohmann transfer time,
  `t_days = 182.6 × ((a₁ + a₂) / 2)^1.5` (a in AU), divided by drive speed
  and ship speed. A fleet moves at its slowest ship.
- **Local** (Earth↔Luna, moon↔moon of one planet): 30 s.
- **Launch energy** = mass × zone cost × window penalty. **Every zone is
  reachable from the start** — Voidcraft (§8) reduces the zone cost
  cumulatively, it never unlocks a destination.

| Destination zone | Cislunar | Inner | Belt | Jovian | Saturnian | Outer |
|---|---|---|---|---|---|---|
| Energy per mass (Voidcraft 0) | 10 | 25 | 40 | 60 | 80 | 120 |

- **Window penalty** = `1 + 2 × |Δθ| / π`, where Δθ is the gap between the
  current and ideal phase angle `π × (1 − ((a₁ + a₂) / 2a₂)^1.5)`. 1× in the
  window, 3× at worst. Voidcraft's Gravity Assists rung shrinks the 2.
- Fleets in transit **cannot be redirected or intercepted**.

### Combat

Space combat fires whenever hostile fleets (and platforms) share a body's
orbit, including on arrival.

- **Effective strength** of a side = the flat sum of its units' strength.
- **Lanchester square law:** the stronger side wins and keeps
  √(1 − (L/W)²) of each stack, rounded to whole units. Equal sides annihilate.
  No randomness.

**Invasion:** win orbital superiority (no hostile warships in orbit), land
Armies from Transports, then ground combat by the same rule: Armies vs
garrison Armies, garrison getting a flat +50% holding a region it already
owns. Winning transfers the region with its buildings. An undefended region
falls to any Army.

### War rules

| Rule | Value |
|---|---|
| Declaration | Public; active 1 min later |
| Protection | New and respawned nations: untouchable for 5 min, cannot declare |
| Conquest | Full; capitals can fall. Capital moves to largest remaining region |
| Elimination | Losing every region. Respawn on a free Earth region, or a single off-Earth colony if Earth is full, with ×2 production for 5 min |
| Peace | Both sides agree |

## 8. Tech: 4 ladders × 6 rungs

Rung *n* needs rung *n − 1* in its own ladder; no ladder depends on another.
Costs double per rung: 40, 80, 160, 320, 640, 1280 R. One research at a time.
24 rungs total, not 48 — a season should see a strong player hold about half
the tree, not a third of it.

### Voidcraft: faster, better ships; reach is a cost, not a wall
1. **Thrust Vectoring**: launch energy cost −15%
2. **Ion Drives**: speed ×1.25; unlocks Destroyer
3. **Gravity Assists**: window penalty coefficient −30%
4. **Nuclear Thermal Drive**: speed ×1.5 (cumulative); unlocks Battleship
5. **Fusion Drive**: launch energy cost −15% further (cumulative −30%);
   speed ×1.75 (cumulative)
6. **Torch Ships**: speed ×2 (cumulative); window penalty almost none;
   unlocks Dreadnought

### Industry: new buildings, bigger yields
1. **Automated Mining**: Mine output +25%
2. **Fractional Distillation**: Refinery output +25%
3. **Advanced Metallurgy**: Foundry output +25%
4. **Assembly Lines**: Factory output +25%
5. **Orbital Solar Arrays**: Power Plant Solar mode +25%; unlocks Fission mode
6. **Nanofabrication**: all production +20%; unlocks Fusion mode

### Science: research output, and the only route to an Envoy
1. **Computing**: Lab output +25%
2. **Signals Intelligence**: unlocks the Envoy (§11) — base capability, one
   slot
3. **Machine Learning**: research +25%
4. **Quantum Computing**: tech costs −10%
5. **Planetary Science**: Lab output off Earth +25%
6. **Artificial General Intelligence**: research +50%; tech costs −15%
   further (cumulative −25%)

### Society: what it costs to hold what you have
1. **Closed-loop Life Support**: colony Materiel upkeep −25%
2. **Pressurised Habitats**: +1 slot off Earth
3. **Superconductors**: building Energy upkeep −20%
4. **Arcologies**: +1 slot on Earth
5. **Signal Relays**: +1 concurrent Envoy slot
6. **Post-scarcity Economy**: colony Materiel upkeep removed; +1 further
   Envoy slot

## 9. Trade

Trade has no tech line of its own. It's a flat mechanism for covering a gap
in your own production, not a path to be maximised for its own sake — its
payoff always lands in Economy score, the same place a Mine's does.

1. **Offer:** A proposes "X of mine for Y of yours" to B.
2. **Accept:** both sides are **escrowed** at once; each side's free Freighter
   launches toward the other's capital.
3. **Deliver** on arrival. Earth-to-Earth trades need no Freighter and land in 30 s.
4. **Gift:** one-sided transfer.
5. **Earth Exchange:** NPC market at a flat 3:1, so two players alone (the
   marker's case) still have a working economy.

### Trade Multiplier

An Envoy (§11) is an embassy at another nation's capital, and it opens a
trade corridor as well as a sightline. If either nation in an **Offer** trade
maintains an active Envoy on the other, both sides' deliveries on that trade
are scaled up:

```
multiplier = 1 + 0.15 × Science rungs held by whichever side maintains the Envoy
           (the higher of the two, if both maintain one on each other)
```

Roughly ×1 with no Science investment up to ×1.9 at a full Science ladder —
first pass, sim-tunable (§13). A trade of 4 Energy for 8 Metal between two
Envoy-linked, Science-heavy nations lands closer to 8 Energy for 16 Metal:
the corridor rewards diplomacy, not just the goods themselves. It does not
apply to **Gift** (nothing to multiply both sides of) or the **Earth
Exchange** (no capital to send an Envoy to).

## 10. Victory: seasons

| Category | Measure | Points |
|---|---|---|
| Territory | Regions, body control | 5 per region, +20 per whole body |
| Economy | Total production /min across stocks | 1 per 5 |
| Tech | Rungs held | 1 per rung × rung number |

Each category is **capped at 40% of the threshold** (three categories, so pure
specialisation in one can never reach 100% alone, but near-even play across
two of three can).

**A season lasts at most 60 minutes**, about the longest an assessor will play.

- First to the threshold wins early. The sim tunes the threshold so a strong
  player reaches it at around 50 min.
- At 60 min, the highest score wins.
- The end writes a hall of fame entry; accounts, empire names and colours carry
  over to the next season.
- **A new season starts when the first player connects after the last one
  ended**, not on a clock. Otherwise an empty world would burn through
  seasons nobody plays while the machine sleeps.
- A player returning the next day sees the last season's result, then joins
  the season their arrival starts.

## 11. Players and presence

- **Accounts:** username and password (system-design.md §9). An account lasts
  across seasons; an empire belongs to one season.
- **Empire:** name (3 to 24 characters, unique per season), primary and
  secondary colour. Colours are picked from 24 presets chosen to stay
  distinguishable on the map, or custom; a custom colour too close to an
  existing empire's is refused with the clash named. The form starts on the
  first preset nobody is using, so a new player never hits a clash by
  default. Editable any time.
- **World size:** at most 24 nations (one per Earth start region).
- **Late joining:** allowed until minute 50, with ×2 production for the first
  5 min so a late start isn't hopeless.
- **Presence:** online nations glow; a live news ticker reports launches,
  claims, declarations, battles, trades.
- **Concurrency:** commands are serialised and validated against current state.
  Two Colony Ships for one region: first arrival wins; tie goes to the earlier
  launch, then lower id. The loser waits in orbit.

### Sensors, fog of war and Envoys

- **Sensors:** owning any region on a body gives instant, full, live vision of
  everything there — fleets, buildings, ownership.
- **Fog of war:** everywhere else renders exactly like unclaimed space: blank.
  One exception: a nation still choosing where to start (new, or just
  eliminated) sees which Earth start regions are taken, and nothing else
  about them, so it can pick a free one.
  There is no "last known owner," no ghost icon for a fleet that left. If you
  can currently see it, you see it; if you can't, nothing is shown at all.
- **Envoy:** unlocked by Science's Signals Intelligence rung. An Envoy is
  sent to a **target nation's capital**, not a single body, and costs a flat
  **Energy upkeep per minute** to maintain (not a one-off payment — stop
  paying and it recalls itself). While active it gives live, **empire-wide**
  vision of that nation's **fleets and territory**, across every body it
  currently holds, but never any of its buildings. A nation's capital
  (which region it is, not what's built there) is globally public, so it can
  be targeted. One Envoy relationship at a time until Society's Signal Relays
  and Post-scarcity Economy rungs each add one more.
- This is deliberately asymmetric: sensors (from ownership) are total but
  local; Envoys (bought with Energy) are partial but empire-wide. Buying
  full-fidelity intel on a specific body always means taking the ground
  yourself. An Envoy also opens a trade corridor with its target (§9).

### Onboarding

1. **Login screen:** sign in or create an account, over a slowly turning Earth
   (a static image on the low tier or before the 3D bundle loads).
2. **Create empire:** name and colours, previewed live as a region fill and
   banner.
3. **Choose a start region:** free Earth regions highlighted on the globe (and
   listed for keyboard users), each showing its M, V, S.
4. Camera flies in to your capital. The game begins.

### Tutorial: five goals, no walls of text

The design should explain itself; the tutorial is a short checklist pinned to
the corner, each goal teaching one system. Dismissible, and it never blocks
play.

1. **Build a Mine**: the resource bar and rates
2. **Research Thrust Vectoring**: the tech ladders
3. **Build a Spaceport**: slots and build queues
4. **Launch a Colony Ship to Luna**: the launch window gauge and travel
5. **Claim a Luna region**: expansion and colony upkeep

Supporting rules that make a long tutorial unnecessary:

- **Every disabled action says why** ("needs 20 M", "needs Voidcraft 2",
  "Mars window opens in 3 min"). The rules engine returns the reason, so this
  is testable.
- A **next goal** hint is always visible until the checklist is done.
- First hover on any resource, building or tech shows a one-line tooltip.
- Empty panels say what to do ("No fleets yet: build one at a Spaceport").
- The protection timer is visible, so new players know they are safe.

## 12. Visuals: the map is the game

Stellaris-like: the solar system **is** the main screen, and everything you
do, you do on it. Dark space, glowing orbits and borders, a lit sun, as
physically realistic as a browser allows, with a thin, sleek HUD over the
top. There is no page of forms: a panel appears only for what you've
selected, beside it, and gets out of the way when you're done. User
friendliness is a design principle here (goals.md P10), not a finish.

All rendering is client-side; the server never draws.

### The screen

```
┌ resources · date · timers ─────────────────────────── alerts · you ┐
│                                                         outliner │
│                    full-screen 3D solar system            your   │
│               (zoom from the whole system to a surface)   planets │
│                                                          + fleets │
│ ┌ selection panel ┐                                               │
│ │ what you clicked │                 goals · news ticker · board  │
└─┴─────────────────┴──────────────────────────────────────────────-┘
```

- **Top bar:** six stocks with rates (live between ticks), shortfall
  warning, game date, protection/boost/season timers, connection state.
- **Outliner (right):** your bodies, regions and fleets, grouped; click to
  fly there. Collapsible.
- **Selection panel (bottom-left):** opens on clicking a body, region or
  fleet. Holds that thing's actions: build, queue, train, ships, march,
  colonise, invade, launch. Every disabled action says why.
- **Overlays on demand:** tech (four ladders), diplomacy, trade, each a
  drawer opened from the top bar, closed with Esc; the map stays visible
  behind.
- **Corner widgets:** the tutorial goals, a news ticker, the leaderboard,
  all small and dismissible.

### Navigating: Google Maps at solar-system scale

| Input | Does |
|---|---|
| Scroll wheel, pinch, `+` `−` | Zoom toward the cursor, continuously, from the whole system down to low orbit over a region |
| Left-drag, one-finger drag, arrows / WASD | Pan |
| Right-drag, two-finger twist, `Q` `E` | Rotate the view |
| Click a body, or pick it in the outliner | Eased fly-to; the camera then follows that body along its orbit |
| Click a region (zoomed in) | Select it: the panel shows its actions |
| `[` `]` | Cycle bodies; Enter focuses; Esc backs out one level (region → body → system) |

The canvas is not the only way in: the outliner and selection panel are real
DOM, and an off-screen list of every body and region (shown on keyboard
focus) mirrors the map, so keyboard and screen-reader users reach every
action (goals.md P7).

Distances are log-scaled so the whole system fits on one screen yet Earth
and Luna still separate when you zoom in; body sizes are exaggerated the same
way. Labels fade in by zoom level so the screen never gets crowded.

### Rendering

| Piece | Approach |
|---|---|
| Engine | Three.js |
| Textures | Solar System Scope (CC BY 4.0), NASA Blue Marble and Black Marble (public domain); KTX2/Basis compressed. Procedural shading until textures land |
| Earth | Day/night blend shader, city lights on the dark side, cloud layer, specular oceans |
| Atmospheres | Rim-glow scattering shader for Earth, Venus, Mars, Titan |
| Sun and space | Emissive sun, bloom, star-field skybox (NASA Deep Star Maps) |
| Gas giants | Banded textures, Saturn's rings with alpha and shadow |
| Scale | Logarithmic depth buffer and floating origin, so zooming from Neptune to a city never jitters |
| Detail | Texture tiers 512 / 2K / 8K by camera distance; only the focused body loads 8K |

### Regions on the surface

Regions are drawn as **stylised patches** on each body's sphere: a spherical
Voronoi partition around one seed point per region, softly shaded, with
glowing borders. Earth's 24 start regions plus Antarctica are seeded at their
real geographic centres (latitude/longitude in `rules/data/map.ts`), so the
patches sit roughly where the countries are; other bodies' seeds are spread
evenly. Real Natural Earth borders for Earth are a later upgrade, not a
blocker.

### The mechanics on screen

- **Ownership:** a region you can currently see is tinted with its owner's
  colour, borders glowing. A region on a body you have no sensor on, whose
  owner you have no Envoy on, renders flat and untinted, identical to
  unclaimed space: the map never hints at what it isn't showing you.
- **Economy you can see:** city lights on the night side grow with each
  building in a sensed region; buildings show as icons pinned on the region.
- **Fleets:** glowing markers on their Hohmann arc with a trail and ETA,
  for fleets you currently have vision on only; nothing for a fleet outside
  sensor and Envoy range, not even a stale marker.
- **Launching:** select a fleet, then click a destination body: the transfer
  arc draws on the map with its energy cost, travel time and the launch-window
  gauge (green in the window); confirm to launch.
- **Envoys:** a small beacon on a nation's capital where you hold an Envoy,
  visible only to you.
- **Battles:** flashes in orbit and a ticker entry with the Lanchester result.
- **Choosing a start:** the camera opens on Earth with free start regions
  lit and taken ones in their owners' colours; click one to begin (also
  listed for keyboard users).

### Phone (390×844)

The map stays full-screen; the selection panel and drawers become bottom
sheets; tap targets ≥ 44 px; pinch to zoom, two-finger twist to rotate;
post-processing off.

### Budgets

| Budget | Target |
|---|---|
| First render | < 3 MB download (512 px textures), interactive on slow 4G |
| Frame rate | 60 fps desktop, 30 fps phone |
| Pixel ratio | Capped at 2 desktop, 1.5 phone; post-processing off on phone |

## 13. Headless sim and agent playtesting

The rules are built **before** the renderer, as a pure module the server,
client and sim all share. Balance is then tested by agents playing simulated
hours, not guessed.

### Rules engine

- `rules/`: pure TypeScript, no I/O, no `Date.now()`, no randomness.
  - `apply(state, nation, command, at) → state | error`
  - `validate(state, nation, command) → reason | null` (same check, no state change)
  - `advanceTo(state, t) → state` (processes due events)
  - `observe(state, nationId) → view` (vision-filtered: sensors + Envoys, per §11)
  - `legalActions(state, nationId) → command[]`
- `rules/data/`: every number in this document.
- Because time is analytic, the sim jumps straight between decision points: a
  multi-hour season runs in milliseconds.

### Keep sim runs cheap

Bot runs cost nothing but wall-clock time; LLM playtests draw on the credit
budget. Default sim runs to a short simulated window (15 to 20 simulated
minutes is enough to see whether the early game works) rather than the full
60-minute cap, and only run a full-length season when specifically checking
threshold or late-game behaviour. LLM playtests are used sparingly: a handful
of short sessions, not a continuous loop.

### Players

| Player | What it is | Used for |
|---|---|---|
| **Scripted bots** | Fixed strategies: Expander (claims aggressively), Builder (Industry-first economy), Trader (leans on the Exchange and offers), Conqueror (military build, invades), Researcher (Science rush), Random | Seeded runs: balance numbers, dominant strategies, deadlocks |
| **LLM playtesters** | Claude agents driving a text interface: each turn gets `observe` as JSON plus `legalActions`, returns commands and one line of reasoning | Feel: early-game clarity, dead time, whether choices are interesting. Each writes a short playtest report |
| **Mixed tables** | 1 to 2 LLM players with 4 to 6 bots | Diplomacy, war and trade under pressure |

Agents decide every 15 simulated seconds, or on any event that concerns them
(completion, arrival, declaration, attack). A **newcomer agent** joins
mid-season to test the late-join experience.

### Balance targets (enforced)

These become tests in `sim/` (its own vitest project; the shipped config only
includes `spec/`).

| Target | Value |
|---|---|
| Voidcraft's Thrust Vectoring researched | ~2 min |
| First off-Earth colony | 4 to 7 min |
| First Mars colony | 12 to 25 min |
| Dead time (decision points with no useful action), first 30 min | < 20% |
| Deadlock | none: from any start, a sensible bot always reaches Voidcraft 2 |
| Strategy win rates | every bot strategy wins 10 to 35% of runs |
| Snowball | leader holds < 40% of total score at mid-season |
| Late joiner (joins at 30 min) | reaches 25% of median score by 60 min |
| Respawn | survives its protection window and holds a region 10 min later in 80% of runs |
| Season length | threshold reached at 50 ± 10 min, or the 60 min cap |
| Progression | winner holds ~10 of 24 rungs; no ladder finished before 40 min |
| Earth fairness | every start region's M + V + S = 3.3 |

### Playtest rubric (judged)

Each LLM playtester scores 1 to 5, with evidence from its game:

1. I always knew what to do next.
2. My choices mattered; different choices led to different games.
3. Early wins came fast; later goals felt earned.
4. Waiting felt like anticipation, not boredom.
5. Other nations changed my plans.

### Loop

1. Run the bot suite and a few LLM playtests.
2. Read the metrics and reports; pick one problem.
3. Change one number in `rules/data/`.
4. Rerun; record before and after in `docs/balance-log.md` with the commit.

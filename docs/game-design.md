# Game design

Source of truth for mechanics, visuals and balance testing. Every number here is
a starting value; the headless sim (§13) tunes them. Numbers live in code in
one data module (`rules/data/`), so tuning is a data edit, never a rule edit.
Why each major mechanic is the way it is: [docs/adr/](adr/README.md) (G01 to
G11).

## 1. The idea

**Growth is the core human drive, and Interstellar Expansion is built to let it out in
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
  active, protection ends, **ground battle ends** (§7), **stock depleted** (scheduled at
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

Every off-Earth region is a **real named feature** (IAU names), centred and
sized from the USGS Gazetteer of Planetary Nomenclature, so Hellas is the
Hellas basin and Olympus sits on Olympus Mons (§12). Luna's "Far Side" region
sits on the South Pole–Aitken basin. A gas giant's "orbital" regions are orbits,
not ground: they are claimed and drawn as orbital bands around the planet,
never as patches on its clouds.

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

Each region is a group of **real countries**, drawn with their real borders
from Natural Earth (§12). The United States, Russia and China are split along
their real internal borders: US West and US East at the state lines along
the Mississippi basin's western edge, Western Russia and Siberia at the Urals
(the Ural Federal District goes to Siberia), North and South China at the
provincial lines along the Qinling–Huai line. The country and province
lists live in `rules/data/map.ts`. Oceans belong to no region. Slots 4.
**Fairness rule:** every start region's M + V + S sums to 3.3, so geography
is flavour, not advantage.

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

One resource per building; no building has two outputs. One exception: a
capital makes 2 Materiel/min on its own, so every nation can train Armies
from the start (ADR G12).

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
Demolish refunds 50%; Replace is a demolish and a build in the same slot,
as one command. Slots: Earth 4, large bodies 3, small bodies 2.

| Building | Cost | Time | Output /min | Upkeep /min |
|---|---|---|---|---|
| Power Plant | 40 M | 20 s | Solar: 10 E × S · Fission [Industry 5]: 15 E flat · Fusion [Industry 6]: 25 E flat, +50% at Fusion-flagged bodies | none |
| Mine | 30 M | 20 s | 10 M × region M | 2 E |
| Refinery | 30 M | 20 s | 4 V × region V | 3 E |
| Foundry | 50 M | 30 s | 4 M → 3 A | 4 E |
| Lab | 40 M, 10 V | 30 s | 5 R | 3 E |
| Factory | 60 M, 10 V | 30 s | 2 A + 1 V → 3 Materiel | 5 E |
| Spaceport | 70 M, 25 A | 240 s | Builds ships and Armies; launches from this body | 2 E |

The Spaceport is the gate off Earth. Its 240 s build plus a Colony Ship
(45 s) and the hop to Luna (30 s) put the earliest off-Earth claim at
5 min 15 s; its cost (with a Colony Ship's, 65 A against the kit's 60)
means a little Foundry output or Exchange trade first.

Each off-Earth region costs **1 Materiel/min** colony upkeep; a shortfall
halves its output. Society tech (§8) reduces both this and building Energy
upkeep.

**Starting kit:** capital with Power Plant, Mine, Refinery, Lab (as many as
the region has slots); 2 Armies; 200 M, 100 V, 60 A, 50 Materiel, 30 R,
500 E. The capital adds 2 Materiel/min. Every start is on Earth (§11).

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
  Allies at war with the same enemy in one orbit fight as one side, each
  fleet keeping the side's survival fraction of its units.
- **Lanchester square law:** the stronger side wins and keeps
  √(1 − (L/W)²) of each stack, rounded to whole units. Equal sides annihilate.
  No randomness.

**Invasion:** win orbital superiority (no hostile warships in orbit), land
Armies from Transports, or march them in on Earth. An undefended region
falls to any Army at once. A defended one starts a **ground battle**.

**Ground battles take time.** Space combat stays instant; ground combat is
the same square law played out as it happens, so a player can watch it:

- Each Army destroys `0.025` enemy Armies per second; a garrison holding
  its own region destroys `0.025 × 1.5²` (its +50% strength, squared as the
  square law has it): `dA/dt = −0.05625 × D`, `dD/dt = −0.025 × A`. This
  is Lanchester's own equation, so the survivors are exactly
  `√(1 − (L/W)²)` as before; only the timing is new. 10 attackers against
  10 garrison Armies lose in about 21 s.
- Counts follow the analytic solution between events (§3); the battle ends
  when a side drops below half an Army, and that side is wiped out (both, if
  even). Winning as attacker transfers the region with its buildings.
- **Reinforcements join:** the attacker's Armies arriving at the region and
  the defender's Armies trained there add to their side, and the end time is
  recomputed. The garrison can't march out while fighting.
- One attacking side per region at a time: Armies of the attacker's allies
  at war with the defender join the attack; anyone else's return home.
  Armies marching into an ally's region under attack join its defence.
  Every Armies count on a side is kept per nation; losses fall on each in
  proportion. When the battle ends, allied survivors march back to the
  region they came from (lost if it fell).

### War rules

| Rule | Value |
|---|---|
| Declaration | Public; active 1 min later |
| Protection | New and respawned nations: untouchable for 1 min, cannot declare |
| Conquest | Full; capitals can fall. Capital moves to largest remaining region |
| Plunder | Taking a region moves 25% of the loser's stock of every resource, times that region's share of the loser's regions, to the conqueror (up to its cap). Taking a last region takes 25% of everything (ADR G12) |
| Elimination | Losing every region. Respawn on a free Earth start region, with ×2 production for 5 min; while none is free, respawn waits |
| Peace | Both sides agree; joining an alliance forces it between members |

## 8. Tech: 4 ladders × 6 rungs

Rung *n* needs rung *n − 1* in its own ladder; no ladder depends on another.
Costs double per rung: 40, 80, 160, 320, 640, 1280 R. One research at a time.
24 rungs total, not 48 — an hour should see a strong player hold about half
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

### Alliances and sanctions

An alliance is a pact of up to 4 nations. It shares no score, no stocks
and no vision; it is about who fights whom and who trades with whom.

- **Forming:** any nation invites another; accepting forms an alliance, or
  joins the inviter's. A nation is in at most one alliance. Leaving is
  immediate; an alliance of one dissolves.
- **Forced peace:** accepting ends every war between the joiner and the
  members. Members can't declare war on each other.
- **Fighting together:** each member still declares its own wars. Where
  members are at war with the same nation, their forces fight as one side
  (§7): fleets in one orbit, Armies joining an ally's attack or an ally's
  defence.
- **Sanctions:** any member can sanction a nation outside the alliance, and
  any member can lift it. While it stands, no offer, accept or gift passes
  between any member and that nation, and their open offers are cancelled.
  The Earth Exchange and Envoys are unaffected. A sanctioned nation can't
  be invited. Sanctions and alliances are public and in the ticker.

## 10. Victory: stages in a world that keeps going

The world never ends on its own. It runs until an admin resets it (§11),
and its time is cut into **stages** of 20 minutes. A stage is what a season
was: a ranking with a winner and a hall of fame entry. But when it ends the
game carries on, and the next stage adds a global modifier that changes how
everyone plays.

| Category | Measure | Points |
|---|---|---|
| Territory | Regions, body control | 5 per region, +20 per whole body |
| Economy | Total production /min across stocks | 1 per 5 |
| Tech | Rungs held | 6 per rung × rung number (`SCORE.techPer`, balance-log.md Loop 5) |

A nation's **score** is the sum, uncapped, shown live in Empires.

- **A stage ranks score gained during it:** total at stage end minus total
  at stage start (or at joining, for a nation that joined mid-stage). Growth
  wins a stage, not size, so a late joiner or a small empire can top one.
- At each stage end the top three go in the hall of fame with their gains,
  and the ticker announces the winner and the next stage. A stage in which
  nobody issued a command records nothing.
- **Global modifiers stack.** Each stage from the second adds one, for every
  nation, from then on. They add to tech bonuses, like tech bonuses do.

| Stage | Starts | Name | Adds, for everyone |
|---|---|---|---|
| 1 | 0 min | Founding | nothing |
| 2 | 20 min | Industrial Age | Mines and Refineries +25% output |
| 3 | 40 min | Space Age | Spaceports −25% cost and −50% build time; ships build 25% faster; warships +20% strength |
| 4 | 60 min | Information Age | Research output +25%; tech costs −10% |
| 5 | 80 min | Expansion Age | Launch energy −25%; colony Materiel upkeep −50% |
| 6 | 100 min | Fusion Age | Power Plant output +25% |
| 7+ | 120 min on | Golden Age | nothing new; stages keep ranking every 20 min |

Stage ends are scheduled events (§3), so rates change exactly at the
boundary and an idle server catches up exactly. Accounts, empire names and
colours carry over a reset; progress does not.

## 11. Players and presence

- **Accounts:** username and password (system-design.md §9). An account lasts
  across worlds; an empire belongs to one world, until a reset.
- **Empire:** name (3 to 24 characters, unique per world), primary and
  secondary colour. Colours are picked from 24 presets chosen to stay
  distinguishable on the map, or custom; a custom colour too close to an
  existing empire's is refused with the clash named. The form starts on the
  first preset nobody is using, so a new player never hits a clash by
  default. Editable any time.
- **World size:** at most 24 nations (one per Earth start region).
- **Late joining:** always open, with ×2 production for the first 5 min for
  anyone joining 5+ min into the world, so a late start isn't hopeless. **Every start is on Earth**: a
  newcomer or respawn picks a free Earth start region, never an off-Earth
  one. While none is free, joining is refused with that reason and the
  start screen says so; it opens again when a region frees up.
- **Admin reset:** the account `admin` (password `platypus`, hardcoded and
  seeded at boot; the username is reserved at sign-up) opens `/admin`, which
  has a **Reset world** button. Confirmed, it kicks every connected player,
  ends the world with no winner, and starts a fresh one at stage 1: every
  empire, region, fleet, alliance and stock is gone; accounts, sessions,
  empire names and colours, and the hall of fame stay. Players reconnect to
  the start screen.
- **Presence:** online nations glow; a live news ticker reports launches,
  claims, declarations, battles, trades.
- **Concurrency:** commands are serialised and validated against current state.
  Two Colony Ships for one region: first arrival wins; tie goes to the earlier
  launch, then lower id. The loser waits in orbit. Commands in one tick
  apply in arrival order; why, and the alternatives weighed (threads, round
  robin, a faster tick), are in system-design.md §5.

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
   listed for keyboard users), each showing its Metals, Volatiles and Solar
   yields as icons.
4. Camera flies in to your capital. The game begins.

### Tutorial: five goals and a Guide

The design should explain itself; the tutorial is a short checklist under the
empire menu, each goal teaching one system and linking to its Guide page.
Dismissible, and it never blocks play.

1. **Build a Mine**: the resource bar and rates
2. **Research Thrust Vectoring**: the tech ladders
3. **Build a Spaceport**: slots and build queues
4. **Launch a Colony Ship to Luna**: the launch window gauge and travel
5. **Claim a Luna region**: expansion and colony upkeep

**The Guide** is an in-game wiki, opened any time from the top bar (or `?`)
as an overlay with the map behind it, so players can check it mid-game. One
short page per task, each a few numbered steps naming the exact clicks, with
the real icons inline:

| Page | Covers |
|---|---|
| Resources | The six icons, what makes and uses each, stock caps, shortfall |
| Building | Slots, the build picker, replace, upgrade, demolish (50% back) |
| Armies | Training, marching on Earth, garrisons and the +50% defence |
| Research | The four ladders, one research at a time, what each unlocks |
| Colonising | Colony Ship, launch, pick a region, colony upkeep |
| Sending ships | Select a fleet, click a destination, the window gauge, energy |
| War and invasion | Declaring, protection, orbit battles, landing Armies |
| Trade and Envoys | Offers, gifts, the Earth Exchange, the trade multiplier |
| Stages | The three scores, stage rankings by gain, each stage's modifier |
| Alliances | Inviting, forced peace, fighting together, sanctions |

Pages are data in the client, and every number in them is read from
`rules/data/`, so the Guide can't drift from the rules. Empty states and
tutorial goals link to the page that explains them.

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
┌ INTERSTELLAR EXPANSION · ⚡512 +0.25/day  ⛏210 +0.16/day  …  · date ·      Empires  Guide ┐
│ Territory ▸│                                          │ Mars North    ✕  │
│ Military ▾ │        full-screen 3D solar system       │ ⚔ BATTLE  0:12   │
│  Armies    │   (zoom from the whole system to a       │ you  ███████░ 7  │
│  Fleets    │    surface; army markers on regions,     │ them ███░░░░░ 3  │
│ Research ▸ │    fleets on their arcs, ⚔ on battles)   │ ┌──┐┌──┐┌──┐     │
│ goals      │                                          │ │⛏ ││⚡ ││ +│     │
│            │ ─────────────── news ticker ──────────── │ Forces here      │
└────────────┴──────────────────────────────────────────┴──────────────────┘
```

#### The command console look

You are a general at a war table, not a user in an app. The HUD is a
futuristic command console laid over real space, with the same layout as
above:

- **Gunmetal plates, not glass.** Panels are dark brushed gunmetal
  (`#1b1f24` to `#2c3138`), near-opaque, with a bevelled top edge, a thin
  machined inner rule and chamfered (45° cut) corners. No rounded cards, no
  frosted blur, no soft drop shadows.
- **Tabs and buttons are console keys.** Gunmetal keys with engraved
  uppercase labels; the active one is powered: a lit cyan edge and a faint
  inner glow. Primary actions are lit cyan keys; danger is an amber-red key.
  Disabled keys are unlit, still readable.
- **HUD furniture.** Corner brackets on panels, a designation strip on each
  panel header (`SECTOR // MARS · THARSIS`), hairline rules, a faint grid
  over panel backgrounds. Selection on the map is a targeting reticle;
  region borders read as holographic lines.
- **Type.** A condensed technical face for labels and headings (Rajdhani),
  tracked uppercase; a monospace for every number (Share Tech Mono), so
  stocks and timers read like instruments. Both self-hosted, subset, under
  100 KB together.
- **Colour.** Gunmetal greys carry the UI; cyan (`#5cc8ff`) means live and
  selected, amber means warning, red means hostile. Empire colours appear
  only as owner chips and map tints. Text keeps WCAG AA contrast (P7).
- **Motion.** Short mechanical easing: panels slide and lock, numbers tick,
  a brief power-on flicker when a panel opens. All of it off under
  `prefers-reduced-motion`.

Still true from before: icons over words, no boxes inside boxes, fewer and
larger controls.

#### Icons, never letters

Every resource has an SVG icon, and the icon replaces the resource's letter
or name **everywhere** it appears: top bar, costs, yields, upkeep,
breakdowns, trade forms, the Guide. No "M" for Metals anywhere in the UI.
Each icon carries an accessible name (`role="img"` and `aria-label`, e.g.
"Metals") and shows it as a tooltip on hover, so it is never a puzzle
(goals.md P2, P7). Resource pickers (trade, the Exchange) are a radio group
of the six icons, not a list of names. Region yields use the same set, plus a sun
icon for Solar.

Every building has a detailed SVG icon, and so does each upgrade: Power
Plant's Solar, Fission and Fusion modes each get their own. A building whose
Industry rung is held shows a small boost pip on its icon. Ships and Armies
have icons too, used in fleet lists and forces.

#### Top bar

Each of the six resources shows its icon, the empire's total and a
**+X/day** button (a day is one second of play, so this is the gain per
day). Clicking it opens that resource's breakdown: what produces it, what
consumes it, per day and per minute. Also the shortfall warning, game date,
protection/boost timers, the current stage with its time left and modifier
(hover for the full list), connection state, and two buttons on the
right: **Empires** and **Guide** (§11). There is no Tech or Trade button:
tech lives in the empire menu, trade in Empires.

#### Empire menu (left)

Three dropdowns, each a console key with its count or status on the key,
and nothing else above them:

- **Territory:** every region you hold, grouped by body. Click one to drop
  it down: its slots as a row of small building icons and its output and
  upkeep per day; a second click flies there and opens its panel. The
  dropdown follows the selection. All bodies sit at the end, for flying to
  one you don't hold.
- **Military:** two lists. **Armies:** every garrison by region, Armies
  marching with ETAs, and any battle you're in with both live counts.
  **Fleets:** every fleet, in orbit or in transit with its ETA. Click a row
  to select its region or fleet.
- **Research:** current research and its progress on the key; dropped down,
  each ladder's next rung with cost and a Research action, and a button
  that opens the full tree as an overlay beside the menu, map visible
  behind, closed with Esc.

The tutorial goals sit below the menu until done.

#### Empires (top right)

One overlay, one row per nation: leaderboard rank and score (Territory,
Economy, Tech) and its gain this stage, its alliance, war status (allied,
protected, at peace, war declared, at war, peace offered) with the matching
action (declare war, offer or accept peace, invite to alliance, sanction or
lift), your
Envoy on them, and your trade deals with them (open offers in both
directions, with accept, decline, cancel, plus new offer and gift). The
Earth Exchange is the last row. A header row shows your alliance: members,
pending invites (accept, decline), its sanctions, and Leave. A **Stages**
tab-free section at the foot lists past stage winners. This replaces the old
Tech, Empires and Trade drawers.

#### Selection panel (right)

Opens on clicking a body, region or fleet. No tabs: everything for the
selection is on one scrolling surface. Every disabled action says why.

For a **region you hold**:

1. **Header:** name, body, yields (icons with multipliers).
2. **Slot grid:** one tile per slot the region has (`slotsOf`). An empty slot
   is a plain tile with a `+`; clicking it opens the build picker (each
   building's icon, cost, time, and what it would produce and consume here).
   A tile under construction shows its icon dimmed with a progress ring and
   a cancel. A built tile shows its building's icon. Under every built tile,
   what it produces and consumes per day, as icons (a Mine: `+6⛏ −2⚡`).
   Clicking a built tile opens its actions:
   - **Replace:** pick another building for this slot; it demolishes (50%
     back) and queues the new one in the same slot, as one command, refused
     with a reason if the new one can't be afforded after the refund. The
     picker names any income it takes to zero ("Removes your only Lab:
     Research 0/min"). On a full start region, Replace is the first build:
     it counts for P1's 30 s.
   - **Upgrade:** Power Plant mode (Solar, Fission, Fusion). Other buildings
     upgrade through their Industry rung, so the button is disabled and says
     which rung (P2).
   - **Demolish:** 50% refund, confirmed.
   - **Spaceport only:** build ships (each with icon, cost, count) and train
     Armies.
3. **Forces here:** your garrison with Train Armies and, on Earth, March to a
   neighbour; fleets in orbit at this body, yours and any you can see;
   hostile fleets and Armies inbound with ETA; and the last battle here with
   its Lanchester result and losses on each side. While a hostile force is
   in orbit or landing, this section leads with it, outlined in red.

**Battle:** while a ground battle is on in the region, the panel leads with
it, above the header: attacker and defender, each with their army icon, a
bar and a count that drain live, and the time left. Reinforcements show as
a jump in their side's bar. When it ends, the result stays as the last
battle under Forces here.

A **foreign or unclaimed region** shows its header, its slots read-only
where you have a sensor, Forces here, and one action block for what you can
do to it:

- **Unclaimed:** Settle (march from a neighbour) or Colonise.
- **Held by a nation you're at war with:** Attack, with the Armies each
  bordering garrison of yours would send, or Invade from a Transport in
  orbit.
- **Held by a nation you're not at war with:** Declare war on its owner,
  in place, with the 1 min activation shown after; disabled with the reason
  while either side is protected. Attack shows beside it, disabled until
  the war is active.

A **body** lists its regions and the fleets in its orbit. A **fleet** shows
its units and the launch planner; a fleet in orbit with a Colony Ship lists
the body's free regions, each with a Colonise button.

#### News ticker (bottom)

The latest events in one slim line.

### Navigating: Google Maps at solar-system scale

| Input | Does |
|---|---|
| Scroll wheel, pinch, `+` `−` | Zoom toward the cursor, continuously, from the whole system down to low orbit over a region |
| Left-drag, one-finger drag, arrows / WASD | Pan |
| Right-drag, two-finger twist, `Q` `E` | Rotate the view |
| Click a body, or pick it in the empire menu | Eased fly-to; the camera then follows that body along its orbit |
| Click a region (zoomed in) | Select it: the panel shows its actions |
| `[` `]` | Cycle bodies; Enter focuses; Esc backs out one level (open breakdown → region → body → system) |

The canvas is not the only way in: the empire menu and selection panel are real
DOM, and an off-screen list of every body and region (shown on keyboard
focus) mirrors the map, so keyboard and screen-reader users reach every
action (goals.md P7).

Scale is meant to impress: orbits are log-scaled but generously spaced, and
body sizes keep their real proportions compressed rather than flattened
(radius^0.75, so Jupiter is about six Earths across and the Sun dwarfs
everything). Far away, bodies keep a minimum on-screen size so the inner
planets still read. Labels fade in by zoom level so the screen never gets
crowded. Bodies don't spin on screen: a day is one second, which would only
blur; the terminator follows each body round its orbit.

### Rendering: a visual spectacle, within budget

| Piece | Approach |
|---|---|
| Engine | Three.js, logarithmic depth buffer (every custom shader writes it, so bodies are solid, never see-through) |
| Surfaces | **Real imagery** on every playable body, so each looks like the real world. Earth: Solar System Scope day, night (city lights) and clouds, its oceans shining where the region map has no land; the night side's lights still grow with buildings in regions you can see. Sun, Mercury, Venus (its cloud deck), Luna, Mars, Jupiter, Saturn, Uranus, Neptune: Solar System Scope. Io, Europa, Ganymede, Callisto, Titan, Vesta, Phobos, Triton, Pluto: USGS Astrogeology global mosaics from Galileo, Voyager, Cassini, Dawn, Viking and New Horizons; Enceladus, Titania, Oberon: NASA/JPL maps; Deimos: a CC BY-SA colour map. Greyscale mosaics are tinted to the body's real colour; unimaged gaps are filled from the mirrored hemisphere, then blended. Psyche has no global map and Ceres no public albedo mosaic, so both keep their procedural look. Decorative minor bodies keep the procedural shaders |
| Textures | Equirectangular maps converted to WebP by `scripts/worlds.ts` (`pnpm worlds`) from the documented sources, in tiers 512 / 2K, plus 4K for Earth's day map; 6.6 MB in all, committed. The procedural shaders render first and stay as the fallback; real textures stream in after the game is interactive, so first render is unchanged. Credits in the Guide's footer and the user menu |
| Atmospheres | Rim-glow shells for Earth, Venus, Mars, Titan and the gas giants |
| Sun and space | Large emissive sun with corona glow, bloom (off on phones), deep star field |
| Rings | Saturn's banded rings with gaps; faint rings on Uranus |
| Detail | Sphere detail by body size; the focused body holds its top tier, others drop to 512 |

### A full, busy system

Beyond the 25 playable bodies, the system is crowded with **decorative,
non-colonisable** bodies so it feels alive: the main asteroid belt
(thousands of rocks), Jupiter's Trojan swarms at ±60°, the Kuiper belt, the
dwarf planets Eris, Makemake, Haumea and Sedna, Pluto's Charon, the minor
moons of the giants (Mimas, Tethys, Dione, Rhea, Iapetus, Amalthea, Miranda,
Ariel, Umbriel), and six real comets (Halley, Encke, Hale-Bopp,
Swift-Tuttle, 67P, Tempel 1) on their real elliptical orbits, with tails
pointing away from the Sun that grow as they near it. Moons sit in their real
order around their planet. All move on their own orbits; the belt has
Kirkwood gaps. Named minor bodies carry dim, unclickable labels (far dwarf
planets only in the system view) and no game rules: nothing there can be
claimed.

### Regions on the surface

Regions follow real geography. Each body has a **region map**: an
equirectangular image where every pixel holds its region's index (0 for
none), built once by `scripts/worlds.ts`:

- **Earth:** the real country and province borders from Natural Earth
  (1:50m countries via `world-atlas`, 1:10m admin-1 for the US, Russia and
  China), each filled with the region its country belongs to (§4). Oceans
  are 0. Borders follow real coastlines and frontiers.
- **Other bodies:** a weighted spherical Voronoi around each region's real
  feature centre, weighted by the feature's real diameter (USGS Gazetteer),
  so a large basin claims a large region and boundaries fall between real
  features. Single-region bodies are one region.
- **Gas giants:** no surface regions; the orbital regions are bands drawn
  around the planet (§4).

The shader samples the region map to tint owned regions and draws borders
as glowing holographic lines where the index changes, over the real
texture. Labels and fly-to use each region's anchor: its lat/lon in
`rules/data/map.ts` (the feature centre off Earth), tested to lie inside the
region on its map. Overseas pieces of a country more than 25° from its
mainland (French Guiana, Réunion) join the nearest region instead.

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
- **Armies:** an army icon with a count pinned on every region whose
  garrison you can see, in its owner's colour; Armies marching on Earth as
  the same icon moving along a line between the two regions, with ETA.
  Same vision rule as fleets: nothing for Armies you can't see.
- **Battles:** a pulsing crossed-swords icon on a region in a ground battle,
  clickable to open its Battle panel; space battles flash in orbit. Either
  kind puts the Lanchester result in the ticker.
- **Choosing a start:** the camera opens on Earth with free start regions
  lit and taken ones in their owners' colours; click one to begin (also
  listed for keyboard users).

### Phone (390×844)

The map stays full-screen; the selection panel, Empires, Guide and tech
overlays become bottom sheets; the empire menu collapses to a button; the
slot grid keeps its tiles at ≥ 44 px; tap targets ≥ 44 px; pinch to
zoom, two-finger twist to rotate; bloom off, decorative bodies thinned.

### Budgets

| Budget | Target |
|---|---|
| First render | < 3 MB download (procedural surfaces, region maps, fonts), interactive on slow 4G; real textures stream after |
| Frame rate | 60 fps desktop, 30 fps phone |
| Pixel ratio | Capped at 2 desktop, 1.5 phone; post-processing off on phone |
| GPU memory | < 300 MB |
| Graphics | Quality tiers high, medium, low (system-design.md §8): auto starts high on desktop, medium on phone, and steps down when frames stay slow; the user menu's Graphics item overrides it, kept per browser |

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
  multi-hour world runs in milliseconds.

### Keep sim runs cheap

Bot runs cost nothing but wall-clock time; LLM playtests draw on the credit
budget. Default sim runs to a short simulated window (15 to 20 simulated
minutes is enough to see whether the early game works) rather than the full
first 60 minutes, and only run longer when specifically checking stages
past the third or late-game behaviour. LLM playtests are used sparingly: a handful
of short sessions, not a continuous loop.

### Players

| Player | What it is | Used for |
|---|---|---|
| **Scripted bots** | Fixed strategies: Expander (claims aggressively), Builder (Industry-first economy), Trader (leans on the Exchange and offers), Conqueror (military build, invades), Researcher (Science rush), Random | Seeded runs: balance numbers, dominant strategies, deadlocks |
| **LLM playtesters** | `/playtest` (build-process.md G): six Haiku agents, one per score path (Territory, Economy, Tech) and stance (aggressive, cooperative), play a live local server through `scripts/play.ts`, each turn reading a compact view and sending commands; a Sonnet analyst watches as admin | Feel, goal alignment, whether rejections teach (P2), dominant paths. Each scores the rubric below with evidence |
| **Mixed tables** | LLM players alongside the scripted bots' numbers from the same run | Diplomacy, war and trade under pressure |

Scripted bots decide every 15 simulated seconds. LLM playtesters play in real
time, so a run is one 20 min stage, capped at 25 min, or shorter if one
nation passes 50% of the score after minute 10.

### Balance targets (enforced)

These become tests in `sim/` (its own vitest project; the shipped config only
includes `spec/`).

| Target | Value |
|---|---|
| Voidcraft's Thrust Vectoring researched | ~2 min |
| First off-Earth colony | 5 to 8 min (never before 5 min) |
| First Mars colony | 12 to 25 min |
| Dead time (decision points with no useful action), first 30 min | < 20% |
| Deadlock | none: from any start, a sensible bot always reaches Voidcraft 2 |
| Strategy win rates | every bot strategy wins 10 to 35% of stages 1 to 3 |
| Snowball | leader holds < 40% of total score at 30 min |
| Late joiner (joins at 30 min) | reaches 25% of median score by 60 min, and wins at least one stage in 10% of runs |
| Respawn | survives its protection window and holds a region 10 min later in 80% of runs |
| Stage winners | no nation wins all of stages 1 to 3 in more than 50% of runs |
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

1. Run the bot suite after any `rules/data/` change; run `/playtest` once
   after a build run finishes.
2. Read the metrics and the report; pick the ACT items (build-process.md G's
   loop rule).
3. Change one number in `rules/data/`.
4. Rerun; record before and after in `docs/balance-log.md` with the commit.

## 14. Settled calls

Calls made during the build where this document was silent, kept here so
the ledger stays short. Each is in force; numbers are in `rules/data/` and
sim-tunable. Revisit through `comp4020-update` like any other design change.

D4: a stage's base score is taken at its end,
before the next modifier applies, so the boost counts as gain for all
alike. A rules version change at boot closes the world rather than patch
old snapshots. Stage length 20 min, ranking by gain, and
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
- Sim "dead time" counts decision points where no affordable build,
  replace, research, train, ship, launch, colonise, invade or Envoy is
  legal. March, war and trade-accept no longer count: the first `/playtest`
  had 5 of 6 players over 20% dead while the old measure said 0%.
- Owning any Earth region shows every Earth region's owner and Armies
  (§11, P5): seeing rival counts across Earth is intended. A region with 0
  Armies shows no count.
- A nation choosing its start sees Earth start-region owners (documented).
- Respawn resets stocks to the starting kit.
- Asteroid J2000 longitudes are approximate (`map.ts`). Off-Earth region
  names are IAU features; E2 replaces invented ones and their placement.

# G05. Fog of war and paid Envoys

**Status:** Accepted (sensors and fog in 7549419; Envoy as an empire-wide
embassy with the Trade Multiplier in a3f28b4).
**Serves:** P5, S6, P3.

## Context

Part of the world is a harsh one. If every player sees everything, scouting
is not a choice and surprise attacks are impossible. Total blindness gives
no way to learn about a rival at all. The goal (P5) is that what you know
about your rivals is earned, not given.

## Options

| Option | For | Against |
|---|---|---|
| Full map vision | Simple; easy to build | No harsh frontier; no value in information |
| Classic fog with "last seen" ghosts | Familiar | Stale data misleads; leaks history the player did not earn |
| Scout ships with sensor range | Spatial and tactile | More units and rules; travel times make scouting slow |
| **Sensors from owned ground, plus paid Envoys** | Two clear routes to intel, each with a cost | Players see little early; needs strict server-side filtering |

## Decision

Owning any region on a body gives full, live vision of that body.
Everywhere else renders exactly like unclaimed space: no last known owner,
no ghost fleet. An Envoy, unlocked by Science's Signals Intelligence rung,
sits at a rival's capital for an Energy upkeep per minute and gives live
empire-wide vision of that nation's fleets and territory, never its
buildings, and opens a Trade Multiplier (1 + 0.15 per Science rung of the
Envoy holder). Stop paying and it recalls itself.

The author agreed with the reasoning: the world is harsh, and information is
earned, not given.

## Consequences

The server must filter every message to what each nation can see, which
makes fog a security property (S6) as much as a design one. Checks:
`rules/observe.test.ts` (nothing off sensed bodies; an Envoy shows
territory and fleets, never buildings); `spec/game.test.ts` (no data for
unsensed bodies reaches the client); `rules/trade.test.ts` (Envoy upkeep,
recall, the multiplier). P5's simulated target, Envoy cost against the value
of its intel and multiplier, has no row in `sim/report.ts` yet; whether
scouting feels like a real decision is judged by playtest.

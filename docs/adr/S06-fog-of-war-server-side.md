# S06. Fog of war is enforced by the server

**Status:** Accepted 2026-10-02 (8745d21, built in c3333c8).
**Serves:** P5, S6, S3.

## Context

What you know about rivals is earned, not given (goals.md P5). A region you
have no vision on must render exactly like an unclaimed one: no owner, no
buildings, no fleets, no stale data. Anything the server sends, a player can
read in devtools.

## Options

| Option | For | Against |
|---|---|---|
| **Server filters per nation; never sends what it has no vision on** | Nothing to leak or mis-render; smaller messages | A per-nation view and diff every tick |
| Broadcast one public world, hide in the client | One view per tick | Every client holds rivals' data; the fog is a UI choice anyone can lift |

## Decision

`observe(state, nationId)` (`rules/observe.ts`) computes each nation's view
every tick from a set of owned bodies (sensors) and a set of nation ids it
holds an Envoy on, at most 24 of each (system-design.md §6):

| Tier | What | Who |
|---|---|---|
| Globally public | Wars, alliances, members, invites, sanctions, stage, scores, presence, news, each region's existence and slot count, each nation's capital | Every client |
| Vision-gated, full | A region's owner, buildings, garrison, battle, fleets present or in transit, marches | A nation with a sensor: owns any region on that body |
| Vision-gated, partial | Owner, garrison, battle, fleets, marches; never buildings | A nation with an active Envoy on the owning nation |
| Private | Stocks and rates, queues, research, its trade offers, its Envoys | That nation alone |

Capitals are public so an Envoy can be targeted. Stocks stay private even
inside sensor range. A region leaving vision is resent whole with owner,
buildings and armies absent; a fleet leaving vision goes in
`removed.fleets` (§14.3).

## Consequences

- The vision filter is a handful of set lookups; tick CPU stayed at 2.9% of
  budget with it (docs/measurements.md).
- Rules out any feature that grants vision outside sensors and Envoys.
- Checked by `rules/observe.test.ts` "shows everything on a sensed body,
  nothing elsewhere", "shows marches and battles only where you have
  vision", "gives an Envoy territory and fleets, never buildings";
  `spec/game.test.ts` "never sends another nation's private state" and
  "sends nothing about regions on bodies it has no sensor on". No test
  checks over the socket that Envoy vision appears by the next tick after
  `sendEnvoy` and lapses the tick its upkeep goes unpaid (P5), or that a
  region leaving vision is resent with owner absent.

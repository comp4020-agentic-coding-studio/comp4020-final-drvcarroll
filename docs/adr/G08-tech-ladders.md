# G08. Four tech ladders of six rungs

**Status:** Accepted (cut from 6 ladders x 8 rungs in 7549419).
**Serves:** P3, P6, P5.

## Context

Tech is one of the three scores (G01) and the lever that speeds up every
other path. A big tree adds options but buries the player; a tiny one gives
everyone the same game. An earlier draft had six ladders of eight rungs.

## Options

| Option | For | Against |
|---|---|---|
| A single linear track | Trivial to learn | One-dimensional; every player researches the same order |
| A large branching web (6 x 8, cross-dependencies) | Depth and variety | Too complex to be fun; a strong player sees a third of it in an hour |
| **Four independent ladders of six rungs** | One ladder per path plus the cost of holding ground; clear next step | Fewer combinations than a web |

## Decision

Voidcraft (faster, cheaper ships; reach is a cost it lowers, never a wall),
Industry (yields and Power Plant modes), Science (research output and the
only route to an Envoy) and Society (the cost of holding territory: colony
upkeep, slots, Envoy slots). Rung n needs rung n − 1 in its own ladder; no
ladder depends on another. Costs double per rung, 40 to 1280 R, one research
at a time: 24 rungs, so an hour sees a strong player hold about half.

The author's reasoning: one ladder per path, plus Society for the cost of
holding territory, balancing complexity and playability. Too complex is not
fun; too simple is one-dimensional and does not lead to emergent behaviour.

## Consequences

No tech ever gates expansion, trade or self-defence; Colony Ship, Freighter,
Transport and Corvette are ungated, so tech speeds paths up rather than
locking them. Checks: the sim's progression target (leader holds about 10
rungs; no ladder finished before 40 min: first ladder at 58.3 min, met);
Thrust Vectoring at about 2 min (2.3 min, met; also
`rules/economy.test.ts`); `rules/fleets.test.ts` (Voidcraft speed and
launch cost). The researcher bot wins only 1% of stages in the latest
report, an open P3 item that balance loop 3 attributes to bot play.

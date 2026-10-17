# G01. Three scores; military and trade are only instruments

**Status:** Accepted (goals in 6325c60, mechanics in 7549419).
**Serves:** P3, P6.

## Context

The core idea is growth. A player dropped into the solar system should be
able to chase it as a conqueror, trader, builder, researcher or any mix. A
single score would reward one of those and make the rest decoration. 6325c60 replaced
a five-verb framing with one drive measured three ways.

## Options

| Option | For | Against |
|---|---|---|
| One score (e.g. regions held) | Simple to read and rank | One dominant path; every other mechanic becomes a means to it |
| Five scores, one per verb, military and trade included | Every activity is visibly rewarded | Rewards fighting and trading for their own sake; too many axes to read |
| **Territory, Economy, Tech; military and trade as instruments** | Three distinct ways to grow; fighting and trading matter only through what they grow | Military and trade players must convert their activity into a score, so tuning has to make that conversion fair |

## Decision

Growth is scored as Territory (5 per region, +20 per whole body), Economy
(1 per 5 production per minute) and Tech (rung number per rung held), summed
and uncapped. A fleet that never takes ground scores nothing; a trade surplus
counts only once spent. Every mechanic must serve one of the three, directly
or as an instrument.

In the author's words, the game should be multi-dimensional and accommodate
many different players' ideologies and playstyles, for two reasons: larger
mass appeal, and a comment on the variance of methods of human growth.

## Consequences

Every feature now has to pass the scope test in `goals.md` (it grows one of
the three, or it does not ship). The cost is balance work: three paths must
each be sufficient to win. P3's target is that each of six bot strategies
wins 10 to 35% of stages 1 to 3, measured by `sim/balance.test.ts` through
`sim/report.ts`. The latest report does not meet it (trader 58%, conqueror
0%, researcher 1%); balance-log loops 2 and 3 diagnose this as bot play
rather than rules, so the target stays open. `rules/score.ts` computes the
three scores; ranking is checked in `rules/economy.test.ts`.

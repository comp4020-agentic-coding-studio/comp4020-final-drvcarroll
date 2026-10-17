# G09. Alliances and sanctions

**Status:** Accepted (docs in e52c0a1, rules in 042cd57).
**Serves:** P3, P6.

## Context

Before this, every relationship was one to one: war or peace, a trade or
not. A hyper-aggressive player could pick off neighbours one at a time, and
there was no way for weaker nations to answer together. Playtest feedback
asked for more between players than trade and war alone.

## Options

| Option | For | Against |
|---|---|---|
| No formal diplomacy | Nothing to build | Aggressors face rivals one at a time; no collective answer |
| Full alliances with shared vision, stocks or score | Strong cooperation | Breaks the harsh frontier (G05) and blurs who grew (G01) |
| **Alliances for who fights and trades with whom, plus sanctions** | A real collective response; keeps scores, stocks and vision separate | More rules to learn and test |

## Decision

An alliance is a pact of up to 4 nations, formed by invite and accept. It
shares no score, stocks or vision. Joining forces peace between members.
Members still declare their own wars, but where they fight the same nation
their fleets fight as one side and their Armies join each other's attacks
and defences. Any member can sanction an outsider: no offer, accept or gift
passes between any member and that nation, and open offers are cancelled.
The Earth Exchange and Envoys are unaffected, so a sanctioned nation is
squeezed, never cut off. Alliances and sanctions are public.

The author's reasoning: it adds another dimension to the game, it came from
playtesting feedback, and it helps balance hyper-aggressive players.

## Consequences

Trade becomes a lever of pressure as well as a source of goods, and military
becomes collective, both still instruments toward the three scores (G01).
The cost is ally bookkeeping in combat (per-nation counts, losses in
proportion, survivors marching home) and in replay. Checks:
`rules/alliance.test.ts` (forced peace, member cap, sanctions block trade
both ways, two allied fleets beat one neither beats alone, allied Armies
join and return, replay through alliances and sanctions); `server/server.test.ts`
and the e2e invite test. Whether it actually curbs aggressors is judged by
playtest; the sim bots do not yet form alliances.

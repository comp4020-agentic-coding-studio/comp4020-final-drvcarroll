# G06. Stages every 20 minutes in a world that never ends

**Status:** Accepted (docs in e52c0a1, rules in 0534c10). Supersedes the
1-hour season with a score threshold at 50 ± 10 min.
**Serves:** P6, P9, P3.

## Context

The game first ran in seasons: a world ended at a score threshold or a
60-minute cap, crowned a winner, and started over. In playtest the game
simply stopped at season end, mid-plan. The game will run in a showcase
room where people drop in and out at any time, and a visitor may play for
five minutes or an hour.

## Options

| Option | For | Against |
|---|---|---|
| Keep seasons that end | Clear winner; fresh starts | The game stops on the player; late arrivals land in a dying world |
| Endless world, one running leaderboard | Never stops | Early leaders snowball; nothing to aim for in a short session |
| **Endless world cut into 20-min stages ranked by gain, each adding a global modifier** | Never stops; a short session can win a stage; the world changes as it ages | More rules (modifiers); history must be kept per stage |

## Decision

The world never ends on its own; only the admin reset clears it. Every 20
minutes a stage closes, ranking score gained during it (from joining, for
mid-stage arrivals), recording the top three in the hall of fame. From
stage 2 each stage adds a stacking global modifier: Industrial Age, Space
Age, Information Age, Expansion Age, Fusion Age, then Golden Age.

The author's reasoning: playtest showed the game just stopping at season
end; a never-ending world suits the showcase room, and it should also
accommodate different length game sessions.

## Consequences

Ranking by gain, not size, keeps a small or late empire in contention.
Stage ends are scheduled events (G03), so an idle server catches up
exactly. Checks: `rules/economy.test.ts` (stages advance every 20 min, rank
gain, never end; a late joiner can top a stage; modifiers apply to
everyone); `server/server.test.ts` (stages catch up while nobody is
connected); the sim's stage-winner target (no nation sweeps stages 1 to 3
in more than half of runs: 8 of 24, met).

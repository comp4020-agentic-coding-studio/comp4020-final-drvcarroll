---
name: playtest
description: Six Haiku players (3 score paths x aggressive/cooperative) play a live local Interstellar Expansion server while a Sonnet analyst measures, then a synthesis agent writes one compact balance and goal-alignment report. Run once after comp4020-resume finishes, never per unit. Use for "/playtest", "playtest the game", "run a playtest".
---

Replaces the old `.claude/workflows/playtest.js` pseudocode (no such
workflow-file runner exists in Claude Code — `phase()`/`agent()`/`parallel()`
were never real). This skill does the same job with real tool calls: the
`Agent` tool, run in parallel, using the existing `analyst` and `playtester`
subagent definitions in `.claude/agents/`.

Default cap: 25 minutes (a stage is 20 min). If the user's `/playtest`
argument gives a different number of minutes, use that instead everywhere
below.

## 1. Start the server

Run from the repo root, yourself (not delegated):

```
node --disable-warning=ExperimentalWarning scripts/play.ts start <minutes> \
  terr_war terr_coop econ_war econ_coop tech_war tech_coop
```

Confirm it printed `server on` before continuing.

## 2. Play (one message, parallel Agent calls)

Launch the analyst and all six playtesters as **separate `Agent` tool calls
in a single message** so they run concurrently. Use `subagent_type: "analyst"`
and `subagent_type: "playtester"` (defined in `.claude/agents/`).

Players (username, path, stance):

| user | path | stance |
|---|---|---|
| terr_war | Territory | aggressive: claim fast, build Armies and warships, declare war and invade rivals, take their regions |
| terr_coop | Territory | cooperative: expand peacefully off Earth by colonising, ally neighbours, trade for what you lack |
| econ_war | Economy | aggressive: build the strongest production, sanction and pressure rivals, fight to protect and seize productive regions |
| econ_coop | Economy | cooperative: build production, trade surpluses with other players and the Exchange, join an alliance |
| tech_war | Tech | aggressive: rush research, use Voidcraft for strong warships, strike whoever threatens you |
| tech_coop | Tech | cooperative: rush Labs and Science, send Envoys for the trade multiplier, trade and ally for resources |

**Analyst prompt:**

> You are the analyst for this run (cap `<minutes>` min). Players: terr_war
> (Territory, aggressive), terr_coop (Territory, cooperative), econ_war
> (Economy, aggressive), econ_coop (Economy, cooperative), tech_war (Tech,
> aggressive), tech_coop (Tech, cooperative). Follow your instructions.
> Return your report as JSON only, matching this shape: `{ stoppedBecause,
> minutes, snapshots: [{minute, totals}], leaders: {territory, economy,
> tech, total, leaderShare}, interactions: {wars, trades, alliances,
> invasions}, rejections: {<code>: count}, simTargets: [{target, measured,
> met}], logTellsStory: {ok, gaps: []} }`.

**Each playtester prompt** (one per row above):

> Your username: `<user>`. Your path to growth: `<path>` (win on the
> `<path>` score above all). Your stance: `<stance>`. Join a free Earth
> region first. Play until STOP, then report. Return your report as JSON
> only, matching this shape: `{ user, finalScore: {territory, economy,
> tech, total}, played, rubric: {knewWhatToDo, choicesMattered,
> winsFastGoalsEarned, waitingWasAnticipation, othersChangedPlans} (each
> `{score: 1-5, evidence}`), confusions: [], goals: [{goal, verdict:
> met|broken|unclear, evidence}] (for P1 to P6), suggestion }`.

Collect all seven results before moving on.

## 3. Report (synthesis)

Launch one more `Agent` call (fresh, no subagent_type needed) with the
analyst's and players' JSON embedded in the prompt, asking it to read
`docs/goals.md` and `game-design.md` §13, then write the `/playtest` report:
run length and why it stopped, final scores per player (table), whether
every path won (P3, P6, snowball share), a goal-alignment table (P1 to P6,
S7, verdict, evidence, how many players agreed), the five rubric questions
(mean + sharpest evidence), and at most 5 ranked recommendations each tagged
**ACT** (breaks a §13/goals.md numeric target, or a P1/P2/P10 confusion from
2+ players, or touches multi-user/real-time/persistence) or **LOG**
(everything else). Under 450 words, no em dashes.

Stop the server after: `node --disable-warning=ExperimentalWarning scripts/play.ts stop`.

Present the synthesis agent's report to the user as the final output of
`/playtest`.

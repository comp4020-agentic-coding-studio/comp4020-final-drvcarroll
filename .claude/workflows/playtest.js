export const meta = {
  name: 'playtest',
  description: 'Six Haiku players (3 score paths x aggressive/cooperative) play a live local server while an analyst measures; returns a compact balance and goal-alignment report',
  phases: [{ title: 'Setup' }, { title: 'Play' }, { title: 'Report' }],
}

// args: { minutes?: number } caps the run (default 25; a stage is 20 min).
const minutes = (args && args.minutes) || 25

const PLAYERS = [
  { user: 'terr_war', path: 'Territory', stance: 'aggressive: claim fast, build Armies and warships, declare war and invade rivals, take their regions' },
  { user: 'terr_coop', path: 'Territory', stance: 'cooperative: expand peacefully off Earth by colonising, ally neighbours, trade for what you lack' },
  { user: 'econ_war', path: 'Economy', stance: 'aggressive: build the strongest production, sanction and pressure rivals, fight to protect and seize productive regions' },
  { user: 'econ_coop', path: 'Economy', stance: 'cooperative: build production, trade surpluses with other players and the Exchange, join an alliance' },
  { user: 'tech_war', path: 'Tech', stance: 'aggressive: rush research, use Voidcraft for strong warships, strike whoever threatens you' },
  { user: 'tech_coop', path: 'Tech', stance: 'cooperative: rush Labs and Science, send Envoys for the trade multiplier, trade and ally for resources' },
]

const RUBRIC = {
  type: 'object',
  required: ['score', 'evidence'],
  properties: { score: { type: 'integer', minimum: 1, maximum: 5 }, evidence: { type: 'string' } },
}

const PLAYER_REPORT = {
  type: 'object',
  required: ['user', 'finalScore', 'played', 'rubric', 'confusions', 'goals'],
  properties: {
    user: { type: 'string' },
    finalScore: { type: 'object', properties: { territory: { type: 'number' }, economy: { type: 'number' }, tech: { type: 'number' }, total: { type: 'number' } } },
    played: { type: 'string', description: 'Two or three sentences: what you did, in order, with minutes' },
    rubric: {
      type: 'object',
      required: ['knewWhatToDo', 'choicesMattered', 'winsFastGoalsEarned', 'waitingWasAnticipation', 'othersChangedPlans'],
      properties: {
        knewWhatToDo: RUBRIC, choicesMattered: RUBRIC, winsFastGoalsEarned: RUBRIC,
        waitingWasAnticipation: RUBRIC, othersChangedPlans: RUBRIC,
      },
    },
    confusions: { type: 'array', items: { type: 'string' }, description: 'Rejections or moments that left you unsure what to do, verbatim where possible' },
    goals: {
      type: 'array',
      description: 'For P1 to P6 (goals.md), what your game showed',
      items: {
        type: 'object', required: ['goal', 'verdict', 'evidence'],
        properties: { goal: { type: 'string' }, verdict: { enum: ['met', 'broken', 'unclear'] }, evidence: { type: 'string' } },
      },
    },
    suggestion: { type: 'string', description: 'The one change that would most improve your game' },
  },
}

const ANALYST_REPORT = {
  type: 'object',
  required: ['stoppedBecause', 'minutes', 'snapshots', 'leaders', 'interactions', 'rejections', 'simTargets', 'logTellsStory'],
  properties: {
    stoppedBecause: { type: 'string' },
    minutes: { type: 'number' },
    snapshots: { type: 'array', items: { type: 'object', properties: { minute: { type: 'number' }, totals: { type: 'object' } } } },
    leaders: { type: 'object', properties: { territory: { type: 'string' }, economy: { type: 'string' }, tech: { type: 'string' }, total: { type: 'string' }, leaderShare: { type: 'number' } } },
    interactions: { type: 'object', properties: { wars: { type: 'number' }, trades: { type: 'number' }, alliances: { type: 'number' }, invasions: { type: 'number' } } },
    rejections: { type: 'object', description: 'count by code across all players' },
    simTargets: { type: 'array', items: { type: 'object', properties: { target: { type: 'string' }, measured: { type: 'string' }, met: { type: 'boolean' } } } },
    logTellsStory: { type: 'object', properties: { ok: { type: 'boolean' }, gaps: { type: 'array', items: { type: 'string' } } } },
  },
}

phase('Setup')
await agent(
  `From the repo root run: node --disable-warning=ExperimentalWarning scripts/play.ts start ${minutes} ${PLAYERS.map((p) => p.user).join(' ')}
Confirm it printed "server on". Reply with that line only.`,
  { label: 'start server', model: 'haiku' },
)

phase('Play')
const [analyst, ...players] = await parallel([
  () => agent(
    `You are the analyst for this run (cap ${minutes} min). Players: ${PLAYERS.map((p) => `${p.user} (${p.path}, ${p.stance.split(':')[0]})`).join(', ')}. Follow your instructions.`,
    { label: 'analyst', agentType: 'analyst', model: 'sonnet', schema: ANALYST_REPORT, stallMs: 2400000 },
  ),
  ...PLAYERS.map((p) => () => agent(
    `Your username: ${p.user}. Your path to growth: ${p.path} (win on the ${p.path} score above all). Your stance: ${p.stance}.
Join a free Earth region first. Play until STOP, then report.`,
    { label: p.user, agentType: 'playtester', model: 'haiku', schema: PLAYER_REPORT, stallMs: 2400000 },
  )),
])

phase('Report')
return await agent(
  `You write the /playtest report for Interstellar Expansion. Read docs/goals.md (the targets) and the balance targets table in docs/game-design.md §13. Then synthesise the data below into one compact markdown report, under 450 words, no em dashes:

1. **Run**: length, why it stopped, final scores per player (one table: player, path, stance, T, E, R, total).
2. **Did every path win?** Which path and stance led, P3 (every path a real path), P6 pacing, snowball share. Cite numbers.
3. **Goal alignment**: a table, goal | verdict (met / broken / unclear) | evidence, for P1 to P6 and S7, merging the six players' verdicts and the analyst's log check. Count how many players agreed.
4. **Feel**: the five rubric questions, mean score and the sharpest evidence for each.
5. **Recommendations**: at most 5, ranked. Each: the change (a rules/data number, a reason message, or a UI hint), the goal it serves, the evidence, and a tag **ACT** or **LOG**. ACT only if it breaks a numeric target in goals.md or §13, OR is a P1/P2/P10 confusion reported by 2+ players, OR touches multi-user, real-time or persistence. Everything else is LOG.

Analyst: ${JSON.stringify(analyst)}
Players: ${JSON.stringify(players.filter(Boolean))}`,
  { label: 'synthesis', model: 'sonnet' },
)

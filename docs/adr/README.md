# Architecture Decision Records

One decision per file: context, options, decision, consequences. A changed decision gets a new record that supersedes the old one.

## Game

| Goal | Purpose | ADR |
|---|---|---|
| [Growth, measured three ways](../game-design.md#1-the-idea) | Territory, Economy and Tech each win alone, so every playstyle is a real path | [G01](G01-growth-measured-three-ways.md) |
| [Real orbits at a playable pace](../game-design.md#2-pace-and-orbits) | One day is one second; transfer windows make distance and timing a cost | [G02](G02-real-orbits-at-a-playable-pace.md) |
| [Analytic time](../game-design.md#3-time-model-analytic) | The world advances from rates and events, so it keeps going while nobody watches | [G03](G03-analytic-time.md) |
| [The real solar system](../game-design.md#4-map) | 25 bodies and 74 regions with uneven yields, so nobody is self-sufficient | [G04](G04-the-real-solar-system.md) |
| [Six resources](../game-design.md#5-resources-6) | Enough to manage and trade, without the economy becoming a full-time job | [G05](G05-six-resources.md) |
| [Seven buildings](../game-design.md#6-buildings-7) | One output each; four Earth slots force real choices | [G06](G06-seven-buildings.md) |
| [Instrumental, deterministic military](../game-design.md#7-military) | Combat follows Lanchester's laws with no dice; armies matter only through what they take | [G07](G07-instrumental-deterministic-military.md) |
| [Four independent tech ladders](../game-design.md#8-tech-4-ladders--6-rungs) | A research path strong enough to win on its own | [G08](G08-four-independent-tech-ladders.md) |
| [Trade, alliances and sanctions](../game-design.md#9-trade) | Cooperation is as real a strategy as conquest | [G09](G09-trade-alliances-and-sanctions.md) |
| [Stages in a world that never ends](../game-design.md#10-victory-stages-in-a-world-that-keeps-going) | Scored every 20 minutes, then a new modifier, and the world carries on | [G10](G10-stages-in-a-world-that-never-ends.md) |
| [Fair starts, earned information](../game-design.md#11-players-and-presence) | Playing within a minute; you only see what you hold or pay to watch | [G11](G11-fair-starts-earned-information.md) |
| [The map is the game](../game-design.md#12-visuals-the-map-is-the-game) | A real, navigable solar system as the screen, with panels only for what you select | [G12](G12-the-map-is-the-game.md) |
| [Balanced by agents](../game-design.md#13-headless-sim-and-agent-playtesting) | Bots and LLM players test every path before players do | [G13](G13-balanced-by-agents.md) |
| [Calls recorded as they're made](../game-design.md#14-settled-calls) | Decisions made mid-build stay in force and can be revisited | [G14](G14-calls-recorded-as-they-re-made.md) |

## System

| Goal | Purpose | ADR |
|---|---|---|
| [Fit one small machine](../system-design.md#1-constraints-that-shape-everything) | One shared CPU and 256 MB, auto-stopping when idle | [S01](S01-fit-one-small-machine.md) |
| [One TypeScript stack](../system-design.md#2-stack) | Server, client and sim share one rules module, so they can't disagree | [S02](S02-one-typescript-stack.md) |
| [Pure rules at the centre](../system-design.md#3-repo-layout) | Game logic has no I/O, so it runs identically everywhere | [S03](S03-pure-rules-at-the-centre.md) |
| [Command log plus snapshots](../system-design.md#4-persistence-command-log-plus-snapshots) | Every move stored in order; replay rebuilds the world exactly | [S04](S04-command-log-plus-snapshots.md) |
| [One writer, a 500 ms tick](../system-design.md#5-the-server-loop-a-500-ms-tick) | Simultaneous moves resolve in one fair, deterministic order | [S05](S05-one-writer-a-500-ms-tick.md) |
| [Filtered real-time sync](../system-design.md#6-real-time-sync) | One WebSocket; each client gets only what its fog of war allows, within a second | [S06](S06-filtered-real-time-sync.md) |
| [Server efficiency budget](../system-design.md#7-server-efficiency-budget) | Memory, CPU and bandwidth limits that hold at 30 players | [S07](S07-server-efficiency-budget.md) |
| [Client rendering budget](../system-design.md#8-client-rendering-budget) | A spectacle that still runs on integrated graphics and phones | [S08](S08-client-rendering-budget.md) |
| [Accounts and sessions](../system-design.md#9-accounts-and-sessions) | People are told apart securely, and stay signed in | [S09](S09-accounts-and-sessions.md) |
| [Pages and flows](../system-design.md#10-pages-and-flows) | Few pages: sign in, empire, the map and the README | [S10](S10-pages-and-flows.md) |
| [Logging and the live view](../system-design.md#11-logging-and-the-live-view-crit-10) | A world's story can be told from the logs alone | [S11](S11-logging-and-the-live-view.md) |
| [Deploy](../system-design.md#12-deploy) | Boots in a second, migrates safely, survives redeploys | [S12](S12-deploy.md) |
| [Every claim has a check](../system-design.md#13-every-claim-and-its-check) | A promise without a test, measure or judged pass is reworded | [S13](S13-every-claim-has-a-check.md) |
| [Message contract](../system-design.md#14-message-contract) | One typed, validated protocol shared by server and client | [S14](S14-message-contract.md) |

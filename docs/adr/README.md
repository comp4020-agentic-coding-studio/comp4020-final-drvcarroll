# Architecture Decision Records

An ADR here records one decision: the context that forced it, the options
weighed, what was chosen, and what it costs, including which test enforces
it. One decision per file. When a decision is reversed, the old ADR is
marked superseded and a new one is written; accepted ADRs are not edited to
say something different. The S-series covers the system (stack, storage,
sync, security); the G-series covers game mechanics. Goal ids refer to
[goals.md](../goals.md).

## System

| Id | Title | Serves |
|---|---|---|
| [S01](S01-stack.md) | One Node process: Hono, SQLite, Preact and Three.js | S2, S3, S5, P8 |
| [S02](S02-persistence.md) | Persistence: a command log plus snapshots | S4, S5, P9, S7 |
| [S03](S03-contention-and-ordering.md) | Contention: one writer, a 500 ms tick, arrival order | S1, S5, S4 |
| [S04](S04-authoritative-server.md) | The server decides; clients send commands and draw | S1, P9, P2, S6 |
| [S05](S05-transport.md) | Transport: one WebSocket, a filtered diff per client per tick | S1, S3, P9 |
| [S06](S06-fog-of-war-server-side.md) | Fog of war is enforced by the server | P5, S6, S3 |
| [S07](S07-identity-and-authorisation.md) | Identity and authorisation | S6, P9, S7, P5 |
| [S08](S08-pure-rules-engine.md) | A pure rules engine shared by server, sim and client | S5, P2, P3, P6 |
| [S09](S09-logging-and-observability.md) | Logging: one JSON line per action, an SSE live view | S7, S4 |
| [S10](S10-hardcoded-admin.md) | A hardcoded admin account | P9, S7, S5 |
| [S11](S11-vision-ticks-on-the-welcome-budget.md) | A tick that opens a body's vision is held to the welcome budget | S3, S1, P5 |

## Game

| ID | Decision | Serves |
|---|---|---|
| [G01](G01-three-scores.md) | Three scores; military and trade are only instruments | P3, P6 |
| [G02](G02-real-solar-system.md) | The real solar system as the theatre | P4, P6, P10, P3 |
| [G03](G03-time-scale.md) | One game day is one real second | P4, P6, P9, S2, S5 |
| [G04](G04-deterministic-combat.md) | Deterministic combat: Lanchester, no dice, timed ground battles | S5, P3, P10, P2 |
| [G05](G05-fog-and-envoys.md) | Fog of war and paid Envoys | P5, S6, P3 |
| [G06](G06-stages-not-seasons.md) | Stages every 20 minutes in a world that never ends | P6, P9, P3 |
| [G07](G07-resources-and-buildings.md) | Six resources and seven buildings | P1, P3, P6, P2 |
| [G08](G08-tech-ladders.md) | Four tech ladders of six rungs | P3, P6, P5 |
| [G09](G09-alliances-and-sanctions.md) | Alliances and sanctions | P3, P6 |
| [G10](G10-map-is-the-screen.md) | The map is the main screen | P10, P1, P2, P7 |
| [G11](G11-protection-respawn-late-join.md) | New-player protection, respawn and the late-join boost | P6, P1, P3 |
| [G12](G12-conquest-pays.md) | Conquest pays: plunder and a capital Materiel trickle | P3, P6 |

# S05. Transport: one WebSocket, a filtered diff per client per tick

**Status:** Accepted 2026-10-02 (8745d21, built in 82870a0).
**Serves:** S1, S3, P9.

## Context

Changes must reach other open sessions within about a second with no reload,
so the server must push (system-design.md §1). Clients also send commands.
Each client may see a different slice of the world (S06), and slow
connections matter (S3: quiet tick ≤ 500 B, busy ≤ 3 KB, `welcome` ≤ 60 KB).

## Options

From system-design.md §6:

| Option | For | Against |
|---|---|---|
| Polling | Plain HTTP | Two requests a second per client for a 500 ms cadence; commands need a second channel anyway |
| SSE + POST | Viable, plain HTTP | Splits each interaction across two channels; presence can't be seen from the command path |
| **WebSocket** | One ordered channel both ways; disconnect is presence | Needs its own auth on upgrade (S07) and reconnect logic |

## Decision

One WebSocket at `/ws` via `ws`, `permessage-deflate` off (each zlib context
costs hundreds of KB per socket). On connect the client gets a full
`welcome`: its vision-filtered view. Every 500 ms each client gets one
`tick`, always sent so it doubles as a heartbeat. The hub compares that
client's filtered view entity by entity with what it last sent, and sends
changed entities whole, not field diffs (§14.3). An entity leaving vision is
sent like any other change. Reconnect uses exponential backoff with jitter
from 0.5 s to 15 s and a visible "reconnecting" state; every reconnect gets
a fresh `welcome` rather than missed ticks (§6). Close codes: 4001 not
signed in, 4002 session expired, 4003 server restarting, 4004 world reset.

## Consequences

- Measured: quiet tick p95 356 B, busy p95 2471 B, `welcome` max 4.4 KB,
  42 KB/s egress at 30 clients (docs/measurements.md).
- Whole entities cost bytes but the client can never drift out of step.
- A full `welcome` on every reconnect is simpler than replay and costs under
  a second on slow 4G (§6).
- Checked by `server/server.test.ts` "is multi-user and real-time: one
  command, both clients see it within 1 s", "persists across a restart"
  (close 4003), the admin reset test (close 4004), and "rejects wrong
  passwords ... and closes 4001 without a session"; `spec/game.test.ts`
  "delivers one client's command to another within 1 s". No test checks
  message sizes against the S3 limits (only `pnpm load` measures them),
  reconnect backoff, or restore under 3 s (P9).

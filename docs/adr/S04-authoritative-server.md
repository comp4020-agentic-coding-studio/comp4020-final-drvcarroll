# S04. The server decides; clients send commands and draw

**Status:** Accepted 2026-10-02 (8745d21).
**Serves:** S1, P9, P2, S6.

## Context

Players share one world, and some see more of it than others (S06). A slow
link must never show something that didn't happen (P9). The screen draws at
60 fps while ground truth arrives twice a second (system-design.md §6).

## Options

| Option | For | Against |
|---|---|---|
| **Authoritative server; clients send commands only, no optimistic UI** | One source of truth; a client can't cheat outcomes; nothing shown is ever rolled back | Each action waits for the next tick to confirm |
| Optimistic client state with server reconciliation | Instant feedback | A rejected or reordered command must be rolled back on screen; a slow link shows events that never happened |
| Peer-to-peer or client-decided outcomes | No server work | Clients could decide outcomes and would need data they have no vision on |

## Decision

The server runs the `rules/` engine and is the ground truth; clients send
`{t: "cmd", id, cmd}` and never decide outcomes (§5). A command shows as
pending until its result arrives in the next `tick` (§6). Between ticks the
client draws from formulas in the tick, never its own decisions: stocks as
`v + rate × elapsed` clamped to cap, fleets along their arc, bodies by
`position(body, t)`, progress as elapsed ÷ duration. If the next tick
disagrees, the tick wins. Every tick carries server time; the client keeps
a median offset from pings and runs every animation on server time
(`client/src/net.ts`). The HUD calls `rules.validate` on its mirror so
disabled controls show the server's own reason, but the server's answer
still decides (§3).

## Consequences

- Confirmation takes up to one tick plus the round trip: measured command
  round trip p50 261 ms, p95 488 ms (docs/measurements.md).
- Pending commands are resent on reconnect with the same id, which S03's
  idempotency makes safe.
- Rules out instant local outcomes.
- Checked by `server/server.test.ts` "applies a repeated client id once, and
  explains every rejection" (a socket-sent `setEmpire` is refused, so a
  client can't issue server-only commands); `e2e/client.test.ts` "has three
  dropdowns; declares war, attacks and shows the battle drain live" (counts
  fall between ticks). No test checks that the client shows a command as
  pending and changes nothing until its result, or that pending commands
  are resent after a reconnect.

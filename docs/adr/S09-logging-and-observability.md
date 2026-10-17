# S09. Logging: one JSON line per action, an SSE live view

**Status:** Accepted 2026-10-10 (a8d88ec).
**Serves:** S7, S4.

## Context

Crit 10 needs a live view of the server and a world's story told from logs
alone (goals.md S7). Fly collects stdout. Watching the server must not
disturb the game.

## Options

| Option | For | Against |
|---|---|---|
| **One JSON line per action to stdout** | Twelve-Factor XI: the app writes an event stream, the platform collects it; `fly logs` tails it; greppable | No retention beyond what Fly keeps; the `commands` table covers durable history |
| Log files on the volume | Retention | Competes with the DB for the 1 GB volume; needs rotation |
| A hosted log service | Search and dashboards | An external dependency for a single machine |
| **Live view over SSE** (`/api/admin/stream`) | Watching never joins the world or counts as a player (system-design.md §11) | A second channel |
| Live view over the game socket | One channel | The watcher becomes a connected client and a nation |

## Decision

`server/log.ts` writes one line per user action:
`{ts, user, nation, action, target, result, reason?, ms}`, `result` "ok" or
the rejection code, `ms` the apply time. Login, sign-up, logout, connect,
disconnect, boot, idle and reset are logged too. `/admin` is a plain page
fed by an SSE stream once a second: online players, sockets, commands per
minute, rejections by reason, recent actions, tick p50/p99, append p99, RSS
and heap. Admins only; 404 for everyone else (S07). Passwords and session
tokens never appear: only username, action and outcome are written.

## Consequences

- Logs carry usernames and nation ids, so a world's story can be read back.
- The in-memory stats reset on restart.
- Checked by `server/server.test.ts` "writes one JSON line per action, and
  streams live stats to admins only" (fields, rejection reason, sign-up and
  connect lines, `/admin` 404 for non-admins, SSE stats shape) and the admin
  reset test (`reset` line). `pnpm load` records the idle line
  (docs/measurements.md). No test asserts that no log line contains a
  password or session token, or that login, logout and disconnect lines
  are written.

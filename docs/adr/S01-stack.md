# S01. One Node process: Hono, SQLite, Preact and Three.js

**Status:** Accepted 2026-10-02 (8745d21, built in 82870a0).
**Serves:** S2, S3, S5, P8.

## Context

The game runs on one Fly.io shared-cpu-1x machine with 256 MB of RAM, one
volume at `/data`, no database server, and auto-stop when idle
(system-design.md §1, `fly.toml`). The brief needs changes visible to others
within about a second and state that survives restarts. Server, client and
headless sim must agree on every rule (§2).

## Options

| Option | For | Against |
|---|---|---|
| **One Node 24 process: Hono, `ws`, `node:sqlite`; Vite-built Preact + Three.js client** | One TypeScript `rules/` module shared by all three sides; runs `.ts` directly, no server build; embedded DB fits the volume; Hono is small; Preact is 4 KB | One process is one point of failure; no horizontal scale |
| Separate frontend and backend services | Independent deploys | Two processes in 256 MB; the brief needs neither |
| Postgres | Mature, concurrent writers | Needs a server the course setup excludes (§2) |
| JSON file store | No dependency | No atomic writes (§2) |
| Unity WebGL or a game engine | Built-in renderer and tooling | Can't share the TypeScript rules module; a large runtime against a 3 MB first-load budget (P8) |
| SvelteKit or another full-stack framework | Routing and SSR built in | Adds a build and a framework where Hono plus server-rendered pages already cover `/readme/` and the forms (§10) |
| react-three-fiber over imperative Three.js | Declarative scene | A reconciler for a scene that rarely changes shape (§2) |

## Decision

One Node 24 process running `server/main.ts` directly: Hono on
`@hono/node-server` for HTTP, `ws` for the socket, SQLite through built-in
`node:sqlite` in WAL mode on `/data` (`server/db.ts`). The client is Preact
with signals over an imperative Three.js canvas, built by Vite with hashed
asset names. Node starts with `--max-old-space-size=160
--max-semi-space-size=4` (`Dockerfile`).

## Consequences

- No native modules to compile; `node:sqlite` is synchronous, which fits the
  single writer (S03).
- Measured at 30 clients on a laptop: 123 MB peak RSS against a 180 MB
  target, tick processing p99 19.97 ms, egress 42 KB/s (docs/measurements.md).
- Rules out multiple machines and any DB that needs its own server.
- Checked by `pnpm load` (`sim/load.ts`) for RSS and CPU, and by
  `e2e/client.test.ts` "renders first in under 3 MB, real maps streaming
  after (goals.md P8)". The measurements were taken on a laptop, not the Fly
  machine; no test runs against the deploy.

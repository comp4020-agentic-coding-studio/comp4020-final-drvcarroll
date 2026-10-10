# Measurements

Measured goals (goals.md, kind **Measured**). Written by `pnpm load`
(`sim/load.ts`): 30 bots over real WebSockets for 60 s against
the server in its own process, each acting every 2 s on its own beat. Last run
2026-10-10 05:28 UTC on darwin arm64, Node v24.21.0.

| Goal | What | Target | Measured | Met |
|---|---|---|---|---|
| S1 | Claim visible to every other client | ≤ 600 ms p95 | p50 277 · p95 501 · p99 511 ms (720 sightings) | yes |
| S1 | Command result round trip | ≤ 600 ms p95 | p50 261 · p95 488 ms (890 commands) | yes |
| S1 | Tick processing | ≤ 20 ms p99 | p50 14.27 · p99 19.97 ms | yes |
| S2 | Server RSS at 30 clients | ≤ 180 MB | 123 MB peak (JS heap 19 MB) | yes |
| S2 | Tick CPU share of the 500 ms budget | ≤ 10% | 2.9% (p50) | yes |
| S2 | Loop stops with nobody connected | logged | idle line logged | yes |
| S3 | Quiet tick | ≤ 500 B | p95 356 B | yes |
| S3 | Busy tick | ≤ 3 KB | p95 2471 B | yes |
| S3 | welcome | ≤ 60 KB | max 4.4 KB | yes |
| S3 | Egress at 30 clients | ≤ 200 KB/s | 42 KB/s | yes |
| S4 | Command-log append | ≤ 1 ms p99 | p99 0.6 ms (whole apply p99 1.75 ms) | yes |
| S4 | Bytes per stored command | ≤ 200 B | 110.7 B (456 commands; db 172 KB) | yes |
| S5 | Boot (snapshot + replay) | ≤ 1 s | 2.9 ms after this run (456 commands); 0 ms fresh | yes |

Notes: a laptop, not the 256 MB shared-CPU Fly machine, so CPU and RSS read
lower than production would; rerun against the deploy before each crit.

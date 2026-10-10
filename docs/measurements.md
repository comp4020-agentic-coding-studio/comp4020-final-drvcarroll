# Measurements

Measured goals (goals.md, kind **Measured**). Written by `pnpm load`
(`sim/load.ts`): 30 bots over real WebSockets for 60 s against
the server in its own process, each acting every 2 s. Last run
2026-10-10 05:03 UTC on darwin arm64, Node v24.21.0.

| Goal | What | Target | Measured | Met |
|---|---|---|---|---|
| S1 | Claim visible to every other client | ≤ 600 ms p95 | p50 270 · p95 514 · p99 518 ms (330 sightings) | yes |
| S1 | Command result round trip | ≤ 600 ms p95 | p50 157 · p95 234 ms (894 commands) | yes |
| S1 | Tick processing | ≤ 20 ms p99 | p50 15.34 · p99 19.53 ms | yes |
| S2 | Server RSS at 30 clients | ≤ 180 MB | 162 MB peak (JS heap 17 MB) | yes |
| S2 | Tick CPU share of the 500 ms budget | ≤ 10% | 3.1% (p50) | yes |
| S2 | Loop stops with nobody connected | logged | idle line logged | yes |
| S3 | Quiet tick | ≤ 500 B | p95 356 B | yes |
| S3 | Busy tick | ≤ 3 KB | p95 2008 B | yes |
| S3 | welcome | ≤ 60 KB | max 4.3 KB | yes |
| S3 | Egress at 30 clients | ≤ 200 KB/s | 14.9 KB/s | yes |
| S4 | Command-log append | ≤ 1 ms p99 | p99 0.84 ms (whole apply p99 1.49 ms) | yes |
| S4 | Bytes per stored command | ≤ 200 B | 110.6 B (208 commands; db 116 KB) | yes |
| S5 | Boot (snapshot + replay) | ≤ 1 s | 0.1 ms (fresh) | yes |

Notes: a laptop, not the 256 MB shared-CPU Fly machine, so CPU and RSS read
lower than production would; rerun against the deploy before each crit.

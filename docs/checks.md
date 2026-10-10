# Checks

Judged goals (goals.md, kind **Judged**): what was checked, when, on what,
and the result. Newest first.

## P8: frame rate and GPU memory

**2026-10-10, MacBook Air M4 (integrated GPU), Chrome via Playwright with
ANGLE Metal, 1920×1080 at device pixel ratio 1.** A player on Western
Europe, textures streamed, 5 s of `requestAnimationFrame` per view:

| Tier | Earth focused | System view | GPU memory |
|---|---|---|---|
| High | 60 fps, p95 16.7 ms | 60 fps, p95 16.8 ms | ~210 MB |
| Medium | 60 fps, p95 16.7 ms | 60 fps, p95 16.8 ms | ~210 MB |
| Low | 60 fps, p95 16.7 ms | 60 fps, p95 16.8 ms | ~178 MB |

GPU memory is a tally of live objects, not a driver reading (Chrome exposes
none): textures with mips 96 MB (64 MB at low, Earth's day map at 2K),
geometry 8 MB, framebuffer and bloom targets ~106 MB by arithmetic.
Auto stayed at high.

**Phone, emulated:** 390×844 at pixel ratio 3, touch, CPU throttled 4×, same
GPU: auto picked medium (bloom off), 60 fps, p95 16.8 ms, ~126 MB.
**Slow GPU:** under SwiftShader (software) at 1440×900, auto stepped down to
low within seconds and held there at 13 fps, no oscillation.

**Result: pass on this laptop** (60 fps desktop, under 300 MB).
Frame rate is vsync-capped, so the headroom is not measured. Flagged: the
phone figure is emulated on a laptop GPU. A real phone check is still owed
before Crit 10.

## S7: a season's story from logs alone

**2026-10-10, MacBook (darwin arm64), `pnpm load` run, `.cache/load-log.jsonl`.**
Read only the JSON lines (no database, no screen) and told what happened:

- 0.0 s the server booted on a fresh volume (`boot`, 0 ms) and listened.
- 31 accounts signed up; 30 connected. From 1.3 s, 24 nations joined one per
  Earth start region in order: load01 Canada, load02 US West, load03 US East,
  load04 Mexico & Central America, and so on.
- The six without a region kept trying to act and were refused 173 times
  with "Join the season first": the world was full.
- Each player then trained Armies, cancelled builds and traded Energy at the
  Earth Exchange (about 18 accepted and 12 refused each). Research never
  started: 167 refusals counting down "Needs 10 more Research" to "Needs 5
  more", as Labs filled the stock, and 138 "Nothing is being researched".
- All 30 disconnected at about 64 s; the loop went `idle` at 65.3 s.

**Result: pass.** Who joined where, what each did, what the world refused
and why, and when it went quiet are all recoverable from the log alone.

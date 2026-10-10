# Checks

Judged goals (goals.md, kind **Judged**): what was checked, when, on what,
and the result. Newest first.

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

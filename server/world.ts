// system-design.md §4, §5: the in-memory world, its command log, snapshots
// and seasons. A command not in the log is never kept in the state.
import type { StatementSync } from "node:sqlite";
import {
  RULES_VERSION, advance, applyInPlace, newSeason, type Command, type CommandResult, type Id, type Ms, type State,
} from "../rules/index.ts";
import type { Db } from "./db.ts";

export const nationOf = (userId: number): Id => `n_${userId}`;

export interface HallEntry { season: Id; endedAt: Ms; winner: string | null }

export class World {
  appends: number[] = []; // recent command-log insert times, ms (S4)
  private pending: number[] = []; // this batch's insert times, before the commit's share
  private seenStmt?: StatementSync;
  private insertStmt?: StatementSync;
  state: State | null = null;
  private lastSeq = 0;
  private dirty = false;
  private db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  boot(now: Ms): void {
    const season = this.db.prepare("SELECT id, started_at FROM seasons ORDER BY started_at DESC LIMIT 1").get() as
      { id: string; started_at: number } | undefined;
    if (!season) return;
    const snap = this.db.prepare(
      "SELECT seq, rules_version, state FROM snapshots WHERE season_id = ? ORDER BY seq DESC LIMIT 1",
    ).get(season.id) as { seq: number; rules_version: string; state: string } | undefined;
    const s = snap ? (JSON.parse(snap.state) as State) : newSeason(season.id, season.started_at);
    s.battles ??= {}; // rules 1 snapshots predate ground battles
    this.lastSeq = snap?.seq ?? 0;
    const rows = this.db.prepare(
      "SELECT seq, nation_id, at, payload FROM commands WHERE season_id = ? AND seq > ? ORDER BY seq",
    ).all(season.id, this.lastSeq) as { seq: number; nation_id: string; at: number; payload: string }[];
    for (const r of rows) {
      const bad = applyInPlace(s, r.nation_id, JSON.parse(r.payload), r.at);
      if (bad) throw new Error(`replay diverged at command ${r.seq}: ${bad.reason}`);
      this.lastSeq = r.seq;
    }
    this.state = s;
    this.advance(now);
  }

  // A new season starts when someone arrives after the last one ended.
  ensureSeason(now: Ms): State {
    this.advance(now); // an idle server hasn't ticked: the season may have run out
    if (this.state?.season.status === "running") return this.state;
    const id = `s_${now}`;
    this.db.prepare("INSERT INTO seasons (id, started_at, rules_version) VALUES (?, ?, ?)").run(id, now, RULES_VERSION);
    this.state = newSeason(id, now);
    this.lastSeq = 0;
    this.dirty = true;
    return this.state;
  }

  advance(now: Ms): void {
    if (!this.state) return;
    const wasRunning = this.state.season.status === "running";
    advance(this.state, now); // the server owns its state: no copy (S2)
    const s = this.state.season;
    if (wasRunning && s.status === "ended") {
      this.db.prepare("UPDATE seasons SET ended_at = ?, winner_nation_id = ? WHERE id = ?")
        .run(Math.round(this.state.t), s.winner ?? null, s.id);
      this.dirty = true;
    }
  }

  submit(nation: Id, cmd: Command, clientId: string | null, at: Ms): CommandResult {
    const id = clientId ?? "";
    const s = this.state;
    if (!s) return { id, ok: false, code: "SEASON_OVER", reason: "No season is running" };
    if (clientId) {
      this.seenStmt ??= this.db.prepare("SELECT result FROM commands WHERE season_id = ? AND nation_id = ? AND client_cmd_id = ?");
      const seen = this.seenStmt.get(s.season.id, nation, clientId) as { result: string } | undefined;
      if (seen) return { id, ...JSON.parse(seen.result) };
    }
    const bad = applyInPlace(s, nation, cmd, at);
    if (bad) return { id, ok: false, code: bad.code, reason: bad.reason };
    const t0 = performance.now();
    this.insertStmt ??= this.db.prepare(
      "INSERT INTO commands (season_id, nation_id, at, type, payload, result, client_cmd_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    let ins;
    try {
      ins = this.insertStmt.run(s.season.id, nation, at, cmd.type, JSON.stringify(cmd), JSON.stringify({ ok: true }), clientId);
    } catch (e) {
      if (this.db.isTransaction) throw e; // batch() rolls back and rebuilds
      this.boot(at); // the state already holds it but the log doesn't: rebuild from the log
      return { id, ok: false, code: "INVALID", reason: `The server couldn't save that (${(e as Error).message}); try again` };
    }
    this.pending.push(performance.now() - t0);
    this.lastSeq = Number(ins.lastInsertRowid);
    this.dirty = true;
    if (cmd.type === "setEmpire") this.recordEmpire(nation, cmd);
    return { id, ok: true };
  }

  // One tick's commands in one transaction: one fsync, and nobody is told
  // before it lands (S4). If the commit fails, rebuild from the log; the
  // tick's accepted commands then report a failure.
  batch(at: Ms, f: () => CommandResult[]): CommandResult[] {
    this.pending = [];
    this.db.exec("BEGIN");
    let results: CommandResult[];
    try {
      results = f();
      const t0 = performance.now();
      this.db.exec("COMMIT");
      const share = (performance.now() - t0) / Math.max(1, this.pending.length);
      this.appends.push(...this.pending.map((ms) => ms + share));
      this.appends.splice(0, Math.max(0, this.appends.length - 500));
      return results;
    } catch (e) {
      if (this.db.isTransaction) this.db.exec("ROLLBACK");
      this.boot(at);
      const reason = `The server couldn't save that (${(e as Error).message}); try again`;
      return (results! ?? []).map((r) => (r.ok ? { id: r.id, ok: false, code: "INVALID", reason } : r));
    }
  }

  private recordEmpire(nation: Id, c: Extract<Command, { type: "setEmpire" }>): void {
    this.db.prepare(`
      INSERT INTO nations (id, season_id, user_id, name, colour_primary, colour_secondary) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (season_id, id) DO UPDATE SET name = excluded.name,
        colour_primary = excluded.colour_primary, colour_secondary = excluded.colour_secondary
    `).run(nation, this.state!.season.id, Number(nation.slice(2)), c.name.trim(), c.primary, c.secondary);
  }

  // Empire name and colours carry over from the user's last season.
  lastEmpire(userId: number): { name: string; primary: string; secondary: string } | undefined {
    return this.db.prepare(`
      SELECT n.name, n.colour_primary AS "primary", n.colour_secondary AS secondary
      FROM nations n JOIN seasons s ON s.id = n.season_id WHERE n.user_id = ? ORDER BY s.started_at DESC LIMIT 1
    `).get(userId) as { name: string; primary: string; secondary: string } | undefined;
  }

  snapshot(): void {
    if (!this.state || !this.dirty) return;
    this.db.prepare("INSERT INTO snapshots (season_id, seq, at, rules_version, state) VALUES (?, ?, ?, ?, ?)")
      .run(this.state.season.id, this.lastSeq, Math.round(this.state.t), RULES_VERSION, JSON.stringify(this.state));
    this.dirty = false;
  }

  hallOfFame(): HallEntry[] {
    return (this.db.prepare(`
      SELECT s.id AS season, s.ended_at AS endedAt, n.name AS winner FROM seasons s
      LEFT JOIN nations n ON n.season_id = s.id AND n.id = s.winner_nation_id
      WHERE s.ended_at IS NOT NULL ORDER BY s.ended_at DESC LIMIT 20
    `).all() as unknown as HallEntry[]);
  }
}

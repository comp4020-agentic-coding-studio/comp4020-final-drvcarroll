// system-design.md §4, §5: the in-memory world, its command log, snapshots
// and seasons. Durable write before the new state is swapped in.
import {
  RULES_VERSION, advanceTo, apply, newSeason, type Command, type CommandResult, type Id, type Ms, type State,
} from "../rules/index.ts";
import type { Db } from "./db.ts";

export const nationOf = (userId: number): Id => `n_${userId}`;

export interface HallEntry { season: Id; endedAt: Ms; winner: string | null }

export class World {
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
    let s = snap ? (JSON.parse(snap.state) as State) : newSeason(season.id, season.started_at);
    this.lastSeq = snap?.seq ?? 0;
    const rows = this.db.prepare(
      "SELECT seq, nation_id, at, payload FROM commands WHERE season_id = ? AND seq > ? ORDER BY seq",
    ).all(season.id, this.lastSeq) as { seq: number; nation_id: string; at: number; payload: string }[];
    for (const r of rows) {
      const res = apply(s, r.nation_id, JSON.parse(r.payload), r.at);
      if (!res.ok) throw new Error(`replay diverged at command ${r.seq}: ${res.reason}`);
      s = res.state;
      this.lastSeq = r.seq;
    }
    this.state = s;
    this.advance(now);
  }

  // A new season starts when someone arrives after the last one ended.
  ensureSeason(now: Ms): State {
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
    this.state = advanceTo(this.state, now);
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
      const seen = this.db.prepare(
        "SELECT result FROM commands WHERE season_id = ? AND nation_id = ? AND client_cmd_id = ?",
      ).get(s.season.id, nation, clientId) as { result: string } | undefined;
      if (seen) return { id, ...JSON.parse(seen.result) };
    }
    const r = apply(s, nation, cmd, at);
    if (!r.ok) return { id, ok: false, code: r.code, reason: r.reason };
    const ins = this.db.prepare(
      "INSERT INTO commands (season_id, nation_id, at, type, payload, result, client_cmd_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(s.season.id, nation, at, cmd.type, JSON.stringify(cmd), JSON.stringify({ ok: true }), clientId);
    this.lastSeq = Number(ins.lastInsertRowid);
    this.state = r.state;
    this.dirty = true;
    if (cmd.type === "setEmpire") this.recordEmpire(nation, cmd);
    return { id, ok: true };
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

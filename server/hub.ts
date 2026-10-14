// system-design.md §5, §6, §14.3: sockets, the command queue and the 500 ms
// tick. Each client gets its vision-filtered view, diffed against what it
// was last sent, entity by entity.
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { observe, settled, viewCache, type ViewCache, type Command, type CommandResult, type Id, type PrivateState, type State, type VisibleWorld } from "../rules/index.ts";
import { frozen } from "../rules/economy.ts";
import { scores } from "../rules/score.ts";
import type { User } from "./auth.ts";
import { Log, targetOf, type Stats } from "./log.ts";
import { parseMessage } from "./schema.ts";
import { nationOf, type World } from "./world.ts";

export const TICK_MS = 500;
const KINDS = ["nations", "regions", "fleets", "wars", "battles", "marches"] as const;
const MAX_CMDS_PER_TICK = 10;

interface Sent {
  ents: Map<string, string>; // "regions:r_x" → JSON
  scores: string;
  presence: string;
  news: Set<string>;
  season: string;
  you: Map<string, string>;
}

interface Client {
  ws: WebSocket;
  user: User;
  nation: Id;
  sent: Sent;
  results: CommandResult[];
  queued: number;
}

const json = (x: unknown) => JSON.stringify(x);

export class Hub {
  private wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
  private clients = new Set<Client>();
  private queue: { c: Client; id: string; cmd: Command }[] = [];
  private timer: ReturnType<typeof setInterval> | undefined;
  private n = 0;
  private world: World;
  private build: string;
  private now: () => number;
  readonly log: Log;

  constructor(world: World, build: string, now = () => Date.now(), log = new Log()) {
    this.world = world;
    this.build = build;
    this.now = now;
    this.log = log;
  }

  stats(): Stats {
    const names = this.online.map((id) => this.world.state?.nations[id]?.name ?? id);
    return this.log.stats(this.now(), names, this.clients.size, this.world.appends);
  }

  get online(): Id[] {
    return [...new Set([...this.clients].map((c) => c.nation))].sort();
  }

  upgrade(req: IncomingMessage, socket: Duplex, head: Buffer, user: User): void {
    this.wss.handleUpgrade(req, socket, head, (ws) => this.connect(ws, user));
  }

  // Close codes: 4001 not signed in, 4002 session expired (§14.3).
  reject(req: IncomingMessage, socket: Duplex, head: Buffer, code: 4001 | 4002): void {
    this.wss.handleUpgrade(req, socket, head, (ws) => ws.close(code, code === 4001 ? "Not signed in" : "Session expired"));
  }

  private connect(ws: WebSocket, user: User): void {
    const now = this.now();
    const state = this.world.ensureSeason(now);
    const nation = nationOf(user.id);
    if (!state.nations[nation]) {
      const prev = this.world.lastEmpire(user.id);
      if (prev) this.world.submit(nation, { type: "setEmpire", ...prev }, null, now);
    }
    const c: Client = { ws, user, nation, results: [], queued: 0, sent: blank() };
    this.clients.add(c);
    this.log.write({ ts: now, user: user.username, nation, action: "connect", result: "ok" });
    const { world, you } = this.view(c);
    const season = this.world.state!.season;
    remember(c.sent, world, you, season);
    ws.send(json({ t: "welcome", build: this.build, serverTime: now, tickMs: TICK_MS, tick: this.n, season, world, you }));
    ws.on("message", (raw) => this.receive(c, String(raw)));
    ws.on("close", () => {
      this.clients.delete(c);
      this.log.write({ ts: this.now(), user: user.username, nation, action: "disconnect", result: "ok" });
      if (!this.clients.size) {
        this.stopTicking();
        this.log.write({ ts: this.now(), action: "idle", result: "ok" }); // S2: no work with nobody here
      }
    });
    this.startTicking();
  }

  private receive(c: Client, raw: string): void {
    const m = parseMessage(raw);
    if ("bad" in m) {
      const id = (() => { try { return String(JSON.parse(raw).id ?? ""); } catch { return ""; } })();
      if (id) c.results.push({ id, ok: false, code: "INVALID", reason: m.bad });
      return;
    }
    if (m.t === "ping") {
      c.ws.send(json({ t: "pong", clientTime: m.clientTime, serverTime: this.now() }));
      return;
    }
    if (++c.queued > MAX_CMDS_PER_TICK) {
      const r = { id: m.id, ok: false as const, code: "RATE_LIMIT" as const, reason: "Too many commands; wait a moment" };
      c.results.push(r);
      this.logCommand(c, m.cmd, r, 0);
      return;
    }
    this.queue.push({ c, id: m.id, cmd: m.cmd });
  }

  private startTicking(): void {
    this.timer ??= setInterval(() => this.tick(), TICK_MS);
  }

  private stopTicking(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  // Advance, apply queued commands in arrival order, send each client one tick.
  tick(): void {
    const t0 = performance.now();
    const now = this.now();
    this.n++;
    this.world.advance(now);
    const queued = this.queue.splice(0);
    const times: number[] = [];
    const results = queued.length ? this.world.batch(now, () => queued.map(({ c, id, cmd }) => {
      const t1 = performance.now();
      const r = this.world.submit(c.nation, cmd, id, now);
      times.push(performance.now() - t1);
      return r;
    })) : [];
    queued.forEach(({ c, cmd }, i) => {
      c.results.push(results[i]);
      this.logCommand(c, cmd, results[i], times[i] ?? 0);
    });
    // The view is fixed for the rest of the tick: score and send from it.
    frozen(() => {
      const view = this.world.state && settled(this.world.state); // one copy and one scoring per tick, not per client
      const cache = viewCache();
      const sc = view ? (cache.scores = scores(view)) : undefined;
      const shared = view ? sharedOf({ scores: sc!, presence: this.online, news: view.news }, view.season, cache) : undefined;
      for (const c of this.clients) {
        c.queued = 0;
        const msg = this.diff(c, now, view, shared);
        c.results = [];
        if (c.ws.readyState === c.ws.OPEN) c.ws.send(json(msg));
      }
    });
    this.log.tick(performance.now() - t0);
  }

  private logCommand(c: Client, cmd: Command, r: CommandResult, ms: number): void {
    this.log.write({
      ts: this.now(), user: c.user.username, nation: c.nation, action: cmd.type, target: targetOf(cmd),
      result: r.ok ? "ok" : r.code, ...(r.ok ? {} : { reason: r.reason }), ms: Number(ms.toFixed(2)),
    });
  }

  private view(c: Client, s = this.world.state!, cache?: ViewCache): { world: VisibleWorld; you: PrivateState | null } {
    const v = observe(s, s.nations[c.nation] ? c.nation : null, cache);
    v.world.presence = this.online;
    return v;
  }

  // Each entity serialised once per client per tick; what every client
  // shares (scores, presence, news, season) once per tick (system-design.md §7).
  private diff(c: Client, at: number, s?: State | null, shared?: Shared): Record<string, unknown> {
    const { world, you } = this.view(c, s ?? undefined, shared?.cache);
    const sh = shared ?? sharedOf(world, this.world.state!.season);
    const msg: Record<string, unknown> = { t: "tick", n: this.n, at };
    if (c.results.length) msg.results = c.results;
    const changes: Record<string, unknown[]> = {};
    const ents = new Map<string, string>();
    for (const kind of KINDS) {
      for (const e of world[kind] as { id: string }[]) {
        const key = `${kind}:${e.id}`;
        const j = sh.json(e);
        ents.set(key, j);
        if (c.sent.ents.get(key) !== j) (changes[kind] ??= []).push(e);
      }
    }
    const removed: Record<string, string[]> = {};
    for (const key of c.sent.ents.keys()) {
      if (ents.has(key)) continue;
      const [kind, id] = key.split(":");
      (removed[kind] ??= []).push(id);
    }
    if (Object.keys(removed).length) changes.removed = removed as never;
    if (Object.keys(changes).length) msg.changes = changes;
    if (sh.scores !== c.sent.scores) msg.scores = world.scores;
    if (sh.presence !== c.sent.presence) msg.presence = world.presence;
    const fresh = world.news.filter((_, i) => !c.sent.news.has(sh.news[i]));
    if (fresh.length) msg.news = fresh;
    if (sh.season !== c.sent.season) msg.season = this.world.state!.season;
    const mine = new Map<string, string>();
    if (you) {
      const y: Record<string, unknown> = { stocks: you.stocks };
      for (const [k, v] of Object.entries(you)) {
        const j = json(v);
        mine.set(k, j);
        if (k !== "stocks" && c.sent.you.get(k) !== j) y[k] = v;
      }
      msg.you = y;
    }
    c.sent = { ents, scores: sh.scores, presence: sh.presence, news: new Set(sh.news), season: sh.season, you: mine };
    return msg;
  }

  close(code: number, reason: string): void {
    this.stopTicking();
    for (const c of this.clients) c.ws.close(code, reason);
  }
}

interface Shared { scores: string; presence: string; news: string[]; season: string; cache?: ViewCache; json: (e: object) => string }

// observe() hands every nation that sees an entity alike the same object
// (ViewCache), so its JSON is computed once per tick, keyed on identity.
function sharedOf(w: Pick<VisibleWorld, "scores" | "presence" | "news">, season: unknown, cache?: ViewCache): Shared {
  const memo = new WeakMap<object, string>();
  const once = (e: object) => {
    let j = memo.get(e);
    if (j === undefined) memo.set(e, (j = json(e)));
    return j;
  };
  return { scores: json(w.scores), presence: json(w.presence), news: w.news.map(json), season: json(season), cache, json: once };
}

function blank(): Sent {
  return { ents: new Map(), scores: "", presence: "", news: new Set(), season: "", you: new Map() };
}

function remember(s: Sent, world: VisibleWorld, you: PrivateState | null, season?: unknown): void {
  s.ents.clear();
  for (const kind of KINDS) {
    for (const e of world[kind] as { id: string }[]) s.ents.set(`${kind}:${e.id}`, json(e));
  }
  s.scores = json(world.scores);
  s.presence = json(world.presence);
  s.news = new Set(world.news.map(json));
  if (season) s.season = json(season);
  s.you = new Map(Object.entries(you ?? {}).map(([k, v]) => [k, json(v)]));
}

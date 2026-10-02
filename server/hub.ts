// system-design.md §5, §6, §14.3: sockets, the command queue and the 500 ms
// tick. Each client gets its vision-filtered view, diffed against what it
// was last sent, entity by entity.
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { observe, type Command, type CommandResult, type Id, type PrivateState, type VisibleWorld } from "../rules/index.ts";
import type { User } from "./auth.ts";
import { parseMessage } from "./schema.ts";
import { nationOf, type World } from "./world.ts";

export const TICK_MS = 500;
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

  constructor(world: World, build: string, now = () => Date.now()) {
    this.world = world;
    this.build = build;
    this.now = now;
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
    const { world, you } = this.view(c);
    const season = this.world.state!.season;
    remember(c.sent, world, you, season);
    ws.send(json({ t: "welcome", build: this.build, serverTime: now, tickMs: TICK_MS, tick: this.n, season, world, you }));
    ws.on("message", (raw) => this.receive(c, String(raw)));
    ws.on("close", () => {
      this.clients.delete(c);
      if (!this.clients.size) this.stopTicking();
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
      c.results.push({ id: m.id, ok: false, code: "RATE_LIMIT", reason: "Too many commands; wait a moment" });
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
    const now = this.now();
    this.n++;
    this.world.advance(now);
    for (const { c, id, cmd } of this.queue.splice(0)) c.results.push(this.world.submit(c.nation, cmd, id, now));
    for (const c of this.clients) {
      c.queued = 0;
      const msg = this.diff(c, now);
      c.results = [];
      if (c.ws.readyState === c.ws.OPEN) c.ws.send(json(msg));
    }
  }

  private view(c: Client): { world: VisibleWorld; you: PrivateState | null } {
    const v = observe(this.world.state!, this.world.state!.nations[c.nation] ? c.nation : null);
    v.world.presence = this.online;
    return v;
  }

  private diff(c: Client, at: number): Record<string, unknown> {
    const { world, you } = this.view(c);
    const msg: Record<string, unknown> = { t: "tick", n: this.n, at };
    if (c.results.length) msg.results = c.results;
    const changes: Record<string, unknown[]> = {};
    const seen = new Set<string>();
    for (const kind of ["nations", "regions", "fleets", "wars"] as const) {
      for (const e of world[kind] as { id: string }[]) {
        const key = `${kind}:${e.id}`;
        seen.add(key);
        const j = json(e);
        if (c.sent.ents.get(key) !== j) (changes[kind] ??= []).push(e);
      }
    }
    const removed: Record<string, string[]> = {};
    for (const key of c.sent.ents.keys()) {
      if (seen.has(key)) continue;
      const [kind, id] = key.split(":");
      (removed[kind] ??= []).push(id);
    }
    if (Object.keys(removed).length) changes.removed = removed as never;
    if (Object.keys(changes).length) msg.changes = changes;
    if (json(world.scores) !== c.sent.scores) msg.scores = world.scores;
    if (json(world.presence) !== c.sent.presence) msg.presence = world.presence;
    const fresh = world.news.filter((x) => !c.sent.news.has(json(x)));
    if (fresh.length) msg.news = fresh;
    const season = this.world.state!.season;
    if (json(season) !== c.sent.season) msg.season = season;
    if (you) {
      const y: Record<string, unknown> = { stocks: you.stocks };
      for (const [k, v] of Object.entries(you)) if (k !== "stocks" && c.sent.you.get(k) !== json(v)) y[k] = v;
      msg.you = y;
    }
    remember(c.sent, world, you, season);
    return msg;
  }

  close(code: number, reason: string): void {
    this.stopTicking();
    for (const c of this.clients) c.ws.close(code, reason);
  }
}

function blank(): Sent {
  return { ents: new Map(), scores: "", presence: "", news: new Set(), season: "", you: new Map() };
}

function remember(s: Sent, world: VisibleWorld, you: PrivateState | null, season?: unknown): void {
  s.ents.clear();
  for (const kind of ["nations", "regions", "fleets", "wars"] as const) {
    for (const e of world[kind] as { id: string }[]) s.ents.set(`${kind}:${e.id}`, json(e));
  }
  s.scores = json(world.scores);
  s.presence = json(world.presence);
  s.news = new Set(world.news.map(json));
  if (season) s.season = json(season);
  s.you = new Map(Object.entries(you ?? {}).map(([k, v]) => [k, json(v)]));
}

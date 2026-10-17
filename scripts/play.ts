// /playtest's text client (game-design.md §13): agents play a real local
// server over the real socket. One command per process; state in .cache/playtest.
//   node scripts/play.ts start <minutes> <user...>   fresh server + accounts
//   node scripts/play.ts help                        costs, from rules/data
//   node scripts/play.ts <user> look | do '<json>' | wait <s>
//   node scripts/play.ts admin status | wait <s>     scores, log summary
//   node scripts/play.ts stop
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { BODIES, BUILDINGS, EMPIRE, LADDERS, REGIONS, RESOURCE_NAMES, TECH, UNITS, ADJACENT } from "../rules/data/index.ts";

const DIR = ".cache/playtest";
const STATE = join(DIR, "state.json");
const LOG = join(DIR, "server.log");
const STOP = join(DIR, "STOP");
const PASSWORD = "playtest-pass";
const MIN = 60_000;

type Msg = Record<string, any>;
interface Run { port: number; pid: number; startedAt: number; capMin: number; cookies: Record<string, string> }

const run = (): Run => JSON.parse(readFileSync(STATE, "utf8"));
const base = (r: Run) => `http://127.0.0.1:${r.port}`;
const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const r0 = (x: number) => Math.round(x);
const name = (id: string) => REGIONS[id]?.name ?? BODIES[id]?.name ?? id;
const goods = (g: Msg = {}) => Object.entries(g).map(([k, v]) => `${v} ${k}`).join(" ") || "free";

async function start(capMin: number, users: string[]): Promise<void> {
  if (existsSync(STATE)) await stop();
  mkdirSync(DIR, { recursive: true });
  rmSync(STOP, { force: true });
  const port = 18_900 + Math.floor(Math.random() * 500);
  const cmd = JSON.parse(/^CMD (\[.*\])$/m.exec(readFileSync("Dockerfile", "utf8"))![1]) as string[];
  const out = openSync(LOG, "w");
  const server = spawn(process.execPath, cmd.slice(1), {
    env: { ...process.env, PORT: String(port), DATA_DIR: mkdtempSync(join(tmpdir(), "playtest-")) },
    detached: true, stdio: ["ignore", out, out],
  });
  server.unref();
  for (let i = 0; i < 100 && !readFileSync(LOG, "utf8").includes('"listen"'); i++) await sleep(100);
  const r: Run = { port, pid: server.pid!, startedAt: Date.now(), capMin, cookies: {} };
  const post = (path: string, body: object, cookie = "") =>
    fetch(base(r) + path, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) });
  const login = await post("/api/login", { username: "admin", password: "platypus" });
  r.cookies.admin = login.headers.get("set-cookie")!.split(";")[0];
  for (const [i, u] of users.entries()) {
    const res = await post("/api/signup", { username: u, password: PASSWORD });
    if (!res.ok) throw new Error(`sign-up ${u}: ${res.status} ${await res.text()}`);
    r.cookies[u] = res.headers.get("set-cookie")!.split(";")[0];
    await post("/api/empire", { name: `${u} empire`, primary: EMPIRE.presets[i], secondary: "#ffffff" }, r.cookies[u]);
  }
  writeFileSync(STATE, JSON.stringify(r));
  console.log(`server on ${base(r)}, log ${LOG}, cap ${capMin} min, users: ${users.join(", ")}`);
}

async function stop(): Promise<void> {
  try { process.kill(run().pid, "SIGTERM"); } catch { /* already gone */ }
  rmSync(STATE, { force: true });
  console.log("stopped");
}

// One live connection: welcome, then ticks merged into the same shape.
class Conn {
  ws: WebSocket;
  world: Msg = {};
  you: Msg | null = null;
  season: Msg = {};
  at = 0;
  news: Msg[] = [];
  results = new Map<string, Msg>();
  private ready: Promise<void>;
  constructor(r: Run, user: string) {
    const cookie = r.cookies[user];
    if (!cookie) throw new Error(`no account "${user}"; users: ${Object.keys(r.cookies).join(", ")}`);
    this.ws = new WebSocket(base(r).replace("http", "ws") + "/ws", { headers: { cookie, origin: base(r) } });
    this.ready = new Promise((ok, no) => {
      this.ws.on("error", no);
      this.ws.on("close", (code, why) => no(new Error(`socket closed ${code} ${why}`)));
      this.ws.on("message", (raw) => {
        const m = JSON.parse(String(raw));
        if (m.t === "welcome") {
          Object.assign(this, { world: m.world, you: m.you, season: m.season, at: m.serverTime });
          ok();
        }
        if (m.t === "tick") this.merge(m);
      });
    });
  }
  open = () => this.ready;
  merge(m: Msg): void {
    this.at = m.at;
    for (const r of m.results ?? []) this.results.set(r.id, r);
    for (const [k, list] of Object.entries<Msg[]>(m.changes ?? {})) {
      if (k === "removed") continue;
      const key = k === "battles" ? "region" : k === "marches" ? "departAt" : "id";
      const byId = new Map((this.world[k] ?? []).map((x: Msg) => [x[key], x]));
      for (const x of list) byId.set(x[key], x);
      this.world[k] = [...byId.values()];
    }
    for (const [k, ids] of Object.entries<string[]>(m.changes?.removed ?? {})) {
      const key = k === "battles" ? "region" : "id";
      if (k !== "marches") this.world[k] = (this.world[k] ?? []).filter((x: Msg) => !ids.includes(x[key]));
    }
    if (m.scores) this.world.scores = m.scores;
    if (m.season) this.season = m.season;
    if (m.news) this.news.push(...m.news);
    if (m.you) this.you = { ...(this.you ?? {}), ...m.you };
  }
  send(cmd: Msg): string {
    const id = `pt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.ws.send(JSON.stringify({ t: "cmd", id, cmd }));
    return id;
  }
  async result(id: string): Promise<Msg> {
    for (let i = 0; i < 40 && !this.results.has(id); i++) await sleep(100);
    return this.results.get(id) ?? { ok: false, reason: "no result within 4 s" };
  }
  close = () => this.ws.close();
}

function stopLine(r: Run, c?: Conn): string | null {
  if (existsSync(STOP)) return `STOP: ${readFileSync(STOP, "utf8").trim() || "analyst ended the run"}`;
  if (c && c.season.stage >= 2) return "STOP: stage 1 ended";
  if (Date.now() - r.startedAt > r.capMin * MIN) return `STOP: ${r.capMin} min cap reached`;
  return null;
}

// What a player sees, in a few hundred tokens.
function view(c: Conn): string {
  const w = c.world, me = c.you;
  const nations = new Map<string, Msg>((w.nations ?? []).map((n: Msg) => [n.id, n]));
  const nm = (id: string) => nations.get(id)?.name ?? id;
  const t = (ms: number) => `${Math.max(0, r0((ms - c.at) / 1000))}s`;
  const L: string[] = [];
  L.push(`Stage ${c.season.stage}, ends in ${t(c.season.stageEndsAt)}. World minute ${r0((c.at - c.season.startedAt) / MIN)}.`);
  if (!me || !nations.get(me.nation)?.capital) {
    const free = (w.regions ?? []).filter((r: Msg) => r.body === "earth" && !r.owner).map((r: Msg) => r.id);
    L.push(`Not joined. Join with {"type":"join","region":"<id>"}. Free Earth regions: ${free.join(" ")}`);
  } else {
    const st = Object.entries<Msg>(me.stocks ?? {}).map(([k, s]) => `${RESOURCE_NAMES[k as keyof typeof RESOURCE_NAMES]} ${k} ${r0(s.v)} (${s.rate >= 0 ? "+" : ""}${s.rate.toFixed(1)}/min)`);
    L.push(`You: ${me.nation} "${nm(me.nation)}". Efficiency ${me.efficiency}.`);
    L.push(`Stocks: ${st.join(", ")}`);
    const next = Object.values(LADDERS).map((l) => l.find((x) => !me.techs?.includes(x.id))).filter(Boolean)
      .map((x) => `${x!.id} ${TECH.costs[Number(x!.id.split(".")[1]) - 1]} R`);
    L.push(`Techs: ${me.techs?.join(" ") || "none"}. Researching: ${me.research ? `${me.research.tech}, done in ${t(me.research.finishAt)}` : "nothing"}. Next rungs: ${next.join(", ")}`);
    const mine = (w.regions ?? []).filter((r: Msg) => r.owner === me.nation);
    L.push(`Your regions (${mine.length}):`);
    for (const r of mine) {
      const b = (r.buildings ?? []).map((x: Msg) => `${x.slot}:${x.type}${x.mode ? `/${x.mode}` : ""}`).join(" ");
      const q = (me.queues?.[r.id] ?? []).map((x: Msg) => `${x.item} ${t(x.finishAt)}`).join(", ");
      const adj = r.body === "earth" ? ` borders ${(ADJACENT[r.id] ?? []).join(" ")}` : "";
      L.push(`  ${r.id} (${name(r.id)}, ${r.body}) slots ${r.buildings?.length ?? 0}/${r.slots} [${b}] armies ${r.armies ?? 0}${q ? ` queue: ${q}` : ""}${adj}`);
    }
    const fleets = (w.fleets ?? []).filter((f: Msg) => f.owner === me.nation);
    for (const f of fleets) {
      const where = f.at ? `in orbit at ${f.at}` : `to ${f.transit.to}, arrives in ${t(f.transit.arriveAt)}`;
      L.push(`  fleet ${f.id} ${goods(f.units)} ${where}`);
    }
    for (const m of (w.marches ?? []).filter((x: Msg) => x.owner === me.nation)) L.push(`  march ${m.count} Armies ${m.from} -> ${m.to}, arrive in ${t(m.arriveAt)}`);
    for (const o of me.trades ?? []) L.push(`  offer ${o.id}: ${nm(o.from)} gives ${goods(o.give)} for ${goods(o.get)} to ${nm(o.to)}`);
    for (const e of me.envoys ?? []) L.push(`  envoy at ${nm(e.nation)}`);
  }
  const rivals = [...nations.values()].filter((n) => n.id !== me?.nation && n.capital);
  L.push(`Nations: ${rivals.map((n) => `${n.id} "${n.name}" capital ${n.capital ?? "-"}${n.protectedUntil > c.at ? " (protected)" : ""}`).join("; ")}`);
  const seen = (w.regions ?? []).filter((r: Msg) => r.owner && r.owner !== me?.nation);
  if (seen.length) L.push(`Rival regions you can see: ${seen.map((r: Msg) => `${r.id}=${nm(r.owner)}${r.armies ? `(${r.armies} armies)` : ""}`).join(" ")}`);
  for (const x of w.wars ?? []) L.push(`War ${x.id}: ${nm(x.a)} vs ${nm(x.b)}${x.activeAt > c.at ? `, active in ${t(x.activeAt)}` : ""}${x.peaceFrom ? `, peace offered by ${nm(x.peaceFrom)}` : ""}`);
  for (const a of w.alliances ?? []) L.push(`Alliance ${a.id}: ${a.members.map(nm).join(", ")}${a.invites.length ? `; invited ${a.invites.map(nm).join(", ")}` : ""}${a.sanctions.length ? `; sanctions ${a.sanctions.map(nm).join(", ")}` : ""}`);
  for (const b of w.battles ?? []) L.push(`Battle at ${b.region}: ${nm(b.attacker)} attacking ${nm(b.defender)}, ends in ${t(b.endsAt)}`);
  const sc = Object.entries<Msg>(w.scores ?? {}).sort((a, b) => b[1].total - a[1].total);
  L.push(`Scores (total: territory/economy/tech): ${sc.map(([id, s]) => `${nm(id)} ${r0(s.total)}: ${r0(s.territory)}/${r0(s.economy)}/${r0(s.tech)}`).join(", ")}`);
  const news = [...(w.news ?? []), ...c.news].slice(-6).map((n: Msg) => n.text);
  if (news.length) L.push(`News: ${news.join(" | ")}`);
  return L.join("\n");
}

function help(): string {
  const L = ["Buildings (cost, build time, output/min, upkeep/min):"];
  for (const [id, b] of Object.entries(BUILDINGS)) {
    L.push(`  ${id}: ${goods(b.cost)}, ${b.timeS}s, ${b.output ? `+${b.output.base} ${b.output.res}${b.output.yield ? " x region yield" : ""}` : "no output"}${b.input ? `, uses ${goods(b.input)}` : ""}, upkeep ${goods(b.upkeep)}`);
  }
  L.push("Resources: " + Object.entries(RESOURCE_NAMES).map(([k, v]) => `${k} = ${v}`).join(", ") + ". M (Metals) and Mt (Materiel) differ.");
  L.push("Units (cost, time, strength):");
  for (const [id, u] of Object.entries(UNITS)) L.push(`  ${id}: ${goods(u.cost)}, ${u.timeS}s, str ${u.strength}${u.unlock ? `, needs ${u.unlock}` : ""}${u.atSpaceport ? ", at a Spaceport" : ""}`);
  L.push(`Tech ladders (rungs in order; rung cost ${TECH.costs.join(", ")} R):`);
  for (const [id, rungs] of Object.entries(LADDERS)) L.push(`  ${id}: ${rungs.map((r) => `${r.id} ${r.name} (${r.desc})`).join("; ")}`);
  L.push("Bodies: " + Object.values(BODIES).map((b) => `${b.id}(${b.zone}, ${b.slots} slots)`).join(" "));
  return L.join("\n");
}

// Who did what, read from the server's JSON log (the Crit 10 story).
function logSummary(): string {
  const per = new Map<string, { ok: number; no: Record<string, number>; actions: Record<string, number> }>();
  for (const line of readFileSync(LOG, "utf8").split("\n")) {
    let l: Msg;
    try { l = JSON.parse(line); } catch { continue; }
    if (!l.user || l.ms === undefined) continue;
    const p = per.get(l.user) ?? { ok: 0, no: {}, actions: {} };
    if (l.result === "ok") { p.ok++; p.actions[l.action] = (p.actions[l.action] ?? 0) + 1; }
    else p.no[l.result] = (p.no[l.result] ?? 0) + 1;
    per.set(l.user, p);
  }
  const fmt = (o: Record<string, number>) => Object.entries(o).map(([k, v]) => `${k} ${v}`).join(", ") || "none";
  return [...per].map(([u, p]) => `  ${u}: ${p.ok} ok (${fmt(p.actions)}); rejected: ${fmt(p.no)}`).join("\n");
}

async function main(): Promise<void> {
  const [who, verb, arg] = process.argv.slice(2);
  if (who === "start") return start(Number(verb) || 25, process.argv.slice(4));
  if (who === "stop") return stop();
  if (who === "help") return void console.log(help());
  const r = run();
  const c = new Conn(r, who);
  await c.open();
  const pre = stopLine(r, c);
  if (pre && who !== "admin") {
    console.log(pre);
    return c.close();
  }
  if (verb === "do") {
    const cmds: Msg[] = [JSON.parse(arg)].flat();
    for (const cmd of cmds) {
      const res = await c.result(c.send(cmd));
      console.log(`${cmd.type}: ${res.ok ? "ok" : `REJECTED ${res.code}: ${res.reason}`}`);
    }
    await sleep(600);
  } else if (verb === "wait") {
    const s = Math.min(Number(arg) || 15, 120);
    for (let i = 0; i < s * 2 && !stopLine(r, c); i++) await sleep(500);
  }
  if (who === "admin") console.log(`Elapsed ${((Date.now() - r.startedAt) / MIN).toFixed(1)} min of ${r.capMin}.\nLog summary:\n${logSummary()}`);
  console.log(who === "admin" ? view(c).split("\n").filter((l) => !l.startsWith("Not joined")).join("\n") : view(c));
  const post = stopLine(r, c);
  if (post) console.log(post);
  c.close();
}

await main();

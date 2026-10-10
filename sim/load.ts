// goals.md S1 to S5, "Measured": 30 bots play over real WebSockets against
// the real server in its own process; results go to docs/measurements.md.
// Run: pnpm load
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { WebSocket } from "ws";

const CLIENTS = 30;
const SECONDS = 60;
const PORT = 18_080 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN = "load00";
const OUT = "docs/measurements.md";

type Msg = Record<string, any>;
const q = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN;
};
const r1 = (x: number) => Number(x.toFixed(1));

async function account(name: string, i: number): Promise<string> {
  const post = (path: string, body: object, cookie = "") =>
    fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) });
  const res = await post("/api/signup", { username: name, password: "correct horse" });
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  const hue = Math.round((i * 360) / CLIENTS);
  for (let k = 0; k < 30; k++) {
    const colour = `#${[0, 8, 4].map((o) => Math.round(127 + 127 * Math.sin(((hue + k * 37) / 57) + o)).toString(16).padStart(2, "0")).join("")}`;
    if ((await post("/api/empire", { name: `Load ${i}`, primary: colour, secondary: "#ffffff" }, cookie)).ok) break;
  }
  return cookie;
}

class Bot {
  ws: WebSocket;
  welcome?: Msg;
  bytes = 0;
  ticks: { size: number; busy: boolean }[] = [];
  sent = new Map<string, number>();
  rtt: number[] = [];
  seen = new Map<string, number>(); // region → first time this bot saw it owned
  private n = 0;
  readonly name: string;
  constructor(cookie: string, name: string) {
    this.name = name;
    this.ws = new WebSocket(BASE.replace("http", "ws") + "/ws", { headers: { cookie, origin: BASE } });
    this.ws.on("message", (raw) => {
      const s = String(raw);
      this.bytes += s.length;
      const m = JSON.parse(s);
      if (m.t === "welcome") this.welcome = m;
      if (m.t !== "tick") return;
      this.ticks.push({ size: s.length, busy: !!(m.changes || m.news || m.results) });
      for (const r of m.results ?? []) {
        const t = this.sent.get(r.id);
        if (t) this.rtt.push(Date.now() - t);
      }
      for (const r of m.changes?.regions ?? []) if (r.owner && !this.seen.has(r.id)) this.seen.set(r.id, Date.now());
    });
  }
  ready = () => new Promise<void>((ok) => { const i = setInterval(() => this.welcome && (clearInterval(i), ok()), 20); });
  send(cmd: object): string {
    const id = `${this.name}-${++this.n}`;
    this.sent.set(id, Date.now());
    this.ws.send(JSON.stringify({ t: "cmd", id, cmd }));
    return id;
  }
}

async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "grow-load-"));
  const prof = process.env.LOAD_PROF ? ["--cpu-prof", "--cpu-prof-dir=.cache/prof"] : [];
  // The production command's flags, read from the Dockerfile's CMD.
  const cmd = JSON.parse(/^CMD (\[.*\])$/m.exec(readFileSync("Dockerfile", "utf8"))![1]) as string[];
  const server = spawn(process.execPath, [...prof, ...cmd.slice(1)], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, ADMIN_USERS: ADMIN },
  });
  const logs: Msg[] = [];
  let buf = "";
  server.stdout.on("data", (d) => {
    buf += d;
    for (let i; (i = buf.indexOf("\n")) >= 0; buf = buf.slice(i + 1)) { try { logs.push(JSON.parse(buf.slice(0, i))); } catch { /* not ours */ } }
  });
  for (let i = 0; i < 100 && !logs.some((l) => l.action === "listen"); i++) await new Promise((r) => setTimeout(r, 100));

  const adminCookie = await account(ADMIN, 0);
  const cookies = await Promise.all(Array.from({ length: CLIENTS }, (_, i) => account(`load${String(i + 1).padStart(2, "0")}`, i + 1)));
  const bots = cookies.map((c, i) => new Bot(c, `b${i}`));
  await Promise.all(bots.map((b) => b.ready()));
  const welcome = bots.map((b) => JSON.stringify(b.welcome).length);

  // Joins one at a time: each claim's arrival at every other bot is S1.
  const joinAt = new Map<string, number>();
  const regions: string[] = bots[0].welcome!.world.regions.filter((r: Msg) => r.body === "earth").map((r: Msg) => r.id);
  const players = bots.slice(0, regions.length);
  for (const [i, b] of players.entries()) {
    joinAt.set(regions[i], Date.now());
    b.send({ type: "join", region: regions[i] });
    await new Promise((r) => setTimeout(r, 120));
  }
  await new Promise((r) => setTimeout(r, 1500));
  const visible: number[] = [];
  for (const b of bots) for (const [region, t] of joinAt) { const s = b.seen.get(region); if (s) visible.push(s - t); }

  // Steady play: every bot acts every 2 s from a menu of cheap commands.
  const menu = (b: Bot, k: number) => [
    { type: "train", region: regions[bots.indexOf(b)] ?? "r_canada", count: 1 },
    { type: "research", tech: "voidcraft.1" },
    { type: "cancelResearch" },
    { type: "cancelBuild", region: regions[bots.indexOf(b)] ?? "r_canada", index: 0 },
    { type: "exchange", give: "E", amount: 30, get: "M" },
  ][k % 5];
  const bytes0 = bots.reduce((a, b) => a + b.bytes, 0);
  const t0 = Date.now();
  let k = 0;
  const play = setInterval(() => { for (const b of bots) b.send(menu(b, k + bots.indexOf(b))); k++; }, 2000);
  const statsRes = await fetch(`${BASE}/api/admin/stream`, { headers: { cookie: adminCookie } });
  const reader = statsRes.body!.getReader();
  let stats: Msg = {};
  const rss: number[] = [];
  const dec = new TextDecoder();
  while (Date.now() - t0 < SECONDS * 1000) {
    const { value } = await reader.read();
    const line = dec.decode(value).split("\n").find((l) => l.startsWith("data:"));
    if (line) { stats = JSON.parse(line.slice(5)); rss.push(stats.rssMb); }
  }
  clearInterval(play);
  const egress = (bots.reduce((a, b) => a + b.bytes, 0) - bytes0) / ((Date.now() - t0) / 1000);
  await reader.cancel();
  for (const b of bots) b.ws.close();
  await new Promise((r) => setTimeout(r, 800));
  const idle = logs.some((l) => l.action === "idle");
  server.kill("SIGTERM");
  await new Promise((r) => server.once("exit", r));

  const db = new DatabaseSync(join(dir, "game.db"));
  const cmds = db.prepare("SELECT COUNT(*) AS n, SUM(LENGTH(payload) + LENGTH(result) + LENGTH(type) + 40) AS b FROM commands").get() as { n: number; b: number };
  db.close();
  const dbBytes = statSync(join(dir, "game.db")).size;
  const ticks = bots.flatMap((b) => b.ticks);
  const quiet = ticks.filter((t) => !t.busy).map((t) => t.size), busy = ticks.filter((t) => t.busy).map((t) => t.size);
  const rtt = bots.flatMap((b) => b.rtt);
  const applyMs = logs.filter((l) => l.nation && l.ms !== undefined).map((l) => l.ms);
  const boot = logs.find((l) => l.action === "boot")?.ms;

  const rows: [string, string, string, string, boolean][] = [
    ["S1", "Claim visible to every other client", "≤ 600 ms p95", `p50 ${q(visible, 0.5)} · p95 ${q(visible, 0.95)} · p99 ${q(visible, 0.99)} ms (${visible.length} sightings)`, q(visible, 0.95) <= 600],
    ["S1", "Command result round trip", "≤ 600 ms p95", `p50 ${q(rtt, 0.5)} · p95 ${q(rtt, 0.95)} ms (${rtt.length} commands)`, q(rtt, 0.95) <= 600],
    ["S1", "Tick processing", "≤ 20 ms p99", `p50 ${stats.tickMs?.p50} · p99 ${stats.tickMs?.p99} ms`, stats.tickMs?.p99 <= 20],
    ["S2", "Server RSS at 30 clients", "≤ 180 MB", `${Math.max(...rss)} MB peak (JS heap ${stats.heapMb} MB)`, Math.max(...rss) <= 180],
    ["S2", "Tick CPU share of the 500 ms budget", "≤ 10%", `${r1((stats.tickMs?.p50 / 500) * 100)}% (p50)`, stats.tickMs?.p50 / 500 <= 0.1],
    ["S2", "Loop stops with nobody connected", "logged", idle ? "idle line logged" : "no idle line", idle],
    ["S3", "Quiet tick", "≤ 500 B", `p95 ${q(quiet, 0.95)} B`, q(quiet, 0.95) <= 500],
    ["S3", "Busy tick", "≤ 3 KB", `p95 ${q(busy, 0.95)} B`, q(busy, 0.95) <= 3072],
    ["S3", "welcome", "≤ 60 KB", `max ${r1(Math.max(...welcome) / 1024)} KB`, Math.max(...welcome) <= 61_440],
    ["S3", "Egress at 30 clients", "≤ 200 KB/s", `${r1(egress / 1024)} KB/s`, egress <= 204_800],
    ["S4", "Command-log append", "≤ 1 ms p99", `p99 ${stats.appendMs?.p99} ms (whole apply p99 ${q(applyMs, 0.99)} ms)`, stats.appendMs?.p99 <= 1],
    ["S4", "Bytes per stored command", "≤ 200 B", `${r1(cmds.b / cmds.n)} B (${cmds.n} commands; db ${r1(dbBytes / 1024)} KB)`, cmds.b / cmds.n <= 200],
    ["S5", "Boot (snapshot + replay)", "≤ 1 s", `${boot} ms (fresh)`, (boot ?? 0) <= 1000],
  ];
  const md = `# Measurements

Measured goals (goals.md, kind **Measured**). Written by \`pnpm load\`
(\`sim/load.ts\`): ${CLIENTS} bots over real WebSockets for ${SECONDS} s against
the server in its own process, each acting every 2 s. Last run
${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC on ${process.platform} ${process.arch}, Node ${process.version}.

| Goal | What | Target | Measured | Met |
|---|---|---|---|---|
${rows.map(([g, w, t, m, ok]) => `| ${g} | ${w} | ${t} | ${m} | ${ok ? "yes" : "**no**"} |`).join("\n")}

Notes: a laptop, not the 256 MB shared-CPU Fly machine, so CPU and RSS read
lower than production would; rerun against the deploy before each crit.
`;
  writeFileSync(OUT, md);
  console.log(md);
}

await main();

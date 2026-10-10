import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Client, api, type Msg } from "../spec/helpers.ts";
import { start, type Running } from "./app.ts";
import { Log } from "./log.ts";

let running: Running | undefined;
afterEach(async () => {
  await running?.close();
  running = undefined;
});

let lines: string[] = [];
const boot = async (dataDir: string, admins: string[] = []) =>
  (running = await start({ port: 0, dataDir, admins, log: new Log((l) => lines.push(l)) }));
const base = () => `http://127.0.0.1:${running!.port}`;
const url = (p: string) => base() + p;
const account = (name: string, empire?: string) => api(base()).account(name, empire ? { name: empire } : undefined);
const open = async (cookie: string) => Client.open(base(), cookie);

describe("server: the brief's three requirements at the protocol level", () => {
  it("is multi-user and real-time: one command, both clients see it within 1 s", async () => {
    await boot(mkdtempSync(join(tmpdir(), "grow-")));
    const [a, b] = [await open(await account("alice", "Aurora")), await open(await account("bob", "Borealis"))];
    expect(a.msgs[0].you.nation).not.toBe(b.msgs[0].you.nation);
    b.send("b1", { type: "join", region: "r_us_west" }); // a sensor on Earth
    await b.result("b1");

    const sent = Date.now();
    a.send("c1", { type: "join", region: "r_canada" });
    expect(await a.result("c1")).toEqual({ id: "c1", ok: true });
    const seen = await b.until((m) => m.changes?.regions?.some((r: Msg) => r.id === "r_canada" && r.owner));
    expect(Date.now() - sent).toBeLessThan(1000);
    expect(seen.changes.regions.find((r: Msg) => r.id === "r_canada").owner).toBe(a.msgs[0].you.nation);
    const bob = b.msgs[0].you.nation;
    for (const m of b.msgs) if (m.you?.nation) expect(m.you.nation).toBe(bob); // private state stays private
  });

  it("persists across a restart", async () => {
    const dir = mkdtempSync(join(tmpdir(), "grow-"));
    await boot(dir);
    const a = await open(await account("alice", "Aurora"));
    a.send("c1", { type: "join", region: "r_siberia" });
    a.send("c2", { type: "train", region: "r_siberia", count: 2 });
    expect(await a.result("c2")).toMatchObject({ ok: true });
    await running!.close();
    expect(a.closed ?? (await new Promise((r) => a.ws.once("close", r)))).toBe(4003);

    await boot(dir);
    const again = await open(await account("alice"));
    const w = again.msgs[0];
    expect(w.world.regions.find((r: Msg) => r.id === "r_siberia").owner).toBe(w.you.nation);
    expect(w.you.queues.r_siberia).toHaveLength(2);
    expect(w.you.stocks.Mt.v).toBeCloseTo(30, 0);
  });
});

describe("server: commands", () => {
  it("applies a repeated client id once, and explains every rejection", async () => {
    await boot(mkdtempSync(join(tmpdir(), "grow-")));
    const a = await open(await account("alice", "Aurora"));
    a.send("j", { type: "join", region: "r_canada" });
    a.send("t", { type: "train", region: "r_canada", count: 1 });
    await a.result("t");
    a.msgs = [];
    a.send("t", { type: "train", region: "r_canada", count: 1 });
    expect(await a.result("t")).toEqual({ id: "t", ok: true });
    const tick = await a.until((m) => m.t === "tick" && m.you);
    expect(tick.you.stocks.Mt.v).toBeCloseTo(40, 0);

    a.send("x", { type: "exchange", give: "A", amount: 9999, get: "M" });
    expect(await a.result("x")).toMatchObject({ ok: false, code: "INSUFFICIENT", reason: expect.stringMatching(/Needs .* Alloys/) });
    a.send("bad", { type: "teleport" });
    expect(await a.result("bad")).toMatchObject({ ok: false, code: "INVALID", reason: expect.any(String) });
    a.send("se", { type: "setEmpire", name: "Hacked", primary: "#000000", secondary: "#000000" });
    expect(await a.result("se")).toMatchObject({ ok: false, code: "INVALID" });
  });
});

describe("server: accounts", () => {
  it("offers each new empire a colour nobody has taken", async () => {
    await boot(mkdtempSync(join(tmpdir(), "grow-")));
    const colourOf = async (cookie: string) =>
      /name="primary" type="color" list="presets" value="(#[0-9a-f]{6})"/.exec(await (await fetch(url("/empire"), { headers: { cookie } })).text())![1];
    const a = await account("erin");
    const first = await colourOf(a);
    const r = await api(base()).post("/api/empire", { name: "Erinland", primary: first, secondary: "#ffffff" }, a);
    expect(r.status).toBe(200);
    expect(await colourOf(await account("frank"))).not.toBe(first);
  });

  it("rejects wrong passwords and duplicate usernames, and closes 4001 without a session", async () => {
    await boot(mkdtempSync(join(tmpdir(), "grow-")));
    await account("carol");
    const post = (path: string, body: object) =>
      fetch(url(path), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    expect((await post("/api/signup", { username: "Carol", password: "another pass" })).status).toBe(409);
    expect((await post("/api/login", { username: "carol", password: "wrong pass!" })).status).toBe(401);
    expect((await post("/api/signup", { username: "x", password: "correct horse" })).status).toBe(400);
    const anon = new Client(base(), "");
    await new Promise((r) => anon.ws.once("close", r));
    expect(anon.closed).toBe(4001);
  });
});

describe("logging and the live view (system-design.md §11; goals.md S4, S7)", () => {
  it("writes one JSON line per action, and streams live stats to admins only", async () => {
    lines = [];
    await boot(mkdtempSync(join(tmpdir(), "grow-")), ["alice"]);
    const alice = await account("alice", "Aurora");
    const bob = await account("bob", "Borealis");
    const a = await open(alice);
    a.send("c1", { type: "join", region: "r_canada" });
    a.send("c2", { type: "build", region: "r_canada", building: "mine" });
    await a.result("c2");
    const parsed = lines.map((l) => JSON.parse(l));
    const joined = parsed.find((l) => l.action === "join")!;
    expect(joined).toMatchObject({ user: "alice", nation: expect.any(String), target: "r_canada", result: "ok", ms: expect.any(Number) });
    expect(joined.ts).toEqual(expect.any(Number));
    expect(parsed.find((l) => l.action === "build")).toMatchObject({ result: "NO_SLOT", reason: "No free slot in Canada" });
    expect(parsed.filter((l) => l.action === "signup").map((l) => l.user)).toEqual(["alice", "bob"]);
    expect(parsed.some((l) => l.action === "connect" && l.user === "alice")).toBe(true);

    expect((await fetch(url("/admin"), { headers: { cookie: bob } })).status).toBe(404);
    expect((await fetch(url("/admin"), { headers: { cookie: alice } })).status).toBe(200);
    const res = await fetch(url("/api/admin/stream"), { headers: { cookie: alice } });
    const reader = res.body!.getReader();
    const chunk = new TextDecoder().decode((await reader.read()).value);
    await reader.cancel();
    const stats = JSON.parse(chunk.slice(chunk.indexOf("data:") + 5).split("\n")[0]);
    expect(stats).toMatchObject({ online: ["Aurora"], sockets: 1, commandsPerMin: 2, rejections: { NO_SLOT: 1 } });
    expect(stats.tickMs.p99).toBeGreaterThanOrEqual(0);
    a.close();
  });
});

describe("seasons (game-design.md §10)", () => {
  it("starts a new season for the first arrival after one ran out while nobody was connected", async () => {
    let t = Date.now();
    running = await start({ port: 0, dataDir: mkdtempSync(join(tmpdir(), "grow-")), now: () => t, log: new Log(() => {}) });
    const a = await open(await account("alice", "Aurora"));
    a.send("j", { type: "join", region: "r_canada" });
    expect(await a.result("j")).toMatchObject({ ok: true });
    const first = running.world.state!.season.id;
    a.close();
    await new Promise((r) => setTimeout(r, 100));
    t += 61 * 60_000;
    await account("bob", "Borealis");
    expect(running.world.state!.season.id).not.toBe(first);
    expect(running.world.state!.season.status).toBe("running");
  });
});

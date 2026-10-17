import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
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

  it("starts a fresh world rather than replay under other rules, keeping empires", async () => {
    const dir = mkdtempSync(join(tmpdir(), "grow-"));
    await boot(dir);
    const a = await open(await account("alice", "Aurora"));
    a.send("c1", { type: "join", region: "r_siberia" });
    expect(await a.result("c1")).toMatchObject({ ok: true });
    const old = running!.world.state!.season.id;
    await running!.close();
    const db = new DatabaseSync(join(dir, "game.db"));
    db.prepare("UPDATE seasons SET rules_version = 'old'").run();
    db.close();

    await boot(dir);
    const again = await open(await account("alice"));
    const w = again.msgs[0];
    expect(w.season.id).not.toBe(old);
    expect(w.world.regions.find((r: Msg) => r.id === "r_siberia").owner).toBeUndefined();
    expect(running!.world.state!.nations[w.you.nation].name).toBe("Aurora");
  });
});

describe("server: the admin reset (system-design.md §9, §11)", () => {
  it("has admin / platypus on a fresh database, reserved at sign-up", async () => {
    await boot(mkdtempSync(join(tmpdir(), "grow-")));
    const post = api(base()).post;
    expect((await post("/api/login", { username: "admin", password: "platypus" })).status).toBe(200);
    expect((await post("/api/signup", { username: "Admin", password: "correct horse" })).status).toBe(400);
  });

  it("is 404 for others; for admin it kicks everyone with 4004 and empties the world, accounts kept", async () => {
    await boot(mkdtempSync(join(tmpdir(), "grow-")));
    const post = api(base()).post;
    const alice = await account("alice", "Aurora");
    const a = await open(alice);
    a.send("j", { type: "join", region: "r_canada" });
    expect(await a.result("j")).toMatchObject({ ok: true });
    const old = running!.world.state!.season.id;
    expect((await post("/api/admin/reset", {}, alice)).status).toBe(404);

    const login = await post("/api/login", { username: "admin", password: "platypus" });
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    expect((await post("/api/admin/reset", {}, cookie)).status).toBe(200);
    expect(a.closed ?? (await new Promise((r) => a.ws.once("close", r)))).toBe(4004);
    expect(running!.world.state!.season.id).not.toBe(old);
    expect(Object.values(running!.world.state!.regions).some((r) => r.owner)).toBe(false);

    expect((await post("/api/login", { username: "alice", password: "correct horse" })).status).toBe(200);
    const again = await open(alice);
    expect(again.msgs[0].season.id).not.toBe(old);
    expect(again.msgs[0].world.regions.find((r: Msg) => r.id === "r_canada").owner).toBeUndefined();
    expect(running!.world.state!.nations[again.msgs[0].you.nation].name).toBe("Aurora");
    expect(lines.some((l) => l.includes('"action":"reset"'))).toBe(true);
  });
});

describe("server: alliances reach every client live (game-design.md §9)", () => {
  it("sends an invite to its target and the formed alliance to everyone", async () => {
    await boot(mkdtempSync(join(tmpdir(), "grow-")));
    const [a, b] = [await open(await account("alice", "Aurora")), await open(await account("bob", "Borealis"))];
    a.send("j1", { type: "join", region: "r_canada" });
    b.send("j2", { type: "join", region: "r_brazil" });
    await a.result("j1");
    await b.result("j2");
    a.send("i", { type: "inviteAlly", nation: b.msgs[0].you.nation });
    expect(await a.result("i")).toMatchObject({ ok: true });
    const inv = await b.until((m) => m.changes?.alliances?.length);
    const id = inv.changes.alliances[0].id;
    b.send("y", { type: "acceptAlly", alliance: id });
    expect(await b.result("y")).toMatchObject({ ok: true });
    const formed = await a.until((m) => m.changes?.alliances?.some((x: Msg) => x.members.length === 2));
    expect(formed.changes.alliances[0].members).toHaveLength(2);
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
  it("keeps the world going while nobody is connected, catching up its stages (game-design.md §10)", async () => {
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
    expect(running.world.state!.season).toMatchObject({ id: first, status: "running", stage: 4 });
    const res = await fetch(`http://127.0.0.1:${running.port}/api/season`);
    const { hallOfFame } = await res.json();
    expect(hallOfFame.map((h: { stage: number }) => h.stage)).toEqual([3, 2, 1]);
    expect(hallOfFame[0].ranking[0].name).toBe("Aurora");
  });
});

// Sends the commands right after a tick, so they share the next one.
async function sameTick(clients: Client[], send: () => void): Promise<void> {
  const seen = clients[0].msgs.length;
  await clients[0].until((m) => m.t === "tick" && clients[0].msgs.indexOf(m) >= seen);
  send();
}

describe("contention and rate limits (system-design.md §5, §14.3; S03)", () => {
  it("gives a region claimed twice in one tick to the first; the second gets TAKEN", async () => {
    await boot(mkdtempSync(join(tmpdir(), "grow-")));
    const [a, b] = [await open(await account("alice", "Aurora")), await open(await account("bob", "Borealis"))];
    await sameTick([a], () => {
      a.send("a", { type: "join", region: "r_canada" });
      b.send("b", { type: "join", region: "r_canada" });
    });
    const [ra, rb] = [await a.result("a"), await b.result("b")];
    expect(ra).toEqual({ id: "a", ok: true });
    expect(rb).toEqual({ id: "b", ok: false, code: "TAKEN", reason: "Canada is taken" });
    const tickOf = (c: Client, id: string) => c.msgs.find((m) => m.results?.some((r: Msg) => r.id === id))!.n;
    expect(tickOf(a, "a")).toBe(tickOf(b, "b"));
  });

  it("accepts 10 commands per client per tick and refuses the 11th with RATE_LIMIT", async () => {
    await boot(mkdtempSync(join(tmpdir(), "grow-")));
    const a = await open(await account("alice", "Aurora"));
    await sameTick([a], () => {
      for (let i = 1; i <= 11; i++) a.send(`c${i}`, { type: "cancelResearch" });
    });
    expect(await a.result("c10")).not.toMatchObject({ code: "RATE_LIMIT" });
    expect(await a.result("c11")).toEqual({ id: "c11", ok: false, code: "RATE_LIMIT", reason: "Too many commands; wait a moment" });
  });
});

describe("who may connect and administer (system-design.md §9, §14.3; S07)", () => {
  const ws = (cookie: string, origin: string) =>
    new WebSocket(`ws://127.0.0.1:${running!.port}/ws`, { headers: { cookie, origin } });

  it("refuses a socket from a foreign Origin, and closes 4002 on an expired session", async () => {
    await boot(mkdtempSync(join(tmpdir(), "grow-")));
    const alice = await account("alice", "Aurora");
    const foreign = ws(alice, "https://evil.example");
    expect(await new Promise((r) => { foreign.once("open", () => r("open")); foreign.once("error", () => r("refused")); })).toBe("refused");

    running!.db.prepare("UPDATE sessions SET expires_at = 0").run();
    const stale = new Client(base(), alice);
    await new Promise((r) => stale.ws.once("close", r));
    expect(stale.closed).toBe(4002);
  });

  it("is 404 on every admin route for a player", async () => {
    await boot(mkdtempSync(join(tmpdir(), "grow-")));
    const bob = await account("bob", "Borealis");
    for (const p of ["/admin", "/api/admin/stream"]) expect((await fetch(url(p), { headers: { cookie: bob } })).status, p).toBe(404);
    expect((await api(base()).post("/api/admin/reset", {}, bob)).status).toBe(404);
    expect((await fetch(url("/api/admin/stream"))).status).toBe(404);
  });
});

describe("accounts are stored and limited safely (system-design.md §9; S07)", () => {
  it("returns 429 after 5 bad logins per name, and 20 per IP", async () => {
    await boot(mkdtempSync(join(tmpdir(), "grow-")));
    await account("dave");
    const login = (username: string, password: string, ip = "10.0.0.1") =>
      fetch(url("/api/login"), {
        method: "POST", headers: { "content-type": "application/json", "fly-client-ip": ip }, body: JSON.stringify({ username, password }),
      });
    for (let i = 0; i < 5; i++) expect((await login("dave", "wrong pass!")).status).toBe(401);
    expect((await login("dave", "correct horse")).status).toBe(429);
    for (let i = 0; i < 20; i++) expect((await login(`ghost${i}`, "wrong pass!", "10.0.0.2")).status).toBe(401);
    expect((await login("ghost99", "wrong pass!", "10.0.0.2")).status).toBe(429);
  });

  it("refuses a common password; sets a Secure HttpOnly Lax cookie; stores only hashes", async () => {
    running = await start({ port: 0, dataDir: mkdtempSync(join(tmpdir(), "grow-")), secureCookies: true, log: new Log(() => {}) });
    const post = api(base()).post;
    expect(await (await post("/api/signup", { username: "erin", password: "Password1" })).json())
      .toEqual({ field: "password", reason: "That password is too common" });
    const res = await post("/api/signup", { username: "erin", password: "correct horse" });
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Lax/);
    const token = decodeURIComponent(/session=([^;]+)/.exec(cookie)![1]);
    const sessions = running.db.prepare("SELECT token_hash FROM sessions").all() as { token_hash: string }[];
    expect(sessions.map((s) => s.token_hash)).toEqual([createHash("sha256").update(token).digest("hex")]);
    const { password_hash } = running.db.prepare("SELECT password_hash FROM users WHERE username = 'erin'").get() as { password_hash: string };
    expect(password_hash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{64}$/);
  });
});

describe("the log says who did what, never a secret (system-design.md §11; S09)", () => {
  it("logs login, logout, connect and disconnect with the user, and idle when the last socket closes", async () => {
    lines = [];
    await boot(mkdtempSync(join(tmpdir(), "grow-")));
    const post = api(base()).post;
    const alice = await account("alice", "Aurora");
    const login = await post("/api/login", { username: "alice", password: "correct horse" });
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const a = await open(cookie);
    a.close();
    await new Promise((r) => a.ws.once("close", r));
    await new Promise((r) => setTimeout(r, 50));
    await post("/api/logout", {}, cookie);

    const parsed = lines.map((l) => JSON.parse(l));
    for (const action of ["signup", "login", "connect", "disconnect", "logout"]) {
      expect(parsed.find((l) => l.action === action), action).toMatchObject({ user: "alice", result: "ok" });
    }
    const disconnect = parsed.findIndex((l) => l.action === "disconnect");
    expect(parsed.slice(disconnect).some((l) => l.action === "idle")).toBe(true);
    const secrets = ["correct horse", decodeURIComponent(cookie.split("=")[1]), alice.split("=")[1]];
    for (const l of lines) for (const s of secrets) expect(l).not.toContain(s);
  });
});

describe("sync (system-design.md §6; S05)", () => {
  it("resends a region without its owner when it leaves vision", async () => {
    await boot(mkdtempSync(join(tmpdir(), "grow-")));
    const [a, b] = [await open(await account("alice", "Aurora")), await open(await account("bob", "Borealis"))];
    a.send("j1", { type: "join", region: "r_canada" });
    b.send("j2", { type: "join", region: "r_brazil" });
    await a.result("j1");
    await b.result("j2");
    const s = running!.world.state!;
    const [na, nb] = [a.msgs[0].you.nation, b.msgs[0].you.nation];
    s.regions.r_mars_tharsis.owner = nb; // a region only an Envoy shows A
    s.nations[na].techs.push("science.1", "science.2");
    a.send("e", { type: "sendEnvoy", nation: nb });
    expect(await a.result("e")).toMatchObject({ ok: true });
    const mars = (m: Msg) => m.changes?.regions?.find((r: Msg) => r.id === "r_mars_tharsis");
    expect(mars(await a.until((m) => mars(m)?.owner === nb))).toMatchObject({ owner: nb });
    a.send("r", { type: "recallEnvoy", nation: nb });
    await a.result("r");
    expect(mars(await a.until((m) => mars(m) && !mars(m).owner))).toEqual({ id: "r_mars_tharsis", body: "mars", slots: expect.any(Number) });
  });

  it("streams to every tab of one account", async () => {
    await boot(mkdtempSync(join(tmpdir(), "grow-")));
    const cookie = await account("alice", "Aurora");
    const [t1, t2] = [await open(cookie), await open(cookie)];
    expect(t1.msgs[0].you.nation).toBe(t2.msgs[0].you.nation);
    t1.send("j", { type: "join", region: "r_canada" });
    await t1.result("j");
    await t2.until((m) => m.changes?.regions?.some((r: Msg) => r.id === "r_canada" && r.owner === t1.msgs[0].you.nation));
    expect(running!.hub.stats().sockets).toBe(2);
  });
});

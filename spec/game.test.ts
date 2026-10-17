import { describe, expect, inject, it } from "vitest";
import { REGIONS } from "../rules/data/index.ts";
import { api, Client, unique, type Msg } from "./helpers.ts";

// system-design.md §13: the promises checked against the running app.
const base = inject("baseUrl");
const { account, post } = api(base);

const player = async (tag: string) => {
  const name = unique(tag);
  const cookie = await account(name, { name });
  return { name, cookie, client: await Client.open(base, cookie) };
};

describe("accounts", () => {
  it("signs up, logs in, rejects a wrong password and a duplicate username", async () => {
    const name = unique("acct");
    await account(name);
    expect((await post("/api/login", { username: name, password: "correct horse" })).status).toBe(200);
    expect((await post("/api/login", { username: name, password: "wrong horse!" })).status).toBe(401);
    expect((await post("/api/signup", { username: name.toUpperCase(), password: "correct horse" })).status).toBe(409);
  });
});

describe("real-time, multi-user and persistence", () => {
  it("delivers one client's command to another within 1 s", async () => {
    const [a, b] = [await player("rta"), await player("rtb")];
    const taken = await b.client.join(); // a sensor on Earth
    const region = a.client.welcome.world.regions
      .find((r: Msg) => r.body === "earth" && !r.owner && r.id !== taken).id;
    const sent = Date.now();
    a.client.send("j", { type: "join", region });
    expect(await a.client.result("j")).toMatchObject({ ok: true });
    await b.client.until((m) => m.changes?.regions?.some((r: Msg) => r.id === region && r.owner));
    expect(Date.now() - sent).toBeLessThan(1000);
    a.client.close();
    b.client.close();
  });

  it("shows a command after a fresh login and connect", async () => {
    const a = await player("per");
    const region = await a.client.join();
    a.client.send("t1", { type: "train", region, count: 1 });
    expect(await a.client.result("t1")).toMatchObject({ ok: true });
    a.client.close();
    const again = await Client.open(base, await account(a.name));
    expect(again.welcome.you.queues[region]).toHaveLength(1);
    again.close();
  });
});

describe("privacy and fog of war", () => {
  it("never sends another nation's private state", async () => {
    const [a, b] = [await player("isa"), await player("isb")];
    await a.client.join();
    await b.client.join();
    await new Promise((r) => setTimeout(r, 1200));
    const mine = b.client.welcome.you.nation;
    for (const m of b.client.msgs) {
      if (m.you?.nation) expect(m.you.nation).toBe(mine);
      for (const o of m.you?.trades ?? []) expect([o.from, o.to]).toContain(mine);
    }
    a.client.close();
    b.client.close();
  });

  it("sends nothing about regions on bodies it has no sensor on", async () => {
    const a = await player("fog");
    await a.client.join();
    await new Promise((r) => setTimeout(r, 700));
    for (const m of a.client.msgs) {
      const regions: Msg[] = [...(m.world?.regions ?? []), ...(m.changes?.regions ?? [])];
      for (const r of regions.filter((x) => x.body !== "earth")) {
        expect(r.owner, r.id).toBeUndefined();
        expect(r.buildings, r.id).toBeUndefined();
      }
      const fleets: Msg[] = [...(m.world?.fleets ?? []), ...(m.changes?.fleets ?? [])];
      for (const f of fleets) expect(f.owner === a.client.welcome.you.nation || f.at === "earth").toBe(true);
      for (const b of [...(m.world?.battles ?? []), ...(m.changes?.battles ?? [])]) expect(REGIONS[b.id].body, b.id).toBe("earth");
    }
    a.client.close();
  });
});

describe("commands", () => {
  it("rejects overspending with a reason, applies a repeated id once, explains every rejection", async () => {
    const a = await player("cmd");
    const region = await a.client.join();
    a.client.send("x1", { type: "exchange", give: "A", amount: 1e6, get: "M" });
    expect(await a.client.result("x1")).toMatchObject({ ok: false, code: "INSUFFICIENT", reason: expect.stringMatching(/Needs/) });

    a.client.send("dup", { type: "train", region, count: 1 });
    await a.client.result("dup");
    a.client.msgs = [];
    a.client.send("dup", { type: "train", region, count: 1 });
    await a.client.result("dup");
    const t = await a.client.until((m) => m.t === "tick" && m.you?.stocks);
    expect(t.you.stocks.Mt.v).toBeCloseTo(40, 0);

    for (const [id, cmd] of [["b1", { type: "build", region: "r_nowhere", building: "mine" }], ["b2", { type: "nope" }]] as const) {
      a.client.send(id, cmd);
      const r = await a.client.result(id);
      expect(r.ok).toBe(false);
      expect(r.reason.length).toBeGreaterThan(3);
    }
    a.client.close();
  });
});

describe("message sizes (goals.md S3; system-design.md §14.6)", () => {
  it("keeps welcome ≤ 60 KB, quiet ticks ≤ 500 B and busy ticks ≤ 3 KB", async () => {
    const a = await player("size");
    const region = await a.client.join();
    a.client.send("s1", { type: "train", region, count: 2 });
    a.client.send("s2", { type: "build", region, building: "mine" });
    await a.client.result("s2");
    await new Promise((r) => setTimeout(r, 1200));
    const bytes = (m: Msg) => Buffer.byteLength(JSON.stringify(m));
    const ticks = a.client.msgs.filter((m) => m.t === "tick");
    const quiet = ticks.filter((m) => !m.changes && !m.results && !m.news);
    expect(bytes(a.client.welcome)).toBeLessThanOrEqual(60_000);
    expect(quiet.length).toBeGreaterThan(0);
    for (const m of quiet) expect(bytes(m)).toBeLessThanOrEqual(500);
    // ADR S11: a tick that opens a body's vision is a partial welcome
    const seen = new Set(a.client.welcome.world.regions.filter((r: Msg) => r.buildings).map((r: Msg) => r.body));
    for (const m of ticks) {
      const opened = (m.changes?.regions ?? []).filter((r: Msg) => r.buildings && !seen.has(r.body)).map((r: Msg) => r.body);
      opened.forEach((b: string) => seen.add(b));
      expect(bytes(m)).toBeLessThanOrEqual(opened.length ? 60_000 : 3_000);
    }
    a.client.close();
  });
});

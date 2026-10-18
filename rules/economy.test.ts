import { describe, expect, it } from "vitest";
import { BUILDINGS, ECONOMY, REGIONS, RESOURCES, UNITS } from "./data/index.ts";
import { buildingCost, buildingMs, capOf, economy, mods, shipMs } from "./economy.ts";
import { score, stageRanking } from "./score.ts";
import { advanceTo, apply, settled, validate, type Command } from "./index.ts";
import { S, T0, ok, rng, world } from "./test-helpers.ts";

describe("join and the starting kit (game-design.md §6)", () => {
  it("places the kit, stocks and protection at the chosen region", () => {
    const s = world("r_canada");
    const n = s.nations.n_1;
    expect(s.regions.r_canada.buildings.map((b) => b.type)).toEqual(["powerPlant", "mine", "refinery", "lab"]);
    expect(s.regions.r_canada.armies).toBe(2);
    expect(n.stocks).toEqual(ECONOMY.startKit.stocks);
    expect(n.capital).toBe("r_canada");
    expect(n.protectedUntil).toBe(T0 + 60 * S);
  });

  it("refuses a taken region, and names before joining", () => {
    const s = world("r_canada");
    const t = apply(s, "n_2", { type: "setEmpire", name: "Nation 1", primary: "#123456", secondary: "#000000" }, s.t);
    expect(t).toMatchObject({ ok: false, code: "TAKEN" });
    const clash = apply(s, "n_2", { type: "setEmpire", name: "Other", primary: "#e6194c", secondary: "#000000" }, s.t);
    expect(clash).toMatchObject({ ok: false, code: "TAKEN", reason: "Too close to Nation 1's colour" });
    const s2 = ok(s, "n_2", { type: "setEmpire", name: "Other", primary: "#123456", secondary: "#000000" });
    expect(apply(s2, "n_2", { type: "join", region: "r_canada" }, s2.t)).toMatchObject({ code: "TAKEN" });
    expect(apply(s2, "n_2", { type: "build", region: "r_canada", building: "mine" }, s2.t))
      .toMatchObject({ code: "NOT_JOINED" });
  });
});

describe("every start is on Earth (game-design.md §11)", () => {
  it("refuses off-Earth starts, and every join once Earth is full", () => {
    const s = ok(world("r_canada"), "n_2", { type: "setEmpire", name: "Late", primary: "#123456", secondary: "#ffffff" });
    expect(validate(s, "n_2", { type: "join", region: "r_mars_tharsis" }))
      .toMatchObject({ code: "INVALID", reason: "Pick a free Earth start region" });
    for (const r of Object.values(s.regions)) if (REGIONS[r.id].start) r.owner = "n_1";
    expect(validate(s, "n_2", { type: "join", region: "r_mars_tharsis" })).toMatchObject({ code: "EARTH_FULL" });
  });
});

describe("rates and the analytic stock model (game-design.md §3)", () => {
  it("matches a hand calculation for Canada's kit", () => {
    const s = world("r_canada");
    const { rate } = economy(s, "n_1");
    expect(rate.E).toBeCloseTo(10 * 0.7 - (2 + 3 + 3) - 2 * 0.5); // solar - upkeep - armies
    expect(rate.M).toBeCloseTo(10 * 1.3);
    expect(rate.V).toBeCloseTo(4 * 1.3);
    expect(rate.R).toBeCloseTo(5);
    expect(rate.Mt).toBeCloseTo(0);
    const later = settled(advanceTo(s, T0 + 60 * S));
    expect(later.nations.n_1.stocks.M).toBeCloseTo(200 + 13);
  });

  it("breaks the rate into lines by region and source (game-design.md §12 HUD)", () => {
    const s = world("r_canada");
    s.nations.n_1.stocks.E = 0; // under shortfall, lines still sum to the rate
    const e = economy(s, "n_1");
    for (const r of RESOURCES) {
      expect(e.lines.filter((l) => l.res === r).reduce((a, l) => a + l.amt, 0)).toBeCloseTo(e.rate[r]);
    }
    const mine = economy(world("r_canada"), "n_1").lines.filter((l) => l.source === "mine");
    expect(mine).toEqual([
      { region: "r_canada", source: "mine", res: "M", amt: expect.closeTo(13) },
      { region: "r_canada", source: "mine", res: "E", amt: -2 },
    ]);
    expect(e.lines.find((l) => l.source === "armies")).toMatchObject({ region: "r_canada", res: "E" });
  });

  it("throttles consumers at supply ÷ demand once a stock runs dry", () => {
    const s = world("r_canada");
    s.nations.n_1.stocks.E = 1; // −2 E/min: empty after 30 s
    const later = advanceTo(s, T0 + 120 * S);
    const n = later.nations.n_1;
    expect(n.stocks.E).toBe(0);
    const e = economy(later, "n_1");
    expect(e.rate.E).toBeCloseTo(0);
    expect(e.efficiency).toBeCloseTo(7 / 9);
    expect(e.rate.M).toBeCloseTo((13 * 7) / 9);
  });
});

describe("build queues and research (game-design.md §6, §8)", () => {
  it("rejects a full region, then builds after a demolish refunds 50%", () => {
    let s = world("r_canada");
    expect(validate(s, "n_1", { type: "build", region: "r_canada", building: "mine" }))
      .toMatchObject({ code: "NO_SLOT", reason: "No free slot in Canada; replace a building to use its slot" });
    s = ok(s, "n_1", { type: "demolish", region: "r_canada", slot: 3 });
    expect(s.nations.n_1.stocks.M).toBe(220);
    s = ok(s, "n_1", { type: "build", region: "r_canada", building: "mine" });
    expect(s.nations.n_1.stocks.M).toBe(190);
    s = advanceTo(s, T0 + 20 * S);
    expect(s.regions.r_canada.buildings.filter((b) => b.type === "mine")).toHaveLength(2);
  });

  it("names what makes a resource the nation has no producer for (P2)", () => {
    const s = world("r_canada");
    s.nations.n_1.stocks.Mt = 0;
    expect(validate(s, "n_1", { type: "train", region: "r_canada", count: 1 }))
      .toMatchObject({ code: "INSUFFICIENT", reason: expect.stringMatching(/^Needs \d+ more Materiel; a Factory makes it$/) });
  });

  it("replaces a slot in one command, counting the refund toward the cost", () => {
    let s = world("r_canada");
    s.nations.n_1.stocks.M = 45;
    expect(validate(s, "n_1", { type: "replace", region: "r_canada", slot: 3, building: "spaceport" }))
      .toMatchObject({ code: "INSUFFICIENT", reason: "Needs 5 more Metals" });
    expect(s.regions.r_canada.buildings).toHaveLength(4);
    s.nations.n_1.stocks.M = 200;
    s = ok(s, "n_1", { type: "replace", region: "r_canada", slot: 3, building: "spaceport" });
    expect(s.nations.n_1.stocks).toMatchObject({ M: 150, V: 105, A: 35 });
    expect(s.regions.r_canada.buildings.map((b) => b.slot)).toEqual([0, 1, 2]);
    s = advanceTo(s, T0 + 240 * S);
    expect(s.regions.r_canada.buildings.find((b) => b.slot === 3)?.type).toBe("spaceport");
  });

  it("keeps a replaced slot for its new building while other builds finish", () => {
    let s = world("r_canada");
    s = ok(s, "n_1", { type: "demolish", region: "r_canada", slot: 3 });
    s = ok(s, "n_1", { type: "build", region: "r_canada", building: "mine" });
    s = ok(s, "n_1", { type: "replace", region: "r_canada", slot: 1, building: "factory" });
    s = advanceTo(s, T0 + 20 * S);
    expect(s.regions.r_canada.buildings.find((b) => b.slot === 3)?.type).toBe("mine");
    s = advanceTo(s, T0 + 50 * S);
    expect(s.regions.r_canada.buildings.find((b) => b.slot === 1)?.type).toBe("factory");
  });

  it("refunds a cancelled item and pulls the rest of the queue forward", () => {
    let s = world("r_canada");
    s = ok(s, "n_1", { type: "train", region: "r_canada", count: 3 });
    expect(s.nations.n_1.stocks.Mt).toBe(20);
    s = ok(s, "n_1", { type: "cancelBuild", region: "r_canada", index: 0 }, T0 + 5 * S);
    const q = s.regions.r_canada.queue;
    expect(q.map((x) => x.finishAt - T0)).toEqual([20 * S, 35 * S]);
    s = advanceTo(s, T0 + 40 * S);
    expect(s.regions.r_canada.armies).toBe(4);
  });

  it("researches Thrust Vectoring at about 2 minutes from the start kit", () => {
    let s = world("r_canada");
    expect(validate(s, "n_1", { type: "research", tech: "voidcraft.2" })).toMatchObject({ code: "LOCKED" });
    expect(validate(s, "n_1", { type: "research", tech: "voidcraft.1" }))
      .toMatchObject({ code: "INSUFFICIENT", reason: "Needs 10 more Research" });
    s = ok(s, "n_1", { type: "research", tech: "voidcraft.1" }, T0 + 120 * S);
    s = advanceTo(s, T0 + 135 * S);
    expect(s.nations.n_1.techs).toEqual(["voidcraft.1"]);
  });
});

describe("invariants", () => {
  const cmds = (r: () => number): Command => {
    const regions = ["r_canada", "r_us_west"];
    const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)];
    return pick<Command>([
      { type: "build", region: pick(regions), building: pick(["mine", "foundry", "factory", "powerPlant", "lab"]) },
      { type: "demolish", region: pick(regions), slot: Math.floor(r() * 4) },
      { type: "replace", region: pick(regions), slot: Math.floor(r() * 4), building: pick(["mine", "lab", "spaceport"]) },
      { type: "train", region: pick(regions), count: 1 + Math.floor(r() * 5) },
      { type: "cancelBuild", region: pick(regions), index: 0 },
      { type: "research", tech: pick(["voidcraft.1", "industry.1", "science.1", "society.1"]) },
      { type: "cancelResearch" },
    ]);
  };

  const play = (seed: number) => {
    const r = rng(seed);
    let s = world("r_canada", "r_us_west");
    const trace = [];
    for (let i = 0; i < 400; i++) {
      const at = s.t + Math.floor(r() * 20 * S);
      const nation = r() < 0.5 ? "n_1" : "n_2";
      const res = apply(s, nation, cmds(r), at);
      s = res.ok ? res.state : advanceTo(s, at);
      trace.push(s);
    }
    return trace;
  };

  it("never lets a stock go negative or over its cap", () => {
    for (const seed of [1, 2, 3]) {
      for (const s of play(seed)) {
        for (const n of Object.values(s.nations)) {
          for (const r of RESOURCES) {
            expect(n.stocks[r]).toBeGreaterThanOrEqual(0);
            expect(n.stocks[r]).toBeLessThanOrEqual(capOf(s, n.id) + 1e-9);
          }
        }
      }
    }
  });

  it("replays deterministically, including through a JSON snapshot", () => {
    const a = play(7).at(-1)!;
    const b = play(7).at(-1)!;
    expect(b).toEqual(a);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });

  it("gives identical state whether advanced every tick or command to command", () => {
    const cmds: [number, Command][] = [
      [37_250, { type: "train", region: "r_canada", count: 2 }],
      [121_500, { type: "research", tech: "voidcraft.1" }],
      [400_000, { type: "demolish", region: "r_canada", slot: 3 }],
    ];
    let replay = world("r_canada");
    let live = structuredClone(replay);
    for (const [dt, c] of cmds) {
      const res = apply(replay, "n_1", c, T0 + dt);
      if (!res.ok) throw new Error(res.reason);
      replay = res.state;
      while (live.t + 500 < T0 + dt) live = advanceTo(live, live.t + 500);
      const l = apply(live, "n_1", c, T0 + dt);
      if (!l.ok) throw new Error(l.reason);
      live = l.state;
    }
    expect(live).toEqual(replay);
  });

});

describe("stages: a world that keeps going (game-design.md §10)", () => {
  it("advances every 20 min, ranks gain this stage, and never ends", () => {
    const end = score(advanceTo(world("r_canada", "r_us_west"), T0 + 1199 * S), "n_1").total;
    let s = advanceTo(world("r_canada", "r_us_west"), T0 + 1200 * S);
    expect(s.season).toMatchObject({ stage: 2, stageEndsAt: T0 + 2400 * S, status: "running" });
    expect(s.season.winners[0].stage).toBe(1);
    expect(s.season.winners[0].ranking.map((r) => r.nation)).toHaveLength(2);
    expect(s.news.at(-1)).toMatchObject({ kind: "stage" });
    expect(s.news.at(-1)!.text).toMatch(/Stage 2: Industrial Age/);
    expect(s.season.base.n_1).toBeCloseTo(end); // gains count from here, boost included
    s = advanceTo(s, T0 + 3700 * S);
    expect(s.season).toMatchObject({ stage: 4, status: "running" });
    expect(validate(s, "n_1", { type: "train", region: "r_canada", count: 1 })).toBeNull();
  });

  it("ranks by gain, not size: a late joiner can top a stage", () => {
    let s = world("r_canada");
    s.nations.n_1.techs = ["science.1"]; // n_1 is ahead, then stands still
    s.season.base.n_1 = score(s, "n_1").total;
    s = ok(s, "n_2", { type: "setEmpire", name: "Late", primary: "#123456", secondary: "#ffffff" });
    s = ok(s, "n_2", { type: "join", region: "r_us_west" });
    s.nations.n_2.techs = ["industry.1"];
    expect(stageRanking(s)[0].nation).toBe("n_2");
  });

  it("applies each stage's modifier to everyone (Industrial Age, Space Age)", () => {
    let s = world("r_canada");
    const mine = () => economy(s, "n_1").lines.find((l) => l.source === "mine" && l.res === "M")!.amt;
    const before = mine();
    s = advanceTo(s, T0 + 1200 * S);
    expect(mine()).toBeCloseTo(before * 1.25);
    const m1 = mods(s.nations.n_1, 1), m3 = mods(s.nations.n_1, 3);
    expect(buildingCost("spaceport", m1)).toEqual(BUILDINGS.spaceport.cost);
    expect(buildingCost("spaceport", m3)).toEqual({ M: Math.ceil(BUILDINGS.spaceport.cost.M! * 0.75), A: Math.ceil(BUILDINGS.spaceport.cost.A! * 0.75) });
    expect(buildingMs("spaceport", m3)).toBe(BUILDINGS.spaceport.timeS * 500);
    expect(shipMs("corvette", m3)).toBe(UNITS.corvette.timeS * 750);
    expect(shipMs("army", m3)).toBe(UNITS.army.timeS * 1000);
  });
});

import { describe, expect, it } from "vitest";
import { RESOURCES } from "./data/index.ts";
import { capOf, economy } from "./economy.ts";
import { advanceTo, apply, validate, type Command } from "./index.ts";
import { S, T0, ok, rng, world } from "./test-helpers.ts";

describe("join and the starting kit (game-design.md §6)", () => {
  it("places the kit, stocks and protection at the chosen region", () => {
    const s = world("r_canada");
    const n = s.nations.n_1;
    expect(s.regions.r_canada.buildings.map((b) => b.type)).toEqual(["powerPlant", "mine", "refinery", "lab"]);
    expect(s.regions.r_canada.armies).toBe(2);
    expect(n.stocks).toEqual({ E: 500, M: 200, V: 100, A: 30, R: 30, Mt: 50 });
    expect(n.capital).toBe("r_canada");
    expect(n.protectedUntil).toBe(T0 + 300 * S);
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

describe("rates and the analytic stock model (game-design.md §3)", () => {
  it("matches a hand calculation for Canada's kit", () => {
    const s = world("r_canada");
    const { rate } = economy(s, "n_1");
    expect(rate.E).toBeCloseTo(10 * 0.7 - (2 + 3 + 3) - 2 * 0.5); // solar - upkeep - armies
    expect(rate.M).toBeCloseTo(6 * 1.3);
    expect(rate.V).toBeCloseTo(4 * 1.3);
    expect(rate.R).toBeCloseTo(5);
    expect(rate.Mt).toBeCloseTo(-0.5);
    const later = advanceTo(s, T0 + 60 * S);
    expect(later.nations.n_1.stocks.M).toBeCloseTo(200 + 7.8);
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
    expect(e.rate.M).toBeCloseTo((7.8 * 7) / 9);
  });
});

describe("build queues and research (game-design.md §6, §8)", () => {
  it("rejects a full region, then builds after a demolish refunds 50%", () => {
    let s = world("r_canada");
    expect(validate(s, "n_1", { type: "build", region: "r_canada", building: "mine" }))
      .toMatchObject({ code: "NO_SLOT", reason: "No free slot in Canada" });
    s = ok(s, "n_1", { type: "demolish", region: "r_canada", slot: 3 });
    expect(s.nations.n_1.stocks.M).toBe(220);
    s = ok(s, "n_1", { type: "build", region: "r_canada", building: "mine" });
    expect(s.nations.n_1.stocks.M).toBe(190);
    s = advanceTo(s, T0 + 20 * S);
    expect(s.regions.r_canada.buildings.filter((b) => b.type === "mine")).toHaveLength(2);
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

  it("ends the season at 60 minutes and refuses commands after", () => {
    const s = advanceTo(world("r_canada"), T0 + 3600 * S);
    expect(s.season.status).toBe("ended");
    expect(s.season.winner).toBe("n_1");
    expect(validate(s, "n_1", { type: "cancelResearch" })).toMatchObject({ code: "SEASON_OVER" });
  });
});

import { describe, expect, it } from "vitest";
import { economy } from "./economy.ts";
import { advanceTo, validate } from "./index.ts";
import { S, T0, ok, world } from "./test-helpers.ts";

describe("trade (game-design.md §9)", () => {
  it("escrows both sides on accept and delivers Earth-to-Earth in 30 s", () => {
    let s = world("r_canada", "r_us_west");
    s = ok(s, "n_1", { type: "offerTrade", to: "n_2", give: { M: 100 }, get: { V: 50 } });
    const offer = Object.keys(s.offers)[0];
    s = ok(s, "n_2", { type: "acceptTrade", offer });
    expect([s.nations.n_1.stocks.M, s.nations.n_2.stocks.V]).toEqual([100, 50]);
    s = advanceTo(s, T0 + 30 * S);
    const d = 30 / 60;
    expect(s.nations.n_2.stocks.M).toBeCloseTo(200 + 100 + economy(s, "n_2").rate.M * d, 6);
    expect(s.nations.n_1.stocks.V).toBeCloseTo(100 + 50 + economy(s, "n_1").rate.V * d, 6);
    expect(s.offers).toEqual({});
  });

  it("refuses an accept the acceptor can't cover, and expires after 5 min", () => {
    let s = world("r_canada", "r_us_west");
    s = ok(s, "n_1", { type: "offerTrade", to: "n_2", give: { M: 10 }, get: { A: 500 } });
    const offer = Object.keys(s.offers)[0];
    expect(validate(s, "n_2", { type: "acceptTrade", offer })).toMatchObject({ code: "INSUFFICIENT" });
    s = advanceTo(s, T0 + 300 * S);
    expect(s.offers).toEqual({});
  });

  it("scales both deliveries by the Trade Multiplier through an Envoy", () => {
    let s = world("r_canada", "r_us_west");
    s.nations.n_1.techs = ["science.1", "science.2", "science.3"];
    s = ok(s, "n_1", { type: "sendEnvoy", nation: "n_2" });
    s = ok(s, "n_2", { type: "offerTrade", to: "n_1", give: { E: 40 }, get: { M: 80 } });
    s = ok(s, "n_1", { type: "acceptTrade", offer: Object.keys(s.offers)[0] });
    const deliveries = s.events.filter((e) => e.kind === "deliver");
    expect(deliveries.map((e) => e.kind === "deliver" && e.goods)).toEqual([{ E: 40 * 1.45 }, { M: 80 * 1.45 }]);
  });

  it("gifts one way and exchanges 3:1 with the Earth Exchange", () => {
    let s = world("r_canada", "r_us_west");
    s = ok(s, "n_1", { type: "gift", to: "n_2", goods: { Mt: 20 } });
    expect(s.nations.n_1.stocks.Mt).toBe(30);
    s = ok(s, "n_1", { type: "exchange", give: "M", amount: 90, get: "A" });
    expect(s.nations.n_1.stocks).toMatchObject({ M: 110, A: 60 });
  });
});

describe("Envoys (game-design.md §11)", () => {
  it("need Signals Intelligence and a free slot, and cost Energy upkeep", () => {
    let s = world("r_canada", "r_us_west", "r_brazil");
    expect(validate(s, "n_1", { type: "sendEnvoy", nation: "n_2" }))
      .toMatchObject({ code: "LOCKED", reason: "Needs Signals Intelligence" });
    s.nations.n_1.techs = ["science.1", "science.2"];
    const before = economy(s, "n_1").rate.E;
    s = ok(s, "n_1", { type: "sendEnvoy", nation: "n_2" });
    expect(economy(s, "n_1").rate.E).toBeCloseTo(before - 3);
    expect(validate(s, "n_1", { type: "sendEnvoy", nation: "n_3" })).toMatchObject({ code: "NO_ENVOY_SLOT" });
  });

  it("recall themselves when Energy runs out", () => {
    let s = world("r_canada", "r_us_west");
    s.nations.n_1.techs = ["science.1", "science.2"];
    s = ok(s, "n_1", { type: "sendEnvoy", nation: "n_2" });
    s.nations.n_1.stocks.E = 1;
    s = advanceTo(s, T0 + 60 * S);
    expect(s.nations.n_1.envoys).toEqual([]);
  });
});

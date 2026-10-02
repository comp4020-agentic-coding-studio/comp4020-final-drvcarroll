import { describe, expect, it } from "vitest";
import { addUnits, orbitFleet } from "./fleets.ts";
import { legalActions, observe, validate } from "./index.ts";
import { ok, world } from "./test-helpers.ts";

describe("observe: sensors, Envoys and fog (game-design.md §11)", () => {
  const setup = () => {
    const s = world("r_canada", "r_us_west");
    Object.assign(s.regions.r_mars_tharsis, { owner: "n_2", armies: 3, buildings: [{ slot: 0, type: "mine" }] });
    addUnits(orbitFleet(s, "n_2", "mars"), { corvette: 2 });
    return s;
  };

  it("shows everything on a sensed body, nothing elsewhere", () => {
    const { world: w } = observe(setup(), "n_1");
    expect(w.regions.find((r) => r.id === "r_us_west")).toMatchObject({ owner: "n_2", armies: 2 });
    expect(w.regions.find((r) => r.id === "r_mars_tharsis")).toEqual({ id: "r_mars_tharsis", body: "mars", slots: 3 });
    expect(w.fleets).toEqual([]);
  });

  it("gives an Envoy territory and fleets, never buildings", () => {
    let s = setup();
    s.nations.n_1.techs = ["science.1", "science.2"];
    s = ok(s, "n_1", { type: "sendEnvoy", nation: "n_2" });
    const { world: w } = observe(s, "n_1");
    const tharsis = w.regions.find((r) => r.id === "r_mars_tharsis")!;
    expect(tharsis).toMatchObject({ owner: "n_2", armies: 3 });
    expect(tharsis.buildings).toBeUndefined();
    expect(w.fleets).toEqual([expect.objectContaining({ owner: "n_2", at: "mars", units: { corvette: 2 } })]);
  });

  it("shows only Earth start-region owners to a nation choosing where to start", () => {
    const s = ok(setup(), "n_9", { type: "setEmpire", name: "Late", primary: "#000075", secondary: "#ffffff" });
    const { world: w } = observe(s, "n_9");
    expect(w.regions.find((r) => r.id === "r_us_west")).toEqual({ id: "r_us_west", body: "earth", slots: 4, owner: "n_2" });
    expect(w.regions.find((r) => r.id === "r_mars_tharsis")).toEqual({ id: "r_mars_tharsis", body: "mars", slots: 3 });
  });

  it("returns private state with stocks, rates and caps", () => {
    const { you } = observe(setup(), "n_1");
    expect(you?.stocks.M).toEqual({ v: 200, rate: expect.closeTo(7.8), cap: 1500 });
    expect(observe(setup(), null).you).toBeNull();
  });
});

describe("legalActions (game-design.md §13)", () => {
  it("lists only commands that would apply, including the obvious ones", () => {
    const s = world("r_canada", "r_us_west");
    const acts = legalActions(s, "n_1");
    for (const c of acts) expect(validate(s, "n_1", c), JSON.stringify(c)).toBeNull();
    expect(acts).toContainEqual({ type: "train", region: "r_canada", count: 1 });
    expect(acts).toContainEqual({ type: "march", from: "r_canada", to: "r_siberia", count: 2 });
    expect(acts.some((c) => c.type === "declareWar")).toBe(false); // protected
  });

  it("offers the free start regions before joining", () => {
    const s = ok(world("r_canada"), "n_9", { type: "setEmpire", name: "Late", primary: "#000075", secondary: "#ffffff" });
    const joins = legalActions(s, "n_9");
    expect(joins).toHaveLength(23);
    expect(joins.every((c) => c.type === "join")).toBe(true);
  });
});

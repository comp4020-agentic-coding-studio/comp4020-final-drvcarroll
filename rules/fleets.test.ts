import { describe, expect, it } from "vitest";
import { economy, mods } from "./economy.ts";
import { addUnits, orbitFleet } from "./fleets.ts";
import { advanceTo, validate } from "./index.ts";
import { launchEnergy, travelMs, windowPenalty } from "./orbit.ts";
import { S, T0, ok, world } from "./test-helpers.ts";

const noMods = mods({ techs: [] } as never);

describe("orbits and travel (game-design.md §7)", () => {
  it("takes the Hohmann time Earth→Mars, 30 s locally", () => {
    expect(travelMs("earth", "mars", { colonyShip: 1 }, noMods) / S).toBeCloseTo(258.9, 0);
    expect(travelMs("earth", "luna", { colonyShip: 1 }, noMods)).toBe(30 * S);
    expect(travelMs("jupiter", "europa", { corvette: 1 }, noMods)).toBe(30 * S);
  });

  it("moves at the slowest ship, sped up by Voidcraft", () => {
    const slow = travelMs("earth", "mars", { corvette: 1, battleship: 1 }, noMods);
    expect(slow).toBeCloseTo(travelMs("earth", "mars", { colonyShip: 1 }, noMods) / 0.85);
    expect(travelMs("earth", "mars", { colonyShip: 1 }, { ...noMods, speed: 1 }))
      .toBeCloseTo(travelMs("earth", "mars", { colonyShip: 1 }, noMods) / 2);
  });

  it("has a window penalty from 1× in the window to 3× at worst", () => {
    const ps = Array.from({ length: 800 }, (_, d) => windowPenalty("earth", "mars", T0 + d * S, T0, noMods));
    expect(Math.min(...ps)).toBeLessThan(1.01);
    expect(Math.max(...ps)).toBeGreaterThan(2.99);
    expect(Math.max(...ps)).toBeLessThanOrEqual(3);
  });

  it("costs mass × zone × penalty, Thrust Vectoring −15%", () => {
    expect(launchEnergy("earth", "luna", { colonyShip: 1 }, T0, T0, noMods)).toBe(20);
    expect(launchEnergy("earth", "luna", { colonyShip: 1 }, T0, T0, { ...noMods, launchCost: -0.15 })).toBeCloseTo(17);
  });
});

describe("ships, launches and colonies (game-design.md §4, §7, §11)", () => {
  it("builds a Colony Ship, flies to Luna and claims a region", () => {
    let s = world("r_canada");
    s.nations.n_1.stocks.A = 200;
    s = ok(s, "n_1", { type: "demolish", region: "r_canada", slot: 3 });
    expect(validate(s, "n_1", { type: "buildShip", region: "r_canada", unit: "colonyShip", count: 1 }))
      .toMatchObject({ reason: "Canada has no Spaceport" });
    s = ok(s, "n_1", { type: "build", region: "r_canada", building: "spaceport" });
    s = ok(s, "n_1", { type: "buildShip", region: "r_canada", unit: "colonyShip", count: 1 }, T0 + 45 * S);
    s = advanceTo(s, T0 + 90 * S);
    const fleet = Object.values(s.fleets)[0];
    expect(fleet).toMatchObject({ owner: "n_1", at: "earth", units: { colonyShip: 1 } });

    const e0 = s.nations.n_1.stocks.E;
    s = ok(s, "n_1", { type: "launch", from: "earth", to: "luna", units: { colonyShip: 1 } });
    expect(s.nations.n_1.stocks.E).toBeCloseTo(e0 - 20);
    const inFlight = Object.values(s.fleets)[0];
    expect(inFlight.transit).toMatchObject({ from: "earth", to: "luna", arriveAt: s.t + 30 * S });
    s = advanceTo(s, s.t + 30 * S);
    s = ok(s, "n_1", { type: "colonise", fleet: inFlight.id, region: "r_luna_shackleton" });
    expect(s.regions.r_luna_shackleton.owner).toBe("n_1");
    expect(Object.keys(s.fleets)).toHaveLength(0);
    expect(economy(s, "n_1").rate.Mt).toBeCloseTo(-1); // colony upkeep; the Lab was demolished
  });

  it("gives a contested region to the first arrival; the loser waits in orbit", () => {
    let s = world("r_canada", "r_us_west");
    for (const n of ["n_1", "n_2"]) addUnits(orbitFleet(s, n, "earth"), { colonyShip: 1 });
    s = ok(s, "n_2", { type: "launch", from: "earth", to: "luna", units: { colonyShip: 1 } }, T0 + 1 * S);
    s = ok(s, "n_1", { type: "launch", from: "earth", to: "luna", units: { colonyShip: 1 } }, T0 + 2 * S);
    for (const f of Object.values(s.fleets)) {
      s = ok(s, f.owner, { type: "colonise", fleet: f.id, region: "r_luna_far_side" });
    }
    s = advanceTo(s, T0 + 60 * S);
    expect(s.regions.r_luna_far_side.owner).toBe("n_2");
    expect(Object.values(s.fleets)).toEqual([expect.objectContaining({ owner: "n_1", at: "luna", units: { colonyShip: 1 } })]);
  });

  it("refuses Armies without a Transport, and Earth regions by Colony Ship", () => {
    const s = world("r_canada");
    const f = orbitFleet(s, "n_1", "earth");
    addUnits(f, { colonyShip: 1, troopTransport: 1 });
    expect(validate(s, "n_1", { type: "launch", from: "earth", to: "mars", units: { army: 1 } }))
      .toMatchObject({ reason: "Armies need a Troop Transport" });
    expect(validate(s, "n_1", { type: "launch", from: "earth", to: "mars", units: { troopTransport: 1, army: 3 } }))
      .toMatchObject({ reason: "Not enough Armies on Earth" });
    expect(validate(s, "n_1", { type: "colonise", fleet: f.id, region: "r_us_west" }))
      .toMatchObject({ reason: "Earth regions are settled by marching an Army in" });
  });
});

describe("marching (game-design.md §4)", () => {
  it("settles an adjacent unclaimed region 30 s later", () => {
    let s = world("r_canada");
    expect(validate(s, "n_1", { type: "march", from: "r_canada", to: "r_india", count: 1 }))
      .toMatchObject({ code: "NOT_ADJACENT", reason: "Canada doesn't border India" });
    s = ok(s, "n_1", { type: "march", from: "r_canada", to: "r_siberia", count: 1 });
    s = advanceTo(s, T0 + 30 * S);
    expect(s.regions.r_siberia).toMatchObject({ owner: "n_1", armies: 1 });
    expect(s.regions.r_canada.armies).toBe(1);
  });

  it("needs a war to march on another nation", () => {
    const s = world("r_canada", "r_us_west");
    expect(validate(s, "n_1", { type: "march", from: "r_canada", to: "r_us_west", count: 1 }))
      .toMatchObject({ code: "NOT_AT_WAR" });
  });
});

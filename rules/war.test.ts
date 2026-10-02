import { describe, expect, it } from "vitest";
import { addUnits, orbitFleet } from "./fleets.ts";
import { advanceTo, observe, validate, type State } from "./index.ts";
import { S, T0, ok, world } from "./test-helpers.ts";
import { survivors } from "./war.ts";

const PROTECTED = 300 * S;

// Two nations past protection, at active war.
function war(...regions: string[]): State {
  let s = advanceTo(world(...regions), T0 + PROTECTED);
  s = ok(s, "n_1", { type: "declareWar", nation: "n_2" });
  return advanceTo(s, s.t + 60 * S);
}

describe("Lanchester (game-design.md §7)", () => {
  it("keeps √(1 − (L/W)²) of each stack, rounded; equal sides annihilate", () => {
    expect(survivors(10, 100, 60)).toBe(8);
    expect(survivors(3, 30, 30)).toBe(0);
    expect(survivors(4, 40, 0)).toBe(4);
  });
});

describe("war rules (game-design.md §7)", () => {
  it("refuses war on or by a protected nation, then activates after 1 min", () => {
    let s = world("r_canada", "r_us_west");
    expect(validate(s, "n_1", { type: "declareWar", nation: "n_2" })).toMatchObject({ code: "PROTECTED" });
    s = advanceTo(s, T0 + PROTECTED);
    s = ok(s, "n_1", { type: "declareWar", nation: "n_2" });
    expect(validate(s, "n_1", { type: "march", from: "r_canada", to: "r_us_west", count: 1 }))
      .toMatchObject({ code: "NOT_AT_WAR" });
    s = advanceTo(s, s.t + 60 * S);
    expect(validate(s, "n_1", { type: "march", from: "r_canada", to: "r_us_west", count: 1 })).toBeNull();
  });

  it("makes peace when both sides agree", () => {
    let s = war("r_canada", "r_us_west");
    const w = Object.keys(s.wars)[0];
    expect(validate(s, "n_2", { type: "acceptPeace", war: w })).toMatchObject({ code: "INVALID" });
    s = ok(s, "n_1", { type: "offerPeace", nation: "n_2" });
    expect(observe(s, "n_2").world.wars[0].peaceFrom).toBe("n_1");
    s = ok(s, "n_2", { type: "acceptPeace", war: w });
    expect(s.wars).toEqual({});
  });
});

describe("space combat (game-design.md §7)", () => {
  it("fights when a war goes active over a shared orbit", () => {
    let s = advanceTo(world("r_canada", "r_us_west"), T0 + PROTECTED);
    addUnits(orbitFleet(s, "n_1", "earth"), { corvette: 10, colonyShip: 1 });
    addUnits(orbitFleet(s, "n_2", "earth"), { corvette: 6 });
    s = ok(s, "n_1", { type: "declareWar", nation: "n_2" });
    s = advanceTo(s, s.t + 60 * S);
    const fleets = Object.values(s.fleets);
    expect(fleets).toHaveLength(1);
    expect(fleets[0]).toMatchObject({ owner: "n_1", units: { corvette: 8, colonyShip: 1 } });
    expect(s.news.at(-1)?.kind).toBe("battle");
  });

  it("fights on arrival", () => {
    let s = war("r_canada", "r_us_west");
    addUnits(orbitFleet(s, "n_1", "earth"), { corvette: 3 });
    addUnits(orbitFleet(s, "n_2", "luna"), { corvette: 3 });
    s = ok(s, "n_1", { type: "launch", from: "earth", to: "luna", units: { corvette: 3 } });
    s = advanceTo(s, s.t + 30 * S);
    expect(s.fleets).toEqual({});
  });
});

describe("ground combat and conquest (game-design.md §7)", () => {
  it("holds with the +50% garrison bonus", () => {
    let s = war("r_canada", "r_us_west");
    s = ok(s, "n_1", { type: "march", from: "r_canada", to: "r_us_west", count: 2 });
    s = advanceTo(s, s.t + 30 * S);
    expect(s.regions.r_us_west).toMatchObject({ owner: "n_2", armies: 1 }); // 20 vs 30
  });

  it("invades from orbit, takes the buildings, moves the capital, eliminates", () => {
    let s = war("r_canada", "r_us_west");
    s.regions.r_luna_shackleton.owner = "n_2";
    s.regions.r_us_west.armies = 0;
    addUnits(orbitFleet(s, "n_1", "luna"), { troopTransport: 1, army: 4 });
    addUnits(orbitFleet(s, "n_2", "luna"), { corvette: 1 });
    const fleet = Object.values(s.fleets).find((f) => f.owner === "n_1")!.id;
    expect(validate(s, "n_1", { type: "invade", fleet, region: "r_luna_shackleton" }))
      .toMatchObject({ reason: "Win orbital superiority first" });
    delete s.fleets[Object.values(s.fleets).find((f) => f.owner === "n_2")!.id];

    s = ok(s, "n_1", { type: "march", from: "r_canada", to: "r_us_west", count: 1 });
    s = advanceTo(s, s.t + 30 * S);
    expect(s.regions.r_us_west).toMatchObject({ owner: "n_1", armies: 1 });
    expect(s.regions.r_us_west.buildings).toHaveLength(4);
    expect(s.nations.n_2.capital).toBe("r_luna_shackleton");

    s = ok(s, "n_1", { type: "invade", fleet, region: "r_luna_shackleton" });
    expect(s.regions.r_luna_shackleton).toMatchObject({ owner: "n_1", armies: 4 });
    expect(s.nations.n_2).toMatchObject({ eliminated: true, capital: null });
    expect(validate(s, "n_2", { type: "declareWar", nation: "n_1" })).toMatchObject({ code: "NOT_JOINED" });

    s = ok(s, "n_2", { type: "join", region: "r_brazil" });
    expect(s.nations.n_2).toMatchObject({ eliminated: false, capital: "r_brazil", boostUntil: s.t + 300 * S });
  });
});

import { describe, expect, it } from "vitest";
import { addUnits, orbitFleet } from "./fleets.ts";
import { advanceTo, observe, validate, type State } from "./index.ts";
import { S, T0, ok, world } from "./test-helpers.ts";
import { battleCounts, survivors } from "./war.ts";

const PROTECTED = 60 * S;

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
      .toMatchObject({ code: "NOT_AT_WAR", reason: expect.stringMatching(/ is active in 60s$/) });
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
  it("holds with the +50% garrison bonus, after a battle in time", () => {
    let s = war("r_canada", "r_us_west");
    s = ok(s, "n_1", { type: "march", from: "r_canada", to: "r_us_west", count: 2 });
    s = advanceTo(s, s.t + 30 * S);
    const b = s.battles.r_us_west;
    expect(b).toMatchObject({ attacker: "n_1", defender: "n_2", atk: 2, def: 2 });
    expect(s.regions.r_us_west.armies).toBe(0);
    const [a1, d1] = battleCounts(b, b.at + 2 * S);
    expect(a1).toBeLessThan(2);
    expect(d1).toBeLessThan(2);
    s = advanceTo(s, b.endsAt);
    expect(s.battles).toEqual({});
    expect(s.regions.r_us_west).toMatchObject({ owner: "n_2", armies: 1 }); // 20 vs 30
  });

  it("lasts about 21 s at 10 vs 10, leaving the instant result's survivors", () => {
    let s = war("r_canada", "r_us_west");
    s.regions.r_canada.armies = 20;
    s.regions.r_us_west.armies = 10;
    s = ok(s, "n_1", { type: "march", from: "r_canada", to: "r_us_west", count: 10 });
    s = advanceTo(s, s.t + 30 * S);
    const b = s.battles.r_us_west;
    expect((b.endsAt - b.at) / S).toBeGreaterThan(20);
    expect((b.endsAt - b.at) / S).toBeLessThan(22);
    s = advanceTo(s, b.endsAt);
    expect(s.regions.r_us_west).toMatchObject({ owner: "n_2", armies: survivors(10, 150, 100) });

    s.regions.r_canada.armies = 20; // 20 vs 10: the attacker takes it
    s = ok(s, "n_1", { type: "march", from: "r_canada", to: "r_us_west", count: 20 });
    s.regions.r_us_west.armies = 10;
    s = advanceTo(s, s.t + 30 * S);
    s = advanceTo(s, s.battles.r_us_west.endsAt);
    expect(s.regions.r_us_west).toMatchObject({ owner: "n_1", armies: survivors(20, 200, 150) });
  });

  it("carries off a share of the loser's stocks, scaled by regions held (ADR G12)", () => {
    let s = war("r_canada", "r_us_west");
    s.regions.r_us_east.owner = "n_2"; // the loser holds two regions
    s.regions.r_canada.armies = 20;
    s = ok(s, "n_1", { type: "march", from: "r_canada", to: "r_us_west", count: 20 });
    s.regions.r_us_west.armies = 1;
    s = advanceTo(s, s.t + 30 * S);
    const before = { a: { ...s.nations.n_1.stocks }, b: { ...s.nations.n_2.stocks } };
    s = advanceTo(s, s.battles.r_us_west.endsAt);
    const moved = before.b.M - s.nations.n_2.stocks.M;
    expect(moved).toBeGreaterThan(before.b.M * 0.125 - 2);
    expect(moved).toBeLessThan(before.b.M * 0.125 + 2);
    expect(s.nations.n_1.stocks.M - before.a.M).toBeCloseTo(moved, 0);
    expect(s.news.at(-1)?.text).toMatch(/carrying off .*M/);
  });

  it("extends a battle with reinforcements and turns back a second attacker", () => {
    let s = war("r_canada", "r_us_west", "r_us_east");
    s = ok(s, "n_3", { type: "declareWar", nation: "n_2" });
    s = advanceTo(s, s.t + 60 * S);
    s.regions.r_us_west.armies = 10;
    s.regions.r_canada.armies = 10;
    s = ok(s, "n_1", { type: "march", from: "r_canada", to: "r_us_west", count: 10 });
    s = advanceTo(s, s.t + 30 * S);
    const end = s.battles.r_us_west.endsAt;
    s = ok(s, "n_2", { type: "train", region: "r_us_west", count: 1 });
    s = advanceTo(s, s.t + 15 * S);
    const b = s.battles.r_us_west;
    expect(b.at).toBe(s.t);
    expect(b.endsAt).toBeLessThan(end); // more defenders: it ends sooner
    expect(s.regions.r_us_west.armies).toBe(0);
    expect(validate(s, "n_3", { type: "march", from: "r_us_east", to: "r_us_west", count: 1 }))
      .toMatchObject({ reason: "Nation 1 is already attacking US West" });
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

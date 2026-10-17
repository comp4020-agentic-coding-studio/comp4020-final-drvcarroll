import { describe, expect, it } from "vitest";
import { addUnits, orbitFleet } from "./fleets.ts";
import { advanceTo, apply, validate, type Command, type State } from "./index.ts";
import { S, T0, ok, world } from "./test-helpers.ts";

const PROTECTED = 60 * S;

// n_1 and n_2 allied; n_3 outside.
function alliance(...regions: string[]): State {
  let s = advanceTo(world(...regions), T0 + PROTECTED);
  s = ok(s, "n_1", { type: "inviteAlly", nation: "n_2" });
  return ok(s, "n_2", { type: "acceptAlly", alliance: Object.keys(s.alliances)[0] });
}

const atWarWith3 = (s: State, ...who: string[]) => {
  for (const n of who) s = ok(s, n, { type: "declareWar", nation: "n_3" });
  return advanceTo(s, s.t + 60 * S);
};

describe("alliances (game-design.md §9)", () => {
  it("forms by invite and accept, forcing peace between members", () => {
    let s = advanceTo(world("r_canada", "r_us_west"), T0 + PROTECTED);
    s = ok(s, "n_1", { type: "declareWar", nation: "n_2" });
    s = ok(s, "n_1", { type: "inviteAlly", nation: "n_2" });
    const a = Object.keys(s.alliances)[0];
    expect(validate(s, "n_1", { type: "acceptAlly", alliance: a })).toMatchObject({ code: "INVALID" });
    s = ok(s, "n_2", { type: "acceptAlly", alliance: a });
    expect(s.alliances[a].members).toEqual(["n_1", "n_2"]);
    expect(s.wars).toEqual({});
    expect(validate(s, "n_1", { type: "declareWar", nation: "n_2" })).toMatchObject({ code: "ALLIED" });
    s = ok(s, "n_2", { type: "leaveAlliance" });
    expect(s.alliances).toEqual({});
  });

  it("caps members, and a nation sits in one alliance", () => {
    let s = alliance("r_canada", "r_us_west", "r_us_east", "r_mexico", "r_brazil");
    const a = Object.keys(s.alliances)[0];
    for (const n of ["n_3", "n_4"]) {
      s = ok(s, "n_1", { type: "inviteAlly", nation: n });
      s = ok(s, n, { type: "acceptAlly", alliance: a });
    }
    expect(validate(s, "n_1", { type: "inviteAlly", nation: "n_5" })).toMatchObject({ reason: "An alliance holds at most 4" });
    expect(validate(s, "n_5", { type: "inviteAlly", nation: "n_2" })).toMatchObject({ reason: "Nation 2 is already in an alliance" });
  });

  it("sanctions block offers, accepts and gifts both ways, and cancel open offers", () => {
    let s = alliance("r_canada", "r_us_west", "r_us_east");
    s = ok(s, "n_3", { type: "offerTrade", to: "n_2", give: { M: 10 }, get: { V: 10 } });
    s = ok(s, "n_1", { type: "sanction", nation: "n_3" });
    expect(s.offers).toEqual({});
    for (const [from, cmd] of [
      ["n_2", { type: "offerTrade", to: "n_3", give: { M: 10 }, get: { V: 10 } }],
      ["n_3", { type: "offerTrade", to: "n_1", give: { M: 10 }, get: { V: 10 } }],
      ["n_3", { type: "gift", to: "n_2", goods: { M: 10 } }],
      ["n_1", { type: "gift", to: "n_3", goods: { M: 10 } }],
    ] as const) expect(validate(s, from, cmd)).toMatchObject({ code: "SANCTIONED" });
    expect(validate(s, "n_1", { type: "exchange", give: "M", amount: 30, get: "V" })).toBeNull();
    s = ok(s, "n_2", { type: "liftSanction", nation: "n_3" });
    expect(validate(s, "n_3", { type: "gift", to: "n_2", goods: { M: 10 } })).toBeNull();
  });

  it("fights as one side in orbit: two allied fleets beat one neither beats alone", () => {
    let s = alliance("r_canada", "r_us_west", "r_us_east");
    addUnits(orbitFleet(s, "n_1", "luna"), { corvette: 6 });
    addUnits(orbitFleet(s, "n_2", "luna"), { corvette: 6 });
    addUnits(orbitFleet(s, "n_3", "luna"), { corvette: 10 });
    s = atWarWith3(s, "n_1", "n_2");
    const owners = Object.values(s.fleets).map((f) => f.owner).sort();
    expect(owners).toEqual(["n_1", "n_2"]); // 120 vs 100: survivors √(1 − (100/120)²) ≈ 55%
    expect(Object.values(s.fleets).map((f) => f.units.corvette)).toEqual([3, 3]);
  });

  it("an ally's Armies join an attack, and its survivors march home", () => {
    let s = alliance("r_canada", "r_us_west", "r_us_east");
    s = atWarWith3(s, "n_1", "n_2");
    Object.assign(s.regions.r_canada, { armies: 10 });
    Object.assign(s.regions.r_us_west, { armies: 10 });
    s.regions.r_us_east.armies = 10;
    s = ok(s, "n_1", { type: "march", from: "r_canada", to: "r_us_east", count: 10 });
    s = ok(s, "n_2", { type: "march", from: "r_us_west", to: "r_us_east", count: 10 });
    s = advanceTo(s, s.t + 30 * S);
    const b = s.battles.r_us_east;
    expect(b).toMatchObject({ attacker: "n_1", atk: 20, home: { n_2: "r_us_west" } });
    expect(b.atkBy).toEqual({ n_1: 0.5, n_2: 0.5 });
    s = advanceTo(s, b.endsAt);
    expect(s.regions.r_us_east.owner).toBe("n_1"); // 200 vs 150: 13 survive, split
    expect(s.regions.r_us_east.armies + s.regions.r_us_west.armies).toBe(13);
    expect(s.regions.r_us_west.armies).toBeGreaterThan(0);
  });

  it("an ally marches in to defend, never just into an ally's region", () => {
    let s = alliance("r_canada", "r_us_west", "r_us_east");
    expect(validate(s, "n_1", { type: "march", from: "r_canada", to: "r_us_west", count: 1 })).toMatchObject({ code: "ALLIED" });
    s = ok(s, "n_3", { type: "declareWar", nation: "n_2" });
    s = advanceTo(s, s.t + 60 * S);
    s.regions.r_us_east.armies = 30;
    s.regions.r_us_west.armies = 20;
    s.regions.r_canada.armies = 10;
    expect(validate(s, "n_1", { type: "march", from: "r_canada", to: "r_us_west", count: 1 })).toMatchObject({ code: "ALLIED" });
    s = ok(s, "n_3", { type: "march", from: "r_us_east", to: "r_us_west", count: 30 });
    s = advanceTo(s, s.t + 30 * S);
    expect(s.battles.r_us_west).toBeDefined(); // 30 vs 20 holding: ~33 s
    s = ok(s, "n_1", { type: "march", from: "r_canada", to: "r_us_west", count: 10 });
    s = advanceTo(s, s.t + 30 * S);
    const b = s.battles.r_us_west;
    if (b) expect(b.defBy.n_1).toBeGreaterThan(0);
    else expect(s.regions.r_us_west.owner).toBe("n_2");
  });
});

describe("replay through alliances, sanctions and a stage change (S5)", () => {
  it("gives identical state live (every tick) and command to command", () => {
    const cmds: [string, number, Command][] = [
      ["n_1", 61_000, { type: "inviteAlly", nation: "n_2" }],
      ["n_2", 62_000, { type: "acceptAlly", alliance: "a_?" }],
      ["n_1", 63_000, { type: "sanction", nation: "n_3" }],
      ["n_1", 1_250_000, { type: "train", region: "r_canada", count: 2 }],
    ];
    let replay = world("r_canada", "r_us_west", "r_us_east");
    let live = structuredClone(replay);
    for (const [who, dt, c0] of cmds) {
      const c = c0.type === "acceptAlly" ? { ...c0, alliance: Object.keys(replay.alliances)[0] } : c0;
      const res = apply(replay, who, c, T0 + dt);
      if (!res.ok) throw new Error(res.reason);
      replay = res.state;
      while (live.t + 500 < T0 + dt) live = advanceTo(live, live.t + 500);
      const l = apply(live, who, c, T0 + dt);
      if (!l.ok) throw new Error(l.reason);
      live = l.state;
    }
    expect(live).toEqual(replay);
    expect(replay.season.stage).toBe(2);
    expect(Object.values(replay.alliances)[0]).toMatchObject({ members: ["n_1", "n_2"], sanctions: ["n_3"] });
  });
});

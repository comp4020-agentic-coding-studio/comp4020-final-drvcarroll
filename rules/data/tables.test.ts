import { describe, expect, it } from "vitest";
import { LADDERS, RUNGS, TECH, UNITS, BUILDINGS, ECONOMY } from "./index.ts";

describe("tables (game-design.md §6–8)", () => {
  it("has 4 ladders × 6 rungs with doubling costs", () => {
    expect(Object.keys(RUNGS)).toHaveLength(24);
    for (const l of Object.values(LADDERS)) expect(l).toHaveLength(6);
    TECH.costs.slice(1).forEach((c, i) => expect(c).toBe(TECH.costs[i] * 2));
  });

  it("matches the efficiency column: strength per resource spent", () => {
    const eff = (u: keyof typeof UNITS) => {
      const { strength, cost } = UNITS[u];
      return Math.round((100 * strength) / ((cost.A ?? 0) + (cost.Mt ?? 0))) / 100;
    };
    expect(eff("corvette")).toBe(0.33);
    expect(eff("destroyer")).toBe(0.38);
    expect(eff("battleship")).toBe(0.56);
    expect(eff("dreadnought")).toBe(0.84);
  });

  it("unlocks warships off the Voidcraft ladder only", () => {
    expect(UNITS.corvette.unlock).toBeUndefined();
    expect([UNITS.destroyer, UNITS.battleship, UNITS.dreadnought].map((u) => u.unlock))
      .toEqual(["voidcraft.2", "voidcraft.4", "voidcraft.6"]);
    for (const [u, id] of [["destroyer", "voidcraft.2"], ["battleship", "voidcraft.4"], ["dreadnought", "voidcraft.6"]]) {
      expect(RUNGS[id].unlocks).toContain(u);
    }
  });

  it("starts with four buildings that all exist", () => {
    for (const b of ECONOMY.startKit.buildings) expect(BUILDINGS[b]).toBeDefined();
  });
});

import { describe, expect, it } from "vitest";
import { ADJACENT, BODIES, REGIONS } from "./map.ts";

const regions = Object.values(REGIONS);

describe("map data (game-design.md §4)", () => {
  it("has 25 bodies and 74 regions", () => {
    expect(Object.keys(BODIES)).toHaveLength(25);
    expect(regions).toHaveLength(74);
  });

  it("lists every region under its body", () => {
    for (const b of Object.values(BODIES)) {
      expect(regions.filter((r) => r.body === b.id).map((r) => r.name)).toEqual(b.regions);
    }
  });

  it("gives 24 start regions, each summing to 3.3 (Earth fairness)", () => {
    const starts = regions.filter((r) => r.start);
    expect(starts).toHaveLength(24);
    for (const r of starts) expect(r.m + r.v + r.s, r.name).toBeCloseTo(3.3, 9);
  });

  it("places every Earth region on the globe, Antarctica at the pole", () => {
    for (const r of regions.filter((x) => x.body === "earth" || x.body === "antarctica")) {
      expect(Math.abs(r.lat!), r.name).toBeLessThanOrEqual(90);
      expect(Math.abs(r.lon!), r.name).toBeLessThanOrEqual(180);
    }
    expect(REGIONS.r_antarctica.lat).toBeLessThan(-60);
  });

  it("derives off-Earth Solar as 1/d² (Mercury ≈ ×6.6)", () => {
    expect(REGIONS.r_mercury_caloris.s).toBeCloseTo(6.68, 2);
    expect(REGIONS.r_luna_far_side.s).toBe(1);
  });

  it("has symmetric adjacency connecting every Earth region", () => {
    for (const [a, ns] of Object.entries(ADJACENT)) {
      for (const b of ns) expect(ADJACENT[b], `${b}→${a}`).toContain(a);
    }
    const earth = regions.filter((r) => r.body === "earth" || r.body === "antarctica");
    const seen = new Set(["r_canada"]);
    for (const id of seen) for (const n of ADJACENT[id]) seen.add(n);
    expect(seen.size).toBe(earth.length);
  });
});

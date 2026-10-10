// goals.md S5: the server's in-place apply gives exactly apply()'s state,
// rejections included, so live play and replay never drift.
import { describe, expect, it } from "vitest";
import { advance, apply, applyInPlace, type Command } from "./index.ts";
import { rng, S, T0, world } from "./test-helpers.ts";

describe("applyInPlace (system-design.md §5)", () => {
  it("matches apply over a random mix of accepted and rejected commands", () => {
    const r = rng(7);
    const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)];
    let pure = world("r_canada", "r_us_west");
    const live = structuredClone(pure);
    for (let i = 0; i < 300; i++) {
      const at = T0 + i * 3 * S;
      const n = pick(["n_1", "n_2"]);
      const region = n === "n_1" ? "r_canada" : "r_us_west";
      const cmd = pick<Command>([
        { type: "build", region, building: pick(["mine", "lab", "spaceport"]) },
        { type: "demolish", region, slot: Math.floor(r() * 4) },
        { type: "train", region, count: 1 + Math.floor(r() * 6) },
        { type: "research", tech: pick(["voidcraft.1", "industry.1"]) },
        { type: "exchange", give: "E", amount: 30, get: "M" },
        { type: "march", from: region, to: "r_mexico", count: 1 },
      ]);
      const a = apply(pure, n, cmd, at);
      const b = applyInPlace(live, n, cmd, at);
      expect(b === null, `${i} ${cmd.type}`).toBe(a.ok);
      if (a.ok) pure = a.state;
      else advance(pure, at);
      expect(live).toEqual(pure);
    }
  });
});

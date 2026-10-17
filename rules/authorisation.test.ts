// docs/adr/S07: who may change what. n_2 acts on n_1's things.
import { describe, expect, it } from "vitest";
import { validate, type Command } from "./index.ts";
import { ok, world } from "./test-helpers.ts";

describe("authorisation (S07; system-design.md §14.5)", () => {
  const s0 = () => world("r_canada", "r_us_west", "r_mexico");

  it("refuses commands on another nation's region with NOT_OWNER and its name", () => {
    const s = s0();
    const cmds: Command[] = [
      { type: "build", region: "r_canada", building: "mine" },
      { type: "train", region: "r_canada", count: 1 },
      { type: "march", from: "r_canada", to: "r_us_west", count: 1 },
      { type: "demolish", region: "r_canada", slot: 0 },
    ];
    for (const c of cmds) {
      expect(validate(s, "n_2", c), c.type).toEqual({ ok: false, code: "NOT_OWNER", reason: "You don't control Canada" });
    }
  });

  it("treats another nation's fleet or offer as unknown, confirming nothing", () => {
    let s = s0();
    s.fleets.f_a = { id: "f_a", owner: "n_1", units: { colonyShip: 1, army: 1 }, at: "earth", rev: 0 };
    s = ok(s, "n_1", { type: "offerTrade", to: "n_2", give: { M: 10 }, get: { V: 5 } });
    const offer = Object.keys(s.offers)[0];
    const unknown = (n: string, c: Command, reason: string) =>
      expect(validate(s, n, c), c.type).toMatchObject({ ok: false, code: "INVALID", reason });
    unknown("n_2", { type: "colonise", fleet: "f_a", region: "r_canada" }, "Unknown fleet");
    unknown("n_2", { type: "invade", fleet: "f_a", region: "r_canada" }, "That fleet isn't in orbit");
    unknown("n_3", { type: "acceptTrade", offer }, "Unknown offer");
    unknown("n_3", { type: "declineTrade", offer }, "Unknown offer");
    unknown("n_2", { type: "cancelTrade", offer }, "Unknown offer");
    // launch takes the sender's own ships only; n_1's are not n_2's
    expect(validate(s, "n_2", { type: "launch", from: "earth", to: "mars", units: { colonyShip: 1 } }))
      .toMatchObject({ code: "INSUFFICIENT", reason: "Only 0 Colony Ship at Earth" });
  });
});

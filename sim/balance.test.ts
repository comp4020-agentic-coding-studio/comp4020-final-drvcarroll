import { writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { markdown, report, suite } from "./report.ts";

// Stage B's gate: every §13 target is measured. Meeting them is Stage G.
it("measures every balance target in game-design.md §13", () => {
  const runs = suite(24);
  const rows = report(runs);
  const md = markdown(rows, runs);
  writeFileSync("sim/last-report.md", `${md}\n`);
  console.log(md);
  expect(rows).toHaveLength(12);
  for (const r of rows) expect(r.measured, r.target).not.toMatch(/NaN|undefined/);
}, 120_000);

it("replays a seed identically", () => {
  expect(suite(1, 10)).toEqual(suite(1, 10));
});

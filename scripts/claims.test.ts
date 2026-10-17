// system-design.md §13: every claim cites a check that exists (Stage H).
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const doc = readFileSync("docs/system-design.md", "utf8");
const table = doc.slice(doc.indexOf("## 13."), doc.indexOf("## 14.")).split("\n").filter((l) => /^\| .* \| (Enforced|Measured|Judged) \|/.test(l));

describe("every claim names its check (system-design.md §13)", () => {
  it("has no row still owed", () => {
    expect(table.length).toBeGreaterThan(10);
    for (const row of table) expect(row, row).not.toMatch(/\*\*owed\*\*/);
  });

  it("cites only files and test names that exist", () => {
    for (const row of table) {
      const check = row.split(" | ").at(-1)!;
      let file = "";
      for (const [, f, name] of check.matchAll(/`([\w./-]+\.(?:ts|md))`|"([^"]+)"/g)) {
        if (f) {
          expect(existsSync(f), `${f} in: ${row}`).toBe(true);
          file = f;
        } else if (file.endsWith(".ts")) {
          expect(readFileSync(file, "utf8"), `${file}: "${name}"`).toContain(name.replace(/….*$/, ""));
        }
      }
    }
  });
});

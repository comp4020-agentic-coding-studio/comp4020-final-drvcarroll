// docs/adr/S08: rules/ imports nothing outside itself; no clock, no chance.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = import.meta.dirname;
const sources = (readdirSync(ROOT, { recursive: true }) as string[])
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.endsWith("test-helpers.ts"));
const IMPURE = /\b(Date\.now|new Date|Math\.random|performance\.|process\.|setTimeout|setInterval|fetch|require)\b/;

describe("rules/ is pure (S08; goals.md S5)", () => {
  it("imports only its own files", () => {
    for (const f of sources) {
      const src = readFileSync(join(ROOT, f), "utf8");
      for (const [, spec] of src.matchAll(/(?:from|import)\s*\(?\s*"([^"]+)"/g)) {
        const inside = spec.startsWith(".") && !relative(ROOT, resolve(ROOT, dirname(f), spec)).startsWith("..");
        expect(inside, `${f} imports ${spec}`).toBe(true);
      }
    }
  });

  it("reads no clock, randomness, timers or process state", () => {
    for (const f of sources) {
      const code = readFileSync(join(ROOT, f), "utf8").replace(/\/\/.*$/gm, "");
      expect(IMPURE.exec(code)?.[0], f).toBeUndefined();
    }
  });
});

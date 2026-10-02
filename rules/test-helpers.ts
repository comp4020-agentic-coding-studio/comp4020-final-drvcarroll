import { expect } from "vitest";
import { apply, newSeason, type Command, type State } from "./index.ts";

export const T0 = 1_800_000_000_000;
export const S = 1000;

export function ok(s: State, nation: string, cmd: Command, at = s.t): State {
  const r = apply(s, nation, cmd, at);
  if (!r.ok) expect.fail(`${cmd.type} rejected: ${r.reason}`);
  return r.state;
}

const colours = ["#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4", "#46f0f0"];

// A season with nations joined at the given start regions.
export function world(...regions: string[]): State {
  let s = newSeason("s1", T0);
  regions.forEach((region, i) => {
    const id = `n_${i + 1}`;
    s = ok(s, id, { type: "setEmpire", name: `Nation ${i + 1}`, primary: colours[i], secondary: "#ffffff" });
    s = ok(s, id, { type: "join", region });
  });
  return s;
}

// Deterministic PRNG for fuzz tests (mulberry32).
export function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

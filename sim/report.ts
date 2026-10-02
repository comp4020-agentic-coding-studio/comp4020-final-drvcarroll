// game-design.md §13 balance targets, measured over a suite of runs.
import { REGIONS } from "../rules/data/index.ts";
import { ARCHETYPES, type Archetype } from "./bots.ts";
import { run, type RunResult } from "./runner.ts";

export interface Row {
  target: string;
  want: string;
  measured: string;
  met: boolean | null; // null: nothing to measure in these runs
}

const median = (xs: number[]) => {
  const v = [...xs].sort((a, b) => a - b);
  return v.length ? (v[(v.length - 1) >> 1] + v[v.length >> 1]) / 2 : NaN;
};
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : "never");
const mins = (x: number) => (Number.isFinite(x) ? `${x.toFixed(1)} min` : "never");
const pct = (x: number) => `${Math.round(x * 100)}%`;
const earliest = (r: RunResult, k: "offEarthMin" | "marsMin") =>
  Math.min(...r.nations.map((n) => n[k] ?? Infinity));

export function suite(seeds: number, minutes = 60): RunResult[] {
  return Array.from({ length: seeds }, (_, i) =>
    run({ seed: i + 1, bots: [...ARCHETYPES], minutes, lateJoin: { kind: "builder", atMin: 30 } }));
}

export function report(runs: RunResult[]): Row[] {
  const sensible = runs.flatMap((r) => r.nations.filter((n) => n.kind !== "random" && n.joinedAtMin === 0));
  const tv = median(sensible.map((n) => n.thrustVectoringMin ?? Infinity));
  const off = median(runs.map((r) => earliest(r, "offEarthMin")));
  const mars = median(runs.map((r) => earliest(r, "marsMin")));
  const all = runs.flatMap((r) => r.nations);
  const dead = all.reduce((a, n) => a + n.dead, 0) / Math.max(1, all.reduce((a, n) => a + n.decisions, 0));
  const v2 = sensible.filter((n) => n.voidcraft2).length / sensible.length;
  const wins = Object.fromEntries(ARCHETYPES.map((k) => [k, runs.filter((r) => r.winnerKind === k).length / runs.length])) as Record<Archetype, number>;
  const share = median(runs.map((r) => r.leaderShareAt30 ?? NaN));
  const late = runs.flatMap((r) => (r.lateJoiner ? [r.lateJoiner.score / Math.max(1, r.lateJoiner.median)] : []));
  const respawns = runs.flatMap((r) => r.respawns).filter((x) => x.heldAfter10 !== undefined);
  const held = respawns.filter((x) => x.survivedProtection && x.heldAfter10).length;
  const ended = runs.filter((r) => r.endedAtMin !== undefined && r.endedAtMin < r.minutes);
  const endMin = median(runs.map((r) => r.endedAtMin ?? r.minutes));
  const winnerRungs = median(runs.map((r) => {
    const w = r.nations.find((n) => n.id === r.winner);
    return w ? w.final.tech : 0;
  }));
  const ladderDone = Math.min(...all.map((n) => n.ladderDoneMin ?? Infinity));
  const fair = Object.values(REGIONS).filter((r) => r.start).every((r) => Math.abs(r.m + r.v + r.s - 3.3) < 1e-9);

  return [
    { target: "Thrust Vectoring researched", want: "~2 min", measured: `${mins(tv)} (median)`, met: tv >= 1.5 && tv <= 3 },
    { target: "First off-Earth colony", want: "4 to 7 min", measured: `${mins(off)} (median)`, met: off >= 4 && off <= 7 },
    { target: "First Mars colony", want: "12 to 25 min", measured: `${mins(mars)} (median)`, met: mars >= 12 && mars <= 25 },
    { target: "Dead time, first 30 min", want: "< 20%", measured: pct(dead), met: dead < 0.2 },
    { target: "Deadlock: reaches Voidcraft 2", want: "every sensible bot", measured: pct(v2), met: v2 === 1 },
    {
      target: "Strategy win rates", want: "each 10 to 35%",
      measured: ARCHETYPES.map((k) => `${k} ${pct(wins[k])}`).join(", "),
      met: ARCHETYPES.every((k) => wins[k] >= 0.1 && wins[k] <= 0.35),
    },
    { target: "Snowball: leader share at 30 min", want: "< 40%", measured: `${pct(share)} (median)`, met: share < 0.4 },
    {
      target: "Late joiner (at 30 min) vs median", want: ">= 25% by 60 min",
      measured: `${pct(median(late))} (median)`, met: median(late) >= 0.25,
    },
    {
      target: "Respawn holds a region 10 min on", want: "80% of runs",
      measured: respawns.length ? `${held}/${respawns.length}` : "no eliminations",
      met: respawns.length ? held / respawns.length >= 0.8 : null,
    },
    {
      target: "Season length", want: "threshold at 50 ± 10 min, or the cap",
      measured: `${ended.length}/${runs.length} hit the threshold; ends ${mins(endMin)} (median)`,
      met: ended.every((r) => r.endedAtMin! >= 40),
    },
    {
      target: "Progression", want: "winner ~10 rungs; no ladder done < 40 min",
      measured: `winner tech score ${f1(winnerRungs)}; first ladder done ${mins(ladderDone)}`,
      met: ladderDone >= 40,
    },
    { target: "Earth fairness", want: "every start M+V+S = 3.3", measured: fair ? "all 3.3" : "unequal", met: fair },
  ];
}

export function markdown(rows: Row[], runs: RunResult[]): string {
  const mark = (m: boolean | null) => (m === null ? "–" : m ? "yes" : "no");
  return [
    `${runs.length} seasons × ${runs[0]?.minutes} min, ${ARCHETYPES.length} bots + a late joiner at 30 min.`,
    "",
    "| Target | Want | Measured | Met |",
    "|---|---|---|---|",
    ...rows.map((r) => `| ${r.target} | ${r.want} | ${r.measured} | ${mark(r.met)} |`),
  ].join("\n");
}

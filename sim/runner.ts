// game-design.md §13: plays a season headless, jumping between decision
// points, and records what each balance target needs.
import { BODIES, LADDERS, REGIONS, WAR } from "../rules/data/index.ts";
import { owned } from "../rules/economy.ts";
import { BUILDINGS, UNITS, type Building, type Unit } from "../rules/data/index.ts";
import {
  advanceTo, apply, legalActions, newSeason, observe, validate, type Command, type Id, type Score, type State,
} from "../rules/index.ts";
import { leader, scores } from "../rules/score.ts";
import { decide, startRegions, type Archetype } from "./bots.ts";

export const T0 = 1_800_000_000_000;
const MIN = 60_000;
const DECISION_MS = 15_000; // agents decide every 15 simulated seconds (§13)

const USEFUL = new Set<Command["type"]>([
  "build", "research", "train", "buildShip", "launch", "colonise", "invade", "march", "declareWar", "sendEnvoy", "acceptTrade",
]);

export function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface NationMetrics {
  id: Id;
  kind: Archetype;
  joinedAtMin: number;
  thrustVectoringMin?: number;
  offEarthMin?: number;
  marsMin?: number;
  voidcraft2: boolean;
  ladderDoneMin?: number;
  decisions: number; // in the first 30 min
  dead: number; // of those, with no useful legal action
  scoreAt30?: number;
  final: Score;
}

export interface Respawn {
  nation: Id;
  atMin: number;
  survivedProtection?: boolean;
  heldAfter10?: boolean;
}

export interface RunResult {
  seed: number;
  minutes: number;
  endedAtMin?: number; // threshold reached
  winner?: Id;
  winnerKind?: Archetype;
  leaderShareAt30?: number;
  nations: NationMetrics[];
  respawns: Respawn[];
  lateJoiner?: { score: number; median: number };
}

export interface RunOptions {
  seed: number;
  bots: Archetype[];
  minutes: number;
  lateJoin?: { kind: Archetype; atMin: number };
}

const COLOURS = ["#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4", "#46f0f0", "#f032e6", "#008080"];

const minsOf = (s: State) => (s.t - T0) / MIN;
const median = (xs: number[]) => {
  const v = [...xs].sort((a, b) => a - b);
  return v.length ? (v[(v.length - 1) >> 1] + v[v.length >> 1]) / 2 : 0;
};

export function run(o: RunOptions): RunResult {
  const r = rng(o.seed);
  const starts = [...startRegions].sort(() => r() - 0.5);
  let s = newSeason(`sim-${o.seed}`, T0);
  const players: { id: Id; kind: Archetype; joinAtMin: number }[] = o.bots.map((kind, i) => ({ id: `n_${i + 1}`, kind, joinAtMin: 0 }));
  if (o.lateJoin) players.push({ id: `n_${players.length + 1}`, kind: o.lateJoin.kind, joinAtMin: o.lateJoin.atMin });
  const m = new Map<Id, NationMetrics>();
  const respawns: Respawn[] = [];
  let leaderShareAt30: number | undefined;
  let endedAtMin: number | undefined;

  const step = (id: Id, c: Command) => {
    const res = apply(s, id, c, s.t);
    if (res.ok) s = res.state;
    return res.ok;
  };

  const joinFree = (id: Id) => {
    const region = starts.find((x) => !s.regions[x].owner)
      ?? legalActions(s, id).find((c): c is Extract<Command, { type: "join" }> => c.type === "join")?.region;
    return !!region && step(id, { type: "join", region });
  };

  for (let tick = 0, t = T0; t <= T0 + o.minutes * MIN; tick++, t += DECISION_MS) {
    s = advanceTo(s, t);
    const now = minsOf(s);

    for (const p of players) {
      if (m.has(p.id) || now < p.joinAtMin) continue;
      const i = players.indexOf(p);
      step(p.id, { type: "setEmpire", name: `${p.kind} ${i + 1}`, primary: COLOURS[i % COLOURS.length], secondary: "#ffffff" });
      if (!joinFree(p.id)) continue;
      m.set(p.id, {
        id: p.id, kind: p.kind, joinedAtMin: now, voidcraft2: false, decisions: 0, dead: 0,
        final: { territory: 0, economy: 0, tech: 0, total: 0 },
      });
    }

    record(s, m, now);
    for (const x of respawns) {
      const held = owned(s, x.nation).length > 0;
      const protEnd = x.atMin + WAR.protectionS / 60;
      if (x.survivedProtection === undefined && now >= protEnd) x.survivedProtection = held;
      if (x.heldAfter10 === undefined && now >= protEnd + 10) x.heldAfter10 = held;
    }
    if (leaderShareAt30 === undefined && now >= 30) {
      const sc = scores(s);
      const totals = Object.values(sc).map((x) => x.total);
      const sum = totals.reduce((a, b) => a + b, 0);
      leaderShareAt30 = sum ? Math.max(...totals) / sum : 0;
      for (const [id, x] of Object.entries(sc)) m.get(id)!.scoreAt30 = x.total;
    }
    if (s.season.status === "ended") {
      endedAtMin = now;
      break;
    }

    const order = [...m.values()];
    for (let k = 0; k < order.length; k++) {
      const nm = order[(k + tick) % order.length];
      const n = s.nations[nm.id];
      if (n.eliminated) {
        if (joinFree(nm.id)) respawns.push({ nation: nm.id, atMin: now });
        continue;
      }
      const legal = legalActions(s, nm.id);
      if (now < 30) {
        nm.decisions++;
        if (!legal.some((c) => USEFUL.has(c.type))) nm.dead++;
      }
      const { world, you } = observe(s, nm.id);
      const ctx = { id: nm.id, t: s.t, start: T0, world, you: you!, legal, wanted: wanted(s, nm.id), rng: r };
      for (const c of decide(nm.kind, ctx)) step(nm.id, c);
    }
  }

  const sc = scores(s);
  for (const [id, x] of Object.entries(sc)) m.get(id)!.final = x;
  const winner = s.season.winner ?? leader(sc);
  const late = o.lateJoin && m.get(players.at(-1)!.id);
  return {
    seed: o.seed,
    minutes: o.minutes,
    endedAtMin,
    winner,
    winnerKind: winner ? m.get(winner)?.kind : undefined,
    leaderShareAt30,
    nations: [...m.values()],
    respawns,
    lateJoiner: late
      ? { score: late.final.total, median: median([...m.values()].filter((x) => x !== late).map((x) => x.final.total)) }
      : undefined,
  };
}

function wanted(s: State, id: Id): Command[] {
  const out: Command[] = [];
  for (const r of owned(s, id)) {
    for (const b of Object.keys(BUILDINGS) as Building[]) out.push({ type: "build", region: r.id, building: b });
    for (const u of Object.keys(UNITS) as Unit[]) out.push({ type: "buildShip", region: r.id, unit: u, count: 1 });
  }
  return out.filter((c) => validate(s, id, c)?.code === "INSUFFICIENT");
}

function record(s: State, m: Map<Id, NationMetrics>, now: number): void {
  for (const nm of m.values()) {
    const n = s.nations[nm.id];
    if (nm.thrustVectoringMin === undefined && n.techs.includes("voidcraft.1")) nm.thrustVectoringMin = now;
    if (n.techs.includes("voidcraft.2")) nm.voidcraft2 = true;
    const regions = owned(s, nm.id);
    if (nm.offEarthMin === undefined && regions.some((r) => BODIES[REGIONS[r.id].body].zone !== "terrestrial")) nm.offEarthMin = now;
    if (nm.marsMin === undefined && regions.some((r) => REGIONS[r.id].body === "mars")) nm.marsMin = now;
    if (nm.ladderDoneMin === undefined && Object.values(LADDERS).some((l) => l.every((x) => n.techs.includes(x.id)))) {
      nm.ladderDoneMin = now;
    }
  }
}


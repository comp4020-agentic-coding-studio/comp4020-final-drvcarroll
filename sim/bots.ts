// game-design.md §13: scripted bot archetypes. Each scores legalActions
// against what observe shows it, the same view a client gets.
import { BODIES, REGIONS, type Ladder } from "../rules/data/index.ts";
import type { Command, Id, Ms, PrivateState, VisibleWorld } from "../rules/index.ts";

export const ARCHETYPES = ["expander", "builder", "trader", "conqueror", "researcher", "random"] as const;
export type Archetype = (typeof ARCHETYPES)[number];

export interface Ctx {
  id: Id;
  t: Ms;
  start: Ms;
  world: VisibleWorld;
  you: PrivateState;
  legal: Command[];
  wanted: Command[]; // blocked only by cost: worth saving for
  rng: () => number;
}

const SPENDS = new Set<Command["type"]>(["build", "buildShip", "train"]);

interface Weights {
  ladders: Record<Ladder, number>;
  expand: number;
  colonise: number;
  military: number;
  attack: number;
  lab: number;
  envoy: number;
  trade: number;
  armyTarget: number;
}

const base: Weights = {
  ladders: { voidcraft: 2, industry: 2, science: 2, society: 1 },
  expand: 4, colonise: 4, military: 0, attack: 0, lab: 2, envoy: 0, trade: 1, armyTarget: 4,
};

const WEIGHTS: Record<Exclude<Archetype, "random">, Weights> = {
  expander: { ...base, ladders: { voidcraft: 5, industry: 2, science: 1, society: 3 }, expand: 9, colonise: 9, armyTarget: 8 },
  builder: { ...base, ladders: { voidcraft: 1, industry: 6, science: 2, society: 2 }, expand: 5 },
  trader: { ...base, ladders: { voidcraft: 1, industry: 2, science: 5, society: 2 }, envoy: 7, trade: 5 },
  conqueror: {
    ...base, ladders: { voidcraft: 5, industry: 3, science: 1, society: 1 },
    expand: 6, military: 6, attack: 9, armyTarget: 12,
  },
  researcher: { ...base, ladders: { voidcraft: 2, industry: 1, science: 7, society: 2 }, lab: 7, envoy: 3 },
};

const ZONE_PREF: Record<string, number> = { cislunar: 5, inner: 4, belt: 2, jovian: 1, saturnian: 0.5, outer: 0.2, terrestrial: 0 };

function score(w: Weights, c: Command, x: Ctx): number {
  const rate = (r: keyof PrivateState["stocks"]) => x.you.stocks[r].rate;
  const stock = (r: keyof PrivateState["stocks"]) => x.you.stocks[r].v;
  const mine = x.world.regions.filter((r) => r.owner === x.id);
  const armies = mine.reduce((a, r) => a + (r.armies ?? 0), 0);
  const myFleets = x.world.fleets.filter((f) => f.owner === x.id);
  const has = (u: string) => myFleets.some((f) => (f.units as Record<string, number>)[u]);
  const hasSpaceport = mine.some((r) => r.buildings?.some((b) => b.type === "spaceport"));
  const atWarWith = (n?: Id) => !!n && x.world.wars.some((v) => (v.a === x.id && v.b === n) || (v.b === x.id && v.a === n));
  switch (c.type) {
    case "research": return 1 + w.ladders[c.tech.split(".")[0] as Ladder];
    case "build": {
      const b = c.building;
      if (b === "powerPlant") return rate("E") < 2 ? 10 : 1;
      if (b === "mine") return rate("M") < 10 ? 6 : 2;
      if (b === "refinery") return rate("V") < 5 ? 4 : 1;
      if (b === "foundry") return rate("A") < 3 ? 7 : 1;
      if (b === "factory") return rate("Mt") < 1 && rate("A") > 0 ? 7 : 1;
      if (b === "lab") return w.lab;
      return hasSpaceport ? 0 : Math.max(w.colonise, w.military) - 1;
    }
    case "setMode": return c.mode === "fusion" ? 3 : c.mode === "fission" ? 2 : 0;
    case "train": return armies < w.armyTarget ? 4 : 0;
    case "march": {
      const to = x.world.regions.find((r) => r.id === c.to);
      if (!to?.owner) return w.expand;
      return atWarWith(to.owner) ? w.attack : 0;
    }
    case "buildShip": {
      if (c.unit === "colonyShip") return has("colonyShip") ? 0 : w.colonise;
      if (c.unit === "troopTransport") return w.attack && !has("troopTransport") ? w.attack - 2 : 0;
      if (c.unit === "freighter") return 0;
      return w.military * (c.unit === "corvette" ? 1 : 1.5);
    }
    case "launch": {
      if (!c.units.colonyShip) return 0;
      const zone = BODIES[c.to].zone;
      const free = x.world.regions.some((r) => r.body === c.to && !r.owner);
      return free ? (w.colonise * ZONE_PREF[zone]) / 5 : 0;
    }
    case "colonise": return 10;
    case "invade": return w.attack;
    case "declareWar": {
      if (!w.attack || x.world.wars.some((v) => v.a === x.id || v.b === x.id)) return 0;
      const theirs = mine.length && x.world.regions.filter((r) => r.owner === c.nation).length;
      return armies >= 6 ? 3 + (theirs ? 2 / theirs : 0) : 0;
    }
    case "offerPeace": case "acceptPeace": return w.attack ? 0 : 3;
    case "sendEnvoy": return w.envoy;
    case "acceptTrade": return 1 + w.trade;
    case "exchange": {
      const cap = x.you.stocks[c.give].cap;
      return stock(c.give) > 0.7 * cap && stock(c.get) < 100 ? w.trade : 0;
    }
    default: return 0;
  }
}

// Traders also open offers: their fullest stock for their emptiest.
function traderOffer(x: Ctx): Command | null {
  const others = x.world.nations.filter((n) => n.id !== x.id && !n.eliminated);
  if (!others.length || x.rng() > 0.15) return null;
  const by = Object.entries(x.you.stocks).sort((a, b) => b[1].v - a[1].v);
  const [give, low] = [by[0], by.at(-1)!];
  if (give[1].v < 100) return null;
  const to = others[Math.floor(x.rng() * others.length)].id;
  return { type: "offerTrade", to, give: { [give[0]]: 50 }, get: { [low[0]]: 40 } };
}

// Best command per type, then the top few: no one type crowds out the rest.
export function decide(kind: Archetype, x: Ctx, max = 4): Command[] {
  if (kind === "random") {
    return x.legal.length && x.rng() < 0.5 ? [x.legal[Math.floor(x.rng() * x.legal.length)]] : [];
  }
  const w = WEIGHTS[kind];
  const best = new Map<Command["type"], { c: Command; v: number }>();
  for (const c of x.legal) {
    const v = score(w, c, x) + x.rng() * 0.5;
    if (v > 0.5 && v > (best.get(c.type)?.v ?? 0)) best.set(c.type, { c, v });
  }
  const saveFor = Math.max(0, ...x.wanted.filter((c) => SPENDS.has(c.type)).map((c) => score(w, c, x)));
  const ranked = [...best.values()]
    .filter((r) => !SPENDS.has(r.c.type) || r.v >= saveFor)
    .sort((a, b) => b.v - a.v).slice(0, max).map((r) => r.c);
  const offer = kind === "trader" ? traderOffer(x) : null;
  return offer ? [...ranked, offer] : ranked;
}

export const startRegions = Object.values(REGIONS).filter((r) => r.start).map((r) => r.id);


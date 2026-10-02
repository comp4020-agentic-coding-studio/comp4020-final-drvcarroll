// game-design.md §3, §5, §6: rates, caps and the shortfall rule.
import {
  BODIES, BUILDINGS, ECONOMY, MAP, MODS, POWER_MODES, REGIONS, RESOURCES, RUNGS, UNITS,
  type Building, type Goods, type Mod, type PowerMode, type Resource, type Unit,
} from "./data/index.ts";
import type { Id } from "./protocol.ts";
import type { NationState, RegionState, State } from "./state.ts";

export const EPS = 1e-9;
export const MS_PER_MIN = 60_000;

export function mods(n: NationState): Record<Mod, number> {
  const m = Object.fromEntries(MODS.map((k) => [k, 0])) as Record<Mod, number>;
  for (const t of n.techs) for (const [k, v] of Object.entries(RUNGS[t].mods)) m[k as Mod] += v;
  return m;
}

export const isEarth = (regionId: Id) => BODIES[REGIONS[regionId].body].zone === "terrestrial";

export const owned = (s: State, nation: Id): RegionState[] =>
  Object.values(s.regions).filter((r) => r.owner === nation);

export function slotsOf(s: State, regionId: Id): number {
  const r = s.regions[regionId];
  const base = BODIES[REGIONS[regionId].body].slots;
  if (!r.owner) return base;
  const m = mods(s.nations[r.owner]);
  return base + (isEarth(regionId) ? m.slotsEarth : m.slotsOffEarth);
}

export const capOf = (s: State, nation: Id) => ECONOMY.capBase + ECONOMY.capPerRegion * owned(s, nation).length;

export function controlsBody(s: State, nation: Id, body: string): boolean {
  return Object.values(s.regions).every((r) => REGIONS[r.id].body !== body || r.owner === nation);
}

interface Flow {
  out?: { res: Resource; amt: number };
  needs: Goods;
  offEarth: boolean;
}

function buildingFlow(b: Building, mode: PowerMode, regionId: Id, bonus: number, m: Record<Mod, number>): Flow {
  const d = BUILDINGS[b];
  const rd = REGIONS[regionId];
  const offEarth = !isEarth(regionId);
  const needs: Goods = { ...d.input };
  for (const [r, v] of Object.entries(d.upkeep) as [Resource, number][]) {
    needs[r] = (needs[r] ?? 0) + (r === "E" ? v * Math.max(0, 1 + m.buildingUpkeepE) : v);
  }
  if (!d.output) return { needs, offEarth };
  let amt = d.output.base * (d.output.yield ? rd[d.output.yield] : 1);
  const specific: Partial<Record<Building, number>> = {
    mine: m.mineOutput, refinery: m.refineryOutput, foundry: m.foundryOutput,
    factory: m.factoryOutput, lab: m.labOutput + (offEarth ? m.labOffEarth : 0),
  };
  let extra = specific[b] ?? 0;
  if (b === "powerPlant") {
    const flat = POWER_MODES[mode].flat;
    if (flat === undefined) {
      amt = MAP.solarBase * rd.s;
      extra = m.solarOutput;
    } else {
      amt = flat;
      if (mode === "fusion" && BODIES[rd.body].fusionBonus) extra = ECONOMY.fusionBodyBonus;
    }
  }
  return { out: { res: d.output.res, amt: amt * (1 + bonus + extra) }, needs, offEarth };
}

function flows(s: State, n: NationState): Flow[] {
  const m = mods(n);
  const boost = s.t < n.boostUntil ? ECONOMY.boostMultiplier : 1;
  const out: Flow[] = [];
  const unitE = (units: Partial<Record<Unit, number>>) =>
    Object.entries(units).reduce((e, [u, c]) => e + UNITS[u as Unit].upkeepE * (c ?? 0), 0);
  let upkeepE = n.envoys.length * ECONOMY.envoyUpkeepE;
  for (const r of owned(s, n.id)) {
    const body = REGIONS[r.id].body;
    const bonus = m.allProduction + (controlsBody(s, n.id, body) ? MAP.bodyControlBonus : 0);
    for (const b of r.buildings) {
      const f = buildingFlow(b.type, (b.mode ?? "solar") as PowerMode, r.id, bonus, m);
      if (f.out) f.out.amt *= boost;
      out.push(f);
    }
    if (!isEarth(r.id)) {
      out.push({ needs: { Mt: ECONOMY.colonyUpkeepMt * Math.max(0, 1 + m.colonyUpkeep) }, offEarth: true });
    }
    upkeepE += unitE({ army: r.armies });
  }
  for (const f of Object.values(s.fleets)) if (f.owner === n.id) upkeepE += unitE(f.units);
  if (upkeepE > 0) out.push({ needs: { E: upkeepE }, offEarth: false });
  return out;
}

export interface Economy {
  rate: Record<Resource, number>; // net, per minute
  production: Record<Resource, number>; // gross output, per minute
  efficiency: number;
}

const zeros = () => Object.fromEntries(RESOURCES.map((r) => [r, 0])) as Record<Resource, number>;

// Shortfall: an empty stock's consumers run at supply ÷ demand. Iterated to a
// fixed point, since a throttled consumer also produces less.
export function economy(s: State, nation: Id): Economy {
  const n = s.nations[nation];
  const fs = flows(s, n);
  const rho = Object.fromEntries(RESOURCES.map((r) => [r, 1])) as Record<Resource, number>;
  let supply = zeros();
  let used = zeros();
  for (let iter = 0; iter < 32; iter++) {
    supply = zeros();
    used = zeros();
    const demand = zeros();
    for (const f of fs) {
      const needs = Object.entries(f.needs) as [Resource, number][];
      const op = needs.reduce((o, [r]) => Math.min(o, rho[r]), 1);
      if (f.out) supply[f.out.res] += f.out.amt * op * (f.offEarth && rho.Mt < 1 ? ECONOMY.colonyShortfallOutput : 1);
      for (const [r, v] of needs) {
        demand[r] += v;
        used[r] += v * op;
      }
    }
    let changed = false;
    for (const r of RESOURCES) {
      const next = n.stocks[r] <= EPS && demand[r] > supply[r] ? supply[r] / demand[r] : 1;
      if (Math.abs(next - rho[r]) > EPS) changed = true;
      rho[r] = next;
    }
    if (!changed) break;
  }
  const rate = zeros();
  for (const r of RESOURCES) rate[r] = supply[r] - used[r];
  return { rate, production: supply, efficiency: Math.min(...Object.values(rho)) };
}

export function canAfford(n: NationState, cost: Goods): Resource | null {
  for (const [r, v] of Object.entries(cost) as [Resource, number][]) if (n.stocks[r] + EPS < v) return r;
  return null;
}

export function spend(n: NationState, cost: Goods): void {
  for (const [r, v] of Object.entries(cost) as [Resource, number][]) n.stocks[r] = Math.max(0, n.stocks[r] - v);
}

export function credit(s: State, n: NationState, goods: Goods): void {
  const cap = capOf(s, n.id);
  for (const [r, v] of Object.entries(goods) as [Resource, number][]) n.stocks[r] = Math.min(cap, n.stocks[r] + v);
}

export const scale = (g: Goods, k: number): Goods =>
  Object.fromEntries(Object.entries(g).map(([r, v]) => [r, (v ?? 0) * k]));

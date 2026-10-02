// game-design.md §11 and system-design.md §6: what one nation can see.
// Sensors (owning a region on a body) see everything there; Envoys see a
// nation's fleets and territory, never its buildings; elsewhere is blank.
import {
  ADJACENT, BODIES, BUILDINGS, ECONOMY, LADDERS, POWER_MODES, REGIONS, RESOURCES, UNITS, type Building, type Unit,
} from "./data/index.ts";
import { isRejection } from "./check.ts";
import { settled } from "./advance.ts";
import { check } from "./commands.ts";
import { capOf, economy, owned } from "./economy.ts";
import type { Command, Fleet, Id, NationPublic, PrivateState, Region, VisibleWorld } from "./protocol.ts";
import { scores } from "./score.ts";
import type { FleetState, NationState, State } from "./state.ts";

const publicNation = (n: NationState): NationPublic => ({
  id: n.id, name: n.name, primary: n.primary, secondary: n.secondary, capital: n.capital,
  protectedUntil: n.protectedUntil, boostUntil: n.boostUntil, eliminated: n.eliminated,
});

const publicFleet = (f: FleetState): Fleet => ({
  id: f.id, owner: f.owner, rev: f.rev, units: { ...f.units },
  ...(f.at ? { at: f.at } : {}), ...(f.transit ? { transit: { ...f.transit } } : {}),
});

export function vision(s: State, nation: Id | null) {
  const sensors = new Set(nation ? owned(s, nation).map((r) => REGIONS[r.id].body) : []);
  const envoys = new Set(nation ? s.nations[nation]?.envoys.map((e) => e.nation) : []);
  return { sensors, envoys };
}

export function observe(state: State, nation: Id | null): { world: VisibleWorld; you: PrivateState | null } {
  const s = settled(state);
  const { sensors, envoys } = vision(s, nation);
  const regions: Region[] = Object.values(s.regions).map((r) => {
    const body = REGIONS[r.id].body;
    const base: Region = { id: r.id, body, slots: BODIES[body].slots };
    if (sensors.has(body)) return { ...base, owner: r.owner ?? undefined, rev: r.rev, buildings: r.buildings.map((b) => ({ ...b })), armies: r.armies };
    if (r.owner && envoys.has(r.owner)) return { ...base, owner: r.owner, rev: r.rev, armies: r.armies };
    return base;
  });
  const fleets = Object.values(s.fleets)
    .filter((f) => f.owner === nation || (f.at && sensors.has(f.at)) || envoys.has(f.owner))
    .map(publicFleet);
  const world: VisibleWorld = {
    nations: Object.values(s.nations).filter((n) => n.joined).map(publicNation),
    regions,
    fleets,
    wars: Object.values(s.wars).map(({ id, a, b, declaredAt, activeAt }) => ({ id, a, b, declaredAt, activeAt })),
    scores: scores(s),
    presence: [],
    news: [...s.news],
  };
  const n = nation ? s.nations[nation] : undefined;
  return { world, you: n ? privateState(s, n) : null };
}

function privateState(s: State, n: NationState): PrivateState {
  const e = n.joined ? economy(s, n.id) : undefined;
  const cap = capOf(s, n.id);
  return {
    nation: n.id,
    stocks: Object.fromEntries(RESOURCES.map((r) => [r, { v: n.stocks[r], rate: e?.rate[r] ?? 0, cap }])) as PrivateState["stocks"],
    efficiency: e?.efficiency ?? 1,
    techs: [...n.techs],
    research: n.research && { tech: n.research.tech, startAt: n.research.startAt, finishAt: n.research.finishAt },
    queues: Object.fromEntries(owned(s, n.id).filter((r) => r.queue.length)
      .map((r) => [r.id, r.queue.map(({ item, startAt, finishAt }) => ({ item, startAt, finishAt }))])),
    trades: Object.values(s.offers).filter((o) => o.from === n.id || o.to === n.id).map((o) => ({ ...o })),
    envoys: n.envoys.map((x) => ({ ...x })),
  };
}

// Every discrete command that would apply right now. Free-amount commands
// (offerTrade, gift) are left to the caller, which picks the amounts.
export function legalActions(state: State, nation: Id): Command[] {
  const s = settled(state);
  const n = s.nations[nation];
  if (!n) return [];
  const out: Command[] = [];
  if (!n.joined || n.eliminated) {
    for (const r of Object.keys(s.regions)) out.push({ type: "join", region: r });
  } else {
    const mine = owned(s, nation);
    const others = Object.values(s.nations).filter((o) => o.joined && o.id !== nation && !o.eliminated);
    for (const r of mine) {
      for (const b of Object.keys(BUILDINGS) as Building[]) out.push({ type: "build", region: r.id, building: b });
      for (const b of r.buildings) {
        if (b.type !== "powerPlant") continue;
        for (const mode of Object.keys(POWER_MODES)) if (mode !== (b.mode ?? "solar")) out.push({ type: "setMode", region: r.id, slot: b.slot, mode });
      }
      out.push({ type: "train", region: r.id, count: 1 });
      for (const u of Object.keys(UNITS) as Unit[]) out.push({ type: "buildShip", region: r.id, unit: u, count: 1 });
      if (r.armies) for (const to of ADJACENT[r.id] ?? []) out.push({ type: "march", from: r.id, to, count: r.armies });
    }
    for (const ladder of Object.values(LADDERS)) {
      const next = ladder.find((rung) => !n.techs.includes(rung.id));
      if (next) out.push({ type: "research", tech: next.id });
    }
    if (n.research) out.push({ type: "cancelResearch" });
    for (const f of Object.values(s.fleets)) {
      if (f.owner !== nation || !f.at) continue;
      const ships = Object.fromEntries(Object.entries(f.units).filter(([u]) => u !== "army"));
      for (const to of Object.keys(BODIES)) out.push({ type: "launch", from: f.at, to, units: ships });
      for (const r of Object.values(s.regions)) {
        if (REGIONS[r.id].body !== f.at) continue;
        out.push({ type: "colonise", fleet: f.id, region: r.id }, { type: "invade", fleet: f.id, region: r.id });
      }
    }
    for (const o of others) {
      out.push({ type: "declareWar", nation: o.id }, { type: "offerPeace", nation: o.id });
      out.push({ type: "sendEnvoy", nation: o.id }, { type: "recallEnvoy", nation: o.id });
    }
    for (const w of Object.values(s.wars)) out.push({ type: "acceptPeace", war: w.id });
    for (const o of Object.values(s.offers)) {
      out.push({ type: "acceptTrade", offer: o.id }, { type: "declineTrade", offer: o.id }, { type: "cancelTrade", offer: o.id });
    }
    for (const give of RESOURCES) for (const get of RESOURCES) out.push({ type: "exchange", give, amount: ECONOMY.exchangeLot, get });
  }
  return out.filter((c) => !isRejection(check(s, nation, c)));
}


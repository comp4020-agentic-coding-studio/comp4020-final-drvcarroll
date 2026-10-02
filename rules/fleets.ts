// game-design.md §4, §7, §11: ships, launches, arrival, colonising, marching.
import { ADJACENT, BODIES, MILITARY, REGIONS, RUNGS, TRAVEL, UNITS, type Unit } from "./data/index.ts";
import { enqueue, isInt, isRejection, needs, no, ownRegion, regionName, type Handler } from "./check.ts";
import { isEarth, mods, scale, spend } from "./economy.ts";
import { launchEnergy, travelMs } from "./orbit.ts";
import type { Id } from "./protocol.ts";
import { newId, news, schedule, touch, type FleetState, type State } from "./state.ts";

type Units = Partial<Record<Unit, number>>;

export function orbitFleet(s: State, owner: Id, body: string): FleetState {
  const f = Object.values(s.fleets).find((x) => x.owner === owner && x.at === body);
  if (f) return f;
  const id = newId(s, "f");
  return (s.fleets[id] = { id, owner, units: {}, at: body, rev: 0 });
}

export function addUnits(f: FleetState, units: Units): void {
  for (const [u, c] of Object.entries(units)) f.units[u as Unit] = (f.units[u as Unit] ?? 0) + (c ?? 0);
  touch(f);
}

export function removeUnits(s: State, f: FleetState, units: Units): void {
  for (const [u, c] of Object.entries(units)) {
    const left = (f.units[u as Unit] ?? 0) - (c ?? 0);
    if (left > 0) f.units[u as Unit] = left;
    else delete f.units[u as Unit];
  }
  touch(f);
  if (!Object.keys(f.units).length) delete s.fleets[f.id];
}

export function claim(s: State, nation: Id, region: Id, armies = 0): void {
  const r = s.regions[region];
  r.owner = nation;
  r.armies = armies;
  touch(r);
  news(s, "claim", `${s.nations[nation].name} claims ${regionName(region)}`, [nation, region]);
}

const regionsOn = (s: State, nation: Id, body: string) =>
  Object.values(s.regions).filter((r) => r.owner === nation && REGIONS[r.id].body === body).sort((a, b) => (a.id < b.id ? -1 : 1));

export const buildShip: Handler<"buildShip"> = (s, n, c) => {
  const r = ownRegion(s, n, c.region);
  if (isRejection(r)) return r;
  const u = UNITS[c.unit];
  if (!u?.atSpaceport) return no("INVALID", "Unknown ship type");
  if (!r.buildings.some((b) => b.type === "spaceport")) return no("INVALID", `${regionName(r.id)} has no Spaceport`);
  if (u.unlock && !n.techs.includes(u.unlock)) return no("LOCKED", `Needs ${RUNGS[u.unlock].name}`);
  if (!isInt(c.count, 1, MILITARY.maxBuildCount)) return no("INVALID", `Build 1 to ${MILITARY.maxBuildCount} at once`);
  return needs(n, scale(u.cost, c.count)) ?? (() => {
    for (let i = 0; i < c.count; i++) {
      spend(n, u.cost);
      enqueue(s, r, c.unit, u.timeS * 1000, u.cost);
    }
  });
};

export const launch: Handler<"launch"> = (s, n, c) => {
  if (!BODIES[c.from] || !BODIES[c.to] || c.from === c.to) return no("INVALID", "Pick two different bodies");
  const entries = Object.entries(c.units ?? {}) as [Unit, number][];
  if (!entries.length || entries.some(([u, k]) => !UNITS[u] || !isInt(k, 1, 1e6))) return no("INVALID", "Pick units to launch");
  const ships = entries.filter(([u]) => u !== "army");
  if (!ships.length) return no("INVALID", "Armies need a Troop Transport");
  const f = Object.values(s.fleets).find((x) => x.owner === n.id && x.at === c.from);
  for (const [u, k] of ships) {
    if ((f?.units[u] ?? 0) < k) return no("INSUFFICIENT", `Only ${f?.units[u] ?? 0} ${UNITS[u].name} at ${BODIES[c.from].name}`);
  }
  const armies = c.units.army ?? 0;
  const garrisons = regionsOn(s, n.id, c.from);
  if (armies > garrisons.reduce((a, r) => a + r.armies, 0)) return no("INSUFFICIENT", `Not enough Armies on ${BODIES[c.from].name}`);
  if (armies > (c.units.troopTransport ?? 0) * MILITARY.transportCapacity) {
    return no("INSUFFICIENT", `Each Troop Transport carries ${MILITARY.transportCapacity} Armies`);
  }
  const m = mods(n);
  const cost = { E: launchEnergy(c.from, c.to, c.units, s.t, s.season.startedAt, m) };
  return needs(n, cost) ?? (() => {
    spend(n, cost);
    removeUnits(s, f!, Object.fromEntries(ships));
    let left = armies;
    for (const r of garrisons) {
      const take = Math.min(left, r.armies);
      r.armies -= take;
      left -= take;
      if (take) touch(r);
    }
    const id = newId(s, "f");
    const arriveAt = s.t + travelMs(c.from, c.to, c.units, m);
    s.fleets[id] = { id, owner: n.id, units: { ...c.units }, transit: { from: c.from, to: c.to, departAt: s.t, arriveAt }, rev: 0 };
    schedule(s, { kind: "arrive", at: arriveAt, fleet: id });
    news(s, "launch", `${n.name} launches toward ${BODIES[c.to].name}`, [n.id, id]);
  });
};

export const colonise: Handler<"colonise"> = (s, n, c) => {
  const f = s.fleets[c.fleet];
  if (f?.owner !== n.id) return no("INVALID", "Unknown fleet");
  if (!f.units.colonyShip) return no("INVALID", "That fleet has no Colony Ship");
  const r = s.regions[c.region];
  if (!r) return no("INVALID", "Unknown region");
  if (isEarth(r.id)) return no("INVALID", "Earth regions are settled by marching an Army in");
  if (REGIONS[r.id].body !== (f.at ?? f.transit?.to)) return no("INVALID", `That fleet isn't at ${BODIES[REGIONS[r.id].body].name}`);
  if (r.owner) return no("TAKEN", `${regionName(r.id)} is already claimed`);
  return () => {
    if (f.transit) {
      f.colonise = r.id;
      touch(f);
      return;
    }
    removeUnits(s, f, { colonyShip: 1 });
    claim(s, n.id, r.id);
  };
};

// Ties go to the earlier launch, then lower id: arrival events are ordered so.
export function arrive(s: State, fleetId: Id): void {
  const f = s.fleets[fleetId];
  if (!f?.transit) return;
  const body = f.transit.to;
  delete f.transit;
  f.at = body;
  const target = f.colonise;
  delete f.colonise;
  if (target && !s.regions[target].owner) {
    removeUnits(s, f, { colonyShip: 1 });
    claim(s, f.owner, target);
  }
  if (!s.fleets[f.id]) return;
  const home = Object.values(s.fleets).find((x) => x !== f && x.owner === f.owner && x.at === body);
  if (home) {
    addUnits(home, f.units);
    delete s.fleets[f.id];
  } else {
    touch(f);
  }
}

export const march: Handler<"march"> = (s, n, c) => {
  const from = ownRegion(s, n, c.from);
  if (isRejection(from)) return from;
  const to = s.regions[c.to];
  if (!to || !isEarth(to.id) || !isEarth(from.id)) return no("INVALID", "Armies march only between Earth regions");
  if (!ADJACENT[from.id]?.includes(to.id)) return no("NOT_ADJACENT", `${regionName(from.id)} doesn't border ${regionName(to.id)}`);
  if (!isInt(c.count, 1, from.armies)) return no("INSUFFICIENT", `${regionName(from.id)} has ${from.armies} Armies`);
  if (to.owner && to.owner !== n.id) return no("NOT_AT_WAR", `You aren't at war with ${s.nations[to.owner].name}`);
  return () => {
    from.armies -= c.count;
    touch(from);
    schedule(s, { kind: "march", at: s.t + TRAVEL.marchHopS * 1000, nation: n.id, from: from.id, to: to.id, count: c.count });
  };
};

export function marchArrive(s: State, nation: Id, from: Id, to: Id, count: number): void {
  const r = s.regions[to];
  if (!r.owner) return claim(s, nation, to, count);
  if (r.owner === nation) {
    r.armies += count;
    return touch(r);
  }
  const back = s.regions[from];
  if (back.owner === nation) {
    back.armies += count;
    touch(back);
  }
}

export function shipDone(s: State, owner: Id, region: Id, unit: Unit): void {
  addUnits(orbitFleet(s, owner, REGIONS[region].body), { [unit]: 1 });
}

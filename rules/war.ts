// game-design.md §7: war rules, Lanchester combat, invasion, conquest.
import { ADJACENT, BODIES, MILITARY, REGIONS, TRAVEL, UNITS, WAR, type Unit } from "./data/index.ts";
import { isInt, isRejection, no, ownRegion, regionName, type Handler } from "./check.ts";
import { isEarth, owned, slotsOf } from "./economy.ts";
import { claim, removeUnits } from "./fleets.ts";
import type { Battle, Id, Ms, Rejection } from "./protocol.ts";
import { newId, news, schedule, touch, type FleetState, type NationState, type State } from "./state.ts";

const warBetween = (s: State, a: Id, b: Id) =>
  Object.values(s.wars).find((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a));

export const atWar = (s: State, a: Id, b: Id) => {
  const w = warBetween(s, a, b);
  return !!w && s.t >= w.activeAt;
};

// Winner keeps √(1 − (L/W)²) of each stack. Equal sides annihilate.
export const survivors = (count: number, w: number, l: number) =>
  w > l ? Math.round(count * Math.sqrt(1 - (l / w) ** 2)) : 0;

export const spaceStrength = (units: Partial<Record<Unit, number>>) =>
  Object.entries(units).reduce((a, [u, c]) => a + (u === "army" ? 0 : UNITS[u as Unit].strength * (c ?? 0)), 0);

const minutesLeft = (s: State, until: number) => Math.ceil((until - s.t) / 60_000);

function protectedReason(s: State, target: NationState): Rejection | null {
  if (s.t >= target.protectedUntil) return null;
  return no("PROTECTED", `${target.name} is protected for ${minutesLeft(s, target.protectedUntil)} more minutes`);
}

export function resolveSpace(s: State, body: string): void {
  for (;;) {
    const here = Object.values(s.fleets).filter((f) => f.at === body).sort((a, b) => (a.owner < b.owner ? -1 : 1));
    const pair = here.flatMap((a, i) => here.slice(i + 1).map((b) => [a, b] as const))
      .find(([a, b]) => atWar(s, a.owner, b.owner) && spaceStrength(a.units) + spaceStrength(b.units) > 0);
    if (!pair) return;
    fight(s, body, pair[0], pair[1]);
  }
}

function fight(s: State, body: string, a: FleetState, b: FleetState): void {
  const [sa, sb] = [spaceStrength(a.units), spaceStrength(b.units)];
  const [w, l] = sa > sb ? [a, b] : [b, a];
  const [ws, ls] = sa > sb ? [sa, sb] : [sb, sa];
  delete s.fleets[l.id];
  if (ws === ls) delete s.fleets[w.id];
  else {
    for (const [u, c] of Object.entries(w.units)) {
      const left = survivors(c ?? 0, ws, ls);
      if (left) w.units[u as Unit] = left;
      else delete w.units[u as Unit];
    }
    touch(w);
    if (!Object.keys(w.units).length) delete s.fleets[w.id];
  }
  const [na, nb] = [s.nations[a.owner].name, s.nations[b.owner].name];
  const result = ws === ls ? "both fleets are destroyed" : `${s.nations[w.owner].name} wins`;
  news(s, "battle", `Battle at ${BODIES[body].name}: ${na} (${sa}) vs ${nb} (${sb}), ${result}`, [a.owner, b.owner, body]);
}

export function resolveAll(s: State): void {
  const bodies = new Set(Object.values(s.fleets).flatMap((f) => (f.at ? [f.at] : [])));
  for (const b of [...bodies].sort()) resolveSpace(s, b);
}

// Ground battles play the square law out in time (game-design.md §7):
// dA/dt = −rate·k²·D, dD/dt = −rate·A, k the garrison's +50%.
const K = 1 + MILITARY.garrisonBonus;
const GAMMA = MILITARY.groundRate * K; // per second
const LAST = MILITARY.groundLast;

export function battleCounts(b: Battle, t: Ms): [number, number] {
  const x = (GAMMA * Math.max(0, Math.min(t, b.endsAt) - b.at)) / 1000;
  const [c, sh] = [Math.cosh(x), Math.sinh(x)];
  return [Math.max(0, b.atk * c - K * b.def * sh), Math.max(0, b.def * c - (b.atk / K) * sh)];
}

// Smallest x ≥ 0 with p·cosh x − q·sinh x = LAST, for the losing side (p ≤ q).
function toLast(p: number, q: number): number {
  if (p <= LAST) return 0;
  if (Math.abs(p - q) < 1e-9) return Math.log(p / LAST);
  return Math.log((LAST - Math.sqrt(LAST ** 2 + q ** 2 - p ** 2)) / (p - q));
}

function schedBattle(s: State, b: Battle): void {
  const x = b.atk < K * b.def ? toLast(b.atk, K * b.def) : toLast(b.def, b.atk / K);
  b.endsAt = b.at + (x / GAMMA) * 1000;
  schedule(s, { kind: "battle", at: b.endsAt, region: b.id });
}

// Brings a battle's counts to now, adds to one side, and reschedules its end.
function reinforce(s: State, b: Battle, side: "atk" | "def", armies: number): void {
  [b.atk, b.def] = battleCounts(b, s.t);
  b.at = s.t;
  b[side] += armies;
  schedBattle(s, b);
}

// Armies arriving at, or trained in, a region its owner is defending.
export function joinDefence(s: State, region: Id, armies: number): boolean {
  const b = s.battles[region];
  if (b) reinforce(s, b, "def", armies);
  return !!b;
}

// Ground combat. An undefended region falls at once; otherwise a battle starts.
export function ground(s: State, nation: Id, region: Id, armies: number): void {
  const r = s.regions[region];
  const b = s.battles[region];
  if (b) return reinforce(s, b, "atk", armies);
  if (!r.armies) return conquer(s, nation, region, armies);
  const battle: Battle = { id: region, attacker: nation, defender: r.owner!, atk: armies, def: r.armies, at: s.t, endsAt: s.t };
  r.armies = 0;
  touch(r);
  s.battles[region] = battle;
  schedBattle(s, battle);
  news(s, "assault", `${s.nations[nation].name} attacks ${regionName(region)}`, [nation, battle.defender, region]);
}

// Survivors from the square law's invariant, exactly as an instant fight.
export function battleEnd(s: State, region: Id, at: Ms): void {
  const b = s.battles[region];
  if (b?.endsAt !== at) return;
  delete s.battles[region];
  const r = s.regions[region];
  const [atk, def] = [b.atk * UNITS.army.strength, b.def * UNITS.army.strength * K];
  const [an, dn] = [s.nations[b.attacker].name, s.nations[b.defender].name];
  if (atk > def) return conquer(s, b.attacker, region, survivors(b.atk, atk, def));
  r.armies += survivors(b.def, def, atk);
  touch(r);
  news(s, "battle", `${dn} holds ${regionName(region)} against ${an}`, [b.attacker, b.defender, region]);
}

const otherAttacker = (s: State, nation: Id, region: Id) => {
  const b = s.battles[region];
  return b && b.attacker !== nation ? no("INVALID", `${s.nations[b.attacker].name} is already attacking ${regionName(region)}`) : null;
};

function conquer(s: State, nation: Id, region: Id, armies: number): void {
  const r = s.regions[region];
  const prev = s.nations[r.owner!];
  Object.assign(r, { owner: nation, armies, queue: [] });
  touch(r);
  news(s, "conquest", `${s.nations[nation].name} takes ${regionName(region)} from ${prev.name}`, [nation, prev.id, region]);
  if (prev.capital !== region) return;
  const left = owned(s, prev.id).sort((a, b) =>
    b.buildings.length - a.buildings.length || slotsOf(s, b.id) - slotsOf(s, a.id) || (a.id < b.id ? -1 : 1));
  prev.capital = left[0]?.id ?? null;
  if (left.length) return;
  Object.assign(prev, { eliminated: true, envoys: [] });
  news(s, "eliminated", `${prev.name} has been eliminated`, [prev.id]);
}

export function canAttack(s: State, n: NationState, target: Id): Rejection | null {
  const t = s.nations[target];
  if (!atWar(s, n.id, target)) return no("NOT_AT_WAR", `You aren't at war with ${t.name}`);
  return protectedReason(s, t);
}

export const declareWar: Handler<"declareWar"> = (s, n, c) => {
  const t = s.nations[c.nation];
  if (!t?.joined || t.id === n.id) return no("INVALID", "Unknown nation");
  if (t.eliminated) return no("INVALID", `${t.name} has been eliminated`);
  if (warBetween(s, n.id, t.id)) return no("INVALID", `You are already at war with ${t.name}`);
  if (s.t < n.protectedUntil) return no("PROTECTED", "You can't declare war while protected");
  const p = protectedReason(s, t);
  if (p) return p;
  return () => {
    const id = newId(s, "w");
    const activeAt = s.t + WAR.activationS * 1000;
    s.wars[id] = { id, a: n.id, b: t.id, declaredAt: s.t, activeAt };
    schedule(s, { kind: "warActive", at: activeAt, war: id });
    news(s, "war", `${n.name} declares war on ${t.name}`, [n.id, t.id, id]);
  };
};

export const offerPeace: Handler<"offerPeace"> = (s, n, c) => {
  const w = warBetween(s, n.id, c.nation);
  if (!w) return no("NOT_AT_WAR", "You aren't at war with them");
  if (w.peaceFrom === n.id) return no("INVALID", "You already offered peace");
  return () => {
    w.peaceFrom = n.id;
  };
};

export const acceptPeace: Handler<"acceptPeace"> = (s, n, c) => {
  const w = s.wars[c.war];
  if (!w || (w.a !== n.id && w.b !== n.id)) return no("INVALID", "Unknown war");
  if (!w.peaceFrom || w.peaceFrom === n.id) return no("INVALID", "They haven't offered peace");
  return () => {
    delete s.wars[w.id];
    news(s, "peace", `${s.nations[w.a].name} and ${s.nations[w.b].name} make peace`, [w.a, w.b]);
  };
};

export const invade: Handler<"invade"> = (s, n, c) => {
  const f = s.fleets[c.fleet];
  if (f?.owner !== n.id || !f.at) return no("INVALID", "That fleet isn't in orbit");
  const r = s.regions[c.region];
  if (!r || REGIONS[r.id].body !== f.at) return no("INVALID", `That region isn't on ${BODIES[f.at].name}`);
  if (!f.units.army) return no("INVALID", "No Armies aboard");
  if (!r.owner || r.owner === n.id) return no("INVALID", "Invade a region another nation holds");
  const bar = canAttack(s, n, r.owner);
  if (bar) return bar;
  const hostile = Object.values(s.fleets).some((x) => x.at === f.at && spaceStrength(x.units) > 0 && atWar(s, n.id, x.owner));
  if (hostile) return no("INVALID", "Win orbital superiority first");
  const busy = otherAttacker(s, n.id, r.id);
  if (busy) return busy;
  return () => {
    const armies = f.units.army!;
    removeUnits(s, f, { army: armies });
    ground(s, n.id, r.id, armies);
  };
};

export function warActive(s: State, war: Id): void {
  if (s.wars[war]) resolveAll(s);
}


export const march: Handler<"march"> = (s, n, c) => {
  const from = ownRegion(s, n, c.from);
  if (isRejection(from)) return from;
  const to = s.regions[c.to];
  if (!to || !isEarth(to.id) || !isEarth(from.id)) return no("INVALID", "Armies march only between Earth regions");
  if (!ADJACENT[from.id]?.includes(to.id)) return no("NOT_ADJACENT", `${regionName(from.id)} doesn't border ${regionName(to.id)}`);
  if (!isInt(c.count, 1, from.armies)) return no("INSUFFICIENT", `${regionName(from.id)} has ${from.armies} Armies`);
  const bar = to.owner && to.owner !== n.id ? canAttack(s, n, to.owner) ?? otherAttacker(s, n.id, to.id) : null;
  if (bar) return bar;
  return () => {
    from.armies -= c.count;
    touch(from);
    schedule(s, { kind: "march", at: s.t + TRAVEL.marchHopS * 1000, nation: n.id, from: from.id, to: to.id, count: c.count });
  };
};

// Conditions may have changed in 30 s; if the move is no longer valid, go home.
export function marchArrive(s: State, nation: Id, from: Id, to: Id, count: number): void {
  const r = s.regions[to];
  const n = s.nations[nation];
  if (!r.owner) return claim(s, nation, to, count);
  if (r.owner === nation) {
    if (joinDefence(s, to, count)) return;
    r.armies += count;
    return touch(r);
  }
  if (!canAttack(s, n, r.owner) && !otherAttacker(s, nation, to)) return ground(s, nation, to, count);
  const back = s.regions[from];
  if (back.owner === nation) {
    back.armies += count;
    touch(back);
  }
}

// game-design.md §7: war rules, Lanchester combat, invasion, conquest.
import { ADJACENT, BODIES, MILITARY, REGIONS, RESOURCES, TRAVEL, UNITS, WAR, type Goods, type Unit } from "./data/index.ts";
import { isInt, isRejection, no, ownRegion, regionName, type Handler } from "./check.ts";
import { capOf, isEarth, mods, owned, slotsOf } from "./economy.ts";
import { allied } from "./alliance.ts";
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

// A fleet's strength with its owner's modifiers (Space Age warships).
const fleetStrength = (s: State, f: FleetState) =>
  spaceStrength(f.units) * (1 + mods(s.nations[f.owner], s.season.stage).warshipStrength);

// One nation and its allies, as far as they too are at war with the foe.
const side = (s: State, lead: Id, foe: Id) => (o: Id) => (o === lead || allied(s, lead, o)) && atWar(s, o, foe);

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

// Allies at war with the same foe fight as one side (game-design.md §7).
function fight(s: State, body: string, a: FleetState, b: FleetState): void {
  const here = Object.values(s.fleets).filter((f) => f.at === body);
  const A = here.filter((f) => side(s, a.owner, b.owner)(f.owner));
  const B = here.filter((f) => side(s, b.owner, a.owner)(f.owner));
  const sum = (fs: FleetState[]) => fs.reduce((x, f) => x + fleetStrength(s, f), 0);
  const [sa, sb] = [sum(A), sum(B)];
  const [W, L, ws, ls] = sa > sb ? [A, B, sa, sb] : [B, A, sb, sa];
  for (const f of L) delete s.fleets[f.id];
  for (const w of W) {
    if (ws === ls) {
      delete s.fleets[w.id];
      continue;
    }
    for (const [u, c] of Object.entries(w.units)) {
      const left = survivors(c ?? 0, ws, ls);
      if (left) w.units[u as Unit] = left;
      else delete w.units[u as Unit];
    }
    touch(w);
    if (!Object.keys(w.units).length) delete s.fleets[w.id];
  }
  const [na, nb] = [s.nations[a.owner].name, s.nations[b.owner].name];
  const allies = (fs: FleetState[]) => (new Set(fs.map((f) => f.owner)).size > 1 ? " and allies" : "");
  const result = ws === ls ? "both sides are destroyed" : `${s.nations[W[0].owner].name}${allies(W)} wins`;
  const fmt = (x: number) => Math.round(x);
  news(s, "battle", `Battle at ${BODIES[body].name}: ${na}${allies(A)} (${fmt(sa)}) vs ${nb}${allies(B)} (${fmt(sb)}), ${result}`, [...new Set([...A, ...B].map((f) => f.owner)), body]);
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

// Brings a battle's counts to now, adds a nation's Armies to one side
// (its share of that side kept per nation), and reschedules its end.
function reinforce(s: State, b: Battle, sideKey: "atk" | "def", nation: Id, armies: number, home?: Id): void {
  [b.atk, b.def] = battleCounts(b, s.t);
  b.at = s.t;
  const by = sideKey === "atk" ? b.atkBy : b.defBy;
  const total = b[sideKey];
  const counts = Object.fromEntries(Object.entries(by).map(([id, f]) => [id, f * total]));
  counts[nation] = (counts[nation] ?? 0) + armies;
  b[sideKey] = total + armies;
  for (const id of Object.keys(counts)) by[id] = counts[id] / b[sideKey];
  if (home && nation !== b.attacker && nation !== b.defender) b.home[nation] ??= home;
  schedBattle(s, b);
}

// Which side of a region's battle a nation's Armies would join, if any.
function sideOf(s: State, b: Battle, nation: Id): "atk" | "def" | null {
  if (nation === b.defender || allied(s, nation, b.defender)) return "def";
  if (nation === b.attacker || (allied(s, nation, b.attacker) && atWar(s, nation, b.defender))) return "atk";
  return null;
}

// Armies arriving at, or trained in, a region in battle join their side.
export function joinBattle(s: State, region: Id, nation: Id, armies: number, home?: Id): boolean {
  const b = s.battles[region];
  const sd = b && sideOf(s, b, nation);
  if (sd) reinforce(s, b, sd, nation, armies, home);
  return !!sd;
}

// Ground combat. An undefended region falls at once; otherwise a battle starts.
export function ground(s: State, nation: Id, region: Id, armies: number, home?: Id): void {
  const r = s.regions[region];
  if (s.battles[region]) return void joinBattle(s, region, nation, armies, home);
  if (!r.armies) return conquer(s, nation, region, armies);
  const battle: Battle = {
    id: region, attacker: nation, defender: r.owner!, atk: armies, def: r.armies, at: s.t, endsAt: s.t,
    atkBy: { [nation]: 1 }, defBy: { [r.owner!]: 1 }, home: {},
  };
  r.armies = 0;
  touch(r);
  s.battles[region] = battle;
  schedBattle(s, battle);
  news(s, "assault", `${s.nations[nation].name} attacks ${regionName(region)}`, [nation, battle.defender, region]);
}

// An ally's survivors march back to the region they came from, if still theirs.
function sendHome(s: State, b: Battle, nation: Id, armies: number): void {
  const home = s.regions[b.home[nation]];
  if (!armies || home?.owner !== nation) return;
  home.armies += armies;
  touch(home);
}

// Survivors from the square law's invariant, exactly as an instant fight,
// split by each nation's share of its side.
export function battleEnd(s: State, region: Id, at: Ms): void {
  const b = s.battles[region];
  if (b?.endsAt !== at) return;
  delete s.battles[region];
  const r = s.regions[region];
  const [atk, def] = [b.atk * UNITS.army.strength, b.def * UNITS.army.strength * K];
  const [an, dn] = [s.nations[b.attacker].name, s.nations[b.defender].name];
  const attackerWins = atk > def;
  const total = attackerWins ? survivors(b.atk, atk, def) : survivors(b.def, def, atk);
  const by = attackerWins ? b.atkBy : b.defBy;
  const lead = attackerWins ? b.attacker : b.defender;
  let own = total; // allies take their rounded share; the lead keeps the rest
  for (const [id, f] of Object.entries(by)) {
    if (id === lead) continue;
    const k = Math.min(own, Math.round(total * f));
    own -= k;
    sendHome(s, b, id, k);
  }
  if (attackerWins) return conquer(s, b.attacker, region, own);
  r.armies += own;
  touch(r);
  news(s, "battle", `${dn} holds ${regionName(region)} against ${an}`, [b.attacker, b.defender, region]);
}

// A region's battle has room only for its own sides.
const otherAttacker = (s: State, nation: Id, region: Id) => {
  const b = s.battles[region];
  return b && !sideOf(s, b, nation) ? no("INVALID", `${s.nations[b.attacker].name} is already attacking ${regionName(region)}`) : null;
};

// ADR G12: the conqueror carries off a share of the loser's stocks.
function plunder(s: State, from: NationState, to: NationState): Goods {
  const share = MILITARY.plunder / Math.max(1, owned(s, from.id).length);
  const cap = capOf(s, to.id);
  const got: Goods = {};
  for (const r of RESOURCES) {
    const take = Math.min(from.stocks[r] * share, Math.max(0, cap - to.stocks[r]));
    if (take < 1) continue;
    from.stocks[r] -= take;
    to.stocks[r] += take;
    got[r] = Math.floor(take);
  }
  return got;
}

function conquer(s: State, nation: Id, region: Id, armies: number): void {
  const r = s.regions[region];
  const prev = s.nations[r.owner!];
  const got = plunder(s, prev, s.nations[nation]); // before the region changes hands
  Object.assign(r, { owner: nation, armies, queue: [] });
  touch(r);
  const haul = Object.entries(got).map(([k, v]) => `${v} ${k}`).join(", ");
  news(s, "conquest", `${s.nations[nation].name} takes ${regionName(region)} from ${prev.name}${haul ? `, carrying off ${haul}` : ""}`, [nation, prev.id, region]);
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
  if (!atWar(s, n.id, target)) {
    const w = warBetween(s, n.id, target);
    return no("NOT_AT_WAR", w ? `War with ${t.name} is active in ${Math.ceil((w.activeAt - s.t) / 1000)}s` : `You aren't at war with ${t.name}`);
  }
  return protectedReason(s, t);
}

export const declareWar: Handler<"declareWar"> = (s, n, c) => {
  const t = s.nations[c.nation];
  if (!t?.joined || t.id === n.id) return no("INVALID", "Unknown nation; use its id, like n_3");
  if (t.eliminated) return no("INVALID", `${t.name} has been eliminated`);
  if (warBetween(s, n.id, t.id)) return no("INVALID", `You are already at war with ${t.name}`);
  if (allied(s, n.id, t.id)) return no("ALLIED", "You can't declare war on an ally");
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
  // Into a foe's region (or to an ally's battle); never just into an ally's.
  const help = to.owner && allied(s, n.id, to.owner);
  if (help && !s.battles[to.id]) return no("ALLIED", `${regionName(to.id)} belongs to an ally; march in only to defend it`);
  const bar = to.owner && to.owner !== n.id && !help ? canAttack(s, n, to.owner) ?? otherAttacker(s, n.id, to.id) : null;
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
    if (joinBattle(s, to, nation, count)) return;
    r.armies += count;
    return touch(r);
  }
  if (allied(s, nation, r.owner) ? joinBattle(s, to, nation, count, from) : false) return;
  if (!allied(s, nation, r.owner) && !canAttack(s, n, r.owner) && !otherAttacker(s, nation, to)) return ground(s, nation, to, count, from);
  const back = s.regions[from];
  if (back.owner === nation) {
    back.armies += count;
    touch(back);
  }
}

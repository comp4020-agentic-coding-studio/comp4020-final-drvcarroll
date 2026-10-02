// game-design.md §3: snapshot + rates + scheduled events. No loop needed.
import { BUILDINGS, REGIONS, RESOURCES, UNITS, type Building, type Resource, type Unit } from "./data/index.ts";
import { EPS, MS_PER_MIN, capOf, economy, type Economy } from "./economy.ts";
import { arrive, shipDone } from "./fleets.ts";
import type { Id, Ms } from "./protocol.ts";
import { leader, scores } from "./score.ts";
import { deliver, expire } from "./trade.ts";
import { marchArrive, resolveSpace, warActive } from "./war.ts";
import { news, schedule, touch, type GameEvent, type RegionState, type State } from "./state.ts";

const earliest = (es: GameEvent[]) =>
  es.reduce<GameEvent | undefined>((a, e) => (!a || e.at < a.at || (e.at === a.at && e.id < a.id) ? e : a), undefined);

// Mutates s up to time t: events in (at, id) order, stocks integrated between.
export function advance(s: State, t: Ms): void {
  for (;;) {
    if (s.season.status === "ended") {
      s.t = Math.max(s.t, t);
      return;
    }
    const ecos: Record<Id, Economy> = {};
    for (const n of Object.values(s.nations)) if (n.joined) ecos[n.id] = economy(s, n.id);

    let dep: { at: Ms; nation: Id; res: Resource } | undefined;
    for (const [id, e] of Object.entries(ecos)) {
      for (const r of RESOURCES) {
        const v = s.nations[id].stocks[r];
        if (v > EPS && e.rate[r] < -EPS) {
          const at = s.t + (v / -e.rate[r]) * MS_PER_MIN;
          if (!dep || at < dep.at) dep = { at, nation: id, res: r };
        }
      }
    }
    const next = earliest(s.events);
    const target = Math.max(s.t, Math.min(t, next?.at ?? Infinity, dep?.at ?? Infinity));
    integrate(s, ecos, target - s.t);
    s.t = target;

    if (dep && dep.at <= target && (!next || dep.at <= next.at)) {
      s.nations[dep.nation].stocks[dep.res] = 0;
      onDepleted(s, dep.nation, dep.res);
    } else if (next && next.at <= target) {
      s.events.splice(s.events.indexOf(next), 1);
      handle(s, next);
      checkThreshold(s);
    } else {
      return;
    }
  }
}

function integrate(s: State, ecos: Record<Id, Economy>, dt: Ms): void {
  if (dt <= 0) return;
  for (const [id, e] of Object.entries(ecos)) {
    const n = s.nations[id];
    const cap = capOf(s, id);
    for (const r of RESOURCES) n.stocks[r] = Math.min(cap, Math.max(0, n.stocks[r] + (e.rate[r] * dt) / MS_PER_MIN));
  }
}

// Unpaid Energy upkeep recalls every Envoy (§11).
function onDepleted(s: State, nation: Id, res: Resource): void {
  const n = s.nations[nation];
  if (res === "E" && n.envoys.length) {
    n.envoys = [];
    news(s, "envoy", `${n.name} could not pay its Envoys and recalled them`, [nation]);
  }
}

function handle(s: State, e: GameEvent): void {
  switch (e.kind) {
    case "queue": {
      const r = s.regions[e.region];
      if (r.queue[0]?.id !== e.item) return;
      const done = r.queue.shift()!;
      complete(s, r, done.item);
      if (r.queue[0]) schedule(s, { kind: "queue", at: r.queue[0].finishAt, region: r.id, item: r.queue[0].id });
      return;
    }
    case "research": {
      const n = s.nations[e.nation];
      if (n.research?.tech !== e.tech || n.research.finishAt !== e.at) return;
      n.techs.push(e.tech);
      n.research = null;
      return;
    }
    case "arrive": {
      const body = s.fleets[e.fleet]?.transit?.to;
      arrive(s, e.fleet);
      if (body) resolveSpace(s, body);
      return;
    }
    case "warActive":
      return warActive(s, e.war);
    case "deliver":
      return deliver(s, e.to, e.goods);
    case "offerExpire":
      return expire(s, e.offer, e.at);
    case "march":
      return marchArrive(s, e.nation, e.from, e.to, e.count);
    case "rateChange":
      return;
    case "seasonEnd":
      endSeason(s);
      return;
  }
}

function complete(s: State, r: RegionState, item: string): void {
  touch(r);
  if (item === "army") {
    r.armies++;
  } else if (item in UNITS) {
    if (!r.owner) return;
    shipDone(s, r.owner, r.id, item as Unit);
    resolveSpace(s, REGIONS[r.id].body);
  } else if (item in BUILDINGS) {
    const used = new Set(r.buildings.map((b) => b.slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    r.buildings.push({ slot, type: item as Building });
  }
}

function endSeason(s: State): void {
  s.season.status = "ended";
  s.season.winner = leader(scores(s));
  const w = s.season.winner && s.nations[s.season.winner];
  news(s, "season", w ? `${w.name} wins the season` : "The season ended", w ? [w.id] : []);
}

function checkThreshold(s: State): void {
  if (s.season.status !== "running") return;
  const sc = scores(s);
  const id = leader(sc);
  if (!id || sc[id].total < s.season.threshold) return;
  s.season.status = "ended";
  s.season.winner = id;
  news(s, "season", `${s.nations[id].name} reached the threshold and wins`, [id]);
}

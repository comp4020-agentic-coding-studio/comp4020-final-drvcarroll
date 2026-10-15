// game-design.md §3: snapshot + rates + scheduled events. No loop needed.
import { BUILDINGS, REGIONS, RESOURCES, SCORE, SEASON, STAGES, UNITS, type Building, type Resource, type Unit } from "./data/index.ts";
import { EPS, MS_PER_MIN, capOf, economy, type Economy } from "./economy.ts";
import { arrive, shipDone } from "./fleets.ts";
import type { Id, Ms } from "./protocol.ts";
import { scores, stageRanking } from "./score.ts";
import { deliver, expire } from "./trade.ts";
import { battleEnd, joinDefence, marchArrive, resolveSpace, warActive } from "./war.ts";
import { news, schedule, touch, type GameEvent, type RegionState, type State } from "./state.ts";

const earliest = (es: GameEvent[]) =>
  es.reduce<GameEvent | undefined>((a, e) => (!a || e.at < a.at || (e.at === a.at && e.id < a.id) ? e : a), undefined);

// Mutates s up to time t: events in (at, id) order, stocks integrated between.
// Stocks integrate only between events, never to a bare time, so replay
// (command to command) and live play (every tick) give identical floats.
export function advance(s: State, t: Ms): void {
  // Already there with nothing due: the loop below would find nothing.
  if (t <= s.t && !s.events.some((e) => e.at <= t)) return;
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
          const at = s.stocksAt + (v / -e.rate[r]) * MS_PER_MIN;
          if (!dep || at < dep.at) dep = { at, nation: id, res: r };
        }
      }
    }
    const next = earliest(s.events);
    const due = Math.min(next?.at ?? Infinity, dep?.at ?? Infinity);
    if (due > t) {
      s.t = Math.max(s.t, t);
      return;
    }
    const target = Math.max(s.stocksAt, due);
    integrate(s, ecos, target - s.stocksAt);
    s.stocksAt = target;
    s.t = Math.max(s.t, target);

    if (dep && dep.at <= target && (!next || dep.at <= next.at)) {
      s.nations[dep.nation].stocks[dep.res] = 0;
      onDepleted(s, dep.nation, dep.res);
    } else {
      s.events.splice(s.events.indexOf(next!), 1);
      handle(s, next!);
    }
  }
}

// Brings stocks up to s.t: done at each command, identically live and on replay.
// After the season ends, stocks stay frozen.
export function settle(s: State): void {
  if (s.season.status === "ended" || s.stocksAt === s.t) return;
  const ecos: Record<Id, Economy> = {};
  for (const n of Object.values(s.nations)) if (n.joined) ecos[n.id] = economy(s, n.id);
  integrate(s, ecos, s.t - s.stocksAt);
  s.stocksAt = s.t;
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
      complete(s, r, done.item, done.slot);
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
    case "battle":
      return battleEnd(s, e.region, e.at);
    case "deliver":
      return deliver(s, e.to, e.goods);
    case "offerExpire":
      return expire(s, e.offer, e.at);
    case "march":
      return marchArrive(s, e.nation, e.from, e.to, e.count);
    case "rateChange":
      return;
    case "stageEnd":
      return endStage(s);
  }
}

function complete(s: State, r: RegionState, item: string, pinned?: number): void {
  touch(r);
  if (item === "army") {
    if (!joinDefence(s, r.id, 1)) r.armies++;
  } else if (item in UNITS) {
    if (!r.owner) return;
    shipDone(s, r.owner, r.id, item as Unit);
    resolveSpace(s, REGIONS[r.id].body);
  } else if (item in BUILDINGS) {
    // Lowest slot that's neither built nor pinned by a queued replace.
    const used = new Set([...r.buildings.map((b) => b.slot), ...r.queue.flatMap((q) => q.slot ?? [])]);
    let slot = pinned ?? 0;
    while (pinned === undefined && used.has(slot)) slot++;
    r.buildings.push({ slot, type: item as Building });
  }
}

// Ranks the stage by gain, then the next stage's modifier applies to all.
function endStage(s: State): void {
  const sc = scores(s);
  const ranking = stageRanking(s, sc).slice(0, SCORE.stageRanked);
  const sz = s.season;
  if (ranking.length) sz.winners.push({ stage: sz.stage, endedAt: s.t, ranking });
  sz.stage++;
  sz.stageEndsAt = s.t + SEASON.stageS * 1000;
  sz.base = Object.fromEntries(Object.entries(sc).map(([id, x]) => [id, x.total]));
  schedule(s, { kind: "stageEnd", at: sz.stageEndsAt });
  const w = ranking[0] && s.nations[ranking[0].nation];
  const next = STAGES[Math.min(sz.stage, STAGES.length) - 1];
  news(s, "stage", `${w ? `${w.name} wins stage ${sz.stage - 1}. ` : ""}Stage ${sz.stage}: ${next.name}. ${next.desc}`, w ? [w.id] : []);
}

// Stocks brought up to state.t, for reading only: no copy if already there.
export function settled(state: State): State {
  if (state.stocksAt === state.t || state.season.status === "ended") return state;
  const s = structuredClone(state);
  settle(s);
  return s;
}

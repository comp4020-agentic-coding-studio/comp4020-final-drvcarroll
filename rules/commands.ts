// system-design.md §14.5: each handler validates, then returns its executor.
// The same check drives apply, legalActions and the client's disabled reasons.
import {
  BUILDINGS, ECONOMY, EMPIRE, MILITARY, POWER_MODES, REGIONS, RUNGS, SEASON, TECH, UNITS, WAR, type PowerMode,
} from "./data/index.ts";
import {
  enqueue, isInt, isRejection, needs, no, ownRegion, regionName, type Cmd, type Handler, type Plan,
} from "./check.ts";
import { credit, mods, scale, slotsOf, spend } from "./economy.ts";
import { buildShip, colonise, launch, march } from "./fleets.ts";
import type { Command, Id } from "./protocol.ts";
import { emptyStocks, news, schedule, touch, type NationState, type State } from "./state.ts";

function hexDistance(a: string, b: string): number {
  const c = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [c(a), c(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

const setEmpire = (s: State, id: Id, c: Cmd<"setEmpire">): Plan => {
  const name = c.name?.trim() ?? "";
  if (name.length < EMPIRE.nameMin || name.length > EMPIRE.nameMax) {
    return no("INVALID", `Names are ${EMPIRE.nameMin} to ${EMPIRE.nameMax} characters`);
  }
  const hex = /^#[0-9a-f]{6}$/i;
  if (!hex.test(c.primary) || !hex.test(c.secondary)) return no("INVALID", "Colours are #rrggbb");
  for (const o of Object.values(s.nations)) {
    if (o.id === id) continue;
    if (o.name.toLowerCase() === name.toLowerCase()) return no("TAKEN", `${o.name} is already taken`);
    if (hexDistance(o.primary, c.primary) < EMPIRE.colourClashDistance) {
      return no("TAKEN", `Too close to ${o.name}'s colour`);
    }
  }
  return () => {
    const n = (s.nations[id] ??= {
      id, name, primary: c.primary, secondary: c.secondary, capital: null,
      protectedUntil: 0, boostUntil: 0, eliminated: false, joined: false,
      stocks: emptyStocks(), techs: [], research: null, envoys: [],
    });
    Object.assign(n, { name, primary: c.primary, secondary: c.secondary });
  };
};

const join: Handler<"join"> = (s, n, c) => {
  const respawn = n.joined && n.eliminated;
  if (n.joined && !respawn) return no("INVALID", "You have already joined");
  if (!respawn && s.t - s.season.startedAt > SEASON.lateJoinCutoffS * 1000) {
    return no("SEASON_OVER", "Joining closes at minute 50");
  }
  const r = s.regions[c.region];
  if (!r) return no("INVALID", "Unknown region");
  if (r.owner) return no("TAKEN", `${regionName(r.id)} is taken`);
  const earthFull = Object.values(s.regions).every((x) => !REGIONS[x.id].start || x.owner);
  const ok = REGIONS[r.id].start || (respawn && earthFull && REGIONS[r.id].body !== "antarctica");
  if (!ok) return no("INVALID", "Pick a free Earth start region");
  return () => {
    const kit = ECONOMY.startKit;
    r.owner = n.id;
    r.buildings = kit.buildings.slice(0, slotsOf(s, r.id)).map((type, slot) => ({ slot, type }));
    r.armies = kit.armies;
    touch(r);
    const late = s.t - s.season.startedAt >= WAR.boostS * 1000;
    Object.assign(n, {
      joined: true, eliminated: false, capital: r.id, stocks: { ...kit.stocks },
      protectedUntil: s.t + WAR.protectionS * 1000,
      boostUntil: respawn || late ? s.t + WAR.boostS * 1000 : 0,
    });
    if (n.boostUntil) schedule(s, { kind: "rateChange", at: n.boostUntil });
    news(s, "join", `${n.name} ${respawn ? "returns" : "joins"} at ${regionName(r.id)}`, [n.id, r.id]);
  };
};

const build: Handler<"build"> = (s, n, c) => {
  const r = ownRegion(s, n, c.region);
  if (isRejection(r)) return r;
  const d = BUILDINGS[c.building];
  if (!d) return no("INVALID", "Unknown building type");
  const used = r.buildings.length + r.queue.filter((q) => q.item in BUILDINGS).length;
  if (used >= slotsOf(s, r.id)) return no("NO_SLOT", `No free slot in ${regionName(r.id)}`);
  return needs(n, d.cost) ?? (() => {
    spend(n, d.cost);
    enqueue(s, r, c.building, d.timeS * 1000, d.cost);
  });
};

const demolish: Handler<"demolish"> = (s, n, c) => {
  const r = ownRegion(s, n, c.region);
  if (isRejection(r)) return r;
  const b = r.buildings.find((x) => x.slot === c.slot);
  if (!b) return no("INVALID", `No building in slot ${c.slot}`);
  return () => {
    r.buildings = r.buildings.filter((x) => x !== b);
    credit(s, n, scale(BUILDINGS[b.type].cost, ECONOMY.demolishRefund));
    touch(r);
  };
};

const cancelBuild: Handler<"cancelBuild"> = (s, n, c) => {
  const r = ownRegion(s, n, c.region);
  if (isRejection(r)) return r;
  const item = r.queue[c.index];
  if (!item) return no("INVALID", "Nothing queued there");
  return () => {
    r.queue.splice(c.index, 1);
    credit(s, n, item.paid);
    r.queue.forEach((q, i) => {
      const dur = q.finishAt - q.startAt;
      q.startAt = i === 0 ? (c.index === 0 ? s.t : q.startAt) : r.queue[i - 1].finishAt;
      q.finishAt = q.startAt + dur;
    });
    const head = r.queue[0];
    if (head && c.index === 0) schedule(s, { kind: "queue", at: head.finishAt, region: r.id, item: head.id });
    touch(r);
  };
};

const setMode: Handler<"setMode"> = (s, n, c) => {
  const r = ownRegion(s, n, c.region);
  if (isRejection(r)) return r;
  const b = r.buildings.find((x) => x.slot === c.slot);
  if (b?.type !== "powerPlant") return no("INVALID", "Only a Power Plant has modes");
  const m = POWER_MODES[c.mode as PowerMode];
  if (!m) return no("INVALID", "Unknown mode");
  if (m.unlock && !n.techs.includes(m.unlock)) return no("LOCKED", `Needs ${RUNGS[m.unlock].name}`);
  return () => {
    b.mode = c.mode;
    touch(r);
  };
};

export function techCost(n: NationState, tech: string): number {
  const rung = Number(tech.split(".")[1]);
  return TECH.costs[rung - 1] * Math.max(0, 1 + mods(n).techCost);
}

const research: Handler<"research"> = (s, n, c) => {
  const t = RUNGS[c.tech];
  if (!t) return no("INVALID", "Unknown tech");
  if (n.techs.includes(c.tech)) return no("INVALID", `${t.name} is already researched`);
  const [ladder, rung] = c.tech.split(".");
  const prev = `${ladder}.${Number(rung) - 1}`;
  if (RUNGS[prev] && !n.techs.includes(prev)) return no("LOCKED", `Needs ${RUNGS[prev].name}`);
  if (n.research) return no("INVALID", `Already researching ${RUNGS[n.research.tech].name}`);
  const cost = { R: techCost(n, c.tech) };
  return needs(n, cost) ?? (() => {
    spend(n, cost);
    const finishAt = s.t + Number(rung) * TECH.researchSPerRung * 1000;
    n.research = { tech: c.tech, startAt: s.t, finishAt, paid: cost.R };
    schedule(s, { kind: "research", at: finishAt, nation: n.id, tech: c.tech });
  });
};

const cancelResearch: Handler<"cancelResearch"> = (s, n) => {
  const r = n.research;
  if (!r) return no("INVALID", "Nothing is being researched");
  return () => {
    credit(s, n, { R: r.paid });
    n.research = null;
  };
};

const train: Handler<"train"> = (s, n, c) => {
  const r = ownRegion(s, n, c.region);
  if (isRejection(r)) return r;
  if (!isInt(c.count, 1, MILITARY.maxTrainCount)) return no("INVALID", `Train 1 to ${MILITARY.maxTrainCount} Armies`);
  const each = UNITS.army.cost;
  return needs(n, scale(each, c.count)) ?? (() => {
    for (let i = 0; i < c.count; i++) {
      spend(n, each);
      enqueue(s, r, "army", UNITS.army.timeS * 1000, each);
    }
  });
};

const handlers: { [T in Command["type"]]?: Handler<T> } = {
  join, build, demolish, cancelBuild, setMode, research, cancelResearch, train,
  buildShip, launch, colonise, march,
};

export function check(s: State, nation: Id, c: Command): Plan {
  if (s.season.status !== "running") return no("SEASON_OVER", "The season has ended");
  if (c.type === "setEmpire") return setEmpire(s, nation, c);
  const n = s.nations[nation];
  if (!n?.joined && c.type !== "join") return no("NOT_JOINED", "Join the season first");
  if (!n) return no("NOT_JOINED", "Create your empire first");
  if (n.eliminated && c.type !== "join") return no("NOT_JOINED", "You were eliminated; pick a region to return");
  const h = handlers[c.type] as Handler<typeof c.type> | undefined;
  if (!h) return no("INVALID", "Unknown command");
  return h(s, n, c as never);
}


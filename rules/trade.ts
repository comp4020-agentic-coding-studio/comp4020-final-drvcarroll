// game-design.md §9, §11: trade, gifts, the Earth Exchange, Envoys.
import { BODIES, ECONOMY, MILITARY, REGIONS, RESOURCES, RESOURCE_NAMES, RUNGS, TRADE, type Goods, type Resource } from "./data/index.ts";
import { isRejection, needs, no, type Handler } from "./check.ts";
import { credit, mods, scale, spend } from "./economy.ts";
import { travelMs } from "./orbit.ts";
import type { Id, Ms, Rejection } from "./protocol.ts";
import { newId, news, schedule, type NationState, type State } from "./state.ts";

const ENVOY_TECH = Object.values(RUNGS).find((r) => r.unlocks?.includes("envoy"))!.id;

function goodsError(g: Goods | undefined, what: string): Rejection | null {
  const entries = Object.entries(g ?? {});
  if (!entries.length) return no("INVALID", `Pick something to ${what}`);
  const bad = entries.some(([r, v]) => !RESOURCES.includes(r as Resource) || !(Number.isFinite(v) && v! > 0));
  return bad ? no("INVALID", "Amounts must be positive") : null;
}

function partner(s: State, n: NationState, id: Id): Rejection | NationState {
  const t = s.nations[id];
  if (!t?.joined || t.id === n.id) return no("INVALID", "Unknown nation");
  if (t.eliminated) return no("INVALID", `${t.name} has been eliminated`);
  return t;
}

const capitalBody = (n: NationState) => REGIONS[n.capital!].body;
const overEarth = (a: NationState, b: NationState) =>
  BODIES[capitalBody(a)].zone === "terrestrial" && BODIES[capitalBody(b)].zone === "terrestrial";

function deliveryMs(s: State, from: NationState, to: NationState): Ms {
  if (overEarth(from, to)) return TRADE.earthDeliveryS * 1000;
  return travelMs(capitalBody(from), capitalBody(to), { freighter: 1 }, mods(from));
}

const total = (g: Goods) => Object.values(g).reduce((a, v) => a + (v ?? 0), 0);

// Off Earth, goods ride Freighters: a sender needs the hold space.
function freighters(s: State, from: NationState, to: NationState, g: Goods): Rejection | null {
  if (overEarth(from, to)) return null;
  const have = Object.values(s.fleets).reduce((a, f) => a + (f.owner === from.id ? (f.units.freighter ?? 0) : 0), 0);
  const need = Math.ceil(total(g) / MILITARY.freighterCapacity);
  return have >= need ? null : no("INSUFFICIENT", `${from.name} needs ${need} Freighters for this`);
}

const scienceRungs = (n: NationState) => n.techs.filter((t) => t.startsWith("science.")).length;
const hasEnvoy = (a: NationState, b: NationState) => a.envoys.some((e) => e.nation === b.id);

export function tradeMultiplier(a: NationState, b: NationState): number {
  const rungs = Math.max(hasEnvoy(a, b) ? scienceRungs(a) : 0, hasEnvoy(b, a) ? scienceRungs(b) : 0);
  const linked = hasEnvoy(a, b) || hasEnvoy(b, a);
  return linked ? 1 + TRADE.envoyMultiplierPerScience * rungs : 1;
}

function send(s: State, from: NationState, to: NationState, goods: Goods): void {
  schedule(s, { kind: "deliver", at: s.t + deliveryMs(s, from, to), to: to.id, goods });
}

export const offerTrade: Handler<"offerTrade"> = (s, n, c) => {
  const t = partner(s, n, c.to);
  if (isRejection(t)) return t;
  const bad = goodsError(c.give, "give") ?? goodsError(c.get, "ask for") ?? needs(n, c.give);
  if (bad) return bad;
  return () => {
    const id = newId(s, "o");
    const expiresAt = s.t + TRADE.offerTtlS * 1000;
    s.offers[id] = { id, from: n.id, to: t.id, give: c.give, get: c.get, expiresAt };
    schedule(s, { kind: "offerExpire", at: expiresAt, offer: id });
  };
};

export const acceptTrade: Handler<"acceptTrade"> = (s, n, c) => {
  const o = s.offers[c.offer];
  if (o?.to !== n.id) return no("INVALID", "Unknown offer");
  const from = s.nations[o.from];
  if (from.eliminated) return no("INVALID", `${from.name} has been eliminated`);
  const short = needs(from, o.give);
  if (short) return no("INSUFFICIENT", `${from.name} can no longer cover this`);
  const bar = needs(n, o.get) ?? freighters(s, from, n, o.give) ?? freighters(s, n, from, o.get);
  if (bar) return bar;
  return () => {
    spend(from, o.give);
    spend(n, o.get);
    const m = tradeMultiplier(from, n);
    send(s, from, n, scale(o.give, m));
    send(s, n, from, scale(o.get, m));
    delete s.offers[o.id];
    news(s, "trade", `${from.name} and ${n.name} trade${m > 1 ? ` (×${m.toFixed(2)} via Envoy)` : ""}`, [from.id, n.id]);
  };
};

export const declineTrade: Handler<"declineTrade"> = (s, n, c) => {
  const o = s.offers[c.offer];
  if (o?.to !== n.id) return no("INVALID", "Unknown offer");
  return () => void delete s.offers[o.id];
};

export const cancelTrade: Handler<"cancelTrade"> = (s, n, c) => {
  const o = s.offers[c.offer];
  if (o?.from !== n.id) return no("INVALID", "Unknown offer");
  return () => void delete s.offers[o.id];
};

export const gift: Handler<"gift"> = (s, n, c) => {
  const t = partner(s, n, c.to);
  if (isRejection(t)) return t;
  const bar = goodsError(c.goods, "give") ?? needs(n, c.goods) ?? freighters(s, n, t, c.goods);
  if (bar) return bar;
  return () => {
    spend(n, c.goods);
    send(s, n, t, c.goods);
    news(s, "gift", `${n.name} sends a gift to ${t.name}`, [n.id, t.id]);
  };
};

export const exchange: Handler<"exchange"> = (s, n, c) => {
  if (!RESOURCES.includes(c.give) || !RESOURCES.includes(c.get) || c.give === c.get) {
    return no("INVALID", "Pick two different resources");
  }
  if (!(Number.isFinite(c.amount) && c.amount > 0)) return no("INVALID", "Amounts must be positive");
  return needs(n, { [c.give]: c.amount }) ?? (() => {
    spend(n, { [c.give]: c.amount });
    credit(s, n, { [c.get]: c.amount / ECONOMY.exchangeRate });
  });
};

export const sendEnvoy: Handler<"sendEnvoy"> = (s, n, c) => {
  if (!n.techs.includes(ENVOY_TECH)) return no("LOCKED", `Needs ${RUNGS[ENVOY_TECH].name}`);
  const t = partner(s, n, c.nation);
  if (isRejection(t)) return t;
  if (hasEnvoy(n, t)) return no("INVALID", `You already have an Envoy with ${t.name}`);
  if (n.envoys.length >= mods(n).envoySlots) return no("NO_ENVOY_SLOT", "All your Envoy slots are in use");
  if (n.stocks.E <= 0) return no("INSUFFICIENT", `Envoys cost ${ECONOMY.envoyUpkeepE} ${RESOURCE_NAMES.E}/min`);
  return () => void n.envoys.push({ nation: t.id, since: s.t });
};

export const recallEnvoy: Handler<"recallEnvoy"> = (s, n, c) => {
  if (!n.envoys.some((e) => e.nation === c.nation)) return no("INVALID", "No Envoy there");
  return () => {
    n.envoys = n.envoys.filter((e) => e.nation !== c.nation);
  };
};

export function deliver(s: State, to: Id, goods: Goods): void {
  const n = s.nations[to];
  if (n && !n.eliminated) credit(s, n, goods);
}

export function expire(s: State, offer: Id, at: Ms): void {
  if (s.offers[offer]?.expiresAt === at) delete s.offers[offer];
}

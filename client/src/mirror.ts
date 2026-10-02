// Rebuilds a rules State from what this client can see, so every button asks
// the same validate() the server runs. Hidden things (fog, rivals' stocks)
// are blank here, so the server's answer still decides.
import { computed } from "@preact/signals";
import { RESOURCES } from "../../rules/data/index.ts";
import { validate, type Command, type Rejection, type State } from "../../rules/index.ts";
import type { NationState } from "../../rules/state.ts";
import { clock, me, season, stockNow, world, you } from "./store.ts";

const zero = () => Object.fromEntries(RESOURCES.map((r) => [r, 0])) as NationState["stocks"];

export const mirror = computed<State | null>(() => {
  const w = world.value, y = you.value, sz = season.value, t = clock.value;
  if (!w || !sz) return null;
  const nations: Record<string, NationState> = {};
  for (const n of w.nations) {
    nations[n.id] = { ...n, joined: true, stocks: zero(), techs: [], research: null, envoys: [] };
  }
  if (y) {
    const base = nations[y.nation] ?? {
      id: y.nation, name: "", primary: "#000000", secondary: "#000000", capital: null,
      protectedUntil: 0, boostUntil: 0, eliminated: false, joined: false,
    };
    nations[y.nation] = {
      ...base,
      joined: !!nations[y.nation],
      stocks: Object.fromEntries(RESOURCES.map((r) => [r, stockNow(r)])) as NationState["stocks"],
      techs: y.techs,
      research: y.research && { ...y.research, paid: 0 },
      envoys: y.envoys,
    } as NationState;
  }
  return {
    season: sz,
    t,
    stocksAt: t,
    nextId: 1,
    nations,
    regions: Object.fromEntries(w.regions.map((r) => [r.id, {
      id: r.id, owner: r.owner ?? null, buildings: r.buildings ?? [], armies: r.armies ?? 0, rev: r.rev ?? 0,
      queue: (y?.queues[r.id] ?? []).map((q, i) => ({ id: `q${i}`, ...q, paid: {} })),
    }])),
    fleets: Object.fromEntries(w.fleets.map((f) => [f.id, { ...f }])),
    wars: Object.fromEntries(w.wars.map((x) => [x.id, x])),
    offers: Object.fromEntries((y?.trades ?? []).map((o) => [o.id, o])),
    events: [],
    news: w.news,
  };
});

// Why this command would be refused right now, or null if it would apply.
export function why(cmd: Command): Rejection | null {
  const s = mirror.value;
  if (!s || !me.value) return { ok: false, code: "NOT_JOINED", reason: "Connecting…" };
  return validate(s, me.value, cmd);
}

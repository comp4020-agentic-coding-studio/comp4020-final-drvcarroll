// game-design.md §10: Territory, Economy, Tech, uncapped; stages rank gains.
import { BODIES, REGIONS, RESOURCES, SCORE } from "./data/index.ts";
import { controlsBody, economy, owned } from "./economy.ts";
import type { Id, Score } from "./protocol.ts";
import type { State } from "./state.ts";

export function score(s: State, nation: Id): Score {
  const regions = owned(s, nation);
  const bodies = new Set(regions.map((r) => REGIONS[r.id].body));
  const whole = [...bodies].filter((b) => BODIES[b] && controlsBody(s, nation, b)).length;
  const prod = economy(s, nation).production;
  const territory = SCORE.perRegion * regions.length + SCORE.perBody * whole;
  const econ = RESOURCES.reduce((a, r) => a + prod[r], 0) / SCORE.economyPer;
  const tech = s.nations[nation].techs.reduce((a, t) => a + Number(t.split(".")[1]), 0);
  return { territory, economy: econ, tech, total: territory + econ + tech };
}

export const scores = (s: State): Record<Id, Score> =>
  Object.fromEntries(Object.values(s.nations).filter((n) => n.joined).map((n) => [n.id, score(s, n.id)]));

// Score gained this stage, best first; ties to the lower id (game-design.md §10).
export function stageRanking(s: State, sc = scores(s)): { nation: Id; gain: number }[] {
  return Object.entries(sc)
    .filter(([id]) => !s.nations[id].eliminated)
    .map(([nation, x]) => ({ nation, gain: x.total - (s.season.base[nation] ?? 0) }))
    .sort((a, b) => b.gain - a.gain || (a.nation < b.nation ? -1 : 1));
}

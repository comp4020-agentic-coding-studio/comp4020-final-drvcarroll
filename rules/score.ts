// game-design.md §10: Territory, Economy, Tech, each capped at 40%.
import { BODIES, REGIONS, RESOURCES, SCORE } from "./data/index.ts";
import { controlsBody, economy, owned } from "./economy.ts";
import type { Id, Score } from "./protocol.ts";
import type { State } from "./state.ts";

export function score(s: State, nation: Id): Score {
  const cap = SCORE.categoryCap * s.season.threshold;
  const regions = owned(s, nation);
  const bodies = new Set(regions.map((r) => REGIONS[r.id].body));
  const whole = [...bodies].filter((b) => BODIES[b] && controlsBody(s, nation, b)).length;
  const prod = economy(s, nation).production;
  const territory = Math.min(cap, SCORE.perRegion * regions.length + SCORE.perBody * whole);
  const econ = Math.min(cap, RESOURCES.reduce((a, r) => a + prod[r], 0) / SCORE.economyPer);
  const tech = Math.min(cap, s.nations[nation].techs.reduce((a, t) => a + Number(t.split(".")[1]), 0));
  return { territory, economy: econ, tech, total: territory + econ + tech };
}

export const scores = (s: State): Record<Id, Score> =>
  Object.fromEntries(Object.values(s.nations).filter((n) => n.joined).map((n) => [n.id, score(s, n.id)]));

export function leader(sc: Record<Id, Score>): Id | undefined {
  let best: [Id, number] | undefined;
  for (const [id, x] of Object.entries(sc)) if (!best || x.total > best[1]) best = [id, x.total];
  return best?.[0];
}

// game-design.md §8: four ladders × six rungs, one research at a time.
import { LADDERS, RUNGS, TECH, type Ladder } from "../../../rules/data/index.ts";
import { techCost } from "../../../rules/commands.ts";
import { dur, num } from "../format.ts";
import { mirror } from "../mirror.ts";
import { clock, me, you } from "../store.ts";
import { Action, Progress } from "./common.tsx";

const BLURB: Record<Ladder, string> = {
  voidcraft: "Faster, better ships. Reach is a cost, never a wall.",
  industry: "Bigger yields and new Power Plant modes.",
  science: "Research output, and the only route to an Envoy.",
  society: "What it costs to hold what you have.",
};

export function TechPanel() {
  const y = you.value!;
  const r = y.research;
  const n = mirror.value?.nations[me.value!];
  return (
    <div class="panel">
      <p class="hint">Each rung needs the one before it; ladders are independent. Costs double per rung ({TECH.costs.join(", ")} Research). Research is paid up front; cancelling refunds it.</p>
      {r && (
        <section class="card now">
          <h3>Researching {RUNGS[r.tech].name}</h3>
          <Progress start={r.startAt} end={r.finishAt} label="Research progress" />
          <p>{dur(r.finishAt - clock.value)} left <Action kind="quiet" cmd={{ type: "cancelResearch" }}>Cancel (refund)</Action></p>
        </section>
      )}
      <div class="ladders">
        {(Object.entries(LADDERS) as [Ladder, typeof LADDERS[Ladder]][]).map(([id, rungs]) => (
          <section key={id} class="card ladder">
            <h3>{id[0].toUpperCase() + id.slice(1)}</h3>
            <p class="hint">{BLURB[id]}</p>
            <ol class="rungs">
              {rungs.map((rung, i) => {
                const held = y.techs.includes(rung.id);
                const active = r?.tech === rung.id;
                return (
                  <li key={rung.id} class={held ? "held" : active ? "active" : ""}>
                    <b>{i + 1}. {rung.name}</b>
                    <small>{rung.desc}</small>
                    {held ? <span class="tag">Researched</span>
                      : active ? <span class="tag">In progress</span>
                      : <Action kind="quiet" cmd={{ type: "research", tech: rung.id }}>Research · {num(n ? techCost(n, rung.id) : TECH.costs[i])} R</Action>}
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}

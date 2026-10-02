// The DOM mirror of the map (game-design.md §12): every body as a button,
// grouped by zone. `[` and `]` cycle bodies.
import { BODIES, type Zone } from "../../../rules/data/index.ts";
import { me, selBody, world } from "../store.ts";
import { select } from "./SystemMap.tsx";

const ZONES: [Zone, string][] = [
  ["terrestrial", "Earth"], ["cislunar", "Cislunar"], ["inner", "Inner"], ["belt", "Belt"],
  ["jovian", "Jovian"], ["saturnian", "Saturnian"], ["outer", "Outer"],
];

export const BODY_ORDER = ZONES.flatMap(([z]) => Object.values(BODIES).filter((b) => b.zone === z).map((b) => b.id));

export function BodyList() {
  const w = world.value!;
  return (
    <nav class="bodies" aria-label="Bodies">
      {ZONES.map(([z, label]) => (
        <div key={z}>
          <h4>{label}</h4>
          <ul class="plain">
            {Object.values(BODIES).filter((b) => b.zone === z).map((b) => {
              const regs = w.regions.filter((r) => r.body === b.id);
              const mine = regs.filter((r) => r.owner === me.value).length;
              const fleets = w.fleets.filter((f) => f.at === b.id && f.owner === me.value).length;
              return (
                <li key={b.id}>
                  <button class={`bodybtn ${selBody.value === b.id ? "sel" : ""}`} aria-current={selBody.value === b.id} onClick={() => select(b.id)}>
                    <span>{b.name}</span>
                    <small>
                      {mine ? <b>{mine}/</b> : ""}{regs.length} {regs.length === 1 ? "region" : "regions"}
                      {fleets ? " · fleet" : ""}
                    </small>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

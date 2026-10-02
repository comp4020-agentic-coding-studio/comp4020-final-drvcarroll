// Stellaris-style outliner: your holdings and fleets, plus every body, as
// buttons. It doubles as the keyboard and screen-reader route into the map.
import { useState } from "preact/hooks";
import { BODIES, REGIONS, UNITS, type Unit } from "../../../rules/data/index.ts";
import { bodyName, dur } from "../format.ts";
import { clock, me, selFleet, selRegion, world } from "../store.ts";
import { focusOn, selectFleet } from "./SceneHost.tsx";

export function Outliner() {
  const w = world.value!;
  const [open, setOpen] = useState(innerWidth > 720);
  const [all, setAll] = useState(false);
  const mine = w.regions.filter((r) => r.owner === me.value);
  const byBody: Record<string, typeof mine> = {};
  for (const r of mine) (byBody[r.body] ??= []).push(r);
  const fleets = w.fleets.filter((f) => f.owner === me.value);
  return (
    <nav class={`hud outliner ${open ? "" : "closed"}`} aria-label="Outliner">
      <button class="hud-title" aria-expanded={open} onClick={() => setOpen(!open)}>Outliner {open ? "▾" : "▸"}</button>
      {open && (
        <div class="scroll">
          <h4>Territory</h4>
          <ul class="list tight">
            {Object.entries(byBody).map(([body, rs]) => (
              <li key={body}>
                <button class="row" onClick={() => focusOn(body)}><b>{bodyName(body)}</b><small>{rs.length}</small></button>
                <ul class="list tight sub">
                  {rs.map((r) => (
                    <li key={r.id}>
                      <button class={`row ${selRegion.value === r.id ? "on" : ""}`} onClick={() => focusOn(r.body, r.id)}>
                        {REGIONS[r.id].name}<small>{r.buildings?.length ?? 0}▣ ⚔{r.armies ?? 0}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <h4>Fleets</h4>
          {fleets.length === 0 && <p class="hint">None yet.</p>}
          <ul class="list tight">
            {fleets.map((f) => (
              <li key={f.id}>
                <button class={`row ${selFleet.value === f.id ? "on" : ""}`} onClick={() => selectFleet(f.id)}>
                  <span>{(Object.entries(f.units) as [Unit, number][]).map(([u, n]) => `${n} ${UNITS[u].name}`).join(", ")}</span>
                  <small>{f.transit ? `→ ${bodyName(f.transit.to)} ${dur(f.transit.arriveAt - clock.value)}` : `@ ${bodyName(f.at!)}`}</small>
                </button>
              </li>
            ))}
          </ul>
          <button class="hud-title small" aria-expanded={all} onClick={() => setAll(!all)}>All bodies {all ? "▾" : "▸"}</button>
          {all && (
            <ul class="list tight">
              {Object.values(BODIES).filter((b) => b.id !== "antarctica").map((b) => (
                <li key={b.id}><button class="row" onClick={() => focusOn(b.id)}>{b.name}<small>{b.zone}</small></button></li>
              ))}
            </ul>
          )}
        </div>
      )}
    </nav>
  );
}

// game-design.md §11 onboarding: the camera opens on Earth, free start regions
// lit; click one (or pick from the list) and start.
import { useEffect } from "preact/hooks";
import { REGIONS } from "../../../rules/data/index.ts";
import { myNation, selRegion, world } from "../store.ts";
import { Action, Chip } from "./common.tsx";
import { focusOn, scene } from "./SceneHost.tsx";

export function StartPanel() {
  const w = world.value!;
  const eliminated = myNation.value?.eliminated;
  useEffect(() => {
    const t = setTimeout(() => scene.value?.flyTo("earth"), 400); // camera only; keeps any pick
    return () => clearTimeout(t);
  }, []);
  const owner = (id: string) => w.regions.find((r) => r.id === id)?.owner;
  const starts = Object.values(REGIONS).filter((r) => r.start);
  const sel = selRegion.value && REGIONS[selRegion.value]?.start ? REGIONS[selRegion.value] : null;
  return (
    <aside class="hud selection start" aria-label="Choose where to begin">
      <header class="sel-head"><div><h2>{eliminated ? "Your nation has fallen" : "Choose where to begin"}</h2>
        <small>Click a free region on Earth</small></div></header>
      {sel ? (
        <div class="pick">
          <h3>{sel.name}</h3>
          <dl class="facts">
            <dt>Metals</dt><dd>×{sel.m.toFixed(1)}</dd>
            <dt>Volatiles</dt><dd>×{sel.v.toFixed(1)}</dd>
            <dt>Solar</dt><dd>×{sel.s.toFixed(1)}</dd>
          </dl>
          {owner(sel.id) ? <p>Taken by <Chip id={owner(sel.id)} /></p> : <Action cmd={{ type: "join", region: sel.id }}>Start here</Action>}
        </div>
      ) : (
        <p class="hint">
          Every start region's Metals + Volatiles + Solar adds to 3.3: geography is flavour, not advantage. You begin with a Power Plant,
          Mine, Refinery and Lab, two Armies, and {eliminated ? "double production for" : ""} five minutes of protection.
        </p>
      )}
      <details>
        <summary>All start regions</summary>
        <ul class="list tight">
          {starts.map((r) => (
            <li key={r.id}>
              <button class="row" onClick={() => focusOn("earth", r.id)}>{r.name}{owner(r.id) ? <Chip id={owner(r.id)} /> : <small>free</small>}</button>
            </li>
          ))}
        </ul>
      </details>
    </aside>
  );
}

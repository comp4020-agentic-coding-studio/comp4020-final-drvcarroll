// Overlays over the map (game-design.md §12): the tech tree beside the empire
// menu, Empires on the right. Esc or ✕ closes; the map stays live behind.
import { drawer, type Drawer as D } from "../store.ts";
import { EmpiresPanel } from "./EmpiresPanel.tsx";
import { TechPanel } from "./TechPanel.tsx";

const TITLES: Record<D, string> = { tech: "Tech tree", empires: "Empires" };

export function Drawer() {
  const d = drawer.value;
  if (!d) return null;
  return (
    <aside class={`hud drawer ${d}`} aria-label={TITLES[d]}>
      <header class="sel-head">
        <h2>{TITLES[d]}</h2>
        <button class="icon" aria-label="Close" onClick={() => (drawer.value = null)}>✕</button>
      </header>
      <div class="scroll">
        {d === "tech" && <TechPanel />}
        {d === "empires" && <EmpiresPanel />}
      </div>
    </aside>
  );
}

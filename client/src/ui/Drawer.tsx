// Tech, empires (diplomacy + standings) and trade open as a drawer over the
// map's right side; Esc or ✕ closes it and the map stays live behind.
import { drawer, type Drawer as D } from "../store.ts";
import { DiplomacyPanel } from "./DiplomacyPanel.tsx";
import { Leaderboard } from "./Side.tsx";
import { TechPanel } from "./TechPanel.tsx";
import { TradePanel } from "./TradePanel.tsx";

const TITLES: Record<D, string> = { tech: "Technology", empires: "Empires", trade: "Trade" };

export function Drawer() {
  const d = drawer.value;
  if (!d) return null;
  return (
    <aside class="hud drawer" aria-label={TITLES[d]}>
      <header class="sel-head">
        <h2>{TITLES[d]}</h2>
        <button class="icon" aria-label="Close" onClick={() => (drawer.value = null)}>✕</button>
      </header>
      <div class="scroll">
        {d === "tech" && <TechPanel />}
        {d === "empires" && <><Leaderboard /><DiplomacyPanel /></>}
        {d === "trade" && <TradePanel />}
      </div>
    </aside>
  );
}

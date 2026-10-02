// The game shell: onboarding until you've joined, then map, panels, sidebar.
import { useEffect } from "preact/hooks";
import { conn, joined, selBody, tab, toasts, world, you, type Tab } from "../store.ts";
import { BodyList, BODY_ORDER } from "./BodyList.tsx";
import { DiplomacyPanel } from "./DiplomacyPanel.tsx";
import { FleetsPanel } from "./FleetsPanel.tsx";
import { RegionPanel } from "./RegionPanel.tsx";
import { Leaderboard, News, Tutorial } from "./Side.tsx";
import { StartChooser } from "./StartChooser.tsx";
import { select, SystemMap } from "./SystemMap.tsx";
import { TechPanel } from "./TechPanel.tsx";
import { TopBar } from "./TopBar.tsx";
import { TradePanel } from "./TradePanel.tsx";

const TABS: [Tab, string][] = [["region", "Region"], ["tech", "Tech"], ["fleets", "Fleets"], ["diplomacy", "Diplomacy"], ["trade", "Trade"]];
const PANELS = { region: RegionPanel, tech: TechPanel, fleets: FleetsPanel, diplomacy: DiplomacyPanel, trade: TradePanel };

// `[` and `]` cycle bodies, Esc returns to Earth (game-design.md §12).
function useKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, select, textarea")) return;
      const i = BODY_ORDER.indexOf(selBody.value);
      if (e.key === "]") select(BODY_ORDER[(i + 1) % BODY_ORDER.length]);
      else if (e.key === "[") select(BODY_ORDER[(i - 1 + BODY_ORDER.length) % BODY_ORDER.length]);
      else if (e.key === "Escape") select("earth");
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);
}

export function App({ user }: { user: string }) {
  useKeys();
  const body = !world.value
    ? <main class="narrow"><p>{conn.value === "signed-out" ? <>Your session ended. <a href="/">Sign in again</a>.</> : "Connecting…"}</p></main>
    : !you.value
      ? <main class="narrow"><h1>Welcome</h1><p>First, <a href="/empire">name your empire and pick its colours</a>.</p></main>
      : !joined.value ? <StartChooser /> : <Game />;
  return (
    <>
      <TopBar user={user} />
      {body}
      <div class="toasts" aria-live="assertive">
        {toasts.value.map((t) => <p key={t.id} class={`toast ${t.kind}`}>{t.text}</p>)}
      </div>
    </>
  );
}

function Game() {
  const Panel = PANELS[tab.value];
  return (
    <div class="layout">
      <aside class="left">
        <SystemMap />
        <BodyList />
      </aside>
      <main class="center">
        <div class="tabs" role="tablist" aria-label="Panels">
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab.value === id} class={tab.value === id ? "sel" : ""} onClick={() => (tab.value = id)}>{label}</button>
          ))}
        </div>
        <Panel />
      </main>
      <aside class="right">
        <Tutorial />
        <Leaderboard />
        <News />
      </aside>
    </div>
  );
}

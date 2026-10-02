// The game: the full-screen map, with the HUD over it (game-design.md §12).
import { conn, drawer, joined, toasts, world, you } from "../store.ts";
import { Drawer } from "./Drawer.tsx";
import { Outliner } from "./Outliner.tsx";
import { SceneHost } from "./SceneHost.tsx";
import { Selection } from "./Selection.tsx";
import { News, Tutorial } from "./Side.tsx";
import { StartPanel } from "./StartPanel.tsx";
import { TopBar } from "./TopBar.tsx";

export function App({ user }: { user: string }) {
  const w = world.value;
  return (
    <>
      {w && <SceneHost />}
      <TopBar user={user} />
      {!w && <div class="hud card center">{conn.value === "signed-out" ? <>Your session ended. <a href="/">Sign in again</a>.</> : "Connecting…"}</div>}
      {w && !you.value && (
        <div class="hud card center">
          <h2>Welcome</h2>
          <p>First, <a href="/empire">name your empire and pick its colours</a>.</p>
        </div>
      )}
      {w && you.value && !joined.value && <StartPanel />}
      {w && you.value && joined.value && (
        <>
          <Outliner />
          <Selection />
          <Drawer />
          <div class="hud corner" hidden={!!drawer.value}>
            <Tutorial />
            <News />
          </div>
        </>
      )}
      <div class="toasts" aria-live="assertive">
        {toasts.value.map((t) => <p key={t.id} class={`toast ${t.kind}`}>{t.text}</p>)}
      </div>
    </>
  );
}

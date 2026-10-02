// The HUD's top strip: stocks with live rates, date, timers, and the drawers.
import { RESOURCES, RESOURCE_NAMES } from "../../../rules/data/index.ts";
import { dur, gameDate, num, signed } from "../format.ts";
import { clock, conn, drawer, joined, myNation, season, stockNow, you, type Drawer } from "../store.ts";
import { scene } from "./SceneHost.tsx";

const STATUS = { connecting: "Connecting…", open: "Live", reconnecting: "Reconnecting…", "signed-out": "Signed out" };
const DRAWERS: [Drawer, string][] = [["tech", "Tech"], ["empires", "Empires"], ["trade", "Trade"]];

export function TopBar({ user }: { user: string }) {
  const y = you.value, sz = season.value, n = myNation.value, t = clock.value;
  return (
    <header class="hud topbar">
      <button class="brand" title="Whole system (Esc)" onClick={() => scene.value?.toSystem()}>GROW</button>
      {y && joined.value && (
        <ul class="stocks" aria-label="Stocks">
          {RESOURCES.map((r) => {
            const s = y.stocks[r];
            const v = stockNow(r);
            return (
              <li key={r} title={`${RESOURCE_NAMES[r]}: ${num(v)} of ${num(s.cap)} · ${signed(s.rate)}/min`}>
                <i class={`res res-${r}`} aria-hidden="true">{r}</i>
                <span class="sr">{RESOURCE_NAMES[r]}</span>
                <b class={v >= s.cap - 0.5 ? "full" : ""}>{num(v)}</b>
                <small class={s.rate < -0.01 ? "neg" : "pos"}>{signed(s.rate)}</small>
              </li>
            );
          })}
        </ul>
      )}
      {y && joined.value && y.efficiency < 0.999 && (
        <span class="warn" title="A stock ran dry: everything that uses it runs at supply ÷ demand">⚠ {Math.round(y.efficiency * 100)}%</span>
      )}
      <span class="spacer" />
      {joined.value && (
        <nav class="drawers" aria-label="Panels">
          {DRAWERS.map(([d, label]) => (
            <button key={d} class={drawer.value === d ? "on" : ""} aria-pressed={drawer.value === d}
              onClick={() => (drawer.value = drawer.value === d ? null : d)}>{label}</button>
          ))}
        </nav>
      )}
      <span class="meta">
        {sz && <span class="date">{gameDate(sz.startedAt, t)}</span>}
        {n && n.protectedUntil > t && <span class="badge" title="Nobody can declare war on you (and you can't declare)">🛡 {dur(n.protectedUntil - t)}</span>}
        {n && n.boostUntil > t && <span class="badge">×2 {dur(n.boostUntil - t)}</span>}
        {sz && <span class="badge" title="Season end">{sz.status === "ended" ? "Season over" : `⏳ ${dur(sz.endsAt - t)}`}</span>}
        <span class={`conn ${conn.value}`} role="status" title={STATUS[conn.value]}>●</span>
      </span>
      <details class="menu">
        <summary>{user}</summary>
        <div>
          <a href="/empire">Empire name and colours</a>
          <a href="/readme/">About the game</a>
          <form method="post" action="/api/logout"><button class="quiet">Sign out</button></form>
        </div>
      </details>
    </header>
  );
}

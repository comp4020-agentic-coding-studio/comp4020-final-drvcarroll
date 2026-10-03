// The HUD's top strip: empire totals with per-day gains and their
// breakdowns, date, timers, and the drawers (game-design.md §12).
import { useEffect, useState } from "preact/hooks";
import { RESOURCES, RESOURCE_NAMES, type Resource } from "../../../rules/data/index.ts";
import { dur, gameDate, num, perDay, signed, sourceName } from "../format.ts";
import { eco } from "../mirror.ts";
import { clock, conn, drawer, joined, myNation, season, stockNow, you, type Drawer } from "../store.ts";
import { scene } from "./SceneHost.tsx";

const STATUS = { connecting: "Connecting…", open: "Live", reconnecting: "Reconnecting…", "signed-out": "Signed out" };
const DRAWERS: [Drawer, string][] = [["tech", "Tech"], ["empires", "Empires"], ["trade", "Trade"]];

export function TopBar({ user }: { user: string }) {
  const y = you.value, sz = season.value, n = myNation.value, t = clock.value;
  const [open, setOpen] = useState<Resource | null>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => !(e.target as HTMLElement).closest(".stocks") && setOpen(null);
    addEventListener("pointerdown", away);
    return () => removeEventListener("pointerdown", away);
  }, [open]);
  // Esc closes the breakdown only, not the map selection too.
  const esc = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !open) return;
    e.stopPropagation();
    setOpen(null);
  };
  return (
    <header class="hud topbar">
      <button class="brand" title="Whole system (Esc)" onClick={() => scene.value?.toSystem()}>GROW</button>
      {y && joined.value && (
        <ul class="stocks" aria-label="Stocks" onKeyDown={esc}>
          {RESOURCES.map((r) => {
            const s = y.stocks[r];
            const v = stockNow(r);
            return (
              <li key={r} title={`${RESOURCE_NAMES[r]}: ${num(v)} of ${num(s.cap)}`}>
                <i class={`res res-${r}`} aria-hidden="true">{r}</i>
                <span class="sr">{RESOURCE_NAMES[r]}</span>
                <b class={v >= s.cap - 0.5 ? "full" : ""}>{num(v)}</b>
                <button class={`gain ${s.rate < -1e-6 ? "neg" : "pos"} ${open === r ? "on" : ""}`} aria-expanded={open === r}
                  aria-label={`${RESOURCE_NAMES[r]} ${perDay(s.rate)} per day: breakdown`} onClick={() => setOpen(open === r ? null : r)}>
                  {perDay(s.rate)}
                </button>
                {open === r && <Breakdown res={r} />}
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

// What makes and uses one resource, per day and per minute.
function Breakdown({ res }: { res: Resource }) {
  const s = you.value!.stocks[res];
  const by = new Map<string, number>();
  for (const l of eco.value?.lines ?? []) {
    if (l.res === res && Math.abs(l.amt) > 1e-9) by.set(sourceName(l.source), (by.get(sourceName(l.source)) ?? 0) + l.amt);
  }
  const rows = [...by].sort((a, b) => b[1] - a[1]);
  return (
    <div class="breakdown" role="dialog" aria-label={`${RESOURCE_NAMES[res]} breakdown`}>
      <h4>{RESOURCE_NAMES[res]} <small>{num(stockNow(res))} of {num(s.cap)}</small></h4>
      {rows.length === 0 ? <p class="hint">Nothing makes or uses this yet.</p> : (
        <table>
          <thead><tr><th /><th>/day</th><th>/min</th></tr></thead>
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}><td>{k}</td><td class={v < 0 ? "neg" : "pos"}>{perDay(v)}</td><td>{signed(v)}</td></tr>
            ))}
          </tbody>
          <tfoot><tr><td>Net</td><td class={s.rate < -1e-6 ? "neg" : "pos"}>{perDay(s.rate)}</td><td>{signed(s.rate)}</td></tr></tfoot>
        </table>
      )}
    </div>
  );
}

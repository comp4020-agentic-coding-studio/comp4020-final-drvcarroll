// game-design.md §12 interface: stocks with rates, Energy balance, game date.
import { RESOURCES, RESOURCE_NAMES } from "../../../rules/data/index.ts";
import { dur, gameDate, num, signed } from "../format.ts";
import { clock, conn, joined, myNation, season, stockNow, you } from "../store.ts";

const STATUS = { connecting: "Connecting…", open: "Live", reconnecting: "Reconnecting…", "signed-out": "Signed out" };

export function TopBar({ user }: { user: string }) {
  const y = you.value, sz = season.value, n = myNation.value, t = clock.value;
  return (
    <header class="topbar">
      <strong class="brand">Grow</strong>
      {sz && <span class="date" title="1 game day = 1 second">{gameDate(sz.startedAt, t)}</span>}
      {y && joined.value && (
        <ul class="stocks" aria-label="Stocks">
          {RESOURCES.map((r) => {
            const s = y.stocks[r];
            const full = stockNow(r) >= s.cap - 0.5;
            return (
              <li key={r} title={`${RESOURCE_NAMES[r]}: ${num(stockNow(r))} of ${num(s.cap)}, ${signed(s.rate)}/min`}>
                <abbr title={RESOURCE_NAMES[r]}>{r}</abbr>
                <b class={full ? "full" : ""}>{num(stockNow(r))}</b>
                <small class={s.rate < 0 ? "neg" : "pos"}>{signed(s.rate)}/m</small>
              </li>
            );
          })}
        </ul>
      )}
      {y && y.efficiency < 0.999 && (
        <span class="warn" title="A stock ran dry: everything that uses it runs at supply ÷ demand">
          Shortfall: {Math.round(y.efficiency * 100)}% efficiency
        </span>
      )}
      {n && n.protectedUntil > t && <span class="badge" title="Nobody can declare war on you, and you can't declare either">Protected {dur(n.protectedUntil - t)}</span>}
      {n && n.boostUntil > t && <span class="badge">×2 production {dur(n.boostUntil - t)}</span>}
      {sz && (
        <span class="badge" title="The season ends at 60 minutes, or when someone reaches the threshold">
          {sz.status === "ended" ? "Season over" : `Season ends in ${dur(sz.endsAt - t)}`}
        </span>
      )}
      <span class={`conn ${conn.value}`} role="status">{STATUS[conn.value]}</span>
      <span class="user">
        {user} · <a href="/empire">Empire</a>
        <form method="post" action="/api/logout"><button class="quiet">Sign out</button></form>
      </span>
    </header>
  );
}

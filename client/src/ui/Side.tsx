// game-design.md §10–11: the tutorial checklist, live leaderboard and news.
import { useState } from "preact/hooks";
import { SCORE } from "../../../rules/data/index.ts";
import { dur, num } from "../format.ts";
import { clock, drawer, me, season, world, you } from "../store.ts";
import { Chip } from "./common.tsx";
import { focusOn, selectFleet } from "./SceneHost.tsx";

interface Goal { title: string; how: string; done: boolean; go: () => void }

function goals(): Goal[] {
  const w = world.value!, y = you.value!;
  const mineRegions = w.regions.filter((r) => r.owner === me.value);
  const queued = Object.values(y.queues).flat().map((q) => q.item);
  const built = mineRegions.flatMap((r) => r.buildings ?? []).map((b) => b.type);
  const lunaFleet = w.fleets.some((f) => f.owner === me.value && f.units.colonyShip && (f.transit?.to === "luna" || f.at === "luna"));
  const luna = mineRegions.some((r) => r.body === "luna");
  const toEarth = () => focusOn("earth");
  const colony = w.fleets.find((f) => f.owner === me.value && f.units.colonyShip);
  return [
    { title: "Build a Mine", how: "Earth starts full: click your region, Military → march an Army to settle a neighbour, then build a Mine there.", done: built.filter((b) => b === "mine").length > 1 || queued.includes("mine"), go: toEarth },
    { title: "Research Thrust Vectoring", how: "Open Tech (top bar) and research Voidcraft 1 once you have 40 Research.", done: y.techs.includes("voidcraft.1") || y.research?.tech === "voidcraft.1", go: () => (drawer.value = "tech") },
    { title: "Build a Spaceport", how: "Needs 60 Metals and 20 Alloys, and a free slot.", done: built.includes("spaceport") || queued.includes("spaceport"), go: toEarth },
    { title: "Launch a Colony Ship to Luna", how: "Build a Colony Ship at the Spaceport (Military tab), select it, then click Luna.", done: lunaFleet || luna, go: () => (colony ? selectFleet(colony.id) : toEarth()) },
    { title: "Claim a Luna region", how: "Click a free region on Luna and colonise it (or claim it while your ship is on the way).", done: luna, go: () => focusOn("luna") },
  ];
}

const HIDE_KEY = "grow.tutorial.hidden";
const read = () => { try { return localStorage.getItem(HIDE_KEY) === "1"; } catch { return false; } };

export function Tutorial() {
  const [hidden, setHidden] = useState(read);
  const gs = goals();
  const next = gs.find((g) => !g.done);
  const hide = (v: boolean) => { setHidden(v); try { localStorage.setItem(HIDE_KEY, v ? "1" : "0"); } catch { /* private mode */ } };
  if (hidden || !next) {
    return next ? <button class="quiet small" onClick={() => hide(false)}>Show goals</button> : null;
  }
  return (
    <section class="card tutorial" aria-label="Goals">
      <h3>Goals <button class="quiet small" onClick={() => hide(true)} aria-label="Hide goals">Hide</button></h3>
      <ol class="plain">
        {gs.map((g) => <li key={g.title} class={g.done ? "done" : g === next ? "next" : ""}>{g.done ? "✓ " : ""}{g.title}</li>)}
      </ol>
      <p class="hint"><b>Next:</b> {next.how} <button class="quiet small" onClick={next.go}>Show me</button></p>
    </section>
  );
}

export function Leaderboard() {
  const w = world.value!, sz = season.value!;
  const rows = Object.entries(w.scores).sort((a, b) => b[1].total - a[1].total);
  const cap = SCORE.categoryCap * sz.threshold;
  const online = new Set(w.presence);
  return (
    <section class="card">
      <h3>Leaderboard</h3>
      <p class="hint">First to {sz.threshold} wins; each of Territory, Economy, Tech counts for at most {num(cap)}.{sz.status === "ended" && sz.winner ? " Season over." : ""}</p>
      <ol class="board">
        {rows.map(([id, s]) => (
          <li key={id} class={id === me.value ? "me" : ""}>
            <span><Chip id={id} />{online.has(id) && <span class="online" title="Online"> ●</span>}{sz.winner === id && " 🏆"}</span>
            <b>{num(s.total)}</b>
            <div class="bars" title={`Territory ${num(s.territory)} · Economy ${num(s.economy)} · Tech ${num(s.tech)}`}>
              <i class="ter" style={{ width: `${(s.territory / sz.threshold) * 100}%` }} />
              <i class="eco" style={{ width: `${(s.economy / sz.threshold) * 100}%` }} />
              <i class="tec" style={{ width: `${(s.tech / sz.threshold) * 100}%` }} />
            </div>
          </li>
        ))}
      </ol>
      <p class="legend"><i class="ter" /> Territory <i class="eco" /> Economy <i class="tec" /> Tech</p>
    </section>
  );
}

export function News() {
  const w = world.value!;
  const t = clock.value;
  return (
    <section class="card news" aria-live="polite">
      <h3>News</h3>
      <ul class="plain">
        {[...w.news].reverse().slice(0, 25).map((n, i) => (
          <li key={`${n.at}${i}`}><small>{dur(t - n.at)} ago</small> {n.text}</li>
        ))}
      </ul>
    </section>
  );
}

